// Data untuk Dashboard Evaluasi koordinator: opsi penyaring, agregat per grup
// (program × batch × gender), dan baris per-halaqah. Halaman hanya merender.
//
// Sesi yang dihitung ditentukan penyaring `cakupan`. Dulu terkunci ke jenis 'qn'
// dengan nomor_sesi terbesar per halaqah ("sesi berjalan"), sehingga dashboard
// tak pernah bisa menjawab "bagaimana ujian PB?" atau "bagaimana keseluruhan?".
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ALL_LAHN, AMBANG, columnsToCounts, namaProgram,
  UJIAN_QN_SESI, UJIAN_PB_SESI,
} from '@/lib/evaluasi';
import type { Gender } from '@/types/db';

export type GenderFilter = Gender | 'semua';

/**
 * Sesi mana yang diagregasi. `qn-berjalan` = perilaku lama (jenis 'qn',
 * nomor_sesi terbesar per halaqah); sisanya mencakup banyak sesi sekaligus.
 */
export const CAKUPAN = [
  'semua', 'evaluasi', 'qn', 'pb', 'qn-berjalan', 'ujian', 'ujian-qn', 'ujian-pb',
] as const;
export type Cakupan = (typeof CAKUPAN)[number];
export const CAKUPAN_DEFAULT: Cakupan = 'semua';

export interface FilterDashboard {
  /** Slug family program. Kosong = semua program. */
  program: string;
  /** Slug batch. Kosong = semua batch. */
  batch: string;
  gender: GenderFilter;
  cakupan: Cakupan;
}

/** Baris eval_batch sebatas yang dipakai penyaring. */
export interface BarisBatch {
  id: string;
  nama: string;
  family: string;
  batch_label: string | null;
  batch_order: number | null;
}

export interface OpsiPilih {
  value: string;
  label: string;
}

export interface GrupDashboard {
  programId: string;
  programNama: string;
  batchId: string | null;
  batchLabel: string | null;
  batchOrder: number | null;
  gender: Gender;
  halaqah: number;
  total: number;
  selesai: number;
  rata: number | null;
  bermasalah: number;
}

export interface BarisHalaqah {
  id: string;
  nama: string;
  /**
   * Dipakai halaman untuk memutuskan apakah tautan Detail ditampilkan: halaman
   * detail (`[halaqahId]`) masih mengunci gender dan akan 404 untuk gender lain.
   * Tanpa field ini halaman hanya punya `sub` — string — untuk menebaknya.
   */
  gender: Gender;
  /** "Ikhwan · HITS Reguler Juni 2026 · M1" */
  sub: string;
  pengajar: string;
  /** Untuk tautan "Ingatkan". null = pengajar tak punya WA tercatat. */
  pengajarWa: string | null;
  total: number;
  selesai: number;
  rata: number | null;
  bermasalah: number;
  lahnTop: string;
}

export interface TotalDashboard {
  halaqah: number;
  peserta: number;
  selesai: number;
  rata: number | null;
  bermasalah: number;
}

export interface HasilDashboard {
  opsiProgram: OpsiPilih[];
  /** Kosong bila tak ada program terpilih atau program itu berangkatan tunggal. */
  opsiBatch: OpsiPilih[];
  /** Nilai batch yang benar-benar dipakai — '' bila query-string sudah basi. */
  batchTerpilih: string;
  /** Nilai program yang benar-benar dipakai — '' bila slug-nya tak dikenal. */
  programTerpilih: string;
  /** Ringkas penyaring aktif untuk subjudul, mis. "HITS Reguler · Juni 2026 ·
   *  Ikhwan & Akhwat". Ikut tercetak, supaya PDF menerangkan cakupannya sendiri. */
  ringkasFilter: string;
  grup: GrupDashboard[];
  halaqah: BarisHalaqah[];
  total: TotalDashboard;
  namaPeriode: string;
  opsiCakupan: OpsiPilih[];
  cakupanTerpilih: Cakupan;
  /** false = mirror memang kosong; true tapi halaqah kosong = penyaringnya. */
  adaHalaqahSamaSekali: boolean;
}

// ── Fungsi murni (diuji di scripts/test-evaluasi-dashboard.ts) ──

/** Urutan anggota family: batch_order menaik, null paling depan, lalu id. */
function urutAnggota(a: BarisBatch, b: BarisBatch): number {
  const oa = a.batch_order ?? -1;
  const ob = b.batch_order ?? -1;
  return oa !== ob ? oa - ob : a.id.localeCompare(b.id);
}

/**
 * Satu opsi per family. Labelnya diambil dari anggota ber-batch_order terkecil
 * supaya deterministik ketika antar-angkatan ejaannya berbeda ("HITS Safar" vs
 * "HITS Safar (Batch Januari 2026)").
 */
export function susunOpsiProgram(batches: BarisBatch[]): OpsiPilih[] {
  const perFamily = new Map<string, BarisBatch[]>();
  for (const b of batches) {
    const arr = perFamily.get(b.family);
    if (arr) arr.push(b);
    else perFamily.set(b.family, [b]);
  }
  return Array.from(perFamily.entries())
    .map(([family, anggota]) => ({
      value: family,
      label: namaProgram([...anggota].sort(urutAnggota)[0].nama),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'id'));
}

/** Batch milik satu program. Kosong bila program itu hanya punya satu angkatan. */
export function susunOpsiBatch(batches: BarisBatch[], family: string): OpsiPilih[] {
  if (!family) return [];
  const anggota = batches.filter((b) => b.family === family);
  if (anggota.length < 2) return [];
  return [...anggota].sort(urutAnggota).map((b) => ({
    value: b.id,
    // Cadangan memakai nama MENTAH, bukan namaProgram(): fungsi itu ada justru
    // untuk membuang "(Batch ...)", satu-satunya bagian yang membedakan sesama
    // anggota family. Lewat namaProgram, dua angkatan jadi berlabel sama persis.
    label: b.batch_label ?? b.nama,
  }));
}

/**
 * Batch yang benar-benar dipakai. Query-string basi dibuang, supaya hasilnya
 * bukan halaman kosong — atau penyaring tak terlihat — tanpa sebab.
 *
 * Batch tanpa program juga dibuang. Dropdown batch hanya muncul di bawah sebuah
 * program, jadi `?batch=` tanpa `?program=` adalah keadaan yang tak punya
 * kendali di layar: pemakai memilih program, memilih batch, lalu mengembalikan
 * program ke "semua" — dropdown batch lenyap sementara penyaringnya diam-diam
 * masih menyaring, tanpa apa pun yang bisa dipakai membatalkannya.
 */
export function batchTerpakai(batches: BarisBatch[], program: string, batch: string): string {
  if (!batch || !program) return '';
  const cakupan = batches.filter((b) => b.family === program);
  return cakupan.some((b) => b.id === batch) ? batch : '';
}

/** batch_id yang lolos penyaring. null = tak ada pembatasan sama sekali. */
export function idBatchLolos(batches: BarisBatch[], program: string, batch: string): string[] | null {
  const dipakai = batchTerpakai(batches, program, batch);
  if (dipakai) return [dipakai];
  if (!program) return null;
  return batches.filter((b) => b.family === program).map((b) => b.id);
}

/** Urut baris ringkasan: nama program → batch_order → ikhwan sebelum akhwat. */
export function urutkanGrup(grup: GrupDashboard[]): GrupDashboard[] {
  return [...grup].sort((a, b) => {
    const p = a.programNama.localeCompare(b.programNama, 'id');
    if (p !== 0) return p;
    const oa = a.batchOrder ?? -1;
    const ob = b.batchOrder ?? -1;
    if (oa !== ob) return oa - ob;
    if (a.gender !== b.gender) return a.gender === 'ikhwan' ? -1 : 1;
    return 0;
  });
}

/**
 * Nama track untuk label periode. eval_config menyimpannya per gender, jadi saat
 * kedua gender ditampilkan bersama nama itu hanya dipakai bila keduanya sepakat —
 * kalau tidak, label netral, bukan nama salah satu gender yang menyesatkan.
 */
export function pilihNamaTrack(
  configs: Array<{ gender: string; nama_qn: string; nama_pb?: string }>,
  gender: GenderFilter,
  kolom: 'nama_qn' | 'nama_pb' = 'nama_qn'
): string {
  const bawaan = kolom === 'nama_pb' ? 'Evaluasi PB' : 'Evaluasi QN';
  const ambil = (c: { nama_qn: string; nama_pb?: string }): string | undefined =>
    kolom === 'nama_pb' ? c.nama_pb : c.nama_qn;
  if (gender !== 'semua') {
    const c = configs.find((x) => x.gender === gender);
    return (c && ambil(c)) || bawaan;
  }
  const nama = Array.from(
    new Set(configs.map(ambil).filter((n): n is string => !!n))
  );
  if (nama.length === 1) return nama[0];
  if (nama.length === 0) return bawaan;
  return 'Evaluasi';
}

/** Baca penyaring dari query-string. Gender default = gender pemakai. */
export function bacaFilter(
  // Next memberi `string | string[]` — parameter yang diulang di URL datang
  // sebagai larik. Diketik apa adanya supaya tak ada kejutan saat upgrade.
  sp: {
    program?: string | string[]; batch?: string | string[];
    gender?: string | string[]; cakupan?: string | string[];
  },
  genderPemakai: Gender
): FilterDashboard {
  const satu = (v: string | string[] | undefined): string =>
    (Array.isArray(v) ? v[0] : v) ?? '';
  const g = satu(sp.gender);
  const c = satu(sp.cakupan);
  return {
    program: satu(sp.program),
    batch: satu(sp.batch),
    gender: g === 'ikhwan' || g === 'akhwat' || g === 'semua' ? g : genderPemakai,
    // Cakupan tak dikenal (URL diketik tangan) jatuh ke default, BUKAN nol baris:
    // salah ketik di sini tak boleh terbaca sebagai "memang belum ada nilai".
    cakupan: (CAKUPAN as readonly string[]).includes(c) ? (c as Cakupan) : CAKUPAN_DEFAULT,
  };
}

/** Sesi yang masuk hitungan untuk sebuah cakupan. Murni — diuji terpisah. */
export function sesiUntukCakupan<T extends SesiRow>(rows: T[], cakupan: Cakupan): T[] {
  // Sesi ujian yang di-soft-delete (0052) tak boleh ikut: nilainya masih
  // tersimpan tapi sesinya sudah dicabut dari progres.
  const hidup = rows.filter((s) => !s.dihapus);
  if (cakupan === 'semua') return hidup;
  if (cakupan === 'evaluasi') return hidup.filter((s) => s.jenis === 'qn' || s.jenis === 'pb');
  if (cakupan === 'qn') return hidup.filter((s) => s.jenis === 'qn');
  if (cakupan === 'pb') return hidup.filter((s) => s.jenis === 'pb');
  if (cakupan === 'ujian') return hidup.filter((s) => s.jenis === 'ujian');
  if (cakupan === 'ujian-qn')
    return hidup.filter((s) => s.jenis === 'ujian' && s.nomor_sesi === UJIAN_QN_SESI);
  if (cakupan === 'ujian-pb')
    return hidup.filter((s) => s.jenis === 'ujian' && s.nomor_sesi === UJIAN_PB_SESI);
  // qn-berjalan: nomor_sesi terbesar PER HALAQAH, bukan terbesar global —
  // halaqah yang tertinggal tetap dinilai pada sesi terakhirnya sendiri.
  const terbesar = new Map<string, T>();
  for (const s of hidup) {
    if (s.jenis !== 'qn') continue;
    const prev = terbesar.get(s.halaqah_id);
    if (!prev || s.nomor_sesi > prev.nomor_sesi) terbesar.set(s.halaqah_id, s);
  }
  return Array.from(terbesar.values());
}

/** Opsi dropdown cakupan. Label track ikut nama dari eval_config. */
export function opsiCakupan(namaQn: string, namaPb: string): OpsiPilih[] {
  return [
    { value: 'semua', label: 'Keseluruhan' },
    { value: 'evaluasi', label: 'Semua Evaluasi' },
    { value: 'qn', label: `${namaQn} — semua sesi` },
    { value: 'pb', label: `${namaPb} — semua sesi` },
    { value: 'qn-berjalan', label: `${namaQn} — sesi berjalan` },
    { value: 'ujian', label: 'Semua Ujian' },
    { value: 'ujian-qn', label: 'Ujian QN' },
    { value: 'ujian-pb', label: 'Ujian PB' },
  ];
}

/**
 * Judul cakupan untuk subjudul & PDF. `qn-berjalan` menyebut nomor sesinya
 * ("Evaluasi QN Sesi 4") — cakupan lain tidak, karena mencakup banyak sesi dan
 * menyebut satu nomor di sana justru menyesatkan.
 */
export function labelCakupan(
  cakupan: Cakupan,
  namaQn: string,
  namaPb: string,
  maxSesiNo: number
): string {
  switch (cakupan) {
    case 'semua': return 'Keseluruhan';
    case 'evaluasi': return 'Semua Evaluasi';
    case 'qn': return `${namaQn} — semua sesi`;
    case 'pb': return `${namaPb} — semua sesi`;
    case 'ujian': return 'Semua Ujian';
    case 'ujian-qn': return 'Ujian QN';
    case 'ujian-pb': return 'Ujian PB';
    case 'qn-berjalan':
      return maxSesiNo > 0 ? `${namaQn} Sesi ${maxSesiNo}` : namaQn;
  }
}

/** Label gender untuk subjudul dan kolom ringkasan. */
export function labelGender(g: GenderFilter): string {
  return g === 'ikhwan' ? 'Ikhwan' : g === 'akhwat' ? 'Akhwat' : 'Ikhwan & Akhwat';
}

function labelBulan(): string {
  return new Date().toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

// ── Pemuat ──

export interface SesiRow {
  id: string;
  halaqah_id: string;
  jenis: string;
  nomor_sesi: number;
  dihapus: boolean;
}
interface NilaiRow extends Record<string, unknown> {
  sesi_id: string;
  peserta_id: string;
  skor: number;
  done: boolean;
}
/**
 * Cakupan bisa memuat banyak sesi, jadi "selesai" TIDAK boleh jumlah baris nilai
 * — itu melampaui jumlah peserta dan membuat kartu "35/651" mustahil dibaca.
 * Yang dihitung: peserta unik yang punya minimal satu nilai `done`. `perPeserta`
 * menyimpan jumlah & cacah skor per peserta supaya "perlu perhatian" dinilai dari
 * RATA-RATA peserta itu, bukan dari tiap sesi yang kebetulan jeblok sekali.
 */
interface Agg {
  perPeserta: Map<string, { sum: number; n: number }>;
  skorSum: number;
  skorN: number;
  lahn: number[];
}

const NO_ID = ['00000000-0000-0000-0000-000000000000'];

export async function muatDashboard(f: FilterDashboard): Promise<HasilDashboard> {
  const { data: batchRaw } = await supabaseAdmin
    .from('eval_batch')
    .select('id, nama, family, batch_label, batch_order');
  const batches = (batchRaw ?? []) as BarisBatch[];

  const opsiProgram = susunOpsiProgram(batches);
  const batchTerpilih = batchTerpakai(batches, f.program, f.batch);
  const opsiBatch = susunOpsiBatch(batches, f.program);
  const idsLolos = idBatchLolos(batches, f.program, f.batch);
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const namaFamily = new Map(opsiProgram.map((o) => [o.value, o.label]));
  // Slug program yang tak dikenal (URL diketik tangan) tetap MENYARING lewat
  // idsLolos = [] → nol baris, tapi dropdown tak boleh menampilkannya sebagai
  // pilihan yang tak ada; dikosongkan supaya jatuh ke "Semua program".
  const programTerpilih = namaFamily.has(f.program) ? f.program : '';
  // Cakupan TIDAK diulang di sini — ia sudah jadi bagian `namaPeriode`, yang
  // ikut tercetak lewat `periodeLabel`.
  const ringkasFilter = [
    programTerpilih ? namaFamily.get(programTerpilih) : 'Semua program',
    batchTerpilih ? batchById.get(batchTerpilih)?.batch_label ?? null : null,
    labelGender(f.gender),
  ]
    .filter(Boolean)
    .join(' · ');

  let qHalaqah = supabaseAdmin
    .from('eval_halaqah')
    .select('id, nama, gender, mustawa, level, pengajar_id, batch_id')
    .order('nama');
  if (f.gender !== 'semua') qHalaqah = qHalaqah.eq('gender', f.gender);
  if (idsLolos) qHalaqah = qHalaqah.in('batch_id', idsLolos.length ? idsLolos : NO_ID);
  const { data: halaqahRaw } = await qHalaqah;
  const halaqahList = (halaqahRaw ?? []) as Array<{
    id: string; nama: string; gender: Gender; mustawa: number | null;
    level: string | null; pengajar_id: string | null; batch_id: string | null;
  }>;

  // Membedakan "mirror memang kosong" dari "penyaringnya terlalu sempit".
  let adaHalaqahSamaSekali = halaqahList.length > 0;
  if (!adaHalaqahSamaSekali) {
    const { data: adaRaw } = await supabaseAdmin.from('eval_halaqah').select('id').limit(1);
    adaHalaqahSamaSekali = (adaRaw ?? []).length > 0;
  }

  const halaqahIds = halaqahList.map((h) => h.id);

  const { data: configRaw } = await supabaseAdmin
    .from('eval_config')
    .select('gender, nama_qn, nama_pb');
  const configs = (configRaw ?? []) as Array<{ gender: string; nama_qn: string; nama_pb?: string }>;
  const namaTrack = pilihNamaTrack(configs, f.gender);
  const namaTrackPb = pilihNamaTrack(configs, f.gender, 'nama_pb');

  const pengajarIds = Array.from(
    new Set(halaqahList.map((h) => h.pengajar_id).filter((x): x is string => !!x))
  );
  const { data: pengajarRaw } = await supabaseAdmin
    .from('eval_pengajar')
    .select('id, nama, whatsapp')
    .in('id', pengajarIds.length ? pengajarIds : NO_ID);
  const pengajarName = new Map(
    (pengajarRaw ?? []).map((p) => [p.id as string, p.nama as string])
  );
  const pengajarWa = new Map(
    (pengajarRaw ?? []).map((p) => [p.id as string, (p.whatsapp as string | null) ?? null])
  );

  const { data: pesertaRaw } = await supabaseAdmin
    .from('eval_peserta')
    .select('id, halaqah_id')
    .in('halaqah_id', halaqahIds.length ? halaqahIds : NO_ID)
    .eq('aktif', true);
  const pesertaCount = new Map<string, number>();
  for (const p of pesertaRaw ?? []) {
    const hid = p.halaqah_id as string;
    pesertaCount.set(hid, (pesertaCount.get(hid) ?? 0) + 1);
  }

  const { data: sesiRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, halaqah_id, jenis, nomor_sesi, dihapus')
    .in('halaqah_id', halaqahIds.length ? halaqahIds : NO_ID);
  const sesiSemua = (sesiRaw ?? []) as SesiRow[];
  const sesiDipakai = sesiUntukCakupan(sesiSemua, f.cakupan);
  const sesiIds = sesiDipakai.map((s) => s.id);
  const sesiToHalaqah = new Map(sesiDipakai.map((s) => [s.id, s.halaqah_id]));
  // Hanya dipakai label 'qn-berjalan'. Diambil dari sesi yang DIPAKAI, bukan
  // dari seluruh baris, supaya angkanya tak menyebut sesi di luar cakupan.
  const maxSesiNo = sesiDipakai.reduce((a, s) => Math.max(a, s.nomor_sesi), 0);

  const { data: nilaiRaw } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select(
      'sesi_id, peserta_id, skor, done, ' +
        'jk_huruf, jk_harakat, jk_mad, jk_tasydid, kh_izhar, kh_idgham_bighunnah, kh_idgham_bilaghunnah, kh_idgham_mimi, kh_iqlab, kh_ikhfa_hakiki, kh_ikhfa_syafawi'
    )
    .in('sesi_id', sesiIds.length ? sesiIds : NO_ID);
  const nilaiRows = (nilaiRaw ?? []) as NilaiRow[];

  const aggByHalaqah = new Map<string, Agg>();
  for (const n of nilaiRows) {
    if (!n.done) continue;
    const hid = sesiToHalaqah.get(n.sesi_id);
    if (!hid) continue;
    let a = aggByHalaqah.get(hid);
    if (!a) {
      a = { perPeserta: new Map(), skorSum: 0, skorN: 0, lahn: new Array(ALL_LAHN.length).fill(0) };
      aggByHalaqah.set(hid, a);
    }
    const agg = a;
    const skor = Number(n.skor) || 0;
    const p = agg.perPeserta.get(n.peserta_id) ?? { sum: 0, n: 0 };
    p.sum += skor;
    p.n += 1;
    agg.perPeserta.set(n.peserta_id, p);
    agg.skorSum += skor;
    agg.skorN += 1;
    const counts = columnsToCounts(n);
    ALL_LAHN.forEach((d, i) => {
      agg.lahn[i] += counts[d.key] || 0;
    });
  }

  /** Peserta unik yang sudah dinilai, dan yang rata-ratanya di bawah ambang. */
  const ringkasAgg = (a: Agg | undefined): { selesai: number; bermasalah: number } => {
    if (!a) return { selesai: 0, bermasalah: 0 };
    let bermasalah = 0;
    for (const p of a.perPeserta.values()) if (p.n > 0 && p.sum / p.n < AMBANG) bermasalah += 1;
    return { selesai: a.perPeserta.size, bermasalah };
  };

  const topLahnLabel = (lahn: number[]): string => {
    let best = -1;
    let bestVal = 0;
    lahn.forEach((v, i) => {
      if (v > bestVal) { bestVal = v; best = i; }
    });
    return best >= 0 && bestVal > 0 ? ALL_LAHN[best].label : '—';
  };

  // Jumlah skor per grup ditumpuk TERPISAH, bukan dititipkan sementara ke
  // GrupDashboard.rata. Menitipkannya membuat sebuah field bertipe "rata-rata"
  // berisi "jumlah" di antara dua lintasan: benar hari ini, tapi satu `return`
  // lebih awal atau satu filter yang disisipkan di tengah sudah cukup untuk
  // mengirim jumlah mentah ke layar sebagai skor, tanpa ada yang meledak.
  // `skorN` dipisah dari `selesai`: sejak cakupan bisa lintas-sesi, `selesai`
  // adalah cacah PESERTA sedangkan rata-rata harus dibagi cacah NILAI. Memakai
  // `selesai` sebagai penyebut akan menggelembungkan rata-rata begitu satu
  // peserta punya lebih dari satu nilai.
  interface AggGrup extends Omit<GrupDashboard, 'rata'> { skorSum: number; skorN: number }
  const grupMap = new Map<string, AggGrup>();

  const halaqah: BarisHalaqah[] = halaqahList.map((h) => {
    const total = pesertaCount.get(h.id) ?? 0;
    const a = aggByHalaqah.get(h.id);
    const { selesai, bermasalah } = ringkasAgg(a);
    const b = h.batch_id ? batchById.get(h.batch_id) ?? null : null;
    const programId = b?.family ?? '';
    const programNama = (programId && namaFamily.get(programId)) || 'Tanpa program';
    const genderLabel = h.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat';
    const levelText = h.level ?? (h.mustawa != null ? `Mustawa ${h.mustawa}` : null);
    // Halaqah tanpa batch tak menuliskan asal sama sekali. "Tanpa program"
    // berguna sebagai judul kelompok di tabel ringkasan, tapi sebagai keterangan
    // per-baris ia cuma derau — dan baris lama pun tak memuatnya.
    const asal = b ? (b.batch_label ? `${programNama} ${b.batch_label}` : programNama) : null;

    const kunci = `${h.batch_id ?? ''}|${h.gender}`;
    let g = grupMap.get(kunci);
    if (!g) {
      g = {
        programId, programNama,
        batchId: h.batch_id, batchLabel: b?.batch_label ?? null,
        batchOrder: b?.batch_order ?? null,
        gender: h.gender,
        halaqah: 0, total: 0, selesai: 0, bermasalah: 0, skorSum: 0, skorN: 0,
      };
      grupMap.set(kunci, g);
    }
    g.halaqah += 1;
    g.total += total;
    // Aman dijumlahkan antar-halaqah: satu peserta hanya milik satu halaqah,
    // jadi himpunan peserta tiap halaqah saling lepas.
    g.selesai += selesai;
    g.bermasalah += bermasalah;
    g.skorSum += a?.skorSum ?? 0;
    g.skorN += a?.skorN ?? 0;

    return {
      id: h.id,
      nama: h.nama,
      gender: h.gender,
      sub: [genderLabel, asal, levelText].filter(Boolean).join(' · '),
      pengajar: (h.pengajar_id && pengajarName.get(h.pengajar_id)) || '—',
      pengajarWa: (h.pengajar_id && pengajarWa.get(h.pengajar_id)) || null,
      total,
      selesai,
      rata: a && a.skorN > 0 ? Math.round(a.skorSum / a.skorN) : null,
      bermasalah,
      lahnTop: a ? topLahnLabel(a.lahn) : '—',
    };
  });

  const grup: GrupDashboard[] = Array.from(grupMap.values()).map(({ skorSum, skorN, ...g }) => ({
    ...g,
    rata: skorN > 0 ? Math.round(skorSum / skorN) : null,
  }));

  const totalPeserta = halaqah.reduce((a, r) => a + r.total, 0);
  const totalSelesai = halaqah.reduce((a, r) => a + r.selesai, 0);
  const totalBermasalah = halaqah.reduce((a, r) => a + r.bermasalah, 0);
  const skorDone = nilaiRows.filter((n) => n.done).map((n) => Number(n.skor) || 0);
  const rataAll = skorDone.length
    ? Math.round(skorDone.reduce((a, b2) => a + b2, 0) / skorDone.length)
    : null;

  return {
    opsiProgram,
    opsiBatch,
    batchTerpilih,
    programTerpilih,
    ringkasFilter,
    grup: urutkanGrup(grup),
    halaqah,
    total: {
      halaqah: halaqahList.length,
      peserta: totalPeserta,
      selesai: totalSelesai,
      rata: rataAll,
      bermasalah: totalBermasalah,
    },
    namaPeriode: `${labelCakupan(f.cakupan, namaTrack, namaTrackPb, maxSesiNo)} · ${labelBulan()}`,
    opsiCakupan: opsiCakupan(namaTrack, namaTrackPb),
    cakupanTerpilih: f.cakupan,
    adaHalaqahSamaSekali,
  };
}
