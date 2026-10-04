import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionWa, findKetuaProgramKelas } from '@/lib/program-kelas';
import { getMaahirRekap } from '@/lib/maahir-rekap';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { MaahirRekapTable } from '@/components/MaahirRekapTable';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/icons';
import { hariKelas, kelompokkanKelas } from '@/lib/grup-sesi';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7); // '2026-06'

export default async function RekapKetuaPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const myKelas = await findKetuaProgramKelas(wa);
  if (myKelas.length === 0) redirect('/2in1/ketua-kelas');

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : nowMonth;

  const rekap = await getMaahirRekap(month, { kelasIds: myKelas.map((k) => k.id) });
  const monthOptions = monthOptionsSince(ANCHOR_MONTH);
  // Kelas per hari yang segrup sesi tampil di bawah satu judul sesi.
  const grupById = new Map(myKelas.map((k) => [k.id, k.grup_sesi ?? null]));
  const entri = kelompokkanKelas(rekap, (k) => ({
    id: k.kelasId,
    grupSesi: grupById.get(k.kelasId),
    gender: k.gender,
    jadwalHari: k.jadwalHari,
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Rekap Kehadiran
          </div>
          <Link href="/2in1/ketua-kelas" className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>

        <div className="page">
          <div
            className="section-row"
            style={{ marginBottom: 16, alignItems: 'center' }}
          >
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Rekap kehadiran anggota per bulan
            </p>
            <MonthNavSelect options={monthOptions} value={month} />
          </div>

          {rekap.length === 0 && (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada data untuk bulan ini.
            </p>
          )}

          {entri.map((e) =>
            e.jenis === 'tunggal' ? (
              <div key={e.kunci} style={{ marginBottom: 28 }}>
                <SectionHeader
                  title={e.kelas.kelasName}
                  style={{ marginBottom: 8 }}
                  right={<BelumBadge belum={e.kelas.belumDiisi} />}
                />
                <MaahirRekapTable kelas={e.kelas} />
              </div>
            ) : (
              <div key={e.kunci} style={{ marginBottom: 28 }}>
                <SectionHeader
                  title={e.label}
                  style={{ marginBottom: 8 }}
                  right={<BelumBadge belum={e.anggota.reduce((n, k) => n + k.belumDiisi, 0)} />}
                />
                {e.anggota.map((k) => (
                  <div key={k.kelasId} style={{ marginBottom: 18 }}>
                    <div className="section-row" style={{ alignItems: 'center', marginBottom: 6 }}>
                      <div className="t-small" style={{ fontWeight: 600 }}>
                        {hariKelas(k.jadwalHari) || k.kelasName}
                      </div>
                      <BelumBadge belum={k.belumDiisi} />
                    </div>
                    <MaahirRekapTable kelas={k} />
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </main>
  );
}

function BelumBadge({ belum }: { belum: number }) {
  return belum > 0 ? (
    <Link
      href="/2in1/ketua-kelas/presensi"
      className="badge badge-merah"
      style={{ textDecoration: 'none' }}
    >
      {belum} belum diisi
    </Link>
  ) : (
    <span className="badge badge-hijau">Lengkap</span>
  );
}
