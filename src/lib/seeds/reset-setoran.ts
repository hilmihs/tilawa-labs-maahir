/**
 * Wipe semua setoran & rekaman (peserta + musyrif). Tidak menyentuh akun
 * maupun kelas. File audio di storage tidak dihapus (cleanup-audio terpisah).
 */
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function runResetSetoran(log: (s: string) => void): Promise<void> {
  log('Menghapus rekaman_musyrif…');
  const { error: rmErr } = await supabaseAdmin
    .from('rekaman_musyrif')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (rmErr && !/relation .* does not exist/i.test(rmErr.message)) throw rmErr;

  log('Menghapus setoran_musyrif…');
  const { error: smErr } = await supabaseAdmin
    .from('setoran_musyrif')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (smErr && !/relation .* does not exist/i.test(smErr.message)) throw smErr;

  log('Menghapus rekaman…');
  const { error: rErr } = await supabaseAdmin
    .from('rekaman')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (rErr) throw rErr;

  log('Menghapus setoran…');
  const { error: sErr } = await supabaseAdmin
    .from('setoran')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (sErr) throw sErr;

  log('✓ Selesai. Semua setoran & rekaman dihapus.');
  log('Catatan: file audio di storage TIDAK dihapus. Jalankan `npm run cleanup-audio` (CLI) setelah retention period.');
}
