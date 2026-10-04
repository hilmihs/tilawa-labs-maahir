import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSetoranTargets, targetResolver } from '@/lib/setoran-target';
import { isTakhassusKelas } from '@/lib/program-kelas';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { todayJakarta } from '@/lib/anggota-periode';
import { Icon } from '@/components/icons';
import { TargetSetoranClient, type KelasBlok, type VersiRow } from './TargetSetoranClient';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

function tanggalPendek(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function waktuWib(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export default async function TargetSetoranPage() {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  if (!accesses.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran')) {
    redirect('/2in1/koordinator/login');
  }

  const { data: kelasRows } = await supabaseAdmin
    .from('program_kelas')
    .select('id, name, gender')
    .order('gender')
    .order('name');
  const kelasList = ((kelasRows ?? []) as Array<{ id: string; name: string; gender: Gender }>)
    .filter((k) => isTakhassusKelas(k.name));

  if (kelasList.length === 0) {
    return (
      <main style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }} className="page">
          <p className="t-small">Belum ada kelas Takhassus.</p>
        </div>
      </main>
    );
  }

  const kelasIds = kelasList.map((k) => k.id);
  const [{ data: anggotaRows }, targets] = await Promise.all([
    supabaseAdmin
      .from('program_kelas_anggota')
      .select('id, program_kelas_id, name, selesai_tanggal')
      .in('program_kelas_id', kelasIds)
      .eq('active', true)
      .order('name'),
    getSetoranTargets(kelasIds),
  ]);

  // Target yang berlaku HARI INI — itu yang relevan saat koordinator menyetel.
  const hariIni = todayJakarta();
  const berlakuHariIni = targetResolver(targets);

  const anggotaList = ((anggotaRows ?? []) as Array<{
    id: string;
    program_kelas_id: string;
    name: string;
    selesai_tanggal: string | null;
  }>).filter((a) => !a.selesai_tanggal || a.selesai_tanggal >= hariIni);

  const versiOf = (kelasId: string, anggotaId: string | null): VersiRow[] =>
    targets
      .filter((t) => t.programKelasId === kelasId && t.anggotaId === anggotaId)
      .sort((a, b) => (a.berlakuMulai < b.berlakuMulai ? 1 : -1))
      .map((t) => ({
        id: t.id,
        halamanPerBulan: t.halamanPerBulan,
        berlakuLabel: tanggalPendek(t.berlakuMulai),
        catatan: t.catatan,
        oleh: t.dibuatOleh,
        pada: waktuWib(t.createdAt),
      }));

  const blok: KelasBlok[] = kelasList.map((k) => {
    const defaultVersi = versiOf(k.id, null);
    return {
      id: k.id,
      name: k.name,
      gender: k.gender,
      defaultBerlaku: defaultVersi.length ? defaultVersi[0].halamanPerBulan : null,
      defaultVersi,
      anggota: anggotaList
        .filter((a) => a.program_kelas_id === k.id)
        .map((a) => {
          const versi = versiOf(k.id, a.id);
          return {
            id: a.id,
            name: a.name,
            // null = ikut default kelas (resolver mengembalikan angka kelas).
            koreksi: versi.length ? versi[0].halamanPerBulan : null,
            efektif: berlakuHariIni(k.id, a.id, hariIni),
            versi,
          };
        }),
    };
  });

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark"><span className="mark">M</span> Target Setoran</div>
          <Link href="/2in1/koordinator" className="back">{Icon.back(12)} Dashboard</Link>
        </div>

        <div className="page">
          <div style={{ marginBottom: 14 }}>
            <h1 className="t-h2" style={{ marginBottom: 2 }}>Target setoran hafalan bulanan Takhassus</h1>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Target ditetapkan sebagai <strong>halaman per bulan</strong> — satu angka bulat per
              periode laporan (28–27), dan Laporan Bulanan memakainya apa adanya sebagai penyebut
              capaian. <strong>Tanpa prorata:</strong> sakit, tanggal libur, dan bergabung di tengah
              periode tidak menguranginya. Peserta dituntut sekian halaman dalam sebulan,
              bagaimanapun ia membagi hari-harinya — Takhassus Ikhwan berjadwal 5 hari/pekan dan
              Akhwat 3 hari/pekan, dan perbedaan itu sudah kamu perhitungkan saat memilih angkanya.
            </p>
            <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
              Yang mengisi sehari-hari <strong>bukan koordinator</strong>: peserta Takhassus Ikhwan
              memasang sendiri lewat Presensi Mandiri, dan peserta Akhwat dipasangkan oleh ketua
              kelasnya lewat halaman Setoran Hafalan. Halaman ini untuk memantau semuanya dan
              mengoreksi bila ada yang keliru atau belum terisi.
            </p>
            <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
              Mengubah target berarti <strong>menambah versi baru</strong>, bukan menimpa yang lama:
              periode yang sudah dilaporkan tetap memakai target yang berlaku saat itu. Peserta dan
              ketua terkunci ke periode berjalan; <strong>hanya dari halaman ini</strong> tanggal
              berlaku boleh dimundurkan — isi <em>berlaku mulai</em> dengan tanggal lama bila ingin
              bulan-bulan yang sudah lewat ikut dinilai. Default {tanggalPendek(PRESENSI_ANCHOR)},
              awal program.
            </p>
          </div>

          <TargetSetoranClient blok={blok} defaultBerlaku={PRESENSI_ANCHOR} maxTanggal={hariIni} />
        </div>
      </div>
    </main>
  );
}
