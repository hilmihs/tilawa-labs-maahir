import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPengajarMaahirSesi } from '@/lib/maahir-checkin-pengajar-akses';
import {
  awalDari,
  getSesiPengajar,
  jamWib,
  LABEL_STATUS_CHECKIN,
  ringkasSesi,
  tanggalPendek,
} from '@/lib/maahir-checkin-pengajar';
import {
  periodePengajarBerjalan,
  periodePengajarLabel,
  periodePengajarOptions,
  periodePengajarTampilan,
} from '@/lib/periode-pengajar';
import { todayJakarta } from '@/lib/anggota-periode';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { Icon } from '@/components/icons';
import { CheckinMaahirForm } from '../CheckinMaahirForm';

export const dynamic = 'force-dynamic';

export default async function RekapPengajarMaahirSayaPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const akses = await getPengajarMaahirSesi();
  if (!akses) redirect('/');

  const hariIni = todayJakarta();
  const options = periodePengajarOptions(hariIni);
  const month =
    searchParams.month && options.some((o) => o.value === searchParams.month)
      ? searchParams.month
      : periodePengajarTampilan(hariIni);
  const sesi = await getSesiPengajar(akses, month, hariIni);
  const ringkas = ringkasSesi(sesi);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Rincian Kehadiran
          </div>
          <Link href="/kehadiran/pengajar-maahir" className="back">
            {Icon.back(12)} Check-in
          </Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ alignItems: 'center', marginBottom: 10 }}>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              <strong>{akses.pengajar.name}</strong> · {akses.kelas.map((k) => k.name).join(' · ')}
              <br />
              <span className="t-tiny">Periode {periodePengajarLabel(month)}</span>
            </p>
            <MonthNavSelect options={options} value={month} />
          </div>

          <p className="t-small" style={{ marginBottom: 12 }}>
            Terjadwal <strong>{ringkas.terjadwal}</strong> · Hadir <strong>{ringkas.hadir}</strong> ·
            Izin {ringkas.izin} · Sakit {ringkas.sakit} · Belum diisi{' '}
            <strong style={{ color: ringkas.belum > 0 ? 'var(--merah-ink)' : undefined }}>{ringkas.belum}</strong> ·
            Kehadiran <strong>{ringkas.persen === null ? '—' : `${ringkas.persen}%`}</strong>
            {ringkas.materiKosong > 0 && (
              <> · <span style={{ color: 'var(--kuning-ink)' }}>{ringkas.materiKosong} materi belum diisi</span></>
            )}
          </p>

          {sesi.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada sesi pada periode ini.</p>
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sesi.map((s) => {
                    const c = s.checkin;
                    return (
                      <tr key={`${s.kelasId}|${s.tanggal}`} style={!s.lampau ? { opacity: 0.55 } : undefined}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {tanggalPendek(s.tanggal)}
                          <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                            {s.waktuMulai?.slice(0, 5).replace(':', '.')}
                          </div>
                        </td>
                        <td className="t-small">{s.kelasName}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {!s.lampau ? (
                            <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>belum berjalan</span>
                          ) : c ? (
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
                        <td className="t-small" style={{ minWidth: 160 }}>
                          {c?.materi ? c.materi : c?.status === 'hadir' ? <span style={{ color: 'var(--kuning-ink)' }}>belum diisi</span> : '—'}
                        </td>
                        <td className="t-small" style={{ color: 'var(--muted-2)' }}>{c?.catatan ?? '—'}</td>
                        <td style={{ minWidth: 200 }}>
                          {s.bolehIsi && (
                            <CheckinMaahirForm
                              kelasId={s.kelasId}
                              kelasName={s.kelasName}
                              tanggal={s.tanggal}
                              tanggalLabel={tanggalPendek(s.tanggal)}
                              awal={awalDari(s)}
                              susulan={s.tanggal < hariIni}
                              ringkas
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 12 }}>
            Hanya sesi periode berjalan yang bisa diisi atau disunting. Sesi yang belum berjalan
            tampil pudar sebagai pengingat jadwal.
          </p>
        </div>
      </div>
    </main>
  );
}
