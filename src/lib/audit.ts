import { supabaseAdmin } from '@/lib/supabase-admin';
import type { RoleAccess } from '@/types/db';

function actorIdOf(actor: RoleAccess): string | null {
  if ('koordinator_kk_id' in actor) return actor.koordinator_kk_id;
  if ('syaikh_id' in actor) return actor.syaikh_id;
  if ('koordinator_id' in actor) return actor.koordinator_id;
  if ('pengajar_id' in actor) return actor.pengajar_id;
  if ('musyrif_id' in actor) return actor.musyrif_id;
  if ('ketua_kelas_id' in actor) return actor.ketua_kelas_id;
  if ('peserta_id' in actor) return actor.peserta_id;
  return null;
}

export interface LogAuditOpts {
  actor: RoleAccess;
  action: string;
  targetTable: string;
  targetId: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Best-effort insert ke audit_log. Tidak throw — kalau gagal, log ke console
 * supaya tidak menjatuhkan transaksi utama. Caller pattern:
 *
 *   await mutation()
 *   void logAudit({ actor, action, targetTable, targetId, detail })
 *   return ok
 */
export async function logAudit(opts: LogAuditOpts): Promise<void> {
  const actorId = actorIdOf(opts.actor);
  if (!actorId) return;
  const { error } = await supabaseAdmin.from('audit_log').insert({
    actor_role: opts.actor.role,
    actor_id: actorId,
    action: opts.action,
    target_table: opts.targetTable,
    target_id: opts.targetId,
    detail: opts.detail ?? null,
  });
  if (error) {
    console.error('logAudit failed', { action: opts.action, error });
  }
}
