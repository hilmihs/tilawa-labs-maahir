/**
 * Aturan murni kelayakan pengajar — dipisah dari `ketersediaan-kelayakan.ts`
 * (yang `server-only`) supaya bisa diuji langsung lewat scripts/test-ketersediaan.ts.
 */

export interface BarisKelayakan {
  pengajar_id: string;
  boleh: boolean;
}

/**
 * Periode TANPA satu pun baris kelayakan berarti daftarnya belum pernah disetel;
 * dalam keadaan itu semua pengajar layak, persis seperti perilaku sebelum fitur
 * ini ada. Kalau tidak begitu, membuat periode baru akan mengunci semua orang
 * diam-diam dan koordinator baru sadar setelah tak ada satu pun isian masuk.
 */
export function layakMenurutDaftar(daftar: BarisKelayakan[], pengajarId: string): boolean {
  if (daftar.length === 0) return true;
  const baris = daftar.find((d) => d.pengajar_id === pengajarId);
  return baris ? baris.boleh : false;
}

/** True bila periode ini memakai daftar (bukan "semua boleh"). */
export function daftarDipakai(daftar: BarisKelayakan[]): boolean {
  return daftar.length > 0;
}
