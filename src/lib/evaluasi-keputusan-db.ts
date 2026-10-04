// Pemuat DB untuk keputusan mengulang (0075). Terpisah dari `evaluasi-keputusan.ts`
// karena modul itu ikut dipakai komponen klien: mengimpor `supabaseAdmin` di sana
// menyeret `pg` ke bundel browser dan build gagal dengan "Can't resolve 'fs'".
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isKeputusan, labelKeputusan } from '@/lib/evaluasi-keputusan';
import type { Keputusan } from '@/lib/evaluasi-keputusan';

const NO_ID = ['00000000-0000-0000-0000-000000000000'];

/** Keputusan untuk sekumpulan peserta, dipetakan per peserta_id. */
export async function muatKeputusan(pesertaIds: string[]): Promise<Map<string, Keputusan>> {
  const { data } = await supabaseAdmin
    .from('eval_keputusan_mengulang')
    .select('peserta_id, keputusan')
    .in('peserta_id', pesertaIds.length ? pesertaIds : NO_ID);
  const out = new Map<string, Keputusan>();
  for (const r of (data ?? []) as Array<{ peserta_id: string; keputusan: string }>) {
    if (isKeputusan(r.keputusan)) out.set(r.peserta_id, r.keputusan);
  }
  return out;
}

/** Keputusan satu peserta; null bila belum diputuskan. Dipakai lembar rapot. */
export async function keputusanPeserta(pesertaId: string): Promise<Keputusan | null> {
  const { data } = await supabaseAdmin
    .from('eval_keputusan_mengulang')
    .select('keputusan')
    .eq('peserta_id', pesertaId)
    .maybeSingle();
  const k = (data as { keputusan?: unknown } | null)?.keputusan;
  return isKeputusan(k) ? k : null;
}

/**
 * Kalimat keputusan untuk lembar rapot — null bila tak ada yang perlu ditulis.
 *
 * Hanya dicetak di Rapot PB. Rapot PB-lah yang memuat vonis LULUS/MENGULANG,
 * jadi di situlah pembaca mencari "lalu bagaimana"; menempelkannya juga di
 * Rapot QN akan menghasilkan lembar bertulis "LULUS" yang di bawahnya berbunyi
 * "Mengulang di ...", dan itu membuat dokumen tampak bertentangan dengan
 * dirinya sendiri.
 */
export async function keteranganKeputusanRapot(
  pesertaId: string,
  jenisRapot: string
): Promise<string | null> {
  if (jenisRapot !== 'pb') return null;

  const k = await keputusanPeserta(pesertaId);
  if (!k) return null;

  return `Keputusan koordinator: mengulang di ${labelKeputusan(k)}`;
}
