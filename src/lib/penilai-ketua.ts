import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Kelompok yang KETUAnya ditugaskan dinilai oleh seorang pengajar.
 *
 * Penugasan disimpan per kelompok supaya tetap berlaku saat ketua kelompok
 * berganti. Dipakai halaman /kehadiran/ketua-kelompok/penilaian-ketua dan
 * otorisasi POST /api/penilaian-pedagogis/upsert.
 */
export async function getKelompokDinilaiIds(pengajarId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('penilai_ketua_kelompok')
    .select('kelompok_id')
    .eq('pengajar_id', pengajarId);
  return (data ?? []).map((r) => r.kelompok_id as string);
}
