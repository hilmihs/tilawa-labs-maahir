'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getActiveSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

function actorIdOf(a: { role: string } & Record<string, unknown>): string | null {
  for (const k of [
    'koordinator_kk_id',
    'syaikh_id',
    'koordinator_id',
    'pengajar_id',
    'musyrif_id',
    'ketua_kelas_id',
    'peserta_id',
  ]) {
    if (k in a && typeof a[k] === 'string') return a[k] as string;
  }
  return null;
}

const ALLOWED_AUTHOR_ROLES = new Set([
  'koordinator',
  'koordinator_ketua_kelas',
  'syaikh',
]);

export async function addNote(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await getActiveSession();
  if (!session || !ALLOWED_AUTHOR_ROLES.has(session.role)) {
    return { error: 'Hanya koordinator/syaikh yang bisa menambah catatan.' };
  }
  const authorId = actorIdOf(session as unknown as Record<string, unknown> & { role: string });
  if (!authorId) return { error: 'Sesi tidak valid.' };

  const targetType = String(formData.get('target_type') ?? '');
  const targetId = String(formData.get('target_id') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  const visibility = String(formData.get('visibility') ?? 'peer');

  if (!targetType || !targetId || !body) return { error: 'Data tidak lengkap.' };
  if (!['pengajar', 'peserta'].includes(targetType)) return { error: 'Target tidak valid.' };
  if (!['peer', 'private'].includes(visibility)) return { error: 'Visibility tidak valid.' };
  if (body.length > 1000) return { error: 'Catatan maksimal 1000 karakter.' };

  const { data: inserted, error } = await supabaseAdmin
    .from('koordinator_notes')
    .insert({
      target_type: targetType,
      target_id: targetId,
      author_role: session.role,
      author_id: authorId,
      body,
      visibility,
    })
    .select('id')
    .single();

  if (error) return { error: `Gagal simpan: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'note.add',
    targetTable: 'koordinator_notes',
    targetId: inserted?.id ?? null,
    detail: { target_type: targetType, target_id: targetId, visibility },
  });

  if (targetType === 'pengajar') {
    revalidatePath(`/matrix/koordinator/pengajar/${targetId}`);
    revalidatePath('/hits/koordinator');
  } else revalidatePath(`/peserta/${targetId}`);
  return { ok: true };
}

export async function deleteNote(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await getActiveSession();
  if (!session || !ALLOWED_AUTHOR_ROLES.has(session.role)) {
    return { error: 'Akses ditolak.' };
  }
  const authorId = actorIdOf(session as unknown as Record<string, unknown> & { role: string });
  if (!authorId) return { error: 'Sesi tidak valid.' };

  const noteId = String(formData.get('note_id') ?? '');
  if (!noteId) return { error: 'ID catatan tidak ditemukan.' };

  // Only author can delete.
  const { data: note } = await supabaseAdmin
    .from('koordinator_notes')
    .select('id, target_type, target_id, author_id')
    .eq('id', noteId)
    .maybeSingle();

  if (!note) return { error: 'Catatan tidak ditemukan.' };
  if (note.author_id !== authorId) return { error: 'Hanya penulis yang bisa menghapus catatan.' };

  const { error } = await supabaseAdmin.from('koordinator_notes').delete().eq('id', noteId);
  if (error) return { error: `Gagal hapus: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'note.delete',
    targetTable: 'koordinator_notes',
    targetId: noteId,
    detail: { target_type: note.target_type, target_id: note.target_id },
  });

  if (note.target_type === 'pengajar') revalidatePath(`/matrix/koordinator/pengajar/${note.target_id}`);
  else revalidatePath(`/peserta/${note.target_id}`);
  return { ok: true };
}
