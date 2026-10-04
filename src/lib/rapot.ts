// Rapot Evaluasi — tipe snapshot + builder murni.
// Dipakai bersama oleh: API terbitkan (snapshot ke DB), preview HP (client),
// halaman cetak A4, dan halaman verifikasi publik. Satu sumber kebenaran agar
// preview, snapshot, dan cetak selalu identik.

import {
  ALL_LAHN,
  JALIY,
  KHAFIY,
  scoreOf,
  tierOf,
  sumCounts,
  nilaiAkhirTrackOf,
  lantaiNilai,
  peranTrack,
  AMBANG_LULUS_AKHIR,
  NILAI_MINIMUM,
  AMBANG_UJIAN_DEFAULT,
  SKOR_MAKS,
  SKOR_MAKS_LAMA,
  UJIAN_SESI_BY_TRACK,
  SESI_BERKALA_PER_TRACK,
  type Jenis,
  type LahnCounts,
  type Track,
} from './evaluasi';

// Satu sesi peserta yang sudah dinormalisasi (dari DB atau dari state client).
export interface SesiNilaiInput {
  jenis: Jenis;
  nomor_sesi: number;
  counts: LahnCounts;
  catatan: string;
  tgl: string | null; // tgl_jadwal ISO (yyyy-mm-dd) atau null
  done: boolean;
  hadir?: boolean; // default true; sesi dgn hadir===false tak dihitung ke rapot
}

export interface RapotIdentitas {
  peserta: string;
  halaqah: string;
  level: string | null;
  mustawa: number | null;
  gender: string;
  batch: string | null;
}

export interface RapotTrackSnap {
  jenis: 'qn' | 'pb';
  label: string;
  rata: number | null;
  history: (number | null)[]; // 4 slot
  catatan: { label: string; tgl: string | null; teks: string }[];
}

export interface RapotLahnRow {
  key: string;
  label: string;
  group: 'jaliy' | 'khafiy';
  count: number;
}

export interface RapotUjianSnap {
  sesi: number;
  label: string; // 'Ujian QN' | 'Ujian PB'
  skor: number | null;
  jaliy: number;
  khafiy: number;
  counts: LahnCounts;
  tgl: string | null;
  catatan: string;
  lulus: boolean | null; // vs ambang
}

export interface RapotBerkala {
  rataGabungan: number | null;
  tertinggi: number | null;
  predikat: string;
  tracks: RapotTrackSnap[];
  akumulasi: RapotLahnRow[]; // nonzero, desc
}

export interface RapotUjian {
  nilaiAkhir: number | null;
  berkalaAvg: number | null;
  ujianPbSkor: number | null;
  lulus: boolean | null;
  qn: RapotUjianSnap | null;
  pb: RapotUjianSnap | null;
  rincian: { key: string; label: string; group: 'jaliy' | 'khafiy'; qn: number | null; pb: number | null }[];
  catatanPenguji: string;
}

/**
 * Jenis dokumen rapot ERA LAMA — dokumen yang sudah terbit sebelum rotasi 0062.
 * Nilainya tidak dicabut dan barisnya tidak pernah dihitung ulang: rapot ber-QR
 * yang sudah beredar harus tetap terverifikasi persis seperti saat dicetak.
 *
 * - `berkala`   — rekap 4 sesi QN + 4 sesi PB digabung.
 * - `ujian`     — rapot ujian akhir gabungan; nilai akhir = 30% berkala + 70% Ujian PB.
 * - `ujian_qn` / `ujian_pb` — batch dgn `eval_batch.rapot_ujian_terpisah` (0058):
 *   satu dokumen per ujian, nilai akhir MURNI skor ujian itu, dan sengaja tidak
 *   menyinggung ujian yang lain sama sekali.
 */
export type JenisRapotLegacy = 'berkala' | 'ujian' | 'ujian_qn' | 'ujian_pb';

/**
 * Jenis dokumen rapot ERA BARU (0062) = track-nya sendiri: satu rapot memuat
 * seluruh evaluasi berkala track itu PLUS ujian akhir track itu.
 */
export type JenisRapot = JenisRapotLegacy | Track;

/** Rapot ujian legacy yang berdiri sendiri (bukan gabungan QN+PB). */
export function isUjianTunggal(j: JenisRapot): j is 'ujian_qn' | 'ujian_pb' {
  return j === 'ujian_qn' || j === 'ujian_pb';
}

/**
 * Ujian mana yang jadi fokus dokumen LEGACY; null untuk rapot gabungan/berkala.
 * Sengaja null juga untuk 'qn'/'pb' — rapot era baru punya `trackRapot.track`,
 * jangan pakai fungsi ini untuk menentukan track-nya.
 */
export function fokusUjian(j: JenisRapot): 'qn' | 'pb' | null {
  return j === 'ujian_qn' ? 'qn' : j === 'ujian_pb' ? 'pb' : null;
}

/** Isi rapot satu track: seluruh sesi berkala track itu + ujian akhirnya. */
export interface RapotTrackAkhir {
  track: Track;
  label: string; // config.nama_qn / nama_pb
  berkala: RapotTrackSnap; // 4 slot sesi — bentuk lama dipakai ulang
  berkalaAvg: number | null;
  ujian: RapotUjianSnap | null;
  ujianSkor: number | null;
  nilaiAkhir: number | null;
  lulus: boolean | null;
  ujianSaja: boolean; // true = nilai akhir murni skor ujian (batch rapot_ujian_terpisah)
  predikat: string;
  akumulasi: RapotLahnRow[]; // kesalahan sesi berkala track ini
  rincianUjian: RapotLahnRow[]; // kesalahan pada ujian track ini
  catatanPenguji: string;
  peran: 'penentu' | 'prasyarat'; // pb menentukan kelulusan, qn prasyarat
}

/**
 * Kenapa rapot track ini belum boleh diterbitkan — kosong berarti boleh.
 *
 * SATU sumber untuk klien dan server. Dulu aturannya ditulis dua kali: sekali di
 * `screens/RapotTrack.tsx` (untuk mengunci tombol) dan sekali di
 * `/api/evaluasi/rapot/terbitkan` (untuk menolak). Keduanya sudah pernah
 * berbeda, dan bedanya muncul sebagai tombol yang menyala lalu gagal 400 —
 * pengajar tak punya cara menebak mana yang benar.
 *
 * Dibangun dari payload yang sudah jadi, bukan dari baris sesi mentah, supaya
 * pemanggilnya tak perlu tahu nomor sesi ujian tiap track.
 */
export function alasanBelumTerbit(tr: RapotTrackAkhir): string[] {
  const short = tr.track === 'qn' ? 'QN' : 'PB';
  const alasan: string[] = [];
  if (tr.ujian == null) alasan.push(`Belum ada Ujian ${short}`);
  if (!tr.ujianSaja) {
    // Rapot track memuat SELURUH sesi berkala track itu, jadi keempatnya wajib
    // sudah dinilai — bukan sekadar "ada satu" seperti era sebelum 0062.
    const terisi = tr.berkala.history.filter((v) => v != null).length;
    if (terisi < SESI_BERKALA_PER_TRACK) {
      alasan.push(`Sesi ${short} baru ${terisi} dari ${SESI_BERKALA_PER_TRACK}`);
    }
  }
  if (alasan.length === 0 && tr.nilaiAkhir == null) alasan.push('Nilai akhir belum lengkap');
  return alasan;
}

/** ERA LAMA — bentuk payload yang sudah tersimpan. JANGAN diubah selamanya. */
export interface RapotPayloadLegacy {
  v?: undefined;
  jenis_rapot: JenisRapotLegacy;
  identitas: RapotIdentitas;
  ambang: number;
  tanggal: string; // ISO terbit
  penerbit: string; // nama pengajar
  berkala?: RapotBerkala;
  ujian?: RapotUjian;
}

/** ERA BARU (0062) — satu rapot per track. */
export interface RapotPayloadTrack {
  v: 1;
  jenis_rapot: Track;
  identitas: RapotIdentitas;
  ambang: number; // AMBANG_LULUS_AKHIR saat terbit (70; 65 untuk terbitan 25 Sep – 1 Okt 2026)
  /**
   * Skor tanpa kesalahan saat rapot terbit (`SKOR_MAKS`: 100, atau 95 untuk
   * terbitan 25 Sep – 1 Okt 2026). Tidak ada di rapot yang terbit sebelum
   * 25 Sep 2026 — baca lewat `skorMaksOf`, yang mengembalikan 100.
   */
  skorMaks?: number;
  tanggal: string;
  penerbit: string;
  trackRapot: RapotTrackAkhir;
}

/**
 * Payload rapot — union dua era. Diskriminannya `jenis_rapot` (selalu ada, dan
 * kembar dengan kolom DB); `v` hanya penanda forensik (baris lama tidak punya).
 *
 * Konsumen WAJIB mempersempit lewat `isRapotTrack` sebelum menyentuh isinya.
 */
export type RapotPayload = RapotPayloadLegacy | RapotPayloadTrack;

export function isRapotTrack(p: RapotPayload): p is RapotPayloadTrack {
  return p.jenis_rapot === 'qn' || p.jenis_rapot === 'pb';
}

/** Skor maksimum yang berlaku saat rapot terbit — untuk rumus yang dicetak. */
export function skorMaksOf(p: RapotPayloadTrack): number {
  return p.skorMaks ?? SKOR_MAKS_LAMA;
}

export function isRapotLegacy(p: RapotPayload): p is RapotPayloadLegacy {
  return !isRapotTrack(p);
}

const TRACK_LABEL: Record<'qn' | 'pb', string> = { qn: 'Evaluasi QN', pb: 'Evaluasi PB' };

function trackShort(j: Jenis): string {
  return j === 'qn' ? 'QN' : j === 'pb' ? 'PB' : 'Ujian';
}

// Skor sesi berkala SATU track yang done — dasar rata-rata 30% rapot track itu.
// (Sebelum 0062 fungsi ini menggabung qn+pb; penggabungan itulah yang dihapus.)
function berkalaScoresOf(sesi: SesiNilaiInput[], track: Track): number[] {
  return sesi
    .filter((s) => s.jenis === track && s.done && s.hadir !== false)
    .map((s) => scoreOf(s.counts).skor);
}

function buildTrack(sesi: SesiNilaiInput[], jenis: 'qn' | 'pb', namaTrack?: string): RapotTrackSnap {
  const rows = sesi.filter((s) => s.jenis === jenis);
  const history: (number | null)[] = [1, 2, 3, 4].map((n) => {
    const r = rows.find((s) => s.nomor_sesi === n && s.done && s.hadir !== false);
    return r ? scoreOf(r.counts).skor : null;
  });
  const filled = history.filter((v): v is number => v != null);
  const rata = filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length) : null;
  const catatan = rows
    .filter((s) => s.done && s.hadir !== false && s.catatan.trim())
    .sort((a, b) => a.nomor_sesi - b.nomor_sesi)
    .map((s) => ({ label: `${trackShort(jenis)} S${s.nomor_sesi}`, tgl: s.tgl, teks: s.catatan.trim() }));
  return { jenis, label: namaTrack ?? TRACK_LABEL[jenis], rata, history, catatan };
}

/** Baris lahn nonzero, urut menurun — dipakai akumulasi berkala & rincian ujian. */
function lahnRowsOf(counts: LahnCounts): RapotLahnRow[] {
  return ALL_LAHN.map((d) => ({ key: d.key, label: d.label, group: d.group, count: counts[d.key] || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Akumulasi kesalahan seluruh sesi berkala SATU track. */
function akumulasiLahn(sesi: SesiNilaiInput[], track: Track): RapotLahnRow[] {
  const done = sesi
    .filter((s) => s.jenis === track && s.done && s.hadir !== false)
    .map((s) => s.counts);
  return lahnRowsOf(sumCounts(done));
}

function ujianSnap(sesi: SesiNilaiInput[], nomor: number, label: string, ambang: number): RapotUjianSnap | null {
  const r = sesi.find((s) => s.jenis === 'ujian' && s.nomor_sesi === nomor && s.done && s.hadir !== false);
  if (!r) return null;
  const sc = scoreOf(r.counts);
  // Lantai `NILAI_MINIMUM` (55): skor ujian yang DICETAK tak pernah di bawah itu.
  //
  // Badge lulus tetap dihitung dari skor MENTAH. Lantai adalah aturan pencetakan,
  // bukan aturan penilaian — ia tidak boleh meluluskan siapa pun. `ambang` di sini
  // adalah `eval_halaqah.ambang_ujian`, smallint bebas isi yang default lamanya 65
  // dan masih 65 di skrip seed; halaqah mana pun berambang ≤55 akan mencap skor
  // mentah 10 sebagai "Lulus" kalau badge-nya ikut dilantai.
  const skor = lantaiNilai(sc.skor);
  return {
    sesi: nomor,
    label,
    skor,
    jaliy: sc.jaliyCount,
    khafiy: sc.khafiyCount,
    counts: r.counts,
    tgl: r.tgl,
    catatan: r.catatan.trim(),
    lulus: sc.skor >= ambang,
  };
}

/**
 * Bangun rapot SATU track (0062): seluruh sesi evaluasi berkala track itu plus
 * ujian akhir track itu, dalam satu dokumen.
 *
 * Nilai akhir = 30% rata sesi berkala track + 70% ujian track (`nilaiAkhirTrackOf`).
 * Untuk batch `eval_batch.rapot_ujian_terpisah` (Januari 2026) pakai `ujianSaja`:
 * nilai akhir jadi murni skor ujian track itu dan komponen berkala tidak ada —
 * berlaku untuk KEDUA track, bukan PB saja.
 *
 * `ambangUjianSesi` (= halaqah.ambang_ujian) hanya menentukan badge lulus di dalam
 * snap ujian, supaya cocok dengan layar Nilai pengajar. Ambang NILAI AKHIR tetap
 * fix `AMBANG_LULUS_AKHIR` (70) untuk kedua track.
 */
export function buildTrackRapotPayload(args: {
  track: Track;
  identitas: RapotIdentitas;
  penerbit: string;
  tanggal: string;
  sesi: SesiNilaiInput[];
  namaTrack?: string;
  ambangUjianSesi?: number;
  ujianSaja?: boolean;
}): RapotPayloadTrack {
  const {
    track,
    identitas,
    penerbit,
    tanggal,
    sesi,
    namaTrack,
    ambangUjianSesi = AMBANG_UJIAN_DEFAULT,
    ujianSaja = false,
  } = args;

  const label = namaTrack ?? TRACK_LABEL[track];
  const berkala = buildTrack(sesi, track, label);
  const ujian = ujianSnap(
    sesi,
    UJIAN_SESI_BY_TRACK[track],
    `Ujian ${track.toUpperCase()}`,
    ambangUjianSesi,
  );

  const na = nilaiAkhirTrackOf(track, berkalaScoresOf(sesi, track), ujian?.skor ?? null, {
    ujianSaja,
  });

  return {
    v: 1,
    jenis_rapot: track,
    identitas,
    ambang: AMBANG_LULUS_AKHIR,
    skorMaks: SKOR_MAKS,
    tanggal,
    penerbit,
    trackRapot: {
      track,
      label,
      berkala,
      berkalaAvg: na.berkalaAvg,
      ujian,
      ujianSkor: na.ujianSkor,
      nilaiAkhir: na.nilai,
      lulus: na.lulus,
      ujianSaja: na.ujianSaja,
      predikat: na.nilai == null ? '\u2014' : tierOf(na.nilai).label,
      akumulasi: ujianSaja ? [] : akumulasiLahn(sesi, track),
      rincianUjian: ujian ? lahnRowsOf(ujian.counts) : [],
      catatanPenguji: (ujian?.catatan ?? '').trim(),
      peran: peranTrack(track),
    },
  };
}

// Re-export supaya konsumen cukup impor dari satu modul.
export { JALIY, KHAFIY, AMBANG_LULUS_AKHIR, NILAI_MINIMUM, SKOR_MAKS };
