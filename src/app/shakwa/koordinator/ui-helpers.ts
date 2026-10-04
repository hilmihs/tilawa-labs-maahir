// Helper bersama komponen dashboard Shakwa koordinator.
// Dipakai FilterBar, Paginasi, KategoriBadges, dan ShakwaCard.

/** Peta query saat ini (dari searchParams) → tipe seragam antar komponen. */
export type ShakwaQuery = {
  tanggal?: string;
  dari?: string;
  sampai?: string;
  kategori?: string;
  status?: string;
  gender?: string;
  page?: string;
};

/**
 * Gabung query saat ini dengan patch → string "?a=b&c=d".
 * Nilai `null` pada patch MENGHAPUS kunci itu. Kunci `page` dibuang otomatis
 * saat patch mengubah filter apa pun (kembali ke halaman 1), kecuali patch
 * sendiri menyetel `page`.
 */
export function mergeQuery(current: ShakwaQuery, patch: Partial<Record<keyof ShakwaQuery, string | null>>): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(current)) {
    if (v != null && v !== '') merged[k] = v;
  }
  const patchMengubahFilter = Object.keys(patch).some((k) => k !== 'page');
  if (patchMengubahFilter && !('page' in patch)) delete merged.page;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `?${qs}` : '';
}

/** Awal sistem — batas bawah "semua waktu" untuk tautan belum-ditangani. */
export const EPOCH_ISO = '2020-01-01';

/**
 * Waktu relatif Bahasa Indonesia dari ISO string. `now` di-inject agar bisa
 * diuji; default waktu sekarang. Di atas 7 hari, jatuh ke tanggal absolut WIB.
 */
export function waktuRelatif(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const detik = Math.floor((now.getTime() - t) / 1000);
  if (detik < 0) return 'baru saja';
  if (detik < 60) return 'baru saja';
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7) return `${hari} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium' });
}
