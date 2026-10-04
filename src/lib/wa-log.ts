import { supabaseAdmin } from '@/lib/supabase-admin';
import type { RoleAccess } from '@/types/db';

function senderIdOf(actor: RoleAccess): string | null {
  if ('koordinator_kk_id' in actor) return actor.koordinator_kk_id;
  if ('syaikh_id' in actor) return actor.syaikh_id;
  if ('koordinator_id' in actor) return actor.koordinator_id;
  if ('pengajar_id' in actor) return actor.pengajar_id;
  if ('musyrif_id' in actor) return actor.musyrif_id;
  if ('ketua_kelas_id' in actor) return actor.ketua_kelas_id;
  if ('peserta_id' in actor) return actor.peserta_id;
  return null;
}

export interface LogWaReminderOpts {
  sender: RoleAccess;
  recipientTable: string;
  recipientId: string | null;
  recipientWa: string;
  templateKind: string;
  targetTable?: string;
  targetId?: string;
}

export async function logWaReminder(opts: LogWaReminderOpts): Promise<void> {
  const senderId = senderIdOf(opts.sender);
  if (!senderId) return;
  const { error } = await supabaseAdmin.from('wa_reminder_log').insert({
    sender_role: opts.sender.role,
    sender_id: senderId,
    recipient_table: opts.recipientTable,
    recipient_id: opts.recipientId,
    recipient_wa: opts.recipientWa,
    template_kind: opts.templateKind,
    target_table: opts.targetTable ?? null,
    target_id: opts.targetId ?? null,
  });
  if (error) {
    console.error('logWaReminder failed', { template: opts.templateKind, error });
  }
}
