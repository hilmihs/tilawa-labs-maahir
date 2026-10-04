'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKetuaKelompok } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export async function decideAlasan(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requireKetuaKelompok();

  const pengajuanId = String(formData.get('pengajuan_id') ?? '');
  const decision = String(formData.get('decision') ?? '') as 'accepted' | 'rejected';

  if (!pengajuanId || !['accepted', 'rejected'].includes(decision)) {
    return { error: 'Data tidak lengkap.' };
  }

  const { data: pengajuan } = await supabaseAdmin
    .from('pengajuan_alasan')
    .select('id, pengajar_id, status')
    .eq('id', pengajuanId)
    .maybeSingle();

  if (!pengajuan || pengajuan.status !== 'pending') {
    return { error: 'Pengajuan tidak ditemukan atau sudah diproses.' };
  }

  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('kelompok_id')
    .eq('id', pengajuan.pengajar_id)
    .maybeSingle();

  if (!pengajar || pengajar.kelompok_id !== session.kelompok_id) {
    return { error: 'Pengajar bukan anggota kelompok Anda.' };
  }

  const { error: updateErr } = await supabaseAdmin
    .from('pengajuan_alasan')
    .update({
      status: decision,
      decided_by: session.pengajar_id,
      decided_by_role: 'pengajar',
      decided_at: new Date().toISOString(),
    })
    .eq('id', pengajuanId);

  if (updateErr) {
    return { error: `Gagal update: ${updateErr.message}` };
  }

  await logAudit({
    actor: session,
    action: 'alasan.decide',
    targetTable: 'pengajuan_alasan',
    targetId: pengajuanId,
    detail: { decision, pengajar_id: pengajuan.pengajar_id },
  });

  if (decision === 'accepted') {
    const checkinQuery = supabaseAdmin
      .from('checkin_pengajar')
      .select('id, is_terlambat')
      .eq('pengajar_id', pengajuan.pengajar_id)
      .eq('tanggal', (await supabaseAdmin.from('pengajuan_alasan').select('tanggal').eq('id', pengajuanId).maybeSingle()).data?.tanggal ?? '')
      .maybeSingle();

    const { data: checkin } = await checkinQuery;
    if (checkin && checkin.is_terlambat) {
      await supabaseAdmin
        .from('checkin_pengajar')
        .update({ is_terlambat: false })
        .eq('id', checkin.id);
    }
  }

  return { ok: true };
}

export async function invalidateCheckin(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requireKetuaKelompok();

  const checkinId = String(formData.get('checkin_id') ?? '');
  if (!checkinId) return { error: 'Data tidak lengkap.' };

  const { data: checkin } = await supabaseAdmin
    .from('checkin_pengajar')
    .select('id, pengajar_id')
    .eq('id', checkinId)
    .maybeSingle();

  if (!checkin) return { error: 'Check-in tidak ditemukan.' };

  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('kelompok_id')
    .eq('id', checkin.pengajar_id)
    .maybeSingle();

  if (!pengajar || pengajar.kelompok_id !== session.kelompok_id) {
    return { error: 'Pengajar bukan anggota kelompok Anda.' };
  }

  const { error: updateErr } = await supabaseAdmin
    .from('checkin_pengajar')
    .update({
      invalidated_by: session.pengajar_id,
      invalidated_at: new Date().toISOString(),
    })
    .eq('id', checkinId);

  if (updateErr) {
    return { error: `Gagal update: ${updateErr.message}` };
  }

  await logAudit({
    actor: session,
    action: 'checkin.invalidate',
    targetTable: 'checkin_pengajar',
    targetId: checkinId,
    detail: { pengajar_id: checkin.pengajar_id },
  });

  return { ok: true };
}
