// Leaderboard disiplin pengajar (F5): agregat %KBBS + hutang menit per pengajar,
// lalu ranking. Terpisah dari hits-rekap.ts (yang month-coupled).
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  isKeteranganDinilai,
  todayJakartaISO,
  KETERANGAN_NILAI_COLS,
  type KeteranganNilaiFields,
} from '@/lib/hits-observasi';
import { fetchInChunks } from '@/lib/hits-rekap';
import {
  isPelanggaranOnTime,
  isPelanggaranStabilitas,
  type PelanggaranRingkas,
} from '@/lib/hits-pelanggaran-kategori';
import {
  computeHutangForHalaqahList,
  HUTANG_ANCHOR,
  type HutangRincian,
} from '@/lib/hits-hutang';
import { HALAQAH_SCOPE_COLS, lolosScope, type HalaqahScope } from '@/lib/hits-halaqah-scope';
import { berasalDariIzin } from '@/lib/shakwa-izin';
import type { Gender } from '@/types/db';

export type DisiplinAgg = {
  pengajarId: string;
  pengajarNama: string;
  gender: Gender | null;
  halaqahCount: number;
  halaqahIds: string[]; // untuk aksi noData (WA ketua, isi manual)
  kbbs: number;
  nonLibur: number;
  // Hitungan pelanggaran per-jenis dalam periode [start,end) — dari hits_pelanggaran.
  kmt: number;
  kbla: number;
  jkg: number;
  tidakLatihan: number;
  // Dua rasio per-pertemuan, dipisah sesuai definisi indikator matrix.
  onTimeBaik: number;  // pertemuan tanpa KMT(>5 menit)/KBLA
  onTimeTotal: number; // penyebut on-time: pertemuan non-libur MINUS JKG/BADAL
  stabilBaik: number;  // pertemuan tanpa JKG/BADAL
  stabilTotal: number; // semua pertemuan non-libur
  hutangSaldo: number; // menit, kumulatif (bukan per-periode)
};

export type DisiplinRankRow = DisiplinAgg & {
  pctOnTime: number | null; // 0..100, null bila onTimeTotal=0
  pctStabil: number | null; // 0..100, null bila stabilTotal=0
  pctKbbs: number | null;   // 0..100, null bila nonLibur=0 — gabungan lama
  rank: number | null;      // null bila tak ada data sama sekali
};

/**
 * Urut: %On-Time turun → %Stabilitas turun → hutang menit naik → nama.
 *
 * Kunci utamanya %On-Time (ketepatan jam), bukan lagi %KBBS gabungan: JKG jauh
 * lebih sering daripada KMT+KBLA, jadi "Ranking Disiplin" yang diurut %KBBS
 * sebenarnya mengurutkan siapa yang paling sering pindah jadwal. %Stabilitas
 * tetap jadi kunci kedua supaya perilaku itu tak hilang dari ranking.
 *
 * Baris tanpa data apa pun (stabilTotal=0) turun ke bawah & tak dapat rank.
 * Fungsi murni — mudah diuji.
 */
export function rankFromAggregates(aggs: DisiplinAgg[]): DisiplinRankRow[] {
  const rows: DisiplinRankRow[] = aggs.map((a) => ({
    ...a,
    pctOnTime: a.onTimeTotal > 0 ? Math.round((a.onTimeBaik / a.onTimeTotal) * 100) : null,
    pctStabil: a.stabilTotal > 0 ? Math.round((a.stabilBaik / a.stabilTotal) * 100) : null,
    pctKbbs: a.nonLibur > 0 ? Math.round((a.kbbs / a.nonLibur) * 100) : null,
    rank: null,
  }));
  // Pengajar yang SEMUA pertemuannya dipindah/dibadalkan punya pctOnTime null
  // padahal datanya ada. Jangan buang ke bawah — nilai on-time-nya diperlakukan
  // paling rendah, lalu %Stabilitas yang membedakan.
  const keyOnTime = (r: DisiplinRankRow) =>
    r.stabilTotal === 0 ? -1 : r.pctOnTime ?? 0;
  rows.sort((x, y) => {
    const ox = keyOnTime(x), oy = keyOnTime(y);
    if (ox !== oy) return oy - ox; // desc, tanpa-data terakhir
    const sx = x.pctStabil ?? -1, sy = y.pctStabil ?? -1;
    if (sx !== sy) return sy - sx; // desc
    if (x.hutangSaldo !== y.hutangSaldo) return x.hutangSaldo - y.hutangSaldo; // hutang asc
    return x.pengajarNama.localeCompare(y.pengajarNama);
  });
  let r = 0;
  for (const row of rows) {
    if (row.stabilTotal > 0) { r += 1; row.rank = r; }
  }
  return rows;
}

/** Satu baris asal hutang: pertemuan yang menimbulkan debit + status pelunasannya. */
export type HutangRincianPengajar = HutangRincian & {
  halaqahId: string;
  halaqahName: string;
};

export type DisiplinRankingHasil = {
  rows: DisiplinRankRow[];
  /**
   * Asal-usul kolom "Hutang (mnt)": per pengajar, daftar pertemuan pembentuk
   * debit beserta pembayarannya. Urut tanggal naik — sama dengan urutan alokasi
   * FIFO, jadi baris "lunas" selalu di atas baris "belum".
   */
  hutangByPengajar: Map<string, HutangRincianPengajar[]>;
};

/**
 * Ranking disiplin semua pengajar aktif di [start,end). Halaqah tanpa
 * pengajar_id di-skip (tak bisa diagregat). Hutang = saldo kumulatif (F2),
 * dijumlah per pengajar dari semua halaqahnya (TAK di-scope periode).
 */
export async function getDisiplinRanking(opts: {
  start: string; // 'YYYY-MM-DD' inklusif
  end: string;   // 'YYYY-MM-DD' eksklusif
} & HalaqahScope): Promise<DisiplinRankingHasil> {
  let hq = supabaseAdmin
    .from('hits_halaqah')
    .select(`id, name, pengajar_id, pengajar_nama_sheet, gender, ${HALAQAH_SCOPE_COLS}`)
    .eq('active', true)
    .not('pengajar_id', 'is', null);
  if (opts.gender) hq = hq.eq('gender', opts.gender);
  const { data: halaqahList } = await hq;
  // Batch & online/offline disaring di sini, bukan di query: online = "tak ada
  // kata Offline di jadwal", dan shim tak punya negasi ilike.
  const halaqah = (halaqahList ?? []).filter((h) => lolosScope(h, opts));
  if (!halaqah.length) return { rows: [], hutangByPengajar: new Map() };

  const halaqahIds = halaqah.map((h) => h.id as string);
  const halaqahToPengajar = new Map(halaqah.map((h) => [h.id as string, h.pengajar_id as string]));

  // meta per pengajar (nama, gender, daftar halaqah)
  const meta = new Map<string, { nama: string; gender: Gender | null; halaqahIds: string[] }>();
  for (const h of halaqah) {
    const pid = h.pengajar_id as string;
    const m = meta.get(pid) ?? {
      nama: (h.pengajar_nama_sheet as string) ?? '—',
      gender: (h.gender as Gender | null) ?? null,
      halaqahIds: [],
    };
    m.halaqahIds.push(h.id as string);
    meta.set(pid, m);
  }

  // keterangan harian di periode — chunked (anti-414 & cap-1000). Chunk 40
  // (bukan default 80): mode bulanan bisa ~13 pertemuan/halaqah → 80×13≈1040
  // > cap 1000 baris PostgREST → data terpotong (nonLibur/kbbs understated).
  // 40×13≈520 aman. Ambil `id` juga untuk join pelanggaran per-jenis.
  const ketAllRank = await fetchInChunks(
    halaqahIds,
    (chunk) =>
      supabaseAdmin
        .from('hits_keterangan_harian')
        .select(`id, halaqah_id, kondisi, ${KETERANGAN_NILAI_COLS}`)
        .gte('tanggal', opts.start)
        .lt('tanggal', opts.end)
        .in('halaqah_id', chunk),
    40
  );
  // Pertemuan yang belum terjadi & baris pra-generate impor tidak dinilai —
  // lihat hits-observasi.ts. Tanpa ini, nilai bawaan impor tampil sebagai
  // pelanggaran TL walau ketua kelas belum mengobservasi apa pun.
  const hariIniRank = todayJakartaISO();
  const ketList = ketAllRank.filter((k) =>
    isKeteranganDinilai(k as unknown as KeteranganNilaiFields, hariIniRank)
  );
  const agg = new Map<
    string,
    {
      kbbs: number; nonLibur: number; kmt: number; kbla: number; jkg: number; tidakLatihan: number;
      onTimeBaik: number; onTimeTotal: number; stabilBaik: number; stabilTotal: number;
    }
  >();
  const zero = () => ({
    kbbs: 0, nonLibur: 0, kmt: 0, kbla: 0, jkg: 0, tidakLatihan: 0,
    onTimeBaik: 0, onTimeTotal: 0, stabilBaik: 0, stabilTotal: 0,
  });
  // keterangan_id → pengajar_id (untuk atribusi pelanggaran ke pengajar)
  const ketToPengajar = new Map<string, string>();
  for (const k of ketList) {
    const pid = halaqahToPengajar.get(k.halaqah_id as string);
    if (!pid) continue;
    ketToPengajar.set(k.id as string, pid);
    const a = agg.get(pid) ?? zero();
    if (k.kondisi !== 'LIBUR') a.nonLibur += 1;
    if (k.kondisi === 'KBBS') a.kbbs += 1;
    agg.set(pid, a);
  }

  // pelanggaran per-jenis dalam periode — chunk by keterangan_id (pola hits-hutang).
  // Satu pertemuan bisa >1 jenis; sumber kebenaran multi-pelanggaran = hits_pelanggaran.
  const ketIds = [...ketToPengajar.keys()];
  const pelList = await fetchInChunks(
    ketIds,
    (chunk) =>
      supabaseAdmin
        .from('hits_pelanggaran')
        .select('keterangan_id, jenis, menit')
        .in('keterangan_id', chunk),
    100
  );
  // Kolom angka KMT/KBLA/JKG/TL = jumlah INSIDEN (bisa >1 per pertemuan).
  const pelByKet = new Map<string, PelanggaranRingkas[]>();
  for (const p of pelList) {
    const ketId = p.keterangan_id as string;
    const arr = pelByKet.get(ketId) ?? [];
    arr.push({ jenis: p.jenis as string, menit: (p.menit as number | null) ?? null });
    pelByKet.set(ketId, arr);

    const pid = ketToPengajar.get(ketId);
    if (!pid) continue;
    const a = agg.get(pid) ?? zero();
    switch (p.jenis) {
      case 'KMT': a.kmt += 1; break;
      case 'KBLA': a.kbla += 1; break;
      case 'JKG': a.jkg += 1; break;
      case 'TIDAK_LATIHAN': a.tidakLatihan += 1; break;
    }
    agg.set(pid, a);
  }

  // Dua rasio PER-PERTEMUAN, definisinya sama dengan matrix (rapat Agustus 2026):
  //   %On-Time    = pertemuan tanpa KMT(>5 menit)/KBLA. Pertemuan yang dipindah
  //                 hari atau dibadalkan KELUAR dari penyebut — jam mulai-selesai
  //                 pengajar aslinya tak bisa dinilai di situ.
  //   %Stabilitas = pertemuan yang TIDAK dipindah/dibadalkan, atas semua pertemuan.
  // Dulu keduanya dilebur jadi satu %KBBS, sehingga pengajar yang selalu tepat
  // waktu tapi sering pindah hari tak bisa dibedakan dari yang sering telat.
  for (const k of ketList) {
    if (k.kondisi === 'LIBUR') continue;
    const pid = halaqahToPengajar.get(k.halaqah_id as string);
    if (!pid) continue;
    const a = agg.get(pid) ?? zero();
    const pel = pelByKet.get(k.id as string) ?? [];
    const dipindah = pel.some((p) => isPelanggaranStabilitas(p.jenis));

    a.stabilTotal += 1;
    if (!dipindah) {
      a.stabilBaik += 1;
      a.onTimeTotal += 1;
      if (!pel.some(isPelanggaranOnTime)) a.onTimeBaik += 1;
    }
    agg.set(pid, a);
  }

  // hutang kumulatif per halaqah (F2, bulk) → jumlah per pengajar
  const hutangMap = await computeHutangForHalaqahList(halaqahIds);

  // Rincian asal hutang, dirakit dari peta yang SAMA dengan angka kolomnya —
  // kalau dihitung ulang di query terpisah, saldo di tabel dan rinciannya bisa
  // beda saat ada pembayaran masuk di antara dua query.
  const halaqahNama = new Map(halaqah.map((h) => [h.id as string, (h.name as string) ?? '—']));
  const hutangByPengajar = new Map<string, HutangRincianPengajar[]>();
  for (const [hid, h] of hutangMap) {
    const pid = halaqahToPengajar.get(hid);
    if (!pid || !h.rincian.length) continue;
    const arr = hutangByPengajar.get(pid) ?? [];
    for (const r of h.rincian) {
      arr.push({ ...r, halaqahId: hid, halaqahName: halaqahNama.get(hid) ?? '—' });
    }
    hutangByPengajar.set(pid, arr);
  }
  for (const arr of hutangByPengajar.values()) {
    arr.sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0));
  }

  const aggs: DisiplinAgg[] = [...meta.entries()].map(([pid, m]) => {
    const a = agg.get(pid) ?? zero();
    const hutang = m.halaqahIds.reduce((s, hid) => s + (hutangMap.get(hid)?.saldo ?? 0), 0);
    return {
      pengajarId: pid,
      pengajarNama: m.nama,
      gender: m.gender,
      halaqahCount: m.halaqahIds.length,
      halaqahIds: m.halaqahIds,
      kbbs: a.kbbs,
      nonLibur: a.nonLibur,
      kmt: a.kmt,
      kbla: a.kbla,
      jkg: a.jkg,
      tidakLatihan: a.tidakLatihan,
      onTimeBaik: a.onTimeBaik,
      onTimeTotal: a.onTimeTotal,
      stabilBaik: a.stabilBaik,
      stabilTotal: a.stabilTotal,
      hutangSaldo: hutang,
    };
  });
  return { rows: rankFromAggregates(aggs), hutangByPengajar };
}

/** Teks satu-baris rumus hutang — dipakai layar, cetak, & XLSX supaya seragam. */
export const HUTANG_RUMUS =
  `KMT: menit−5 (toleransi 5 mnt) · KBLA: menit penuh · JKG: 90 mnt/pertemuan · ` +
  `BADAL & TL: 0. Hanya pertemuan sejak ${HUTANG_ANCHOR}. ` +
  `Saldo = debit − pembayaran (diinput ketua kelas), KUMULATIF lintas-waktu — bukan hanya periode ini.`;

// ── Rincian insiden indisipliner per pengajar (KMT/KBLA/JKG/BADAL/TL) ───────
// Dipakai dashboard ranking: baris angka KMT/KBLA/JKG/TL bisa dibuka untuk
// melihat alasannya — keterangan ketua kelas, hasil tabayyun (alasan pengajar),
// serta putusan koordinator ketua kelas (udzur syar'i diterima/ditolak).

export type InsidenTabayyunStatus =
  | 'belum_ditabayyun'
  | 'nunggu_alasan'
  | 'pending'
  | 'diputus';

export type PelanggaranItem = {
  jenis: string; // KMT | KBLA | JKG | BADAL | TIDAK_LATIHAN
  detail: string; // '12 menit', 'Ganti hari', 'Badal: Fulan', ''
};

export type InsidenDetail = {
  keteranganId: string;
  /** id baris hits_tabayyun (untuk deep-link ke halaman putusan). null bila belum ada tabayyun. */
  tabayyunId: string | null;
  halaqahId: string;
  halaqahName: string;
  tanggal: string;
  pertemuanNo: number;
  pelanggaran: PelanggaranItem[];
  catatanKetua: string | null; // keterangan yang ditulis ketua kelas
  status: InsidenTabayyunStatus;
  alasanPengajar: string | null; // hasil tabayyun
  /** Alasannya datang dari izin pra-kelas (Shakwa), bukan dari tabayyun susulan. */
  dariIzin: boolean;
  isUdzurSyari: boolean | null; // putusan koordinator KK
  keputusanCatatan: string | null;
  decidedAt: string | null;
};

function pelanggaranDetail(p: {
  jenis: string;
  menit: number | null;
  jkg_opsi: string | null;
  cicil_n: number | null;
  badal_nama: string | null;
}): string {
  if ((p.jenis === 'KMT' || p.jenis === 'KBLA') && p.menit != null) return `${p.menit} menit`;
  if (p.jenis === 'JKG' && p.jkg_opsi) {
    const base = p.jkg_opsi === 'cicil' ? 'dicicil' : 'ganti hari';
    return p.jkg_opsi === 'cicil' && p.cicil_n ? `${base} ${p.cicil_n}×` : base;
  }
  if (p.jenis === 'BADAL' && p.badal_nama) return `badal: ${p.badal_nama}`;
  return '';
}

function tabayyunStatusOf(status: string | undefined): InsidenTabayyunStatus {
  if (!status) return 'belum_ditabayyun';
  if (status === 'awaiting_reason') return 'nunggu_alasan';
  if (status === 'pending') return 'pending';
  return 'diputus';
}

/**
 * Rincian insiden per pengajar pada [start,end). Sumber sama dengan hitungan
 * kolom KMT/KBLA/JKG/TL di ranking (hits_pelanggaran), di-join ke keterangan
 * harian (catatan ketua) dan hits_tabayyun (alasan pengajar + putusan).
 */
export async function getInsidenDetailByPengajar(opts: {
  start: string;
  end: string;
} & HalaqahScope): Promise<Map<string, InsidenDetail[]>> {
  const result = new Map<string, InsidenDetail[]>();

  let hq = supabaseAdmin
    .from('hits_halaqah')
    .select(`id, name, pengajar_id, ${HALAQAH_SCOPE_COLS}`)
    .eq('active', true)
    .not('pengajar_id', 'is', null);
  if (opts.gender) hq = hq.eq('gender', opts.gender);
  const { data: halaqahList } = await hq;
  const halaqah = ((halaqahList ?? []) as Array<{
    id: string; name: string; pengajar_id: string; batch_id: string | null; jadwal_raw: string | null;
  }>).filter((h) => lolosScope(h, opts));
  if (!halaqah.length) return result;

  const halaqahIds = halaqah.map((h) => h.id);
  const halaqahById = new Map(halaqah.map((h) => [h.id, h]));

  const ketAllInsiden = await fetchInChunks<{
    id: string;
    halaqah_id: string;
    pertemuan_no: number;
    tanggal: string;
    catatan: string | null;
    diisi_by_role: string | null;
    created_at: string | null;
  }>(
    halaqahIds,
    (chunk) =>
      supabaseAdmin
        .from('hits_keterangan_harian')
        .select(`id, halaqah_id, pertemuan_no, tanggal, catatan, diisi_by_role, created_at`)
        .gte('tanggal', opts.start)
        .lt('tanggal', opts.end)
        .in('halaqah_id', chunk),
    40
  );
  const hariIniInsiden = todayJakartaISO();
  const ketList = ketAllInsiden.filter((k) =>
    isKeteranganDinilai(k as unknown as KeteranganNilaiFields, hariIniInsiden)
  );
  if (!ketList.length) return result;

  const ketIds = ketList.map((k) => k.id);
  const [pelList, tabList] = await Promise.all([
    fetchInChunks<{
      keterangan_id: string;
      jenis: string;
      menit: number | null;
      jkg_opsi: string | null;
      cicil_n: number | null;
      badal_nama: string | null;
    }>(
      ketIds,
      (chunk) =>
        supabaseAdmin
          .from('hits_pelanggaran')
          .select('keterangan_id, jenis, menit, jkg_opsi, cicil_n, badal_nama')
          .in('keterangan_id', chunk),
      100
    ),
    fetchInChunks<{
      id: string;
      keterangan_id: string;
      status: string;
      alasan_pengajar: string | null;
      is_udzur_syari: boolean | null;
      keputusan_catatan: string | null;
      decided_at: string | null;
    }>(
      ketIds,
      (chunk) =>
        supabaseAdmin
          .from('hits_tabayyun')
          .select('id, keterangan_id, status, alasan_pengajar, is_udzur_syari, keputusan_catatan, decided_at')
          .in('keterangan_id', chunk),
      100
    ),
  ]);
  if (!pelList.length) return result;

  const pelByKet = new Map<string, PelanggaranItem[]>();
  for (const p of pelList) {
    const arr = pelByKet.get(p.keterangan_id) ?? [];
    arr.push({ jenis: p.jenis, detail: pelanggaranDetail(p) });
    pelByKet.set(p.keterangan_id, arr);
  }
  const tabByKet = new Map(tabList.map((t) => [t.keterangan_id, t]));

  for (const k of ketList) {
    const pelanggaran = pelByKet.get(k.id);
    if (!pelanggaran?.length) continue;
    const h = halaqahById.get(k.halaqah_id);
    if (!h) continue;
    const t = tabByKet.get(k.id);
    const item: InsidenDetail = {
      keteranganId: k.id,
      tabayyunId: t?.id ?? null,
      halaqahId: k.halaqah_id,
      halaqahName: h.name,
      tanggal: k.tanggal,
      pertemuanNo: k.pertemuan_no,
      pelanggaran,
      catatanKetua: k.catatan,
      status: tabayyunStatusOf(t?.status),
      alasanPengajar: t?.alasan_pengajar ?? null,
      dariIzin: berasalDariIzin(t?.alasan_pengajar),
      isUdzurSyari: t?.is_udzur_syari ?? null,
      keputusanCatatan: t?.keputusan_catatan ?? null,
      decidedAt: t?.decided_at ?? null,
    };
    const arr = result.get(h.pengajar_id) ?? [];
    arr.push(item);
    result.set(h.pengajar_id, arr);
  }
  for (const arr of result.values()) {
    arr.sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0));
  }
  return result;
}

// ── Info aksi untuk baris "belum ada data" ──────────────────────────────────
export type HalaqahAksi = {
  halaqahId: string;
  halaqahName: string;
  ketuaNama: string | null;
  ketuaWa: string | null;
  ketuaGender: Gender | null;
  ketuaLoggedIn: boolean;
};
export type NoDataAksi = {
  pengajarId: string;
  pengajarWa: string | null;
  pengajarGender: Gender | null;
  halaqah: HalaqahAksi[];
};

/**
 * Untuk baris noData: WA pengajar + daftar halaqah beserta ketua kelasnya
 * (agar koordinator bisa ingatkan isi keterangan). Query dichunk (anti 414/cap).
 * Ketua = tabel ketua_kelas (sumber kebenaran); >1 ketua/halaqah → prioritas login.
 */
export async function getNoDataActionInfo(rows: DisiplinAgg[]): Promise<Map<string, NoDataAksi>> {
  const result = new Map<string, NoDataAksi>();
  if (!rows.length) return result;

  const pengajarIds = rows.map((r) => r.pengajarId);
  const halaqahIds = [...new Set(rows.flatMap((r) => r.halaqahIds))];

  const [pengajarRows, halaqahRows, ketuaRows] = await Promise.all([
    fetchInChunks<{ id: string; whatsapp_number: string | null; gender: Gender | null }>(
      pengajarIds,
      (ids) =>
        supabaseAdmin.from('pengajar').select('id, whatsapp_number, gender').in('id', ids)
    ),
    fetchInChunks<{ id: string; name: string }>(
      halaqahIds,
      (ids) => supabaseAdmin.from('hits_halaqah').select('id, name').in('id', ids)
    ),
    fetchInChunks<{
      id: string;
      name: string;
      whatsapp_number: string | null;
      gender: Gender | null;
      hits_halaqah_id: string | null;
      last_login_at: string | null;
    }>(
      halaqahIds,
      (ids) =>
        supabaseAdmin
          .from('ketua_kelas')
          .select('id, name, whatsapp_number, gender, hits_halaqah_id, last_login_at')
          .in('hits_halaqah_id', ids)
          .eq('active', true)
    ),
  ]);

  const pengajarById = new Map(pengajarRows.map((p) => [p.id, p]));
  const halaqahName = new Map(halaqahRows.map((h) => [h.id, h.name]));
  const ketuaByHalaqah = new Map<
    string,
    { nama: string; wa: string | null; gender: Gender | null; loggedIn: boolean }
  >();
  for (const k of ketuaRows) {
    if (!k.hits_halaqah_id) continue;
    const cur = ketuaByHalaqah.get(k.hits_halaqah_id);
    const loggedIn = !!k.last_login_at;
    if (!cur || (loggedIn && !cur.loggedIn)) {
      ketuaByHalaqah.set(k.hits_halaqah_id, {
        nama: k.name,
        wa: k.whatsapp_number,
        gender: k.gender,
        loggedIn,
      });
    }
  }

  for (const r of rows) {
    const p = pengajarById.get(r.pengajarId);
    result.set(r.pengajarId, {
      pengajarId: r.pengajarId,
      pengajarWa: p?.whatsapp_number ?? null,
      pengajarGender: p?.gender ?? null,
      halaqah: r.halaqahIds.map((hid) => {
        const k = ketuaByHalaqah.get(hid);
        return {
          halaqahId: hid,
          halaqahName: halaqahName.get(hid) ?? '—',
          ketuaNama: k?.nama ?? null,
          ketuaWa: k?.wa ?? null,
          ketuaGender: k?.gender ?? null,
          ketuaLoggedIn: k?.loggedIn ?? false,
        };
      }),
    });
  }
  return result;
}

// ── Ketua kelas per halaqah (untuk tombol reminder observasi di ranking) ─────
export type KetuaHalaqahInfo = {
  nama: string | null;
  wa: string | null;
  gender: Gender | null;
  magicToken: string | null;
};

/**
 * Peta halaqahId → ketua kelas (nama, WA, gender, magic_token). Dipakai tombol
 * "Ingatkan ketua" di dashboard ranking untuk pengajar yang observasinya belum
 * lengkap. >1 ketua/halaqah → prioritas yang sudah login. Query dichunk (anti 414/cap).
 */
export async function getKetuaByHalaqah(
  halaqahIds: string[]
): Promise<Map<string, KetuaHalaqahInfo>> {
  const out = new Map<string, KetuaHalaqahInfo>();
  const ids = [...new Set(halaqahIds)];
  if (!ids.length) return out;

  const ketuaRows = await fetchInChunks<{
    name: string;
    whatsapp_number: string | null;
    gender: Gender | null;
    magic_token: string | null;
    hits_halaqah_id: string | null;
    last_login_at: string | null;
  }>(ids, (chunk) =>
    supabaseAdmin
      .from('ketua_kelas')
      .select('name, whatsapp_number, gender, magic_token, hits_halaqah_id, last_login_at')
      .in('hits_halaqah_id', chunk)
      .eq('active', true)
  );

  const loggedInSeen = new Map<string, boolean>();
  for (const k of ketuaRows) {
    if (!k.hits_halaqah_id) continue;
    const loggedIn = !!k.last_login_at;
    if (out.has(k.hits_halaqah_id) && !(loggedIn && !loggedInSeen.get(k.hits_halaqah_id))) continue;
    out.set(k.hits_halaqah_id, {
      nama: k.name,
      wa: k.whatsapp_number,
      gender: k.gender,
      magicToken: k.magic_token,
    });
    loggedInSeen.set(k.hits_halaqah_id, loggedIn);
  }
  return out;
}
