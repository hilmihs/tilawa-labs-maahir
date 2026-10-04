/**
 * Backfill password_hash untuk peserta yang belum punya.
 * Aditif — tidak menimpa password yang sudah ada.
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_PASSWORD = 'maahir123';

export async function runSeedPesertaPassword(log: (s: string) => void): Promise<void> {
  log(`Hashing default password peserta ("${DEFAULT_PASSWORD}")…`);
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  log('Backfill peserta tanpa password…');
  const { data, error } = await supabaseAdmin
    .from('peserta')
    .update({ password_hash: hash })
    .is('password_hash', null)
    .select('id, name');
  if (error) throw error;

  log(`✓ ${data?.length ?? 0} peserta di-backfill.`);
  if (data && data.length > 0) {
    log(`Default password peserta: "${DEFAULT_PASSWORD}"`);
    log('Peserta bisa ganti via halaman /akun setelah login.');
  } else {
    log('(Semua peserta sudah punya password.)');
  }
}
