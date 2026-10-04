'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import { logAudit } from '@/lib/audit';

export type DecideResult = { ok?: boolean; error?: string; decided?: 'approved' | 'rejected' };

async function loadPendingByToken(token: string) {
  const { data } = await supabaseAdmin
    .from('hits_pertemuan_hapus_request')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  return data;
}

/** Koordinator KK menyetujui: skip pertemuan via hits_kaldik_pertemuan. */
export async function approveHapus(token: string, catatan: string): Promise<DecideResult> {
  const req = await loadPendingByToken(token);
  if (!req) return { error: 'Pengajuan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };

  // Tanggal pertemuan (override butuh tanggal NOT NULL).
  let tanggal: string | null = req.tanggal;
  if (!tanggal) {
    const loaded = await loadHalaqahPertemuan(req.halaqah_id);
    tanggal = loaded?.derived.find((d) => d.pertemuan_no === req.pertemuan_no && d.level === req.level)?.tanggal ?? null;
  }
  if (!tanggal) return { error: 'Tanggal pertemuan tidak diketahui, tidak bisa diproses.' };

  // Identitas koordinator KK (gender-matched) untuk atribusi override.
  const { data: koor } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('id')
    .eq('gender', req.gender)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  const koorId = koor?.id ?? '00000000-0000-0000-0000-000000000000';

  const { error: ovErr } = await supabaseAdmin
    .from('hits_kaldik_pertemuan')
    .upsert(
      {
        halaqah_id: req.halaqah_id,
        level: req.level,
        pertemuan_no: req.pertemuan_no,
        tanggal,
        is_skipped: true,
        note: `Hapus atas pengajuan ketua: ${req.requested_by_name}${req.alasan ? ` — ${req.alasan}` : ''}`,
        set_by_role: 'koordinator_ketua_kelas',
        set_by_id: koorId,
        updated_at: new Date().toISOString(),
      },
      // Unique constraint tabel: (halaqah_id, level, pertemuan_no).
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    );
  if (ovErr) return { error: `Gagal menghapus pertemuan: ${ovErr.message}` };

  await supabaseAdmin
    .from('hits_pertemuan_hapus_request')
    .update({
      status: 'approved',
      decided_by_role: 'koordinator_ketua_kelas',
      decided_by_id: koorId,
      decided_at: new Date().toISOString(),
      catatan_koordinator: catatan || null,
    })
    .eq('id', req.id);

  await logAudit({
    actor: { role: 'koordinator_ketua_kelas', koordinator_kk_id: koorId, name: 'Koordinator KK', gender: req.gender },
    action: 'hits.pertemuan.hapus.approve',
    targetTable: 'hits_pertemuan_hapus_request',
    targetId: req.id,
    detail: { halaqah_id: req.halaqah_id, level: req.level, pertemuan_no: req.pertemuan_no },
  });

  revalidatePath('/hits/ketua');
  return { ok: true, decided: 'approved' };
}

/** Koordinator KK menolak pengajuan. */
export async function rejectHapus(token: string, catatan: string): Promise<DecideResult> {
  const req = await loadPendingByToken(token);
  if (!req) return { error: 'Pengajuan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };

  const { data: koor } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('id')
    .eq('gender', req.gender)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  const koorId = koor?.id ?? '00000000-0000-0000-0000-000000000000';

  await supabaseAdmin
    .from('hits_pertemuan_hapus_request')
    .update({
      status: 'rejected',
      decided_by_role: 'koordinator_ketua_kelas',
      decided_by_id: koorId,
      decided_at: new Date().toISOString(),
      catatan_koordinator: catatan || null,
    })
    .eq('id', req.id);

  await logAudit({
    actor: { role: 'koordinator_ketua_kelas', koordinator_kk_id: koorId, name: 'Koordinator KK', gender: req.gender },
    action: 'hits.pertemuan.hapus.reject',
    targetTable: 'hits_pertemuan_hapus_request',
    targetId: req.id,
    detail: { halaqah_id: req.halaqah_id, level: req.level, pertemuan_no: req.pertemuan_no },
  });

  return { ok: true, decided: 'rejected' };
}
