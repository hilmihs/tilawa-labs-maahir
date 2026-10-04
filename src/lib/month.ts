/** Helper periode bulan — server-safe (tanpa React), aman dipakai di Server Component. */

/** Opsi bulan dari `start` (YYYY-MM) s/d bulan berjalan (Asia/Jakarta), terbaru dulu. */
export function monthOptionsSince(start: string): Array<{ value: string; label: string }> {
  const now = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const [sy, sm] = start.split('-').map(Number);
  const [ny, nm] = now.split('-').map(Number);
  const out: Array<{ value: string; label: string }> = [];
  let y = sy, m = sm;
  while (y < ny || (y === ny && m <= nm)) {
    const value = `${y}-${String(m).padStart(2, '0')}`;
    out.push({
      value,
      label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out.reverse();
}
