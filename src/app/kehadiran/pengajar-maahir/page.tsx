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
  type SesiPengajar,
} from '@/lib/maahir-checkin-pengajar';
import { periodePengajarLabel, periodePengajarTampilan } from '@/lib/periode-pengajar';
import { todayJakarta } from '@/lib/anggota-periode';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Icon } from '@/components/icons';
import { CheckinMaahirForm } from './CheckinMaahirForm';

export const dynamic = 'force-dynamic';

function jamRange(s: SesiPengajar): string {
  if (!s.waktuMulai) return '';
  const a = s.waktuMulai.slice(0, 5).replace(':', '.');
  const b = s.waktuSelesai ? s.waktuSelesai.slice(0, 5).replace(':', '.') : '';
  return b ? `${a} – ${b}` : a;
}

export default async function PengajarMaahirPage() {
  const akses = await getPengajarMaahirSesi();
  if (!akses) redirect('/');

  const hariIni = todayJakarta();
  const month = periodePengajarTampilan(hariIni);
  const sesi = await getSesiPengajar(akses, month, hariIni);
  const ringkas = ringkasSesi(sesi);
  const hariIniSesi = sesi.filter((s) => s.tanggal === hariIni);
  const belumLampau = sesi.filter((s) => s.lampau && !s.checkin && s.tanggal !== hariIni && s.bolehIsi);
  const materiKosong = sesi.filter((s) => s.checkin?.status === 'hadir' && !s.checkin.materi?.trim());

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Kehadiran Pengajar
          </div>
          <Link href="/" className="back">
            {Icon.back(12)} Beranda
          </Link>
        </div>

        <div className="page">

          <h1 className="t-h1" style={{ marginBottom: 2 }}>Check-in Kelas Maahir</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 14 }}>
            {akses.pengajar.name} · {akses.kelas.map((k) => k.name).join(' · ') || 'belum ada kelas'}
            <br />
            <span className="t-tiny">Periode {periodePengajarLabel(month)} · hari ini {tanggalPendek(hariIni)}</span>
          </p>

          <div className="matrix-stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 16 }}>
            <StatCard
              value={ringkas.persen === null ? '—' : `${ringkas.persen}%`}
              label={`Hadir ${ringkas.hadir}/${ringkas.terjadwal} sesi`}
              valueColor={ringkas.persen !== null && ringkas.persen < 80 ? 'var(--merah-ink)' : 'var(--hijau-ink)'}
            />
            <StatCard
              value={ringkas.belum}
              label="Sesi belum diisi"
              valueColor={ringkas.belum > 0 ? 'var(--merah-ink)' : undefined}
            />
            <StatCard
              value={ringkas.izin + ringkas.sakit}
              label={`Izin ${ringkas.izin} · Sakit ${ringkas.sakit}`}
            />
          </div>

          <SectionHeader title="Hari ini" as="h2" style={{ marginBottom: 8 }} />
          {hariIniSesi.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
              Tidak ada jadwal kelas hari ini.
            </p>
          ) : (
            hariIniSesi.map((s) => (
              <div key={`${s.kelasId}|${s.tanggal}`} className="card" style={{ padding: '12px 14px', marginBottom: 10, borderLeft: '3px solid var(--accent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: s.checkin ? 6 : 10 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.kelasName}</div>
                    <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{jamRange(s)}</div>
                  </div>
                  {s.checkin && (
                    <span className={`badge ${s.checkin.status === 'hadir' ? 'badge-hijau' : 'badge-kuning'}`}>
                      <span className="dot" />
                      {LABEL_STATUS_CHECKIN[s.checkin.status]} · {jamWib(s.checkin.checked_in_at)}
                    </span>
                  )}
                </div>
                {s.checkin?.materi && (
                  <div className="t-small" style={{ marginBottom: 6 }}>
                    <span style={{ color: 'var(--muted-2)' }}>Materi:</span> {s.checkin.materi}
                  </div>
                )}
                <CheckinMaahirForm
                  kelasId={s.kelasId}
                  kelasName={s.kelasName}
                  tanggal={s.tanggal}
                  tanggalLabel={tanggalPendek(s.tanggal)}
                  awal={awalDari(s)}
                  susulan={false}
                  ringkas
                />
              </div>
            ))
          )}

          {belumLampau.length > 0 && (
            <>
              <SectionHeader title={`Belum diisi (${belumLampau.length})`} as="h2" style={{ margin: '16px 0 8px' }} />
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
                Sesi yang sudah lewat dalam periode ini. Isian di sini tercatat sebagai <strong>susulan</strong>.
              </p>
              {belumLampau.map((s) => (
                <div key={`${s.kelasId}|${s.tanggal}`} className="card" style={{ padding: '12px 14px', marginBottom: 10 }}>
                  <CheckinMaahirForm
                    kelasId={s.kelasId}
                    kelasName={s.kelasName}
                    tanggal={s.tanggal}
                    tanggalLabel={`${tanggalPendek(s.tanggal)} · ${jamRange(s)}`}
                    awal={null}
                    susulan
                  />
                </div>
              ))}
            </>
          )}

          {materiKosong.length > 0 && (
            <div className="banner" style={{ marginTop: 12 }}>
              <div className="desc">
                <strong>{materiKosong.length} sesi hadir belum ada materinya.</strong> Lengkapi lewat halaman rincian.
              </div>
            </div>
          )}

          <Link
            href="/kehadiran/pengajar-maahir/rekap"
            className="card-flat"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', marginTop: 16, textDecoration: 'none', color: 'inherit', borderRadius: 10 }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Rincian kehadiran &amp; materi</div>
              <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>Semua sesi per periode 16–15, sunting materi</div>
            </div>
            <span style={{ color: 'var(--muted-2)' }}>→</span>
          </Link>

          <Link
            href="/kehadiran/pertemuan"
            className="card-flat"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', marginTop: 8, textDecoration: 'none', color: 'inherit', borderRadius: 10 }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Rekap pertemuan semua program</div>
              <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>Jumlah pertemuan per halaqah, termasuk Dashboard Edu</div>
            </div>
            <span style={{ color: 'var(--muted-2)' }}>→</span>
          </Link>

          <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 16 }}>
            Jam check-in dicatat apa adanya saat tombol ditekan. Materi boleh diisi setelah kelas
            selesai. Pengisian dan penyuntingan hanya untuk periode berjalan (16 s/d 15); sesudah
            tanggal 15 data terkunci.
          </p>
        </div>
      </div>
    </main>
  );
}
