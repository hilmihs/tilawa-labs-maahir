// Periode laporan Maahir memakai window 28–27: tanggal 28 ke atas sudah masuk
// bulan berikutnya. Modul ini murni (tanpa akses DB) supaya bisa dipakai di
// mana saja — termasuk pengecekan kunci pengisian presensi.

/** '2026-06-29' → '2026-07'. */
export function periodeMonthOf(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  if (d < 28) return `${y}-${String(m).padStart(2, '0')}`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Tanggal pertama periode 'YYYY-MM' = tanggal 28 bulan sebelumnya. */
export function periodeStartDate(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}-28`;
}

/** Tanggal terakhir periode 'YYYY-MM'. */
export function periodeEndDate(month: string): string {
  return `${month}-27`;
}

/** Hari ini (Asia/Jakarta) sebagai 'YYYY-MM-DD'. */
function hariIniJakarta(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/** Periode yang sedang berjalan — satu-satunya yang boleh diisi. */
export function periodeBerjalan(hariIni: string = hariIniJakarta()): string {
  return periodeMonthOf(hariIni);
}

/**
 * Boleh menulis presensi/setoran untuk `tanggal`?
 *
 * Kebijakan rapat Agustus 2026: pengisian ditutup pada tanggal 28 — dan karena
 * periode laporan memang berganti tepat di tanggal itu, aturannya cukup
 * "hanya periode berjalan yang terbuka". Kuncinya jatuh sendiri tiap tanggal 28
 * tanpa penjadwal apa pun, dan periode yang sudah dilaporkan tak bisa berubah
 * di belakang.
 */
export function presensiTerbuka(tanggal: string, hariIni: string = hariIniJakarta()): boolean {
  return periodeMonthOf(tanggal) === periodeBerjalan(hariIni);
}

/** Tanggal paling awal yang masih boleh diisi hari ini. */
export function batasAwalPengisian(hariIni: string = hariIniJakarta()): string {
  return periodeStartDate(periodeBerjalan(hariIni));
}

/** Pesan seragam saat penulisan ditolak — dipakai semua jalur tulis. */
export function pesanTerkunci(tanggal: string, hariIni: string = hariIniJakarta()): string {
  const batas = batasAwalPengisian(hariIni);
  return (
    `Periode presensi tanggal ${tanggal} sudah ditutup. ` +
    `Pengisian hanya dibuka untuk periode berjalan (mulai ${batas}). ` +
    `Hubungi koordinator kehadiran bila ada yang perlu diperbaiki.`
  );
}
