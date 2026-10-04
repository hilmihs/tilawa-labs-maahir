/**
 * Label tanggal & jam berbahasa Indonesia dari string 'YYYY-MM-DD' / 'HH:MM[:SS]'.
 * Murni (tanpa impor server) — aman dipakai di client component.
 *
 * Tanggal dibaca sebagai tanggal kalender, bukan instan: dibentuk di UTC dan
 * diformat di UTC supaya zona waktu mesin tak menggeser harinya.
 */

function utc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** 'Senin, 28 September 2026' */
export function tanggalPanjang(iso: string): string {
  return utc(iso).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** 'Senin, 28 September' */
export function tanggalTanpaTahun(iso: string): string {
  return utc(iso).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

/** 'Senin, 21 Sep' */
export function tanggalSedang(iso: string): string {
  return utc(iso).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/** 'Senin' */
export function namaHari(iso: string): string {
  return utc(iso).toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'UTC' });
}

/** 'Hari ini' / 'Kemarin' / 'Senin, 21 Sep' — relatif terhadap `today`. */
export function tanggalRelatif(iso: string, today: string): string {
  if (iso === today) return 'Hari ini';
  const selisih = Math.round((utc(today).getTime() - utc(iso).getTime()) / 86_400_000);
  if (selisih === 1) return 'Kemarin';
  return tanggalSedang(iso);
}

/** '19:30:00' → '19.30' */
export function jamTitik(hhmm: string): string {
  return hhmm.slice(0, 5).replace(':', '.');
}

/** 'Senin & Selasa', 'Senin, Selasa & Rabu' — nama hari unik, urut kemunculan. */
export function daftarHari(isos: string[]): string {
  const hari = Array.from(new Set(isos.map(namaHari)));
  if (hari.length <= 1) return hari.join('');
  return `${hari.slice(0, -1).join(', ')} & ${hari[hari.length - 1]}`;
}
