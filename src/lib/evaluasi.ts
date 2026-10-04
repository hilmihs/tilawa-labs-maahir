// Single source of truth untuk Evaluasi Halaqah: taksonomi Lahn, skor, tier.
// Aman diimpor dari client & server (tanpa dependensi Node).

export type LahnGroup = 'jaliy' | 'khafiy';
export interface LahnDef {
  key: string;      // key runtime (mis. 'idghammimi')
  label: string;    // label UI (mis. 'JK. Idgham Mimi & Ghunnah')
  group: LahnGroup;
  column: string;   // kolom DB (mis. 'kh_idgham_mimi')
}

export const JALIY: LahnDef[] = [
  { key: 'huruf',   label: 'JK. Huruf',   group: 'jaliy', column: 'jk_huruf' },
  { key: 'harakat', label: 'JK. Harakat', group: 'jaliy', column: 'jk_harakat' },
  { key: 'mad',     label: 'JK. Mad',     group: 'jaliy', column: 'jk_mad' },
  { key: 'tasydid', label: 'JK. Tasydid', group: 'jaliy', column: 'jk_tasydid' },
];

export const KHAFIY: LahnDef[] = [
  { key: 'izhar',             label: 'JK. Izhar',                  group: 'khafiy', column: 'kh_izhar' },
  { key: 'idghambighunnah',   label: 'JK. Idgham Bighunnah',       group: 'khafiy', column: 'kh_idgham_bighunnah' },
  { key: 'idghambilaghunnah', label: 'JK. Idgham Bilaghunnah',     group: 'khafiy', column: 'kh_idgham_bilaghunnah' },
  { key: 'idghammimi',        label: 'JK. Idgham Mimi & Ghunnah',  group: 'khafiy', column: 'kh_idgham_mimi' },
  { key: 'iqlab',             label: 'JK. Iqlab',                  group: 'khafiy', column: 'kh_iqlab' },
  { key: 'ikhfahakiki',       label: 'JK. Ikhfa Hakiki',           group: 'khafiy', column: 'kh_ikhfa_hakiki' },
  { key: 'ikhfasyafawi',      label: 'JK. Ikhfa Syafawi',          group: 'khafiy', column: 'kh_ikhfa_syafawi' },
];

export const ALL_LAHN: LahnDef[] = [...JALIY, ...KHAFIY];
export const LAHN_BY_KEY: Record<string, LahnDef> =
  Object.fromEntries(ALL_LAHN.map((d) => [d.key, d]));
export const LAHN_BY_COLUMN: Record<string, LahnDef> =
  Object.fromEntries(ALL_LAHN.map((d) => [d.column, d]));

// Ambang standar & lulus 70. Sempat 65 (25 Sep – 1 Okt 2026, lihat 0088/0090);
// rapot yang terbit di jendela itu tidak ikut berubah — ambangnya tersimpan di
// `payload.ambang` dan dicetak dari situ.
export const AMBANG = 70;                // ambang standar global
export const AMBANG_UJIAN_DEFAULT = 70;  // default lulus Ujian Akhir (70%)
export const JENIS = ['qn', 'pb', 'ujian'] as const;
export type Jenis = (typeof JENIS)[number];

export type LahnCounts = Record<string, number>;
export function emptyCounts(): LahnCounts {
  const c: LahnCounts = {};
  for (const d of ALL_LAHN) c[d.key] = 0;
  return c;
}
export function columnFor(key: string): string {
  const d = LAHN_BY_KEY[key];
  if (!d) throw new Error(`unknown lahn key: ${key}`);
  return d.column;
}

/**
 * Skor tanpa kesalahan — 100, untuk semua sesi berkala maupun ujian.
 *
 * Sempat 95 (kebijakan 25 Sep 2026, dibatalkan 1 Okt 2026). Rapot yang terbit
 * di jendela itu menyimpan `skorMaks: 95` di payload dan tetap dicetak apa
 * adanya; payload baru menyimpan `skorMaks` juga supaya rumus yang dicetak di
 * lembar rapot selalu cocok dengan angkanya.
 */
export const SKOR_MAKS = 100;
/** Skor maksimum rapot terbit sebelum payload menyimpan `skorMaks` (sebelum 25 Sep 2026). */
export const SKOR_MAKS_LAMA = 100;

export interface Score { skor: number; jaliyCount: number; khafiyCount: number; }
export function scoreOf(counts: LahnCounts): Score {
  const j = JALIY.reduce((a, d) => a + (counts[d.key] || 0), 0);
  const kf = KHAFIY.reduce((a, d) => a + (counts[d.key] || 0), 0);
  return { skor: Math.max(0, SKOR_MAKS - j * 6 - kf * 2), jaliyCount: j, khafiyCount: kf };
}

export interface Tier { label: string; color: string; }
/**
 * `ambang` = batas "Standar". Default `AMBANG`; rapot terbit mengirim
 * `payload.ambang` miliknya supaya rapot lama (ambang 70) tidak tiba-tiba
 * berpredikat "Standar" di samping vonis MENGULANG.
 */
export function tierOf(skor: number, ambang: number = AMBANG): Tier {
  if (skor >= 90) return { label: 'Mumtaz', color: 'oklch(0.40 0.10 150)' };
  if (skor >= ambang) return { label: 'Standar', color: 'oklch(0.40 0.10 150)' };
  // Dulu "Cukup — di bawah standar": kata "Cukup" bertabrakan dengan vonis
  // DI BAWAH STANDAR di pita rapot QN, jadi diringkas.
  if (skor >= 50) return { label: 'Di bawah standar', color: 'oklch(0.48 0.10 75)' };
  return { label: 'Perlu pengulangan', color: 'oklch(0.46 0.14 25)' };
}

export function initials(nama: string): string {
  return nama.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

// --- Nilai akhir: 30% rata-rata evaluasi berkala + 70% ujian akhir ---
// Sumbu rapot dirotasi (0062): tiap track dinilai sendiri — Rapot QN = 30% rata
// 4 sesi QN + 70% Ujian QN, Rapot PB = 30% rata 4 sesi PB + 70% Ujian PB.
// Bobotnya tidak berubah; yang berubah kolam rata-ratanya (dulu QN+PB digabung
// dan hanya Ujian PB yang dihitung). Lihat `nilaiAkhirTrackOf` di bawah.
export const BOBOT_BERKALA = 0.3;
export const BOBOT_UJIAN_AKHIR = 0.7;
export const AMBANG_LULUS_AKHIR = 70; // ambang lulus nilai akhir (fix; sempat 65 25 Sep – 1 Okt 2026)
/** Ambang rapot era lama — `nilaiAkhirOf` dikunci di sini, bukan ikut aturan baru. */
export const AMBANG_LULUS_LAMA = 70;
export const UJIAN_QN_SESI = 1;
export const UJIAN_PB_SESI = 2;

/**
 * Lantai nilai peserta (kebijakan Education Board, September 2026): skor ujian
 * dan nilai akhir tidak pernah dicetak di bawah 55, berapa pun lahn-nya.
 *
 * Ini BUKAN ambang kelulusan — ambang lulus tetap `AMBANG_LULUS_AKHIR` (70),
 * jadi peserta bernilai 55 tetap dinyatakan MENGULANG. Lantai hanya menahan
 * angka yang dicetak; jumlah kesalahan di tabel rincian tetap apa adanya.
 *
 * Skor sesi evaluasi berkala TIDAK dilantai — yang dilantai hanya skor ujian
 * (lewat `nilaiAkhirTrackOf` dan `ujianSnap` di `rapot.ts`) dan nilai akhir.
 */
export const NILAI_MINIMUM = 55;

export function lantaiNilai(n: number): number {
  return Math.max(NILAI_MINIMUM, n);
}

export function lantaiNilaiOpt(n: number | null): number | null {
  return n == null ? null : lantaiNilai(n);
}

/** Track penilaian. Satu rapot = satu track. */
export type Track = 'qn' | 'pb';
export const TRACKS: readonly Track[] = ['qn', 'pb'] as const;

/** Sesi evaluasi berkala per track — dipakai guard kelengkapan sebelum terbit. */
export const SESI_BERKALA_PER_TRACK = 4;

/** Ujian per track FIX: QN=sesi 1, PB=sesi 2 (eval_config.ujian_attempts dibekukan di 2). */
export const UJIAN_SESI_BY_TRACK: Record<Track, number> = {
  qn: UJIAN_QN_SESI,
  pb: UJIAN_PB_SESI,
};

/** Track pemilik sebuah sesi ujian; null bila nomornya di luar 1/2. */
export function trackOfUjianSesi(nomor: number): Track | null {
  return nomor === UJIAN_QN_SESI ? 'qn' : nomor === UJIAN_PB_SESI ? 'pb' : null;
}

/**
 * Jenis rapot yang bersumber dari sebuah sesi — penjaga "buka kunci" sesi
 * terkirim. Membuka sesi yang rapotnya masih aktif berarti membiarkan dokumen
 * ber-QR memuat angka yang sudah tak berlaku, jadi pembukaan ditolak selama
 * masih ada rapot aktif dengan salah satu jenis di daftar ini.
 *
 * Sesi berkala menyuplai rapot track-nya sendiri; sesi ujian menyuplai track
 * pemiliknya (`trackOfUjianSesi`). Rapot era lama ikut terdaftar karena
 * `nilaiAkhirOf` membangunnya dari kolam berkala QN+PB digabung DAN Ujian PB —
 * jadi sesi mana pun bisa jadi sumbernya.
 */
export function jenisRapotDariSesi(jenis: Jenis, nomorSesi: number): string[] {
  if (jenis === 'ujian') {
    const track = trackOfUjianSesi(nomorSesi);
    if (!track) return ['ujian']; // nomor di luar 1/2 — hanya rapot era lama
    return [track, 'ujian', `ujian_${track}`];
  }
  return [jenis, 'berkala', 'ujian'];
}

/** Peran dokumen: PB menentukan kelulusan level, QN prasyarat yang wajib tuntas. */
export function peranTrack(track: Track): 'penentu' | 'prasyarat' {
  return track === 'pb' ? 'penentu' : 'prasyarat';
}

/** Nada vonis pita status rapot track — pemetaan warnanya urusan komponen. */
export type NadaVonis = 'lulus' | 'mengulang' | 'bawah_standar' | 'kosong';

export interface VonisTrack {
  nada: NadaVonis;
  /** Teks huruf besar untuk pita status: LULUS / MENGULANG / DI BAWAH STANDAR / teksKosong. */
  teks: string;
}

/**
 * Vonis yang dicetak di pita status rapot track — SATU definisi untuk lembar
 * A4, layar pengajar, Pusat Rapot, dan halaman cek QR.
 *
 * Kelulusan level ditentukan Rapot PB (peran `penentu`): di bawah ambang =
 * MENGULANG. Rapot QN (peran `prasyarat`) nilainya TIDAK menggugurkan —
 * peserta ber-QN di bawah ambang tetap lanjut ke Kelas PB — jadi vonisnya
 * DI BAWAH STANDAR, bukan MENGULANG. Pernah salah: Rapot QN mencetak
 * "MENGULANG" dan dibaca peserta sebagai tidak naik level.
 *
 * `lulus` null = nilai akhir belum ada; teksnya diserahkan ke pemanggil karena
 * tiap layar punya kalimat "belum"-nya sendiri.
 */
export function vonisTrack(
  peran: 'penentu' | 'prasyarat',
  lulus: boolean | null,
  teksKosong = 'BELUM LENGKAP',
): VonisTrack {
  if (lulus === true) return { nada: 'lulus', teks: 'LULUS' };
  if (lulus === false) {
    return peran === 'prasyarat'
      ? { nada: 'bawah_standar', teks: 'DI BAWAH STANDAR' }
      : { nada: 'mengulang', teks: 'MENGULANG' };
  }
  return { nada: 'kosong', teks: teksKosong };
}

export interface NilaiAkhir {
  nilai: number | null;      // null bila Ujian PB belum ada
  berkalaAvg: number | null; // null bila belum ada sesi berkala yang dinilai
  ujianPbSkor: number | null;
  lengkap: boolean;          // berkalaAvg != null && ujianPbSkor != null
  lulus: boolean | null;     // null bila nilai null
}

// berkalaScores = skor semua sesi qn+pb yang sudah dinilai (digabung, unweighted).
/**
 * @deprecated Hanya untuk rapot era lama (`jenis_rapot` berkala/ujian). Rapot baru
 * per-track memakai `nilaiAkhirTrackOf`. Dipertahankan supaya aritmetika dokumen
 * yang sudah terbit bisa dikunci di `scripts/test-evaluasi.ts` dan tidak diam-diam
 * bergeser kalau seseorang "merapikan" fungsi ini.
 */
export function nilaiAkhirOf(berkalaScores: number[], ujianPbSkor: number | null): NilaiAkhir {
  const berkalaAvg = berkalaScores.length
    ? Math.round(berkalaScores.reduce((a, b) => a + b, 0) / berkalaScores.length)
    : null;
  // Nilai akhir hanya sah bila KEDUA komponen ada. Kalau berkala kosong, jangan
  // perlakukan sebagai 0 (itu diam-diam memotong nilai maksimum ke 70) — kembalikan
  // null supaya tak bisa diterbitkan/ditampilkan sebagai angka menyesatkan.
  const nilai =
    ujianPbSkor == null || berkalaAvg == null
      ? null
      : Math.round(BOBOT_BERKALA * berkalaAvg + BOBOT_UJIAN_AKHIR * ujianPbSkor);
  return {
    nilai,
    berkalaAvg,
    ujianPbSkor,
    lengkap: berkalaAvg != null && ujianPbSkor != null,
    lulus: nilai == null ? null : nilai >= AMBANG_LULUS_LAMA,
  };
}

export interface NilaiAkhirTrack {
  track: Track;
  nilai: number | null;      // null bila komponen belum lengkap
  berkalaAvg: number | null; // rata sesi berkala track ini; null di mode ujianSaja
  ujianSkor: number | null;  // skor ujian track ini
  lengkap: boolean;
  lulus: boolean | null;     // null bila nilai null
  ujianSaja: boolean;        // true = nilai akhir murni skor ujian (batch rapot_ujian_terpisah)
}

/**
 * Nilai akhir SATU track (0062).
 *
 * Normal    : 30% rata sesi berkala track itu + 70% ujian track itu.
 * ujianSaja : 100% skor ujian track itu — batch `eval_batch.rapot_ujian_terpisah`
 *             (Januari 2026) yang memang tidak menjalankan sesi berkala. Berlaku
 *             untuk KEDUA track, bukan PB saja.
 *
 * Semantik null sengaja sama dengan `nilaiAkhirOf`: nilai hanya sah bila komponen
 * yang dibutuhkan ADA. Berkala kosong tidak boleh diperlakukan 0 — itu diam-diam
 * memotong nilai maksimum ke 70 dan menghasilkan angka yang menyesatkan.
 */
export function nilaiAkhirTrackOf(
  track: Track,
  berkalaScoresTrack: number[],
  ujianSkor: number | null,
  opts?: { ujianSaja?: boolean },
): NilaiAkhirTrack {
  const ujianSaja = opts?.ujianSaja === true;

  const berkalaAvg = berkalaScoresTrack.length
    ? Math.round(berkalaScoresTrack.reduce((a, b) => a + b, 0) / berkalaScoresTrack.length)
    : null;

  // Lantai `NILAI_MINIMUM` dipasang di skor ujian, lalu sekali lagi di nilai akhir
  // — supaya angka yang tampil di rekap koordinator sama persis dengan rapot.
  const ujianSkorLantai = lantaiNilaiOpt(ujianSkor);

  // Mode ujianSaja: berkala memang tidak ada, jadi ketiadaannya bukan alasan
  // menahan nilai. Mode normal: kedua komponen wajib ada.
  const lengkap = ujianSaja ? ujianSkorLantai != null : berkalaAvg != null && ujianSkorLantai != null;

  let nilai: number | null = null;
  if (lengkap && ujianSkorLantai != null) {
    // Pembobotan dihitung dengan BILANGAN BULAT, bukan `0.3*a + 0.7*b`.
    // Perkalian pecahan biner membuat sebagian hasil ".5" jatuh ke bawah:
    // berkalaAvg 17 & ujian 92 secara eksak 69,5 → seharusnya membulat ke 70
    // (LULUS), tapi JS menghitungnya 69.49999999999999 → 69 (MENGULANG), dan
    // lembar rapotnya sendiri mencetak "69,5 → 69". Ada 172 pasangan seperti itu
    // di rentang 0–100, satu di antaranya melewati ambang kelulusan.
    nilai = ujianSaja
      ? ujianSkorLantai
      : lantaiNilai(Math.round((3 * (berkalaAvg as number) + 7 * ujianSkorLantai) / 10));
  }

  return {
    track,
    nilai,
    berkalaAvg: ujianSaja ? null : berkalaAvg,
    ujianSkor: ujianSkorLantai,
    lengkap,
    lulus: nilai == null ? null : nilai >= AMBANG_LULUS_AKHIR,
    ujianSaja,
  };
}

// Jumlahkan beberapa LahnCounts (akumulasi kesalahan lintas sesi untuk tabel rapot).
export function sumCounts(list: LahnCounts[]): LahnCounts {
  const out = emptyCounts();
  for (const c of list) for (const d of ALL_LAHN) out[d.key] += c[d.key] || 0;
  return out;
}

// Konversi antara counts (keyed) dan kolom DB (kh_/jk_).
export function countsToColumns(counts: LahnCounts): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of ALL_LAHN) out[d.column] = Math.max(0, counts[d.key] || 0);
  return out;
}
export function columnsToCounts(row: Record<string, unknown>): LahnCounts {
  const c = emptyCounts();
  for (const d of ALL_LAHN) c[d.key] = Number(row[d.column] || 0);
  return c;
}

// --- Geometri grafik tren rapor (port murni dari mockup buildTrack) ---
export interface TrackPoint { no: number; score: number | null; filled: boolean; cx: number; cy: number; }
export interface TrackGeometry {
  points: string;          // polyline points for filled sessions, '' if none
  sessions: TrackPoint[];  // one per history entry
  avg: number | null;      // rounded mean of filled, null if none
  trend: number;           // last filled − prev filled, 0 if <2 filled
  ambangY: number;         // y of the AMBANG dashed line
  chartW: number; chartH: number; padX: number;
}

export function buildTrackGeometry(history: (number | null)[]): TrackGeometry {
  const W = 260, H = 92, padX = 16, padY = 12;
  const n = history.length;
  const denom = n > 1 ? n - 1 : 1;
  const xFor = (i: number) => padX + i * ((W - 2 * padX) / denom);
  const yFor = (score: number) => padY + (1 - score / 100) * (H - 2 * padY);

  const sessions: TrackPoint[] = history.map((v, i) => {
    const filled = v != null;
    return {
      no: i + 1,
      score: filled ? v : null,
      filled,
      cx: xFor(i),
      cy: filled ? yFor(v as number) : H - padY,
    };
  });

  const nums = sessions.filter((x) => x.filled).map((x) => x.score as number);
  const avg = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  const trend = nums.length >= 2 ? nums[nums.length - 1] - nums[nums.length - 2] : 0;
  const points = sessions
    .filter((x) => x.filled)
    .map((x) => x.cx + ',' + x.cy.toFixed(1))
    .join(' ');

  return { points, sessions, avg, trend, ambangY: yFor(AMBANG), chartW: W, chartH: H, padX };
}

/**
 * Nama program tanpa embel-embel angkatan, untuk label dropdown penyaring.
 * "HITS Reguler (Batch April 2026)" → "HITS Reguler".
 *
 * INI HANYA MERANGKAI LABEL, BUKAN PENGELOMPOKAN. Yang mengelompokkan program
 * adalah `eval_batch.family` — dimirror langsung dari `SrcProgram.batch.family`
 * di sumber, jadi sumberlah yang memutuskan angkatan mana milik program mana.
 * Fungsi ini cuma memberi nama pada kelompok yang sudah terbentuk itu. Jangan
 * memakainya sebagai kunci pengelompokan: dua program berbeda yang kebetulan
 * bernama sama akan melebur tanpa suara.
 *
 * Polanya sengaja khusus "(Batch …)" di ujung, bukan sembarang kurung: nama
 * seperti "Tahsin Al-Fatihah Mustahik (LAZ)" dan "HKM — Presensi (Halaqah
 * Keluarga Tilawa Labs)" harus lolos utuh, kalau tidak program yang berbeda bisa
 * bertabrakan jadi satu label.
 *
 * `/i` dipasang untuk jaga-jaga; seluruh data nyata memakai "Batch" berkapital.
 */
export function namaProgram(namaBatch: string): string {
  return namaBatch.replace(/\s*\(Batch\s+[^)]*\)\s*$/i, '').trim();
}
