import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { bolehLihatRekapPengajarMaahir } from '@/lib/maahir-checkin-pengajar-akses';
import {
  getRekapPengajarMaahir,
  jamWib,
  LABEL_STATUS_CHECKIN,
  tanggalPendek,
  type RekapPengajarRow,
} from '@/lib/maahir-checkin-pengajar';
import {
  periodePengajarBerjalan,
  periodePengajarLabel,
  periodePengajarOptions,
  periodePengajarTampilan,
} from '@/lib/periode-pengajar';
import { todayJakarta } from '@/lib/anggota-periode';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

function pct(v: number | null): string {
  return v === null ? '—' : `${v}%`;
}

export default async function RekapPengajarMaahirPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const s = await getSession();
  if (!s.session && !s.accesses?.length) redirect('/?next=/2in1/koordinator/kehadiran/pengajar');
  if (!(await bolehLihatRekapPengajarMaahir())) redirect('/');

  const hariIni = todayJakarta();
  const options = periodePengajarOptions(hariIni);
  const month =
    searchParams.month && options.some((o) => o.value === searchParams.month)
      ? searchParams.month
      : periodePengajarTampilan(hariIni);
  const rekap = await getRekapPengajarMaahir(month, hariIni);
  const berjalan = month === periodePengajarBerjalan(hariIni);

  const total = rekap.list.reduce(
    (acc, r) => {
      acc.terjadwal += r.ringkasan.terjadwal;
      acc.hadir += r.ringkasan.hadir;
      acc.belum += r.ringkasan.belum;
      return acc;
    },
    { terjadwal: 0, hadir: 0, belum: 0 }
  );

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Kehadiran Pengajar Maahir
          </div>
          <Link href="/2in1/koordinator/kehadiran" className="back">
            {Icon.back(12)} Kehadiran Maahir
          </Link>
        </div>

        <div className="page">

          <div className="section-row" style={{ alignItems: 'center', marginBottom: 6 }}>
            <div>
              <h1 className="t-h1" style={{ marginBottom: 2 }}>Rekap Check-in Pengajar</h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Periode <strong>{periodePengajarLabel(month)}</strong>
                {berjalan && <> · dihitung s/d hari ini ({tanggalPendek(rekap.cutoff)})</>}
              </p>
            </div>
            <MonthNavSelect options={options} value={month} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <a
              href={`/api/laporan/kehadiran-pengajar/download?bulan=${month}`}
              className="btn btn-sm btn-primary"
              download
              style={{ textDecoration: 'none' }}
            >
              Export Excel — {periodePengajarLabel(month)}
            </a>
          </div>

          {rekap.list.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada pengajar terdaftar.</p>
          ) : (
            <div className="table-scroll" style={{ marginBottom: 20 }}>
              <table className="k-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Pengajar</th>
                    <th>Kelas</th>
                    <th style={{ textAlign: 'right' }} title="Sesi terjadwal yang sudah berjalan">Terjadwal</th>
                    <th style={{ textAlign: 'right' }}>Hadir</th>
                    <th style={{ textAlign: 'right' }}>Izin</th>
                    <th style={{ textAlign: 'right' }}>Sakit</th>
                    <th style={{ textAlign: 'right' }}>Belum diisi</th>
                    <th style={{ textAlign: 'center' }}>Kehadiran</th>
                    <th style={{ textAlign: 'right' }} title="Sesi hadir yang materinya kosong">Materi kosong</th>
                  </tr>
                </thead>
                <tbody>
                  {rekap.list.map((r) => {
                    const g = r.ringkasan;
                    return (
                      <tr key={r.pengajarId}>
                        <td style={{ fontWeight: 600 }}>
                          <a href={`#p-${r.pengajarId}`} style={{ color: 'inherit' }}>{r.name}</a>
                        </td>
                        <td className="t-small" style={{ color: 'var(--muted-2)' }}>{r.kelasNames.join(' · ') || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{g.terjadwal}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{g.hadir}</td>
                        <td style={{ textAlign: 'right' }}>{g.izin}</td>
                        <td style={{ textAlign: 'right' }}>{g.sakit}</td>
                        <td style={{ textAlign: 'right', color: g.belum > 0 ? 'var(--merah-ink)' : undefined, fontWeight: g.belum > 0 ? 600 : undefined }}>{g.belum}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: g.persen !== null && g.persen < 80 ? 'var(--merah-ink)' : 'var(--hijau-ink)' }}>{pct(g.persen)}</td>
                        <td style={{ textAlign: 'right', color: g.materiKosong > 0 ? 'var(--kuning-ink)' : 'var(--muted-2)' }}>{g.materiKosong}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 600 }}>Semua pengajar</td>
                    <td style={{ textAlign: 'right' }}>{total.terjadwal}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{total.hadir}</td>
                    <td colSpan={2}></td>
                    <td style={{ textAlign: 'right' }}>{total.belum}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                      {total.terjadwal > 0 ? `${Math.round((total.hadir / total.terjadwal) * 100)}%` : '—'}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {rekap.list.map((r) => (
            <RincianPengajar key={r.pengajarId} r={r} />
          ))}

          <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 16 }}>
            Sesi terjadwal diturunkan dari jadwal kelas (hari & jam) dikurangi tanggal libur; hanya
            sesi yang sudah berjalan yang dihitung. Jam = saat pengajar menekan check-in, tanpa aturan
            terlambat. <strong>Susulan</strong> = diisi bukan pada hari sesinya. Pengajar hanya bisa
            mengisi/menyunting periode berjalan (16 s/d 15).
          </p>
        </div>
      </div>
    </main>
  );
}

function RincianPengajar({ r }: { r: RekapPengajarRow }) {
  const lampau = r.sesi.filter((s) => s.lampau);
  return (
    <section id={`p-${r.pengajarId}`} style={{ marginBottom: 22 }}>
      <SectionHeader
        as="h2"
        title={r.name}
        right={<span className="t-tiny" style={{ color: 'var(--muted-2)' }}>{r.kelasNames.join(' · ')}</span>}
        style={{ marginBottom: 6 }}
      />
      {lampau.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada sesi yang berjalan.</p>
      ) : (
        <div className="table-scroll">
          <table className="k-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kelas</th>
                <th>Status</th>
                <th>Jam isi</th>
                <th>Materi</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {lampau.map((s) => {
                const c = s.checkin;
                return (
                  <tr key={`${s.kelasId}|${s.tanggal}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {tanggalPendek(s.tanggal)}
                      <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{s.waktuMulai?.slice(0, 5).replace(':', '.')}</div>
                    </td>
                    <td className="t-small">{s.kelasName}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {c ? (
                        <span className={`badge ${c.status === 'hadir' ? 'badge-hijau' : 'badge-kuning'}`}>
                          <span className="dot" />
                          {LABEL_STATUS_CHECKIN[c.status]}
                        </span>
                      ) : (
                        <span className="badge badge-merah"><span className="dot" />Belum diisi</span>
                      )}
                    </td>
                    <td className="t-small" style={{ whiteSpace: 'nowrap' }}>
                      {c ? jamWib(c.checked_in_at) : '—'}
                      {c?.susulan && <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>susulan</div>}
                    </td>
                    <td className="t-small" style={{ minWidth: 200 }}>
                      {c?.materi ? c.materi : c?.status === 'hadir' ? <span style={{ color: 'var(--kuning-ink)' }}>belum diisi</span> : '—'}
                    </td>
                    <td className="t-small" style={{ color: 'var(--muted-2)' }}>{c?.catatan ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
