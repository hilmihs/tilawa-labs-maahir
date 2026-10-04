// Terapkan baris eval_sync_stage ter-approve ke mirror eval_*. Urutan penting
// (batch/pengajar dulu, lalu halaqah, lalu peserta) supaya FK terpenuhi.
import { supabaseAdmin } from '@/lib/supabase-admin';
import { kurasiDariBaris, tanpaKolomKurasi, type TabelKurasi } from '@/lib/evaluasi-kurasi';
import type { EvalSyncStage } from '@/types/db';

const TABLE: Record<string, string> = {
  batch: 'eval_batch', pengajar: 'eval_pengajar', halaqah: 'eval_halaqah', peserta: 'eval_peserta',
};
const ORDER = ['batch', 'pengajar', 'halaqah', 'peserta'];

/** Tabel mirror yang barisnya bisa dikurasi lokal (migrasi 0074). */
const BISA_KURASI = new Set<string>(['eval_halaqah', 'eval_peserta']);

/**
 * Buang kolom terkurasi lokal dari payload upsert.
 *
 * `after` adalah baris utuh hasil map hilmihs, jadi update yang dipicu kolom
 * lain (mis. peserta pindah halaqah) tetap membawa `nama`/`aktif` versi hulu.
 * Tanpa penyaringan ini, satu update tak berkaitan cukup untuk mengembalikan
 * nama yang sudah dibetulkan pengajar — atau menghidupkan peserta yang sudah
 * dihapusnya (mapPeserta selalu mengirim aktif=true).
 */
async function payloadHormatKurasi(
  table: string,
  entityId: string,
  after: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!BISA_KURASI.has(table)) return after;
  const { data } = await supabaseAdmin
    .from(table as TabelKurasi)
    .select('kurasi')
    .eq('id', entityId)
    .maybeSingle();
  return tanpaKolomKurasi(after, kurasiDariBaris(data as Record<string, unknown> | null));
}

/** Apply baris stage id tertentu. Reject → hanya ditandai, tak sentuh mirror. */
export async function applyStages(stageIds: string[], actor: string): Promise<{ applied: number }> {
  const { data } = await supabaseAdmin
    .from('eval_sync_stage')
    .select('id, entity, op, entity_id, after')
    .in('id', stageIds)
    .is('applied_at', null)
    .eq('rejected', false);
  const rows = (data ?? []) as Pick<EvalSyncStage, 'id' | 'entity' | 'op' | 'entity_id' | 'after'>[];

  const now = new Date().toISOString();
  let applied = 0;

  for (const entity of ORDER) {
    for (const r of rows.filter((x) => x.entity === entity)) {
      const table = TABLE[entity];
      let opError: string | null = null;
      if (r.op === 'deactivate') {
        const { error } = await supabaseAdmin.from(table).update({ aktif: false, synced_at: now }).eq('id', r.entity_id);
        opError = error?.message ?? null;
      } else {
        // create / update: upsert baris mirror dari `after` (+ synced_at),
        // dikurangi kolom yang sudah dikurasi lokal pada baris itu.
        const payload = await payloadHormatKurasi(
          table,
          r.entity_id,
          r.after as Record<string, unknown>
        );
        const { error } = await supabaseAdmin.from(table).upsert({ ...payload, synced_at: now }, { onConflict: 'id' });
        opError = error?.message ?? null;
      }
      // Jangan tandai applied bila mirror gagal ditulis (mis. langgar FK) — kalau
      // ditandai, koordinator mengira sync mendarat padahal mirror parsial.
      if (opError) {
        console.error(`[hilmihs/apply] ${entity} ${r.entity_id} gagal:`, opError);
        continue;
      }
      await supabaseAdmin.from('eval_sync_stage')
        .update({ applied_at: now, applied_by: actor }).eq('id', r.id);
      applied++;
    }
  }
  return { applied };
}

export async function rejectStages(stageIds: string[], actor: string): Promise<{ rejected: number }> {
  const { error } = await supabaseAdmin.from('eval_sync_stage')
    .update({ rejected: true, rejected_by: actor })
    .in('id', stageIds).is('applied_at', null);
  if (error) throw new Error(error.message);
  return { rejected: stageIds.length };
}
