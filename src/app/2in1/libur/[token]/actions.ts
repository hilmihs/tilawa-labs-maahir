'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOneOfRoles } from '@/lib/session';

export type DecideResult = { ok?: boolean; error?: string; decided?: 'approved' | 'rejected' };

async function loadByToken(token: string) {
  const { data } = await supabaseAdmin
    .from('program_kelas_libur_request')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  return data;
}

function deciderId(access: { role: string; koordinator_id?: string; syaikh_id?: string }): string | null {
  return access.role === 'koordinator'
    ? access.koordinator_id ?? null
    : access.role === 'syaikh'
    ? access.syaikh_id ?? null
    : null;
}

/** Koordinator menyetujui: tulis program_kelas_libur untuk (kelas, tanggal). */
export async function approveLibur(token: string, catatan: string): Promise<DecideResult> {
  const access = await requireOneOfRoles(['koordinator', 'syaikh']);
  const req = await loadByToken(token);
  if (!req) return { error: 'Pengajuan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };
  // Guard gender: koordinator hanya memutuskan kelas segender.
  if (access.role === 'koordinator' && access.gender !== req.gender) {
    return { error: 'Pengajuan ini bukan untuk gender koordinator Anda.' };
  }

  const decId = deciderId(access);

  // Tulis libur untuk tanggal itu (idempoten: skip bila sudah ada rentang persis).
  const { data: existing } = await supabaseAdmin
    .from('program_kelas_libur')
    .select('id')
    .eq('program_kelas_id', req.program_kelas_id)
    .eq('tanggal_mulai', req.tanggal)
    .eq('tanggal_selesai', req.tanggal)
    .limit(1)
    .maybeSingle();
  if (!existing) {
    const { error: libErr } = await supabaseAdmin.from('program_kelas_libur').insert({
      program_kelas_id: req.program_kelas_id,
      tanggal_mulai: req.tanggal,
      tanggal_selesai: req.tanggal,
      keterangan: `Libur atas pengajuan: ${req.requester_name}${req.alasan ? ` — ${req.alasan}` : ''}`,
      created_by_id: decId,
    });
    if (libErr) return { error: `Gagal menyimpan libur: ${libErr.message}` };
  }

  await supabaseAdmin
    .from('program_kelas_libur_request')
    .update({
      status: 'approved',
      decided_by_role: access.role,
      decided_by_id: decId,
      decided_at: new Date().toISOString(),
      catatan_koordinator: catatan || null,
    })
    .eq('id', req.id);

  revalidatePath('/2in1/koordinator/kehadiran');
  revalidatePath('/2in1/laporan/maahir');
  return { ok: true, decided: 'approved' };
}

/** Koordinator menolak pengajuan libur. */
export async function rejectLibur(token: string, catatan: string): Promise<DecideResult> {
  const access = await requireOneOfRoles(['koordinator', 'syaikh']);
  const req = await loadByToken(token);
  if (!req) return { error: 'Pengajuan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };
  if (access.role === 'koordinator' && access.gender !== req.gender) {
    return { error: 'Pengajuan ini bukan untuk gender koordinator Anda.' };
  }

  await supabaseAdmin
    .from('program_kelas_libur_request')
    .update({
      status: 'rejected',
      decided_by_role: access.role,
      decided_by_id: deciderId(access),
      decided_at: new Date().toISOString(),
      catatan_koordinator: catatan || null,
    })
    .eq('id', req.id);

  return { ok: true, decided: 'rejected' };
}
