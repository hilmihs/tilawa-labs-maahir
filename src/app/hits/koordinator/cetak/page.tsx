import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import {
  getHitsKoordinatorRekap,
  parseRekapFilter,
  filterQuery,
  filterLabel,
  scopeQuery,
  type HitsMode,
} from '@/lib/hits-koordinator-rekap';
import { parseBatchId, parseKelasMode } from '@/lib/hits-halaqah-scope';
import { HUTANG_RUMUS } from '@/lib/hits-ranking';
import { TOLERANSI_KMT } from '@/lib/hits-pelanggaran-kategori';
import { weekStartMonday } from '@/lib/week';
import type { Gender } from '@/types/db';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

const JENIS_LABEL: Record<string, string> = {
  KMT: 'Kelas Mulai Terlambat',
  KBLA: 'Kelas Berakhir Lebih Awal',
  JKG: 'Jadwal Kelas Ganti',
  BADAL: 'Pengajar digantikan (badal)',
  TIDAK_LATIHAN: 'Tidak memberikan latihan',
};

const STATUS_LABEL: Record<string, string> = {
  belum_ditabayyun: 'Belum ditabayyun',
  nunggu_alasan: 'Nunggu alasan pengajar',
  pending: 'Nunggu putusan koordinator',
  diputus: 'Sudah diputus',
};

/** Ambang sama dengan pctColor di halaman utama — 90 / 75. */
function pctInk(p: number | null): string | undefined {
  if (p === null) return undefined;
  return p >= 90 ? 'var(--hijau-ink)' : p >= 75 ? 'var(--kuning-ink)' : 'var(--merah-ink)';
}

export default async function CetakHitsKoordinatorPage({
  searchParams,
}: {
  searchParams: {
    mode?: string; month?: string; week?: string; gender?: string; masalah?: string; obs?: string;
    batch?: string; kelas?: string;
  };
}) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const boleh = accesses.some(
    (a) => a.role === 'koordinator_ketua_kelas' || a.role === 'koordinator' || a.role === 'syaikh'
  );
  if (!boleh) redirect('/');

  const mode: HitsMode = searchParams.mode === 'minggu' ? 'minggu' : 'bulan';
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '')
    ? (searchParams.month as string)
    : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const week = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week ?? '')
    ? (searchParams.week as string)
    : weekStartMonday();
  const gender: Gender | undefined =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : undefined;

  const filter = parseRekapFilter({ masalah: searchParams.masalah, obs: searchParams.obs });
  const batchId = parseBatchId(searchParams.batch);
  const kelas = parseKelasMode(searchParams.kelas);
  const r = await getHitsKoordinatorRekap({ mode, month, week, gender, batchId, kelas, filter });
  // Judul menyebut filter aktif — kertas hasil cetak gampang disangka daftar lengkap.
  const labelFilter = filterLabel(filter);
  // Cakupan halaqah SELALU dieja, termasuk saat tak ada yang dipilih. `scopeLabel`
  // sengaja null di layar (artinya "tak usah tampilkan chip"), tapi di kertas yang
  // beredar lepas dari layarnya diamnya menyesatkan: pembaca tak bisa membedakan
  // "semua kelas" dari "sudah disaring".
  const cakupan = [
    r.batchName ?? 'Semua batch',
    kelas === 'offline' ? 'kelas offline saja'
      : kelas === 'online' ? 'kelas online saja'
      : 'kelas online + offline',
  ].join(' · ');

  const kembali =
    `/hits/koordinator?mode=${mode}` +
    (mode === 'minggu' ? `&week=${week}` : `&month=${month}`) +
    (gender ? `&gender=${gender}` : '') +
    scopeQuery({ batchId, kelas }) +
    filterQuery(filter);

  const semua = [...r.ranked, ...r.noData];
  const totalInsiden = semua.reduce(
    (n, p) => n + (r.insidenByPengajar.get(p.pengajarId)?.length ?? 0),
    0
  );

  return (
    <main className="cetak" style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
      <div
        className="no-print"
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}
      >
        <Link href={kembali} className="btn btn-sm btn-ghost" style={{ textDecoration: 'none' }}>
          ← Kembali
        </Link>
        <PrintButton />
        <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
          Di dialog cetak pilih tujuan <strong>Save as PDF</strong>. Aktifkan opsi
          &quot;Background graphics&quot; supaya warnanya ikut tercetak.
        </span>
      </div>

      <h1 className="t-h2" style={{ marginBottom: 2 }}>Ranking Disiplin Pengajar</h1>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 14 }}>
        {mode === 'minggu' ? 'Mingguan' : 'Bulanan'} · {r.periodeLabel} · {r.genderLabel} ·{' '}
        {cakupan} · {r.ranked.length} pengajar berperingkat
        {r.noData.length > 0 && `, ${r.noData.length} tanpa sesi yang bisa dinilai`}
        {labelFilter && (
          <>
            {' '}· <strong>disaring: {labelFilter}</strong> (dari {r.counts.total} pengajar)
          </>
        )}
      </p>

      {/* ── Ranking ── */}
      <table className="k-table">
        <thead>
          <tr>
            <th>#</th>
            <th style={{ textAlign: 'left' }}>Pengajar</th>
            <th>Halaqah</th>
            <th title={`Persen pertemuan tepat jam — tanpa KMT (>${TOLERANSI_KMT} menit) / KBLA`}>%On-Time</th>
            <th title="Persen pertemuan sesuai jadwal — tanpa JKG / BADAL">%Stabil</th>
            <th title={`${JENIS_LABEL.KMT} — jumlah insiden`}>KMT</th>
            <th title={`${JENIS_LABEL.KBLA} — jumlah insiden`}>KBLA</th>
            <th title={`${JENIS_LABEL.JKG} — jumlah insiden`}>JKG</th>
            <th title={`${JENIS_LABEL.TIDAK_LATIHAN} — jumlah insiden`}>TL</th>
            <th title={`Kumulatif, bukan periode ini. ${HUTANG_RUMUS}`}>Hutang (mnt)<br />kumulatif</th>
          </tr>
        </thead>
        <tbody>
          {r.ranked.map((p) => (
            <tr key={p.pengajarId}>
              <td style={{ textAlign: 'center' }}>{p.rank}</td>
              <td style={{ fontWeight: 600 }}>{p.pengajarNama}</td>
              <td style={{ textAlign: 'center' }}>{p.halaqahCount}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: pctInk(p.pctOnTime) }}>
                {p.pctOnTime === null ? '—' : `${p.pctOnTime}%`}
              </td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: pctInk(p.pctStabil) }}>
                {p.pctStabil === null ? '—' : `${p.pctStabil}%`}
              </td>
              {[p.kmt, p.kbla, p.jkg, p.tidakLatihan].map((n, i) => (
                <td
                  key={i}
                  style={{
                    textAlign: 'center',
                    color: n > 0 ? 'var(--merah-ink)' : 'var(--muted)',
                    fontWeight: n > 0 ? 700 : 400,
                  }}
                >
                  {n > 0 ? n : '—'}
                </td>
              ))}
              <td style={{ textAlign: 'center', color: p.hutangSaldo > 0 ? 'var(--kuning-ink)' : 'var(--muted)' }}>
                {p.hutangSaldo > 0 ? p.hutangSaldo : '—'}
              </td>
            </tr>
          ))}
          {r.noData.map((p) => (
            <tr key={p.pengajarId} style={{ opacity: 0.6 }}>
              <td style={{ textAlign: 'center' }}>—</td>
              <td>{p.pengajarNama}</td>
              <td style={{ textAlign: 'center' }}>{p.halaqahCount}</td>
              <td colSpan={7} className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                Tak ada pertemuan yang bisa dinilai — ketua kelas belum mengisi, atau
                halaqahnya belum berjalan pada periode ini
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Kertas tak punya tooltip — keterangan kolom dicetak sebagai catatan kaki. */}
      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 6, lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}>
          <strong>%On-Time</strong> = pertemuan tanpa KMT (&gt;{TOLERANSI_KMT} menit) / KBLA,
          dibagi pertemuan non-libur yang TIDAK dipindah hari maupun dibadalkan ·{' '}
          <strong>%Stabil</strong> = pertemuan yang tidak dipindah/dibadalkan, dibagi semua
          pertemuan non-libur.
        </p>
        <p style={{ margin: 0 }}>
          <strong>KMT / KBLA / JKG / TL</strong> = jumlah insiden (satu pertemuan bisa lebih dari
          satu insiden), bukan jumlah pertemuan.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Hutang (mnt)</strong> = KUMULATIF, bukan periode ini. {HUTANG_RUMUS}
        </p>
        {/* Pengecualian yang tak punya baris penanda di tabel — tanpa disebut di
            sini, pengajar yang absen mudah disangka tak punya pelanggaran. */}
        <p style={{ margin: 0 }}>
          <strong>Cakupan</strong> = {cakupan}. Halaqah yang tidak aktif dan yang belum punya
          pengajar tidak ikut dihitung. Online/offline ditentukan dari kata &quot;Offline&quot; di
          kolom jadwal sheet HITS; halaqah yang kolom jadwalnya kosong dianggap online.
        </p>
      </div>

      {/* ── Rincian insiden ── */}
      <div className="blok" style={{ marginTop: 20 }}>
        <h2 className="t-h3" style={{ marginBottom: 8 }}>
          Rincian Insiden &amp; Tabayyun ({totalInsiden})
        </h2>
        {totalInsiden === 0 ? (
          <p className="t-small" style={{ color: 'var(--muted-2)' }}>
            Tak ada insiden pada periode ini.
          </p>
        ) : (
          <table className="k-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Pengajar</th>
                <th>Tanggal</th>
                <th style={{ textAlign: 'left' }}>Halaqah</th>
                <th style={{ textAlign: 'left' }}>Pelanggaran</th>
                <th style={{ textAlign: 'left' }}>Keterangan ketua</th>
                <th style={{ textAlign: 'left' }}>Alasan pengajar</th>
                <th style={{ textAlign: 'left' }}>Putusan</th>
              </tr>
            </thead>
            <tbody>
              {semua.flatMap((p) =>
                (r.insidenByPengajar.get(p.pengajarId) ?? []).map((i) => (
                  <tr key={i.keteranganId}>
                    <td>{p.pengajarNama}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{i.tanggal}</td>
                    <td>{i.halaqahName}</td>
                    <td>
                      {i.pelanggaran
                        .map(
                          (x) =>
                            `${JENIS_LABEL[x.jenis] ?? x.jenis}${x.detail ? ` (${x.detail})` : ''}`
                        )
                        .join('; ')}
                    </td>
                    <td>{i.catatanKetua || '—'}</td>
                    <td>{i.alasanPengajar || '—'}</td>
                    <td
                      style={{
                        color:
                          i.status !== 'diputus'
                            ? 'var(--kuning-ink)'
                            : i.isUdzurSyari === false
                              ? 'var(--merah-ink)'
                              : undefined,
                      }}
                    >
                      {i.status === 'diputus' && i.isUdzurSyari !== null
                        ? i.isUdzurSyari
                          ? 'Udzur syar’i diterima'
                          : 'Udzur ditolak'
                        : STATUS_LABEL[i.status]}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Cakupan observasi ── */}
      <div className="blok" style={{ marginTop: 20 }}>
        <h2 className="t-h3" style={{ marginBottom: 8 }}>Cakupan Observasi Ketua Kelas</h2>
        <table className="k-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Pengajar</th>
              <th>Sudah</th>
              <th>Belum</th>
              <th>Total</th>
              <th>% Terisi</th>
              <th style={{ textAlign: 'left' }}>Pertemuan belum terisi</th>
            </tr>
          </thead>
          <tbody>
            {semua.map((p) => {
              const c = r.cakupanByPengajar.get(p.pengajarId);
              if (!c) return null;
              const belum = c.pertemuan.filter((x) => x.status !== 'sudah');
              return (
                <tr key={p.pengajarId}>
                  <td>{p.pengajarNama}</td>
                  <td style={{ textAlign: 'center' }}>{c.sudah}</td>
                  <td style={{ textAlign: 'center', color: c.belum > 0 ? 'var(--merah-ink)' : undefined }}>
                    {c.belum}
                  </td>
                  <td style={{ textAlign: 'center' }}>{c.total}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: pctInk(c.persen) }}>
                    {c.persen === null ? '—' : `${c.persen}%`}
                  </td>
                  <td className="t-tiny">
                    {belum.length === 0
                      ? '—'
                      : belum.map((x) => `${x.tanggal} ${x.halaqahName}`).join('; ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
