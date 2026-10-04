// Pembagian jenis pelanggaran HITS ke dua indikator yang TIDAK boleh dicampur
// (ditetapkan rapat Agustus 2026). Modul murni tanpa dependensi supaya bisa
// dipakai matrix-compute, hits-ranking, hutang menit, maupun uji.
//
//   Kedisiplinan Waktu (On-Time) — "kelasnya tepat jam?"   → KMT, KBLA
//   Komitmen Jadwal & Kehadiran  — "kelasnya ada?"          → JKG, BADAL
//   Tanggung Jawab               — urusan latihan mandiri   → TIDAK_LATIHAN
//
// Satu jenis hanya memengaruhi SATU indikator. Sampai Agustus 2026 Kedisiplinan
// Waktu ikut menghitung JKG & BADAL, sehingga satu pertemuan yang dipindah hari
// menurunkan dua indikator sekaligus.

/** Toleransi keterlambatan mulai kelas, dalam menit. */
export const TOLERANSI_KMT = 5;

export type PelanggaranRingkas = { jenis: string; menit: number | null };

/**
 * Pelanggaran yang menurunkan **Kedisiplinan Waktu**:
 *   - KMT  = mulai terlambat. Lewat toleransi 5 menit baru dihitung.
 *   - KBLA = kelas diakhiri lebih awal. Tanpa toleransi, tapi 0 menit = tak awal.
 *
 * `menit` kosong = tetap pelanggaran: ketua kelas sudah menandai pertemuan itu,
 * menitnya saja yang tak tercatat (banyak di data impor F1). Beda dari
 * hutangMenit() yang memang tak bisa menagih menit yang tak diketahui.
 */
export function isPelanggaranOnTime(p: PelanggaranRingkas): boolean {
  if (p.jenis === 'KMT') return p.menit == null || p.menit > TOLERANSI_KMT;
  if (p.jenis === 'KBLA') return p.menit == null || p.menit > 0;
  return false;
}

/**
 * Pelanggaran yang menurunkan **Stabilitas Jadwal** (bagian Komitmen Jadwal):
 * pertemuan dipindah hari (JKG) atau dialihkan ke badal. Guru asli tetap
 * dihitung saat digantikan — kelasnya tak berjalan sebagaimana dijadwalkan.
 */
export function isPelanggaranStabilitas(jenis: string): boolean {
  return jenis === 'JKG' || jenis === 'BADAL';
}
