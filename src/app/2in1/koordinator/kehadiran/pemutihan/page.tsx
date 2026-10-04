import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getRiwayatPemutihan } from '@/lib/maahir-pemutihan';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { Icon } from '@/components/icons';
import { PemutihanClient, type AnggotaOpt } from './PemutihanClient';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7);

function tanggalPendek(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Jam WIB — jejak "kapan" yang diminta koordinator agar perubahan mudah dicek. */
function waktuWib(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export default async function PemutihanPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  if (!accesses.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran')) {
    redirect('/2in1/koordinator/login');
  }

  const nowMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;

  const { data: kelasRows } = await supabaseAdmin.from('program_kelas').select('id, name');
  const kelasById = new Map((kelasRows ?? []).map((k) => [k.id as string, k.name as string]));

  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, name, program_kelas_id')
    .eq('active', true)
    .order('name');
  const anggota: AnggotaOpt[] = (anggotaRows ?? []).map((a) => ({
    id: a.id as string,
    name: a.name as string,
    kelasName: kelasById.get(a.program_kelas_id as string) ?? '—',
  }));

  // Riwayat lengkap: termasuk yang sudah dibatalkan, supaya halaman ini jadi
  // bank data — siapa pernah diputihkan, oleh siapa, kapan, dan kapan dicabut.
  const rows = (await getRiwayatPemutihan(month)).map((r) => ({
    id: r.id,
    anggotaId: r.anggotaId,
    alasan: r.alasan,
    periode: r.tanggal ? tanggalPendek(r.tanggal) : 'Sebulan penuh',
    oleh: r.dibuatOleh,
    pada: waktuWib(r.createdAt),
    dibatalkan: r.dibatalkanPada
      ? { oleh: r.dibatalkanOleh, pada: waktuWib(r.dibatalkanPada) }
      : null,
    // Hanya pemutihan sebulan-penuh yang aktif yang menutup tombol "putihkan".
    kunciSebulan: r.tanggal === null && r.dibatalkanPada === null,
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark"><span className="mark">M</span> Pemutihan Absensi</div>
          <Link href="/2in1/koordinator/kehadiran" className="back">{Icon.back(12)} Kehadiran</Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div>
              <h1 className="t-h2" style={{ marginBottom: 2 }}>Pemutihan absensi</h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Pemutihan <strong>sebulan penuh</strong>: peserta dianggap hadir penuh pada periode
                ini — kehadirannya dihitung 100%, tak masuk daftar di bawah target, dan alpa/izin
                bulan ini tak dihitung untuk SP. Data presensi aslinya tetap tersimpan.
              </p>
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
                Untuk memutihkan <strong>tanggal tertentu saja</strong>, buka{' '}
                <Link href="/2in1/koordinator/kehadiran/sp">Pendataan SP</Link> lalu tap nama
                pesertanya. Untuk <strong>banyak kelas sekaligus</strong>, pakai{' '}
                <Link href={`/2in1/koordinator/kehadiran/pemutihan/massal?month=${month}`}>
                  Pemutihan massal
                </Link>
                . Daftar di bawah memuat seluruh riwayat bulan ini, termasuk yang sudah dibatalkan.
              </p>
            </div>
            <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
          </div>

          <PemutihanClient month={month} anggota={anggota} rows={rows} />
        </div>
      </div>
    </main>
  );
}
