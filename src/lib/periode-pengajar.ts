// Periode rekap KEHADIRAN PENGAJAR Kelas Maahir memakai window 16–15: tanggal
// 16 ke atas sudah masuk bulan berikutnya. Beda dari periode laporan peserta
// (28–27, `periode-laporan.ts`) — koordinator memang menarik data pengajar
// per 16–15. Modul murni (tanpa DB) supaya bisa dipakai di mana saja.

/** Check-in pengajar Maahir mulai dilacak sejak tanggal ini. */
export const CHECKIN_PENGAJAR_ANCHOR = '2026-09-16';

/** '2026-09-16' → '2026-10'; '2026-09-15' → '2026-09'. */
export function periodePengajarOf(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  if (d < 16) return `${y}-${String(m).padStart(2, '0')}`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Rentang periode 'YYYY-MM': tanggal 16 bulan sebelumnya s/d tanggal 15 bulan itu. */
export function periodePengajarRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return {
    start: `${py}-${String(pm).padStart(2, '0')}-16`,
    end: `${month}-15`,
  };
}

function hariIniJakarta(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/** Periode yang sedang berjalan — satu-satunya yang boleh diisi/disunting. */
export function periodePengajarBerjalan(hariIni: string = hariIniJakarta()): string {
  return periodePengajarOf(hariIni);
}

/**
 * Periode default untuk tampilan rekap: periode berjalan, tapi tak pernah
 * mendahului periode pertama (sebelum anchor, tampilkan periode pertama yang
 * akan datang — bukan periode kosong yang tak punya sesi).
 */
export function periodePengajarTampilan(hariIni: string = hariIniJakarta()): string {
  const first = periodePengajarOf(CHECKIN_PENGAJAR_ANCHOR);
  const now = periodePengajarBerjalan(hariIni);
  return now < first ? first : now;
}

/** Boleh menulis check-in / materi untuk `tanggal`? Hanya periode berjalan. */
export function periodePengajarTerbuka(tanggal: string, hariIni: string = hariIniJakarta()): boolean {
  return periodePengajarOf(tanggal) === periodePengajarBerjalan(hariIni);
}

/** Label 'Periode 16 Sep – 15 Okt 2026'. */
export function periodePengajarLabel(month: string): string {
  const { start, end } = periodePengajarRange(month);
  const fmt = (iso: string, withYear: boolean) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  };
  return `${fmt(start, false)} – ${fmt(end, true)}`;
}

/**
 * Opsi dropdown periode: dari periode anchor s/d periode berjalan, terbaru
 * dulu. Value 'YYYY-MM', label memuat rentang tanggalnya supaya "Oktober 2026"
 * tak disangka 1–31 Oktober.
 */
export function periodePengajarOptions(
  hariIni: string = hariIniJakarta()
): Array<{ value: string; label: string }> {
  const first = periodePengajarOf(CHECKIN_PENGAJAR_ANCHOR);
  // Sebelum anchor: tetap tawarkan periode pertama, jangan dropdown kosong.
  const last = periodePengajarTampilan(hariIni);
  const out: Array<{ value: string; label: string }> = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    const value = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ value, label: periodePengajarLabel(value) });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out.reverse();
}
