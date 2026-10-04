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

export interface LogLoginOpts {
  accesses: RoleAccess[];
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Insert satu row session_log per role yang ter-unlock saat login.
 */
export async function logLogins(opts: LogLoginOpts): Promise<void> {
  const rows = opts.accesses
    .map((a) => {
      const id = actorIdOf(a);
      if (!id) return null;
      return {
        actor_role: a.role,
        actor_id: id,
        ip_address: opts.ip ?? null,
        user_agent: opts.userAgent ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (!rows.length) return;
  const { error } = await supabaseAdmin.from('session_log').insert(rows);
  if (error) console.error('logLogins failed', error);
}

/**
 * Saat logout: tutup semua session_log yang masih open (logout_at IS NULL)
 * untuk role-role yang sedang aktif.
 */
export async function logLogout(accesses: RoleAccess[]): Promise<void> {
  const nowIso = new Date().toISOString();
  for (const a of accesses) {
    const id = actorIdOf(a);
    if (!id) continue;
    const { error } = await supabaseAdmin
      .from('session_log')
      .update({ logout_at: nowIso })
      .eq('actor_role', a.role)
      .eq('actor_id', id)
      .is('logout_at', null);
    if (error) console.error('logLogout failed', { role: a.role, error });
  }
}
