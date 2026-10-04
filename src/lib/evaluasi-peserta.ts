/**
 * Peserta yang ditambahkan pengajar sendiri lewat /evaluasi/pengajar.
 *
 * Mirror `eval_peserta` diisi dari API hilmihs, dan id remote selalu berbentuk
 * `<slug-batch>:<angka>`. Baris buatan aplikasi diberi prefix `manual:` supaya
 * tak mungkin tabrakan dengan id remote, dan supaya asal-usulnya bisa dibaca
 * dari id-nya saja — itu yang dipakai untuk memutuskan siapa yang boleh diubah
 * atau dihapus pengajar (baris hilmihs: tidak boleh, sumbernya di hulu).
 *
 * Modul ini sengaja TIDAK 'server-only': `src/lib/hilmihs/diff.ts` adalah fungsi
 * murni dan komponen klien juga perlu membedakan baris manual untuk menampilkan
 * tombol ubah/hapus.
 */

export const MANUAL_PREFIX = 'manual:';

/** Baris ini ditambahkan lewat aplikasi, bukan hasil sinkron hilmihs. */
export function isPesertaManual(id: string): boolean {
  return id.startsWith(MANUAL_PREFIX);
}

/** Baris manual diletakkan di bawah semua baris remote pada daftar peserta. */
export const URUTAN_MANUAL_DASAR = 10_000;

const MIN_NAMA = 2;
const MAX_NAMA = 80;

/**
 * Rapikan nama ketikan pengajar: buang spasi berlebih di tepi maupun di tengah.
 * Mengembalikan pesan galat (bukan melempar) supaya route bisa membalas 400
 * dengan kalimat yang bisa langsung ditampilkan ke pengajar.
 */
export function bersihkanNamaPeserta(raw: unknown): { nama: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Nama peserta wajib diisi.' };
  const nama = raw.trim().replace(/\s+/g, ' ');
  if (nama.length < MIN_NAMA) return { error: 'Nama peserta terlalu pendek.' };
  if (nama.length > MAX_NAMA) return { error: `Nama peserta maksimal ${MAX_NAMA} huruf.` };
  return { nama };
}

/**
 * id baru untuk peserta manual. Slug nama dipakai supaya id-nya masih terbaca
 * manusia saat menelusuri lewat SQL, dan akhiran acak menjaga keunikan bila dua
 * halaqah menambahkan nama yang sama.
 */
export function buatIdPesertaManual(nama: string): string {
  const slug = nama
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const acak = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 6);
  return `${MANUAL_PREFIX}${slug || 'peserta'}-${acak}`;
}
