import Link from 'next/link';
import { requireOneOfRoles } from '@/lib/session';
import {
  getLaporanMaahir,
  labelRiwayatSP,
  labelSesiTakHadir,
  type StudentAtt,
} from '@/lib/laporan-maahir';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { periodeBerjalan } from '@/lib/periode-laporan';
import { monthOptionsSince } from '@/lib/month';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { Icon } from '@/components/icons';
import { NotesEditor } from './NotesEditor';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7);

/** Persen → "84%" atau "—" bila null. */
function pct(v: number | null): string {
  return v === null ? '—' : `${v}%`;
}
function num(v: number | null): string {
  return v === null ? '—' : String(v);
}
/** Warna kolom capaian target: ≥100 hijau · 80–99 kuning · <80 merah. */
function inkPersen(v: number | null): string | undefined {
  if (v === null) return 'var(--muted-2)';
  if (v >= 100) return 'var(--hijau-ink)';
  if (v >= 80) return 'var(--kuning-ink)';
  return 'var(--merah-ink)';
}
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
// Periode Maahir: 28 bulan lalu s/d 27 bulan ini (bukan kalender penuh).
function periodeLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 2, 28));
  const end = new Date(Date.UTC(y, m - 1, 27));
  const f = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${f(start)} – ${f(end)}`;
}

export default async function LaporanMaahirPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await requireOneOfRoles(['koordinator', 'syaikh']);
  const dashboardHref = session.role === 'syaikh' ? '/2in1/syaikh' : '/2in1/koordinator';

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : nowMonth;

  const lap = await getLaporanMaahir(month);
  const monthOptions = monthOptionsSince(ANCHOR_MONTH);
  const downloadUrl = `/api/laporan/maahir/download?bulan=${month}`;
  const kehadiranUrl = `/api/laporan/maahir/kehadiran/download?bulan=${month}`;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Laporan Bulanan Maahir
          </div>
          <Link href={dashboardHref} className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ marginBottom: 6, alignItems: 'center' }}>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Rekap program Maahir — <strong>{monthLabel(month)}</strong>
              <br />
              <span className="t-tiny">Periode {periodeLabel(month)}</span>
            </p>
            <MonthNavSelect options={monthOptions} value={month} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <a href={downloadUrl} className="btn btn-sm btn-primary" download style={{ textDecoration: 'none' }}>
              Export Excel — {monthLabel(month)}
            </a>
            <a href={kehadiranUrl} className="btn btn-sm btn-ghost" download style={{ textDecoration: 'none' }}>
              Export Data Kehadiran — {monthLabel(month)}
            </a>
            {session.role !== 'syaikh' && (
              <Link
                href="/2in1/koordinator/target-setoran"
                className="btn btn-sm btn-ghost"
                style={{ textDecoration: 'none' }}
              >
                Atur target setoran
              </Link>
            )}
          </div>
          <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>
            Export Data Kehadiran = matriks peserta × tanggal per kelas (H/I/S/A/T tiap pertemuan,
            ringkasan, dan keterangan), memakai periode yang sama dengan laporan ini.
          </p>

          <NotesEditor month={month} notes={lap.notes} />
          <TakhassusBlock lap={lap} />
          <MaahirBlock lap={lap} />
          <AtTibyanBlock lap={lap} />
          <PresensiTakTerisiBlock lap={lap} />
          <SPBlock lap={lap} />

          <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 20 }}>
            Presensi mulai dilacak {monthLabel(ANCHOR_MONTH)}. Bulan sebelumnya kosong.
            Kehadiran peserta Takhassus &amp; Maahir dihitung dari sesi Kelas Maahir; At-Tibyan
            dilaporkan terpisah. Kehadiran pengajar sementara default 100%.
            <br />
            <strong>Sakit dianggap udzur</strong> — sesinya dikeluarkan dari penyebut, jadi tidak
            menurunkan persen. Izin dan alpa tetap menurunkan. Kolom Pertemuan = (hadir+terlambat)
            dibagi pertemuan terisi setelah sakit dikeluarkan.
            <br />
            Angka di sini bisa berbeda dengan halaman <strong>Rekap Kehadiran</strong>: rekap
            memakai bulan kalender (1–31) dan menggabung sesi Maahir + At-Tibyan jadi satu persen,
            sedangkan laporan ini memakai periode 28–27 dan memisahkan keduanya.
          </p>
        </div>
      </div>
    </main>
  );
}

/* ============ Sub-komponen tabel ============ */

function ObsRow({
  no,
  hal,
  aktual,
  benchmark,
  notes,
}: {
  no: string;
  hal: string;
  aktual: string;
  benchmark: string;
  notes?: string;
}) {
  return (
    <tr>
      <td style={{ textAlign: 'center' }}>{no}</td>
      <td>{hal}</td>
      <td style={{ textAlign: 'center', fontWeight: 600 }}>{aktual}</td>
      <td style={{ textAlign: 'center', color: 'var(--muted-2)' }}>{benchmark}</td>
      <td style={{ color: 'var(--muted-2)' }}>{notes ?? ''}</td>
    </tr>
  );
}

function ObsTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="table-scroll">
        <table className="k-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>No</th>
              <th>{title}</th>
              <th style={{ width: 90 }}>Aktual</th>
              <th style={{ width: 90 }}>Benchmark</th>
              <th style={{ width: 160 }}>Notes</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function GenderRata({
  ikhwan,
  akhwat,
  rata,
}: {
  ikhwan: number | null;
  akhwat: number | null;
  rata: number | null;
}) {
  return (
    <div className="card-flat" style={{ padding: 10, margin: '4px 0 12px', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      <span className="t-small">Ikhwan: <strong>{pct(ikhwan)}</strong></span>
      <span className="t-small">Akhwat: <strong>{pct(akhwat)}</strong></span>
      <span className="t-small">Rata-rata: <strong>{pct(rata)}</strong></span>
    </div>
  );
}

function BawahTargetTable({ list }: { list: StudentAtt[] }) {
  if (list.length === 0) {
    return <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>Tidak ada peserta di bawah target.</p>;
  }
  return (
    <div className="table-scroll" style={{ marginBottom: 12 }}>
      <table className="k-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Peserta di bawah target</th>
            <th style={{ width: 70 }}>Kelas</th>
            <th style={{ width: 70 }}>Kehadiran</th>
            <th style={{ width: 90 }}>Pertemuan</th>
            <th style={{ width: 70 }}>Tidak hadir</th>
            <th style={{ width: 50 }}>Izin</th>
            <th style={{ width: 50 }}>Sakit</th>
            <th style={{ width: 50 }} title="Peserta ditandai alpa oleh ketua kelas (tercatat).">
              Alpa
            </th>
            <th
              style={{ width: 70 }}
              title="Sesi yang ketua kelasnya belum mengisi status peserta sama sekali. Bukan alpa — peserta tidak dirugikan; ini jejak kelalaian pengisian."
            >
              Tanpa ket.
            </th>
            <th style={{ width: 60 }}>Online</th>
            <th title="Tiap sesi tidak hadir: tanggal, status, dan alasan yang diisi ketua kelas.">
              Keterangan
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const hadir = s.counts.H + s.counts.T;
            // Sesi tidak hadir yang tak punya baris status (bukan izin/alpa).
            // Sakit sudah keluar dari penyebut, jadi tak ikut dikurangkan.
            const tanpaKet = Math.max(0, s.tidakHadir - (s.counts.I + s.counts.A));
            return (
              <tr key={s.anggotaId}>
                <td>
                  {s.name}
                  {s.mulaiTanggal && (
                    <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                      gabung {s.mulaiTanggal.slice(8, 10)}/{s.mulaiTanggal.slice(5, 7)}
                    </div>
                  )}
                </td>
                <td className="t-tiny">{s.kelasName}</td>
                <td style={{ textAlign: 'center' }}>{pct(s.persen)}</td>
                <td style={{ textAlign: 'center' }} className="t-tiny">
                  {hadir}/{s.filled}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 600 }}>{s.tidakHadir}x</td>
                <td style={{ textAlign: 'center' }}>{s.counts.I}</td>
                <td style={{ textAlign: 'center' }}>{s.counts.S}</td>
                <td style={{ textAlign: 'center' }}>{s.counts.A}</td>
                <td style={{ textAlign: 'center' }}>{tanpaKet}</td>
                <td style={{ textAlign: 'center' }}>{s.online > 0 ? `${s.online}×` : '—'}</td>
                <td className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                  {s.riwayat.length === 0 ? (
                    s.diputihkan === null ? '—' : null
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {s.riwayat.map((r) => (
                        <span key={`${r.tanggal}|${r.status}`} style={{ whiteSpace: 'nowrap' }}>
                          {labelSesiTakHadir(r)}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.diputihkan !== null && (
                    <div style={{ color: 'var(--hijau-ink)' }}>
                      diputihkan{s.diputihkan ? `: ${s.diputihkan}` : ''}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="t-tiny" style={{ color: 'var(--muted-2)', margin: '6px 2px 0' }}>
        <strong>Alpa</strong> = peserta ditandai alpa oleh ketua kelas (tercatat).{' '}
        <strong>Tanpa ket.</strong> = sesi yang ketua kelasnya belum mengisi status peserta sama
        sekali — bukan alpa, peserta tidak dirugikan; angka ini murni jejak kelalaian pengisian
        agar koordinator bisa menegur.
      </p>
    </div>
  );
}

function TakhassusBlock({ lap }: { lap: Awaited<ReturnType<typeof getLaporanMaahir>> }) {
  const t = lap.takhassus;
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="t-h2" style={{ marginBottom: 8 }}>Maahir Takhassus (Ikhwan &amp; Akhwat)</h2>

      <ObsTable title="Hal yang diobservasi">
        <ObsRow
          no="1"
          hal="Setoran Al-Qur'an per bulan (halaman)"
          aktual={num(t.setoran.aktual)}
          benchmark={num(t.setoran.benchmark)}
          notes="Rata-rata halaman per peserta yang mengisi setoran"
        />
        <ObsRow
          no="2"
          hal="Pencapaian target setoran hafalan"
          aktual={pct(t.setoran.persen)}
          benchmark={t.setoran.adaTarget ? '100%' : ''}
          notes={
            t.setoran.adaTarget
              ? 'Total halaman ÷ total target periode; peserta tanpa setoran dihitung 0'
              : 'Target bulanan belum diatur koordinator'
          }
        />
        <ObsRow no="3" hal="Kehadiran peserta per bulan" aktual={pct(t.kehadiran.aktual)} benchmark={`${t.kehadiran.benchmark}%`} />
        <ObsRow no="4" hal="Jumlah peserta dengan absensi di bawah target" aktual={`${t.dibawahTarget.jumlah} orang`} benchmark="" />
        <ObsRow no="5" hal="Kehadiran pengajar per bulan" aktual={`${t.kehadiranPengajar}%`} benchmark="80%" />
        <ObsRow no="6" hal="Jumlah pengajar dengan absensi di bawah target" aktual={`${t.pengajarDibawahTarget} orang`} benchmark="" />
      </ObsTable>

      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '4px 0' }}>Rincian setoran — peserta ({t.setoran.peserta.length})</div>
      <div className="table-scroll" style={{ marginBottom: 12 }}>
        <table className="k-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Peserta</th>
              <th style={{ width: 60 }}>Gender</th>
              <th style={{ width: 110 }}>Setoran (hal)</th>
              <th style={{ width: 100 }} title="Target halaman/bulan yang ditetapkan koordinator">
                Target (hal)
              </th>
              <th style={{ width: 70 }}>%</th>
              <th style={{ width: 90 }}>Pertemuan</th>
              <th>Rincian per pertemuan</th>
            </tr>
          </thead>
          <tbody>
            {t.setoran.peserta.map((p) => (
              <tr key={p.anggotaId}>
                <td>{p.name}</td>
                <td className="t-tiny">{p.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}</td>
                <td style={{ textAlign: 'center', fontWeight: p.halaman ? 600 : 400 }}>
                  {p.halaman ?? '—'}
                </td>
                <td style={{ textAlign: 'center' }} className="t-tiny">
                  {p.target === null ? (
                    '—'
                  ) : (
                    <>
                      {p.target}
                      <span style={{ color: 'var(--muted-2)' }}>
                        {' '}/bln · {p.sesiTarget} sesi
                      </span>
                    </>
                  )}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 600, color: inkPersen(p.persen) }}>
                  {p.persen === null ? '—' : `${p.persen}%`}
                </td>
                <td style={{ textAlign: 'center' }} className="t-tiny">
                  {p.pertemuanSetor > 0 ? `${p.pertemuanSetor}×` : '—'}
                </td>
                <td className="t-tiny" style={{ color: 'var(--muted-2)' }}>{p.rincian || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
        Target adalah <strong>halaman per bulan</strong> yang ditetapkan koordinator, dipakai apa
        adanya: sakit, libur, dan bergabung di tengah periode <strong>tidak</strong> menguranginya —
        peserta dituntut sekian halaman dalam sebulan, bagaimanapun ia membagi hari-harinya. Ini
        sengaja berbeda dari persentase kehadiran, yang justru memotong semua itu. Angka sesi di
        sebelah target hanya konteks banyaknya pertemuan, bukan pembagi. Peserta yang diputihkan
        sebulan penuh tampil “—”, bukan 100% — pemutihan menghapus ketidakhadiran, bukan mengarang
        hafalan.
      </p>

      <GenderRata ikhwan={t.kehadiran.avgIkhwan} akhwat={t.kehadiran.avgAkhwat} rata={t.kehadiran.aktual} />
      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '4px 0' }}>Peserta di bawah target (&lt; 80%)</div>
      <BawahTargetTable list={t.dibawahTarget.list} />
    </section>
  );
}

function MaahirBlock({ lap }: { lap: Awaited<ReturnType<typeof getLaporanMaahir>> }) {
  const m = lap.maahir;
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="t-h2" style={{ marginBottom: 8 }}>Maahir (selain Takhassus)</h2>

      <ObsTable title="Hal yang diobservasi">
        <ObsRow no="1" hal="Ujian teori mustawa (3 bulan)" aktual="—" benchmark="70" />
        <ObsRow no="2" hal="Ujian praktek mustawa (3 bulan)" aktual="—" benchmark="70" />
        <ObsRow no="3" hal="Kehadiran peserta per bulan" aktual={pct(m.kehadiran.aktual)} benchmark={`${m.kehadiran.benchmark}%`} />
        <ObsRow no="4" hal="Rata-rata keseluruhan Ujian (teori + praktek)" aktual="—" benchmark="70" />
        <ObsRow no="5" hal="Jumlah peserta dengan nilai akhir program di bawah target" aktual="—" benchmark="" />
        <ObsRow no="6" hal="Hafalan matan per mustawa (3 bulan)" aktual="—" benchmark="60" />
        <ObsRow no="7" hal="Jumlah peserta dengan hafalan matan di bawah target" aktual="—" benchmark="" />
        <ObsRow no="8" hal="Jumlah peserta dengan absensi di bawah target" aktual={`${m.dibawahTarget.jumlah} orang`} benchmark="" />
        <ObsRow no="9" hal="Kehadiran pengajar per bulan" aktual={`${m.kehadiranPengajar}%`} benchmark="85%" />
        <ObsRow no="10" hal="Jumlah pengajar dengan absensi di bawah target" aktual={`${m.pengajarDibawahTarget} orang`} benchmark="" />
      </ObsTable>

      <GenderRata ikhwan={m.kehadiran.avgIkhwan} akhwat={m.kehadiran.avgAkhwat} rata={m.kehadiran.aktual} />
      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '4px 0' }}>Peserta di bawah target (&lt; 80%)</div>
      <BawahTargetTable list={m.dibawahTarget.list} />
    </section>
  );
}

/**
 * Sesi yang lewat tanpa presensi terisi — jejak kelalaian ketua kelas.
 * Sengaja tak menghukum peserta: tak ada alpa otomatis dari sesi ini.
 */
function PresensiTakTerisiBlock({ lap }: { lap: Awaited<ReturnType<typeof getLaporanMaahir>> }) {
  const list = lap.presensiTakTerisi;
  if (list.length === 0) return null;
  const terkunci = periodeBerjalan() !== lap.month;
  const total = list.reduce((n, k) => n + k.jumlah, 0);
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="t-h2" style={{ marginBottom: 8 }}>Presensi Tak Terisi</h2>
      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        {total} sesi lewat tanpa presensi di {list.length} kelas.{' '}
        {terkunci
          ? 'Periode ini sudah terkunci — sesi tersebut tak bisa disusulkan lagi.'
          : 'Periode ini masih terbuka — masih bisa disusulkan sampai tanggal 28.'}{' '}
        Kehadiran peserta tak terpengaruh: tak ada yang dihitung alpa karenanya.
      </p>
      <div className="table-scroll">
        <table className="k-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Kelas</th>
              <th style={{ width: 70 }}>Sesi</th>
              <th style={{ textAlign: 'left' }}>Tanggal</th>
            </tr>
          </thead>
          <tbody>
            {list.map((k) => (
              <tr key={k.kelasName}>
                <td>{k.kelasName}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--merah-ink)' }}>
                  {k.jumlah}
                </td>
                <td className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                  {k.tanggal.join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Pendataan SP disiplin kehadiran peserta — periode bulan laporan ini saja. */
function SPBlock({ lap }: { lap: Awaited<ReturnType<typeof getLaporanMaahir>> }) {
  const { list, summary, mulai, cutoff } = lap.sp;
  const spBadge = (n: number) =>
    n >= 3
      ? { bg: 'var(--merah-tint)', bd: 'var(--merah-line)', ink: 'var(--merah-ink)' }
      : n === 2
        ? { bg: 'var(--kuning-tint)', bd: 'var(--kuning-line)', ink: 'var(--kuning-ink)' }
        : { bg: 'var(--surface-3)', bd: 'var(--line)', ink: 'var(--ink-2, var(--ink))' };
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="t-h2" style={{ marginBottom: 8 }}>Pendataan SP (Surat Peringatan)</h2>
      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        Periode {mulai} s/d {cutoff} (bulan ini saja), dari presensi yang diinput ketua kelas.
        Sesi Maahir &amp; At-Tibyan digabung. Alpa 1×/2×/≥3× → SP1/SP2/SP3 · Izin 2×/3×/≥4× →
        SP1/SP2/SP3 (diambil yang tertinggi). Total {summary.total} peserta — SP1 {summary.sp1} ·
        SP2 {summary.sp2} · SP3 {summary.sp3}.
      </p>
      {list.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada peserta terkena SP.</p>
      ) : (
        <div className="table-scroll" style={{ marginBottom: 12 }}>
          <table className="k-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Peserta</th>
                <th>Kelas</th>
                <th style={{ width: 60 }}>SP</th>
                <th style={{ width: 50 }}>Alpa</th>
                <th style={{ width: 50 }}>Izin</th>
                <th style={{ width: 50 }}>Sakit</th>
                <th style={{ width: 60 }}>Hadir</th>
                <th>Penetapan</th>
                <th title="Sesi izin/alpa yang membentuk SP-nya, kronologis, dengan alasan dari ketua kelas. Sesi yang diputihkan tak tampil.">
                  Riwayat
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const st = spBadge(p.sp);
                return (
                  <tr key={p.anggotaId}>
                    <td>{p.name}</td>
                    <td className="t-tiny">{p.kelasName}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge" style={{ background: st.bg, borderColor: st.bd, color: st.ink }}>
                        SP{p.sp}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{p.alpa}</td>
                    <td style={{ textAlign: 'center' }}>{p.izin}</td>
                    <td style={{ textAlign: 'center' }}>{p.sakit}</td>
                    <td style={{ textAlign: 'center' }}>{p.hadir + p.terlambat}</td>
                    <td className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                      {p.penetapan.length === 0
                        ? '—'
                        : p.penetapan
                            .map((r) => `SP${r.level} ${r.tanggal.slice(8, 10)}/${r.tanggal.slice(5, 7)}`)
                            .join(' · ')}
                    </td>
                    <td className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                      {p.riwayat.length === 0 ? (
                        '—'
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {p.riwayat.map((r) => (
                            <span key={`${r.tanggal}|${r.program}`} style={{ whiteSpace: 'nowrap' }}>
                              {labelRiwayatSP(r)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
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

function AtTibyanBlock({ lap }: { lap: Awaited<ReturnType<typeof getLaporanMaahir>> }) {
  const a = lap.atTibyan;
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="t-h2" style={{ marginBottom: 8 }}>At-Tibyan</h2>

      <ObsTable title="Hal yang diobservasi">
        <ObsRow no="1" hal="Kehadiran peserta per bulan" aktual={pct(a.kehadiran.aktual)} benchmark={`${a.kehadiran.benchmark}%`} />
        <ObsRow
          no="2"
          hal="Jumlah peserta dengan absensi di bawah target"
          aktual={`${a.dibawahTarget.total} orang`}
          benchmark=""
          notes={`Ikhwan ${a.dibawahTarget.ikhwan} · Akhwat ${a.dibawahTarget.akhwat}`}
        />
      </ObsTable>

      <GenderRata ikhwan={a.kehadiran.avgIkhwan} akhwat={a.kehadiran.avgAkhwat} rata={a.kehadiran.aktual} />
      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '4px 0' }}>Peserta di bawah target (&lt; 100%)</div>
      <BawahTargetTable list={a.dibawahTarget.list} />
    </section>
  );
}
