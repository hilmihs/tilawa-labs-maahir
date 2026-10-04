import { cycleEndOf, formatCycleDeadline } from '@/lib/week';
import { JENIS_REKAMAN, JENIS_REKAMAN_LABEL, type JenisRekaman } from '@/types/db';

/**
 * Kelengkapan satu setoran (3 rekaman per cycle). Dipakai halaman periksa
 * musyrif/syaikh dan server action-nya, supaya keduanya sepakat rekaman mana
 * yang boleh dinilai.
 *
 * Latar: dulu musyrif wajib memberi nilai ketiga jenis walau peserta baru
 * menyetor satu-dua. UPDATE untuk jenis yang tak punya baris `rekaman` kena 0
 * baris tanpa galat, status tetap jadi 'checked', lalu peserta terkunci (409)
 * dan tak bisa lagi menambah rekaman yang kurang.
 */
export interface Kelengkapan {
  /** Jenis yang sudah punya baris rekaman — hanya ini yang dinilai. */
  ada: JenisRekaman[];
  /** Jenis yang belum disetor. */
  kurang: JenisRekaman[];
  /** Label jenis yang kurang, mis. "Jazariyyah dan Syawahid". */
  kurangLabel: string;
  /** Periode (cycle) setoran sudah lewat batas akhirnya (zona Asia/Jakarta). */
  lewatBatas: boolean;
  /** Label batas akhir cycle, mis. "Senin, 27 Oktober 2026". */
  batasLabel: string;
}

function hariIniJakarta(): string {
  // en-CA menghasilkan format YYYY-MM-DD.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function gabungLabel(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} dan ${items[items.length - 1]}`;
}

export function hitungKelengkapan(
  weekStart: string,
  jenisAda: Iterable<string>
): Kelengkapan {
  const set = new Set(jenisAda);
  const ada = JENIS_REKAMAN.filter((j) => set.has(j));
  const kurang = JENIS_REKAMAN.filter((j) => !set.has(j));
  return {
    ada,
    kurang,
    kurangLabel: gabungLabel(kurang.map((j) => JENIS_REKAMAN_LABEL[j])),
    lewatBatas: hariIniJakarta() > cycleEndOf(weekStart),
    batasLabel: formatCycleDeadline(weekStart),
  };
}
