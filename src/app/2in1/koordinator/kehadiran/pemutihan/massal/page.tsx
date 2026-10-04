import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getBatches, getKelasPilihan } from '@/lib/maahir-pemutihan-batch';
import { periodeStartDate, periodeEndDate, periodeBerjalan } from '@/lib/periode-laporan';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { Icon } from '@/components/icons';
import { MassalClient, type BatchRow } from './MassalClient';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7);

function tanggalPendek(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function bulanPanjang(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Jam WIB — jejak "kapan" supaya aksi massal mudah ditelusuri. */
function waktuWib(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export default async function PemutihanMassalPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  if (!accesses.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran')) {
    redirect('/2in1/koordinator/login');
  }

  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : periodeBerjalan();

  const [kelas, batches] = await Promise.all([getKelasPilihan(month), getBatches(month)]);

  const kelasNameById = new Map(kelas.map((k) => [k.id, k.name]));
  const rows: BatchRow[] = batches.map((b) => ({
    id: b.id,
    alasan: b.alasan,
    jumlahPeserta: b.jumlahPeserta,
    // Kelas yang sudah dihapus tetap terhitung lewat snapshot, tapi namanya
    // tak bisa ditampilkan lagi — tandai apa adanya, jangan disembunyikan.
    kelasNames: b.kelasIds.map((id) => kelasNameById.get(id) ?? '(kelas dihapus)'),
    oleh: b.dibuatOleh,
    pada: waktuWib(b.createdAt),
    dibatalkan: b.dibatalkanPada
      ? { oleh: b.dibatalkanOleh, pada: waktuWib(b.dibatalkanPada) }
      : null,
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark"><span className="mark">M</span> Pemutihan Massal</div>
          <Link href="/2in1/koordinator/kehadiran/pemutihan" className="back">
            {Icon.back(12)} Pemutihan
          </Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div>
              <h1 className="t-h2" style={{ marginBottom: 2 }}>Pemutihan massal per kelas</h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Memutihkan <strong>seluruh anggota</strong> kelas yang dicentang untuk periode{' '}
                <strong>{bulanPanjang(month)}</strong> ({tanggalPendek(periodeStartDate(month))} –{' '}
                {tanggalPendek(periodeEndDate(month))}). Peserta dianggap hadir penuh: alpa dan izin
                bulan itu — Maahir maupun At-Tibyan — tak dihitung untuk SP. Data presensi aslinya
                tetap tersimpan.
              </p>
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
                Peserta yang sudah punya pemutihan sebulan-penuh aktif akan dilewati, bukan ditimpa.
                Satu aksi tersimpan sebagai satu batch dan bisa dibatalkan sekali klik.
              </p>
            </div>
            <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
          </div>

          <MassalClient month={month} kelas={kelas} rows={rows} />
        </div>
      </div>
    </main>
  );
}
