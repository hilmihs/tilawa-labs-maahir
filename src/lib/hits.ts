// Konstanta & helper kecil untuk subsistem HITS soft-skill (batch-native).

import type { HitsKondisi, HitsLevel } from '@/types/db';

export {
  HITS_LEVEL_LABEL,
  HITS_KONDISI_LABEL,
  HITS_STATUS_LATIHAN_LABEL,
} from '@/types/db';

// Hanya KBBS yang dihitung "baik" untuk skor kedisiplinan waktu.
export const KONDISI_BAIK: HitsKondisi = 'KBBS';

// Kondisi yang menjadi penyebut (LIBUR dikecualikan).
export function isCountedDay(kondisi: HitsKondisi): boolean {
  return kondisi !== 'LIBUR';
}

// Map nama hari (format kaldik/seed) ke index getUTCDay().
export const HARI_INDEX: Record<string, number> = {
  Ahad: 0,
  Minggu: 0,
  Senin: 1,
  Selasa: 2,
  Rabu: 3,
  Kamis: 4,
  "Jum'at": 5,
  Jumat: 5,
  Sabtu: 6,
};

// Default-guess level halaqah dari tanggal sesi pertama vs start date tiap level.
export function guessLevel(
  firstSessionDate: string | null,
  qnStart: string | null,
  pbStart: string | null
): HitsLevel | null {
  if (!firstSessionDate) return null;
  const qn = qnStart ? Math.abs(daysBetween(firstSessionDate, qnStart)) : Infinity;
  const pb = pbStart ? Math.abs(daysBetween(firstSessionDate, pbStart)) : Infinity;
  if (qn === Infinity && pb === Infinity) return null;
  return qn <= pb ? 'qoidah_nuroniyyah' : 'perbaikan_bacaan';
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return (Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000;
}

// Slug batch dari nama tab kaldik.
export function batchSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
