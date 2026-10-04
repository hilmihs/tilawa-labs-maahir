/**
 * Kurasi lokal atas mirror hilmihs (`eval_halaqah`, `eval_peserta`).
 *
 * Mirror diisi ulang tiap pull: kolom di `COMPARE` (src/lib/hilmihs/sync.ts)
 * memicu diff 'update', dan apply mengupsert SELURUH baris `after`. Artinya
 * suntingan lokal apa pun akan hilang — diam-diam, beberapa jam kemudian.
 *
 * Kolom `kurasi` (migrasi 0074) menandai kolom mana pada baris itu yang sudah
 * disunting lokal. Efeknya dua, dan keduanya perlu:
 *   1. `diffEntity` melewati kolom tsb → tak ada usulan update palsu.
 *   2. `applyStages` membuang kolom tsb dari payload upsert → update karena
 *      kolom LAIN (mis. pindah halaqah) tak ikut menimpa yang terkurasi.
 *
 * Modul ini menyentuh DB, jadi `diff.ts` sengaja TIDAK mengimpornya — file itu
 * dijaga murni (aman dijalankan tsx tanpa koneksi) dan membaca kolom `kurasi`
 * dari barisnya sendiri.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';

/** Nama tabel mirror yang punya kolom `kurasi`. */
export type TabelKurasi = 'eval_halaqah' | 'eval_peserta';

export function kurasiDariBaris(row: Record<string, unknown> | null | undefined): string[] {
  const v = row?.kurasi;
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/** Buang kolom terkurasi dari payload yang hendak ditulis sync. */
export function tanpaKolomKurasi<T extends Record<string, unknown>>(
  payload: T,
  kurasi: string[]
): Record<string, unknown> {
  if (kurasi.length === 0) return payload;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (kurasi.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Tandai kolom sebagai terkurasi lokal, gabung dengan penanda yang sudah ada.
 * Dipanggil SETELAH tulisan berhasil — kalau update gagal, barisnya tak perlu
 * kebal apa pun.
 */
export async function tandaiKurasi(
  tabel: TabelKurasi,
  id: string,
  kolom: string[]
): Promise<void> {
  const { data } = await supabaseAdmin.from(tabel).select('kurasi').eq('id', id).maybeSingle();
  const sekarang = kurasiDariBaris(data as Record<string, unknown> | null);
  const gabung = [...new Set([...sekarang, ...kolom])];
  if (gabung.length === sekarang.length) return;
  await supabaseAdmin.from(tabel).update({ kurasi: gabung }).eq('id', id);
}
