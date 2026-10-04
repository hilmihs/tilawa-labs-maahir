// Penyaring baris hits_keterangan_harian yang SAH dipakai untuk menilai
// pengajar (matrix skill & rekap indisipliner).
//
// Latar: impor massal 2026-06-21 membuat 3164 baris sekaligus, termasuk 537
// baris untuk pertemuan yang tanggalnya BELUM terjadi. Baris pra-generate itu
// membawa nilai bawaan latihan_diberikan=false / status_latihan='TAL', sehingga
// pengajar terlihat "tidak memberi latihan" (badge TL) padahal kelasnya belum
// berlangsung dan ketua kelas belum mengobservasi apa pun.
//
// Dua saringan:
//   1. tanggal > hari ini            → pertemuan belum terjadi, mustahil dinilai.
//   2. baris pra-generate            → diisi_by_role masih 'koordinator_ketua_kelas'
//      (form ketua menulis 'ketua_kelas' saat disubmit) DAN barisnya dibuat
//      sebelum tanggal pertemuannya. Baris impor yang tanggalnya sudah lewat
//      saat dibuat TETAP dipakai — itu riwayat asli Jan–Jun yang diimpor massal.

/** Peran penulis baris hasil pra-generate/impor, bukan submit ketua kelas. */
export const ROLE_PRAGENERATE = 'koordinator_ketua_kelas';

export type KeteranganNilaiFields = {
  tanggal: string;
  diisi_by_role?: string | null;
  created_at?: string | null;
};

/** Tanggal hari ini (Asia/Jakarta) dalam format YYYY-MM-DD. */
export function todayJakartaISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/**
 * True bila baris keterangan layak dipakai menilai pengajar.
 * @param today YYYY-MM-DD (Asia/Jakarta); lewatkan agar konsisten satu request.
 */
export function isKeteranganDinilai(k: KeteranganNilaiFields, today: string): boolean {
  if (!k.tanggal) return false;
  // 1. Pertemuan belum terjadi.
  if (k.tanggal > today) return false;
  // 2. Baris pra-generate yang belum pernah disubmit ketua kelas.
  if (k.diisi_by_role === ROLE_PRAGENERATE && typeof k.created_at === 'string') {
    const dibuat = k.created_at.slice(0, 10);
    if (k.tanggal > dibuat) return false;
  }
  return true;
}

/** Kolom yang WAJIB ikut di-select agar isKeteranganDinilai bisa bekerja. */
export const KETERANGAN_NILAI_COLS = 'tanggal, diisi_by_role, created_at';

/**
 * True bila pertemuan ini sudah benar-benar diobservasi ketua kelas —
 * dipakai halaman koordinator untuk memisahkan "sudah" vs "belum diisi".
 * Baris pra-generate/impor tidak dihitung sebagai observasi.
 */
export function sudahDiobservasiKetua(k: { diisi_by_role?: string | null } | null | undefined): boolean {
  return !!k && k.diisi_by_role !== ROLE_PRAGENERATE && k.diisi_by_role != null;
}
