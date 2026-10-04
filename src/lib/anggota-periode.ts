// Rentang keanggotaan seorang peserta di satu kelas program.
//
// `active = false` memotong seseorang dari SEMUA periode sekaligus — terlalu
// kasar untuk perpindahan kelas, karena riwayat bulan-bulan sebelumnya ikut
// hilang. Pasangan `mulai_tanggal`/`selesai_tanggal` memberi batas waktu:
// pertemuan sebelum ia masuk dan sesudah ia keluar tak dihitung, sisanya utuh.

export type AnggotaPeriode = {
  created_at?: string | null;
  mulai_tanggal?: string | null;
  selesai_tanggal?: string | null;
};

/** Tanggal (YYYY-MM-DD, WIB) dari timestamp ISO. */
function tanggalWib(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/** Hari ini (Asia/Jakarta) sebagai 'YYYY-MM-DD'. */
export function todayJakarta(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/**
 * true bila ia terdaftar pada `tanggal` — batas mulai/selesai apa adanya.
 *
 * Beda dari `dalamPeriode`: di sini tak ada rentang laporan dan tak ada
 * fallback `created_at`. Dipakai untuk pertanyaan "hari ini masih anggota?",
 * mis. memutuskan sebuah kelas sudah kosong atau belum.
 */
export function anggotaAktifPada(a: AnggotaPeriode, tanggal: string): boolean {
  const mulai = a.mulai_tanggal ?? null;
  const selesai = a.selesai_tanggal ?? null;
  return (!mulai || mulai <= tanggal) && (!selesai || selesai >= tanggal);
}

/**
 * Tanggal mulai efektif di dalam periode [start, end].
 * null = sudah jadi anggota sejak sebelum periode (denominator penuh).
 *
 * `mulai_tanggal` diutamakan; bila kosong dipakai `created_at` supaya baris
 * lama yang belum punya kolom itu tetap berperilaku seperti sebelumnya.
 */
export function mulaiEfektif(a: AnggotaPeriode, start: string, end: string): string | null {
  const d = a.mulai_tanggal ?? (a.created_at ? tanggalWib(a.created_at) : null);
  if (!d) return null;
  return d > start && d <= end ? d : null;
}

/**
 * Tanggal terakhir ia masih dihitung. null = masih anggota.
 * Pertemuan setelah tanggal ini diabaikan, termasuk bila tanggalnya jatuh
 * sebelum periode (berarti seluruh periode ini tak dihitung untuknya).
 */
export function selesaiEfektif(a: AnggotaPeriode): string | null {
  return a.selesai_tanggal ?? null;
}

/** true bila pertemuan pada `tanggal` masuk hitungan anggota ini. */
export function dalamPeriode(
  a: AnggotaPeriode,
  tanggal: string,
  start: string,
  end: string
): boolean {
  const mulai = mulaiEfektif(a, start, end);
  if (mulai && tanggal < mulai) return false;
  const selesai = selesaiEfektif(a);
  if (selesai && tanggal > selesai) return false;
  return true;
}
