import { Fragment } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import {
  getNoDataActionInfo,
  getKetuaByHalaqah,
  HUTANG_RUMUS,
  type InsidenDetail,
  type KetuaHalaqahInfo,
  type HutangRincianPengajar,
} from '@/lib/hits-ranking';
import {
  getHitsKoordinatorRekap,
  parseRekapFilter,
  filterQuery,
  filterAktif,
  scopeQuery,
  daftarBatch,
  type HitsMode,
  type RekapFilter,
} from '@/lib/hits-koordinator-rekap';
import { parseBatchId, parseKelasMode } from '@/lib/hits-halaqah-scope';
import { getHitsPengajuan } from '@/lib/hits-pengajuan';
import type { CakupanPengajar, PertemuanObservasi } from '@/lib/hits-observasi-cakupan';
import { GenderNavSelect } from '@/components/GenderNavSelect';
import { QueryNavSelect } from '@/components/QueryNavSelect';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { WeekNavSelect } from '@/components/WeekNavSelect';
import { NoteQuickAdd } from '@/components/NoteQuickAdd';
import {
  buildWaMeUrl,
  tplReminderIsiKeterangan,
  tplReminderPengajarIsiData,
  tplReminderKetuaKelasObservasiRinci,
  tplHitsRekapInsidenGrup,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { SalinRekapButton } from '@/app/shakwa/koordinator/SalinRekapButton';
import { monthOptionsSince } from '@/lib/month';
import { weekStartMonday, formatWeekRangeShort, recentMondays } from '@/lib/week';
import type { Gender } from '@/types/db';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = '2026-01'; // batch HITS paling awal mulai Jan 2026

const JENIS_LABEL: Record<string, string> = {
  KMT: 'Kelas Mulai Terlambat',
  KBLA: 'Kelas Berakhir Lebih Awal',
  JKG: 'Jadwal Kelas Ganti',
  BADAL: 'Pengajar digantikan (badal)',
  TIDAK_LATIHAN: 'Tidak memberikan latihan',
};
const JENIS_SHORT: Record<string, string> = {
  KMT: 'KMT',
  KBLA: 'KBLA',
  JKG: 'JKG',
  BADAL: 'BADAL',
  TIDAK_LATIHAN: 'TL',
};
const STATUS_LABEL: Record<InsidenDetail['status'], string> = {
  belum_ditabayyun: 'Belum ditabayyun',
  nunggu_alasan: 'Nunggu alasan pengajar',
  pending: 'Nunggu putusan koordinator',
  diputus: 'Sudah diputus',
};

/** Putusan koordinator ketua kelas: udzur syar'i diterima / ditolak. */
function putusanText(i: InsidenDetail): string {
  if (i.status !== 'diputus' || i.isUdzurSyari === null) return STATUS_LABEL[i.status];
  return i.isUdzurSyari ? '✅ Udzur syar’i diterima' : '❌ Udzur ditolak';
}

const TGL_PENDEK = (t: string) => {
  const [, m, d] = t.split('-').map(Number);
  return `${d}/${m}`;
};

/**
 * Cakupan observasi ketua kelas: pertemuan mana pada periode ini yang sudah
 * diobservasi dan mana yang belum. "Belum" mencakup baris pra-generate impor —
 * baris itu ada di DB tapi bukan hasil observasi siapa pun.
 */
function CakupanObservasiRows({
  c,
  pengajarName,
  periodeLabel,
  ketuaByHalaqah,
}: {
  c: CakupanPengajar;
  pengajarName: string;
  periodeLabel: string;
  ketuaByHalaqah: Map<string, KetuaHalaqahInfo>;
}) {
  // Kelompokkan per halaqah, tapi simpan halaqahId juga (untuk ketua & link isi).
  const perHalaqah = new Map<string, { halaqahId: string; list: PertemuanObservasi[] }>();
  for (const p of c.pertemuan) {
    const g = perHalaqah.get(p.halaqahName) ?? { halaqahId: p.halaqahId, list: [] };
    g.list.push(p);
    perHalaqah.set(p.halaqahName, g);
  }
  return (
    <details style={{ background: 'var(--surface-2, var(--surface-3))' }}>
      <summary className="t-tiny" style={{ cursor: 'pointer', padding: '6px 12px', color: 'var(--muted-2)' }}>
        ▸ Observasi ketua kelas — <strong>{c.sudah}/{c.total}</strong> pertemuan terisi
        {c.belum > 0 && (
          <span style={{ color: 'var(--merah-ink)' }}> · {c.belum} belum diobservasi</span>
        )}
      </summary>
      <div style={{ padding: '8px 12px 12px' }}>
        {[...perHalaqah.entries()].map(([nama, { halaqahId, list }]) => {
          const belumList = list.filter((p) => p.status !== 'sudah');
          const ketua = ketuaByHalaqah.get(halaqahId);
          const waReminder =
            belumList.length > 0 && ketua?.wa
              ? buildWaMeUrl(
                  ketua.wa,
                  tplReminderKetuaKelasObservasiRinci({
                    ketuaNama: ketua.nama,
                    halaqahName: nama,
                    pengajarName,
                    periodeLabel,
                    belumList: belumList.map((p) => ({ tanggal: p.tanggal, pertemuanNo: p.pertemuanNo })),
                    isiUrl: ketua.magicToken
                      ? absUrl(`/api/auth/magic-link?token=${ketua.magicToken}`)
                      : absUrl('/hits/ketua'),
                  })
                )
              : null;
          return (
          <div key={nama} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>{nama}</span>
              {belumList.length > 0 && (
                waReminder ? (
                  <a
                    href={waReminder}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-wa btn-xs"
                    style={{ height: 22, padding: '0 8px', fontSize: 10, gap: 4, whiteSpace: 'nowrap' }}
                    title={`Ingatkan ketua kelas via WA — ${belumList.length} pertemuan belum diisi`}
                  >
                    {Icon.wa(11)} Ingatkan ketua ({belumList.length})
                  </a>
                ) : (
                  <span className="t-tiny" style={{ color: 'var(--muted)' }}>
                    (WA ketua belum ada)
                  </span>
                )
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {list.map((p) => {
                const sudah = p.status === 'sudah';
                return (
                  <span
                    key={`${p.halaqahId}-${p.tanggal}`}
                    title={
                      sudah
                        ? `${p.tanggal} — sudah diobservasi${p.libur ? ' (libur)' : ''}`
                        : p.status === 'pragenerate'
                          ? `${p.tanggal} — baris pra-generate impor, ketua kelas belum mengisi`
                          : `${p.tanggal} — belum diisi ketua kelas`
                    }
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 5,
                      border: '1px solid',
                      borderColor: sudah ? 'var(--hijau-line)' : 'var(--merah-line)',
                      background: sudah ? 'var(--hijau-tint)' : 'var(--merah-tint)',
                      color: sudah ? 'var(--hijau-ink)' : 'var(--merah-ink)',
                      opacity: p.libur ? 0.65 : 1,
                    }}
                  >
                    {sudah ? '✓' : '○'} {TGL_PENDEK(p.tanggal)}
                    {p.pertemuanNo ? ` (${p.pertemuanNo})` : ''}
                  </span>
                );
              })}
            </div>
          </div>
          );
        })}
        <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
          ✓ hijau = ketua kelas sudah mengisi keterangan · ○ merah = belum.
          Pelanggaran (TL/KMT/KBLA/JKG) hanya dihitung dari pertemuan yang sudah diobservasi
          dan tanggalnya sudah lewat.
        </p>
      </div>
    </details>
  );
}

/**
 * Deep-link ke halaman putusan tabayyun (/observasi/koordinator). `q` menyaring
 * ke halaqah terkait; anchor #tab-<id> menggulir langsung ke kartu tabayyun-nya.
 * Gender terkunci ke sesi koordinator di halaman tujuan, jadi tak perlu dikirim.
 */
function tabayyunHref(i: InsidenDetail): string | null {
  if (!i.tabayyunId) return null;
  return `/observasi/koordinator?statusTab=all&q=${encodeURIComponent(i.halaqahName)}#tab-${i.tabayyunId}`;
}

/** Rincian insiden KMT/KBLA/JKG/TL satu pengajar — alasan & putusan. */
function InsidenDetailRows({ list }: { list: InsidenDetail[] }) {
  return (
    <details style={{ background: 'var(--surface-2, var(--surface-3))' }}>
      <summary
        className="t-tiny"
        style={{ cursor: 'pointer', padding: '6px 12px', color: 'var(--muted-2)' }}
      >
        Rincian {list.length} insiden — alasan ketua kelas, tabayyun &amp; putusan
      </summary>
      <div style={{ padding: '0 12px 12px' }}>
        <table className="k-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 92 }}>Tanggal</th>
              <th style={{ width: 40 }}>Prt</th>
              <th>Halaqah</th>
              <th style={{ width: 150 }}>Pelanggaran</th>
              <th>Keterangan ketua</th>
              <th>Alasan pengajar (tabayyun)</th>
              <th style={{ width: 150 }}>Putusan koordinator</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.keteranganId}>
                <td className="t-tiny" style={{ whiteSpace: 'nowrap' }}>{i.tanggal}</td>
                <td className="t-mono t-tiny">{i.pertemuanNo}</td>
                <td className="t-tiny">{i.halaqahName}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {i.pelanggaran.map((p, idx) => (
                      <span
                        key={`${p.jenis}-${idx}`}
                        className="badge"
                        title={JENIS_LABEL[p.jenis] ?? p.jenis}
                        style={{
                          background: p.jenis === 'TIDAK_LATIHAN' ? 'var(--merah-tint)' : 'var(--kuning-tint)',
                          borderColor: p.jenis === 'TIDAK_LATIHAN' ? 'var(--merah-line)' : 'var(--kuning-line)',
                          color: p.jenis === 'TIDAK_LATIHAN' ? 'var(--merah-ink)' : 'var(--kuning-ink)',
                        }}
                      >
                        {JENIS_SHORT[p.jenis] ?? p.jenis}
                        {p.detail ? ` · ${p.detail}` : ''}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="t-tiny" style={{ color: 'var(--muted-2)', maxWidth: 220 }}>
                  {i.catatanKetua?.trim() || '—'}
                </td>
                <td className="t-tiny" style={{ color: 'var(--muted-2)', maxWidth: 220 }}>
                  {i.dariIzin && (
                    <div style={{ marginBottom: 2 }}>
                      <span
                        className="badge"
                        title="Alasan diambil dari izin yang pengajar kirim lewat Shakwa sebelum kelas — tak perlu tabayyun susulan."
                        style={{ background: 'var(--hijau-tint)', borderColor: 'var(--hijau-line)', color: 'var(--hijau-ink)' }}
                      >
                        Izin pra-kelas
                      </span>
                    </div>
                  )}
                  {i.alasanPengajar?.trim() || '—'}
                </td>
                <td className="t-tiny" style={{ maxWidth: 180 }}>
                  {(() => {
                    const href = tabayyunHref(i);
                    const perluTindak = i.status !== 'diputus';
                    return href ? (
                      <a
                        href={href}
                        style={{
                          color: perluTindak ? 'var(--accent)' : 'inherit',
                          textDecoration: 'none',
                          fontWeight: perluTindak ? 600 : 400,
                        }}
                        title="Buka halaman tabayyun untuk menindak"
                      >
                        {putusanText(i)}{perluTindak ? ' →' : ''}
                      </a>
                    ) : (
                      <div>{putusanText(i)}</div>
                    );
                  })()}
                  {i.keputusanCatatan?.trim() ? (
                    <div style={{ color: 'var(--muted-2)' }}>{i.keputusanCatatan}</div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const HUTANG_STATUS_LABEL: Record<HutangRincianPengajar['status'], string> = {
  belum: 'Belum dibayar',
  sebagian: 'Dibayar sebagian',
  lunas: 'Lunas',
};

/** Warna badge status pelunasan — lunas hijau, sebagian kuning, belum merah. */
function hutangStatusStyle(s: HutangRincianPengajar['status']) {
  if (s === 'lunas') return { background: 'var(--hijau-tint)', borderColor: 'var(--hijau-line)', color: 'var(--hijau-ink)' };
  if (s === 'sebagian') return { background: 'var(--kuning-tint)', borderColor: 'var(--kuning-line)', color: 'var(--kuning-ink)' };
  return { background: 'var(--merah-tint)', borderColor: 'var(--merah-line)', color: 'var(--merah-ink)' };
}

/**
 * Asal-usul kolom "Hutang (mnt)": pertemuan mana yang menimbulkan debit, berapa
 * sudah dibayar, dan sisanya. Dipisah dari rincian insiden karena cakupannya
 * beda — hutang kumulatif sejak anchor, insiden hanya periode yang dipilih.
 */
function HutangDetailRows({ list }: { list: HutangRincianPengajar[] }) {
  const debit = list.reduce((s, i) => s + i.debit, 0);
  const bayar = list.reduce((s, i) => s + i.terbayar, 0);
  const sisa = list.reduce((s, i) => s + i.sisa, 0);
  return (
    <details style={{ background: 'var(--surface-2, var(--surface-3))' }}>
      <summary
        className="t-tiny"
        style={{ cursor: 'pointer', padding: '6px 12px', color: 'var(--muted-2)' }}
        title={HUTANG_RUMUS}
      >
        ▸ Asal hutang menit — debit <strong>{debit}</strong> · dibayar <strong>{bayar}</strong> ·{' '}
        <span style={{ color: sisa > 0 ? 'var(--merah-ink)' : 'var(--hijau-ink)' }}>
          sisa <strong>{sisa}</strong> mnt
        </span>{' '}
        dari {list.length} pertemuan
      </summary>
      <div style={{ padding: '0 12px 12px' }}>
        <table className="k-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 92 }}>Tanggal</th>
              <th>Halaqah</th>
              <th style={{ width: 120 }}>Jenis</th>
              <th style={{ width: 70, textAlign: 'right' }}>Debit</th>
              <th style={{ width: 70, textAlign: 'right' }}>Dibayar</th>
              <th style={{ width: 70, textAlign: 'right' }}>Sisa</th>
              <th style={{ width: 130 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.keterangan_id}>
                <td className="t-tiny" style={{ whiteSpace: 'nowrap' }}>{i.tanggal}</td>
                <td className="t-tiny">{i.halaqahName}</td>
                <td className="t-tiny" title={JENIS_LABEL[i.jenis] ?? i.jenis}>
                  {JENIS_SHORT[i.jenis] ?? i.jenis}
                </td>
                <td className="t-mono t-tiny" style={{ textAlign: 'right' }}>{i.debit}</td>
                <td className="t-mono t-tiny" style={{ textAlign: 'right', color: 'var(--muted-2)' }}>
                  {i.terbayar || '—'}
                </td>
                <td
                  className="t-mono t-tiny"
                  style={{ textAlign: 'right', color: i.sisa > 0 ? 'var(--merah-ink)' : 'var(--muted)' }}
                >
                  {i.sisa || '—'}
                </td>
                <td>
                  <span className="badge" style={hutangStatusStyle(i.status)}>
                    {HUTANG_STATUS_LABEL[i.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
          {HUTANG_RUMUS} Pembayaran dialokasikan FIFO — pertemuan terlama dilunasi lebih dulu.
        </p>
      </div>
    </details>
  );
}

export default async function HitsKoordinatorPage({
  searchParams,
}: {
  searchParams: {
    mode?: string; month?: string; week?: string; gender?: string; sort?: string; dir?: string;
    masalah?: string; obs?: string; batch?: string; kelas?: string;
  };
}) {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const pengajuanPending = await getHitsPengajuan('pending');
  const pengajuanCount = pengajuanPending.length;
  const pengajuanConflict = pengajuanPending.some((r) => r.conflict);

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);

  const mode = searchParams.mode === 'minggu' ? 'minggu' : 'bulan';
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;
  const week =
    searchParams.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week)
      ? searchParams.week
      : weekStartMonday();

  const genderFilter: Gender | undefined =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : undefined;

  const filter = parseRekapFilter({ masalah: searchParams.masalah, obs: searchParams.obs });
  // Cakupan halaqah: batch mana & kelas online/offline. Beda dari `filter` —
  // ini menentukan halaqah mana yang ikut dihitung, bukan sekadar menyaring
  // baris hasil, jadi %On-Time & cakupan observasi ikut menyesuaikan.
  const batchId = parseBatchId(searchParams.batch);
  const kelas = parseKelasMode(searchParams.kelas);
  const batchOptions = await daftarBatch();

  // Satu loader dipakai bersama halaman ini, export XLSX, dan halaman cetak —
  // supaya angka di layar dan di file tak mungkin berbeda.
  const rekap = await getHitsKoordinatorRekap({ mode, month, week, gender: genderFilter, batchId, kelas, filter });
  const counts = rekap.counts;
  const periodeLabel = rekap.periodeLabel;
  const insidenByPengajar = rekap.insidenByPengajar;
  const cakupanByPengajar = rekap.cakupanByPengajar;
  const hutangByPengajar = rekap.hutangByPengajar;
  const ranked = [...rekap.ranked];
  const noData = rekap.noData;
  const noDataAksi = await getNoDataActionInfo(noData);

  // Ketua kelas per halaqah — untuk tombol "Ingatkan ketua" pada blok cakupan
  // observasi (baris yang punya pertemuan belum diobservasi).
  const cakupanHalaqahIds = [...cakupanByPengajar.values()].flatMap((c) =>
    c.pertemuan.map((p) => p.halaqahId)
  );
  const ketuaByHalaqah = await getKetuaByHalaqah(cakupanHalaqahIds);

  // Sortir kolom (tinggi→rendah default). Tanpa sort → urutan ranking asli
  // (%on-time, lalu %stabilitas).
  const SORT_KEYS = ['pctOnTime', 'pctStabil', 'kmt', 'kbla', 'jkg', 'tidakLatihan', 'hutangSaldo', 'halaqahCount', 'pengajarNama'] as const;
  type SortKey = (typeof SORT_KEYS)[number];
  const sortKey = (SORT_KEYS as readonly string[]).includes(searchParams.sort ?? '') ? (searchParams.sort as SortKey) : null;
  const dir: 'asc' | 'desc' = searchParams.dir === 'asc' ? 'asc' : 'desc';
  if (sortKey) {
    ranked.sort((a, b) => {
      if (sortKey === 'pengajarNama') {
        const c = a.pengajarNama.localeCompare(b.pengajarNama);
        return dir === 'asc' ? c : -c;
      }
      const av = (a[sortKey] as number) ?? 0;
      const bv = (b[sortKey] as number) ?? 0;
      return dir === 'asc' ? av - bv : bv - av;
    });
  }
  // Base query utk link sortir (pertahankan periode + gender + filter). Tombol
  // Unduh XLSX & Cetak memakai base yang sama, jadi filter aktif ikut terbawa.
  const scope = scopeQuery({ batchId, kelas });
  const sortBase =
    `?mode=${mode}` +
    (mode === 'minggu' ? `&week=${week}` : `&month=${month}`) +
    (genderFilter ? `&gender=${genderFilter}` : '') +
    scope +
    filterQuery(filter);
  /** Base tanpa filter — dipakai chip untuk menyusun kombinasi filter baru. */
  const periodeBase =
    `?mode=${mode}` +
    (mode === 'minggu' ? `&week=${week}` : `&month=${month}`) +
    (genderFilter ? `&gender=${genderFilter}` : '') +
    scope;
  const chipHref = (next: RekapFilter) => `${periodeBase}${filterQuery(next)}`;
  const sortHref = (key: SortKey) => {
    const nextDir = sortKey === key && dir === 'desc' ? 'asc' : 'desc';
    return `${sortBase}&sort=${key}&dir=${nextDir}`;
  };
  const arrow = (key: SortKey) => (sortKey === key ? (dir === 'desc' ? ' ↓' : ' ↑') : '');

  const genderLabel =
    genderFilter === 'ikhwan' ? 'Ikhwan' : genderFilter === 'akhwat' ? 'Akhwat' : 'Ikhwan & Akhwat';
  const weekOpts = recentMondays(12).map((mon) => ({ value: mon, label: formatWeekRangeShort(mon) }));
  const g = (genderFilter ? `&gender=${genderFilter}` : '') + scope;
  const pctColor = (p: number) =>
    p >= 90 ? 'var(--hijau-ink)' : p >= 75 ? 'var(--kuning-ink)' : 'var(--merah-ink)';
  // null = tak bisa dinilai (mis. semua pertemuannya dipindah/dibadalkan, jadi
  // tak ada pertemuan yang jam-nya bisa dinilai). Bukan 0 — jangan diwarnai merah.
  const pctCell = (p: number | null) =>
    p === null
      ? { text: '—', color: 'var(--muted)' }
      : { text: `${p}%`, color: pctColor(p) };
  const detailHref = (r: { pengajarId: string; gender: Gender | null }) =>
    `/matrix/koordinator/pengajar/${r.pengajarId}${r.gender ? `?gender=${r.gender}` : ''}`;
  const cnt = (n: number) => ({
    text: n > 0 ? String(n) : '—',
    color: n > 0 ? 'var(--merah-ink)' : 'var(--muted)',
  });

  // ── Teks rekap grup: SELURUH insiden periode ini (abaikan filter masalah/obs;
  // gender ikut tampilan). insidenByPengajar sudah period+gender scoped & tak
  // tersaring, jadi angka rekap tak menyusut mengikuti filter yang aktif. ──
  const namaByPengajar = new Map<string, string>();
  for (const r of [...rekap.ranked, ...rekap.noData]) namaByPengajar.set(r.pengajarId, r.pengajarNama);
  const badgeTotal = { KMT: 0, KBLA: 0, JKG: 0, TL: 0 };
  let totalInsidenRekap = 0;
  let belumDiputusRekap = 0;
  const perPengajarRekap: Array<{ nama: string; line: string; belum: number }> = [];
  for (const [pid, list] of insidenByPengajar) {
    if (!list.length) continue;
    const perJenis: Record<string, number> = {};
    let belum = 0;
    for (const i of list) {
      totalInsidenRekap += 1;
      if (i.status !== 'diputus') { belum += 1; belumDiputusRekap += 1; }
      for (const p of i.pelanggaran) {
        perJenis[p.jenis] = (perJenis[p.jenis] ?? 0) + 1;
        if (p.jenis === 'KMT') badgeTotal.KMT += 1;
        else if (p.jenis === 'KBLA') badgeTotal.KBLA += 1;
        else if (p.jenis === 'JKG') badgeTotal.JKG += 1;
        else if (p.jenis === 'TIDAK_LATIHAN') badgeTotal.TL += 1;
      }
    }
    const ringkas = (['KMT', 'KBLA', 'JKG', 'TIDAK_LATIHAN'] as const)
      .filter((j) => perJenis[j])
      .map((j) => `${JENIS_SHORT[j]}×${perJenis[j]}`)
      .join(', ');
    const nama = namaByPengajar.get(pid) ?? list[0].halaqahName;
    perPengajarRekap.push({
      nama,
      belum,
      line: `• ${nama} — ${ringkas || '—'}${belum ? ` · ${belum} nunggu putusan` : ''}`,
    });
  }
  perPengajarRekap.sort((a, b) => b.belum - a.belum || a.nama.localeCompare(b.nama));
  const rekapGrupTeks = tplHitsRekapInsidenGrup({
    periodeLabel,
    genderLabel,
    totalInsiden: totalInsidenRekap,
    totalPengajar: perPengajarRekap.length,
    byBadge: badgeTotal,
    belumDiputus: belumDiputusRekap,
    perPengajar: perPengajarRekap.map((p) => p.line),
    dashboardUrl: absUrl(`/hits/koordinator${genderFilter ? `?gender=${genderFilter}` : ''}`),
  });

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">H</span> Soft Skill HITS
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link
              href="/hits/koordinator/ketua-kelas"
              className="btn btn-sm btn-primary"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none' }}
            >
              {Icon.shield(13)} Ketua Kelas
            </Link>
            <Link
              href="/hits/koordinator/pertemuan"
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              {Icon.shield(13)} Override Pertemuan
            </Link>
            <Link
              href="/hits/koordinator/pengajuan"
              className="btn btn-sm btn-ghost"
              style={{
                height: 32,
                padding: '0 12px',
                gap: 6,
                textDecoration: 'none',
                border: pengajuanConflict ? '1px solid var(--merah)' : '1px solid var(--line)',
              }}
            >
              {Icon.shield(13)} Pengajuan
              {pengajuanCount > 0 && (
                <span className="badge badge-merah" style={{ marginLeft: 2 }}>
                  {pengajuanCount}
                </span>
              )}
            </Link>
            <Link
              href="/hits/koordinator/indisipliner"
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              {Icon.shield(13)} Indisipliner & Tabayyun
            </Link>
            <Link
              href="/hits/koordinator/validasi"
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              {Icon.shield(13)} Validasi & Sumber Data
            </Link>
            {/* Export mengikuti filter yang sedang aktif (sortBase = periode + gender). */}
            <a
              href={`/api/hits/koordinator/download${sortBase}`}
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              ⬇ Unduh XLSX
            </a>
            <Link
              href={`/hits/koordinator/cetak${sortBase}`}
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', gap: 6, textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              🖨 Cetak / PDF
            </Link>
            {/* Teks rekap seluruh insiden periode ini — untuk ditempel ke grup koordinator. */}
            <SalinRekapButton teks={rekapGrupTeks} />
          </div>
        </div>

        <div className="page">
          {/* ── Hero ── */}
          <div
            style={{
              borderRadius: 'var(--r-xl)',
              padding: '22px 24px',
              marginBottom: 18,
              background: 'linear-gradient(135deg, var(--accent-tint), var(--surface))',
              border: '1px solid var(--accent-line)',
              boxShadow: 'var(--shadow-raised)',
            }}
          >
            <div className="section-row" style={{ alignItems: 'flex-start', marginBottom: 0, gap: 12 }}>
              <div>
                <h1 className="t-h1" style={{ marginBottom: 4 }}>
                  Ranking Disiplin Pengajar
                </h1>
                <p className="t-small" style={{ color: 'var(--ink-2)', maxWidth: 560 }}>
                  Urut <strong>%On-Time</strong> (kelas tepat jam: tanpa KMT/KBLA) · pemecah seri{' '}
                  <strong>%Stabil</strong> (kelas tak dipindah/dibadalkan), lalu{' '}
                  <strong>hutang menit</strong> (saldo tertunggak).{' '}
                  {rekap.batchName ? `Batch ${rekap.batchName}` : 'Lintas-batch'}, per pengajar.
                </p>
                <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 6, maxWidth: 620 }}>
                  Kolom <strong>Hutang (mnt)</strong> = {HUTANG_RUMUS} Buka baris “Asal hutang menit”
                  di bawah tiap pengajar untuk melihat pertemuan pembentuknya.
                </p>
                <p className="t-tiny" style={{ color: 'var(--muted)', marginTop: 8 }}>
                  {mode === 'minggu' ? 'Mingguan' : 'Bulanan'} · {periodeLabel} · {genderLabel} ·{' '}
                  {rekap.scopeLabel ? `${rekap.scopeLabel} · ` : ''}
                  {filterAktif(filter)
                    ? `${ranked.length + noData.length} dari ${counts.total} pengajar (difilter)`
                    : `${ranked.length} pengajar`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Link
                    href={`?mode=bulan${g}`}
                    className="chip-select"
                    style={{ fontWeight: mode === 'bulan' ? 700 : 400, opacity: mode === 'bulan' ? 1 : 0.6 }}
                  >
                    Bulanan
                  </Link>
                  <Link
                    href={`?mode=minggu${g}`}
                    className="chip-select"
                    style={{ fontWeight: mode === 'minggu' ? 700 : 400, opacity: mode === 'minggu' ? 1 : 0.6 }}
                  >
                    Mingguan
                  </Link>
                </div>
                {mode === 'minggu' ? (
                  <WeekNavSelect options={weekOpts} value={week} />
                ) : (
                  <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
                )}
                <GenderNavSelect value={genderFilter ?? ''} />
                <QueryNavSelect
                  param="batch"
                  value={batchId ?? ''}
                  options={batchOptions.map((b) => ({ value: b.id, label: b.name }))}
                  ariaLabel="Pilih batch"
                  allLabel="Semua batch"
                />
                <QueryNavSelect
                  param="kelas"
                  value={kelas ?? ''}
                  options={[
                    { value: 'online', label: 'Kelas online' },
                    { value: 'offline', label: 'Kelas offline' },
                  ]}
                  ariaLabel="Pilih kelas online/offline"
                  allLabel="Online & offline"
                />
              </div>
            </div>

            {/* Penyaring — dua grup yang bisa dipakai bersamaan: 'bermasalah DAN
                observasinya belum lengkap' adalah kasus paling rawan salah nilai. */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
              <Link
                href={chipHref({ ...filter, masalah: !filter.masalah })}
                className="chip-select"
                title="Punya insiden KMT/KBLA/JKG/TL pada periode ini"
                style={{ fontWeight: filter.masalah ? 700 : 400, opacity: filter.masalah ? 1 : 0.7 }}
              >
                Bermasalah ({counts.bermasalah})
              </Link>
              <span className="t-tiny" style={{ color: 'var(--muted-2)', marginLeft: 6 }}>
                Observasi:
              </span>
              {([
                { v: 'semua' as const, label: 'Semua' },
                { v: 'belum' as const, label: `Belum lengkap (${counts.obsBelum})` },
                { v: 'lengkap' as const, label: `Lengkap (${counts.obsLengkap})` },
              ]).map((o) => (
                <Link
                  key={o.v}
                  href={chipHref({ ...filter, obs: o.v })}
                  className="chip-select"
                  style={{ fontWeight: filter.obs === o.v ? 700 : 400, opacity: filter.obs === o.v ? 1 : 0.7 }}
                >
                  {o.label}
                </Link>
              ))}
              {filterAktif(filter) && (
                <Link href={periodeBase} className="t-tiny" style={{ color: 'var(--muted-2)', marginLeft: 4 }}>
                  Reset filter
                </Link>
              )}
            </div>
          </div>

          {ranked.length === 0 && noData.length === 0 ? (
            <div className="card-flat" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: 999, margin: '0 auto 12px',
                  background: 'var(--surface-3)', display: 'grid', placeItems: 'center',
                  color: 'var(--muted)',
                }}
              >
                {Icon.shield(22)}
              </div>
              {filterAktif(filter) ? (
                <>
                  <p className="t-h3" style={{ marginBottom: 4 }}>Tak ada pengajar cocok filter</p>
                  <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                    {counts.total} pengajar ada di periode ini, tapi tak satu pun memenuhi filter yang aktif.
                  </p>
                  <p style={{ marginTop: 10 }}>
                    <Link href={periodeBase} className="t-small" style={{ color: 'var(--accent)' }}>
                      Reset filter
                    </Link>
                  </p>
                </>
              ) : (
                <>
                  <p className="t-h3" style={{ marginBottom: 4 }}>Belum ada data</p>
                  <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                    Tak ada pengajar/keterangan pada periode ini.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="k-table">
                    <thead>
                      <tr>
                        <th style={{ width: 44, textAlign: 'right' }}>#</th>
                        <th><a href={sortHref('pengajarNama')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Pengajar{arrow('pengajarNama')}</a></th>
                        <th style={{ textAlign: 'right' }} title="Persen pertemuan tepat jam — tanpa KMT (>5 menit) / KBLA. Pertemuan yang dipindah hari atau dibadalkan tidak dihitung di sini."><a href={sortHref('pctOnTime')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>%On-Time{arrow('pctOnTime')}</a></th>
                        <th style={{ textAlign: 'right' }} title="Persen pertemuan yang berjalan sesuai jadwal — tanpa JKG (pindah hari) / BADAL (dialihkan ke pengganti)."><a href={sortHref('pctStabil')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>%Stabil{arrow('pctStabil')}</a></th>
                        <th style={{ textAlign: 'right' }} title="Kelas Mulai Terlambat"><a href={sortHref('kmt')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>KMT{arrow('kmt')}</a></th>
                        <th style={{ textAlign: 'right' }} title="Kelas Berakhir Lebih Awal"><a href={sortHref('kbla')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>KBLA{arrow('kbla')}</a></th>
                        <th style={{ textAlign: 'right' }} title="Jadwal Kelas Ganti"><a href={sortHref('jkg')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>JKG{arrow('jkg')}</a></th>
                        <th style={{ textAlign: 'right' }} title="Tidak memberikan latihan"><a href={sortHref('tidakLatihan')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>TL{arrow('tidakLatihan')}</a></th>
                        <th style={{ textAlign: 'right' }} title={HUTANG_RUMUS}><a href={sortHref('hutangSaldo')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Hutang (mnt){arrow('hutangSaldo')}</a></th>
                        <th style={{ textAlign: 'right' }}><a href={sortHref('halaqahCount')} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Halaqah{arrow('halaqahCount')}</a></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r) => {
                        const insiden = insidenByPengajar.get(r.pengajarId) ?? [];
                        const cakupan = cakupanByPengajar.get(r.pengajarId);
                        const hutang = hutangByPengajar.get(r.pengajarId) ?? [];
                        return (
                        <Fragment key={r.pengajarId}>
                        <tr>
                          <td className="t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                            {r.rank}
                          </td>
                          <td className="nm" style={{ fontWeight: 500 }}>
                            <a
                              href={detailHref(r)}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                            >
                              {r.pengajarNama}
                            </a>
                          </td>
                          <td
                            className="t-mono"
                            style={{ textAlign: 'right', fontWeight: 700, color: pctCell(r.pctOnTime).color }}
                          >
                            {pctCell(r.pctOnTime).text}
                          </td>
                          <td
                            className="t-mono"
                            style={{ textAlign: 'right', fontWeight: 700, color: pctCell(r.pctStabil).color }}
                          >
                            {pctCell(r.pctStabil).text}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: cnt(r.kmt).color }}>
                            {cnt(r.kmt).text}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: cnt(r.kbla).color }}>
                            {cnt(r.kbla).text}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: cnt(r.jkg).color }}>
                            {cnt(r.jkg).text}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: cnt(r.tidakLatihan).color }}>
                            {cnt(r.tidakLatihan).text}
                          </td>
                          <td
                            className="t-mono"
                            style={{ textAlign: 'right', color: r.hutangSaldo > 0 ? 'var(--merah-ink)' : 'var(--muted)' }}
                          >
                            {r.hutangSaldo || '—'}
                          </td>
                          <td className="t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                            {r.halaqahCount}
                          </td>
                        </tr>
                        {cakupan && cakupan.total > 0 && (
                          <tr>
                            <td colSpan={10} style={{ padding: 0, borderTop: 0 }}>
                              <CakupanObservasiRows
                                c={cakupan}
                                pengajarName={r.pengajarNama}
                                periodeLabel={periodeLabel}
                                ketuaByHalaqah={ketuaByHalaqah}
                              />
                            </td>
                          </tr>
                        )}
                        {insiden.length > 0 && (
                          <tr>
                            <td colSpan={10} style={{ padding: 0, borderTop: 0 }}>
                              <InsidenDetailRows list={insiden} />
                            </td>
                          </tr>
                        )}
                        {hutang.length > 0 && (
                          <tr>
                            <td colSpan={10} style={{ padding: 0, borderTop: 0 }}>
                              <HutangDetailRows list={hutang} />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {noData.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div
                    className="t-tiny"
                    style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}
                  >
                    BELUM ADA DATA PERIODE INI ({noData.length}) · butuh tindak lanjut
                  </div>
                  <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="k-table">
                        <thead>
                          <tr>
                            <th>Pengajar</th>
                            <th>Halaqah &amp; Ketua</th>
                            <th style={{ width: 260 }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {noData.map((r) => {
                            const aksi = noDataAksi.get(r.pengajarId);
                            const waPengajar =
                              aksi?.pengajarWa && aksi.pengajarGender
                                ? buildWaMeUrl(
                                    aksi.pengajarWa,
                                    tplReminderPengajarIsiData({
                                      pengajarName: r.pengajarNama,
                                      pengajarGender: aksi.pengajarGender,
                                      periodeLabel,
                                    })
                                  )
                                : null;
                            return (
                              <tr key={r.pengajarId}>
                                <td className="nm" style={{ fontWeight: 500, verticalAlign: 'top' }}>
                                  <a href={detailHref(r)} style={{ color: 'inherit', textDecoration: 'none' }}>
                                    {r.pengajarNama}
                                  </a>
                                  {r.hutangSaldo > 0 ? (
                                    <div className="t-tiny" style={{ color: 'var(--merah-ink)' }} title={HUTANG_RUMUS}>
                                      hutang {r.hutangSaldo} mnt
                                    </div>
                                  ) : null}
                                </td>
                                <td style={{ verticalAlign: 'top' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {(aksi?.halaqah ?? []).map((h) => {
                                      const waKetua = h.ketuaWa
                                        ? buildWaMeUrl(
                                            h.ketuaWa,
                                            tplReminderIsiKeterangan({
                                              ketuaNama: h.ketuaNama,
                                              halaqahName: h.halaqahName,
                                              periodeLabel,
                                              isiUrl: absUrl(`/hits/koordinator/halaqah/${h.halaqahId}`),
                                            })
                                          )
                                        : null;
                                      return (
                                        <div key={h.halaqahId} className="t-small">
                                          <div style={{ fontWeight: 500 }}>{h.halaqahName}</div>
                                          <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                                            Ketua: {h.ketuaNama ?? '— belum ada'}
                                            {h.ketuaNama && !h.ketuaLoggedIn ? ' (belum login)' : ''}
                                          </div>
                                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                                            {waKetua ? (
                                              <a
                                                href={waKetua}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="t-tiny"
                                                style={{ color: 'var(--hijau-ink)' }}
                                              >
                                                WA ketua
                                              </a>
                                            ) : (
                                              <span className="t-tiny" style={{ color: 'var(--muted)' }}>
                                                WA ketua —
                                              </span>
                                            )}
                                            <a
                                              href={`/hits/koordinator/halaqah/${h.halaqahId}`}
                                              className="t-tiny"
                                              style={{ color: 'var(--accent)' }}
                                            >
                                              Isi manual
                                            </a>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {(aksi?.halaqah ?? []).length === 0 ? (
                                      <span className="t-tiny" style={{ color: 'var(--muted)' }}>—</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td style={{ verticalAlign: 'top' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                                    {waPengajar ? (
                                      <a
                                        href={waPengajar}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-sm btn-ghost"
                                        style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                                      >
                                        WA pengajar
                                      </a>
                                    ) : (
                                      <span className="t-tiny" style={{ color: 'var(--muted)' }}>
                                        WA pengajar —
                                      </span>
                                    )}
                                    <NoteQuickAdd pengajarId={r.pengajarId} />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
