/**
 * Suntingan lokal atas identitas halaqah di mirror `eval_halaqah`.
 *
 * `nama` dan `level` ikut dibandingkan sinkron hilmihs (`COMPARE.halaqah`),
 * jadi menulis langsung ke sana akan ditarik balik pull berikutnya. Koreksi
 * pengajar disimpan di `nama_override` / `level_override` — kolom yang tak
 * pernah disentuh sync — dan tampilan memakai override bila ada (migrasi 0068).
 *
 * Modul ini sengaja TIDAK 'server-only': layar edit di klien juga perlu tahu
 * mana nilai yang sedang tampil dan mana yang asli dari hulu.
 */

/** Pilihan level yang boleh dipakai pengajar. Kosong = ikut data pusat. */
export const LEVEL_PILIHAN = ['Dasar', 'Lanjutan'] as const;
export type LevelPilihan = (typeof LEVEL_PILIHAN)[number];

/** Bentuk minimal baris halaqah yang cukup untuk menentukan tampilannya. */
export interface HalaqahTampil {
  nama: string;
  nama_override?: string | null;
  level?: string | null;
  level_override?: string | null;
}

export function namaHalaqahTampil(h: HalaqahTampil): string {
  return h.nama_override?.trim() || h.nama;
}

export function levelHalaqahTampil(h: HalaqahTampil): string | null {
  return h.level_override?.trim() || h.level || null;
}

const MIN_NAMA = 3;
const MAX_NAMA = 120;

/**
 * Rapikan nama halaqah ketikan pengajar. Seperti nama peserta, galat
 * dikembalikan (bukan dilempar) supaya route bisa membalas 400 dengan kalimat
 * yang langsung bisa ditampilkan.
 */
export function bersihkanNamaHalaqah(raw: unknown): { nama: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Nama halaqah wajib diisi.' };
  const nama = raw.trim().replace(/\s+/g, ' ');
  if (nama.length < MIN_NAMA) return { error: 'Nama halaqah terlalu pendek.' };
  if (nama.length > MAX_NAMA) return { error: `Nama halaqah maksimal ${MAX_NAMA} huruf.` };
  return { nama };
}

/**
 * Terima "Dasar", "Lanjutan", atau kosong (= ikut data pusat). Level bebas-ketik
 * sengaja tidak diizinkan: data prod sudah menanggung 11 ejaan berbeda untuk
 * dua level yang sama, dan menambah jalur ketik baru cuma memperparahnya.
 */
export function bersihkanLevelHalaqah(raw: unknown): { level: string | null } | { error: string } {
  if (raw === null || raw === undefined || raw === '') return { level: null };
  if (typeof raw !== 'string') return { error: 'Level tidak dikenali.' };
  const level = raw.trim();
  if (!LEVEL_PILIHAN.includes(level as LevelPilihan)) {
    return { error: 'Level harus Dasar atau Lanjutan, atau dikosongkan.' };
  }
  return { level };
}
