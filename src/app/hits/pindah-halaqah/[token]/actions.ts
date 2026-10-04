'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOneOfRoles, getAllAccesses } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { resolveDecider } from '@/lib/hits-pindah-decider';
import { logAudit } from '@/lib/audit';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplPindahDisetujuiToRequester } from '@/lib/whatsapp';

export type DecidePindahResult = {
  ok?: boolean;
  error?: string;
  decided?: 'approved' | 'rejected';
  requesterWaUrl?: string;
};

async function loadByToken(token: string) {
  const { data } = await supabaseAdmin
    .from('hits_halaqah_pindah_request')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  return data;
}

/** Ambil gender halaqah (untuk cek hak koordinator ketua kelas). */
async function halaqahGenderOf(halaqahId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('hits_halaqah').select('gender').eq('id', halaqahId).maybeSingle();
  return (data?.gender as string | null) ?? null;
}

/** Pengajar tujuan / pemilik halaqah / koordinator KK menyetujui. */
export async function approvePindah(token: string, catatan: string): Promise<DecidePindahResult> {
  await requireOneOfRoles(['pengajar', 'koordinator_ketua_kelas']);
  const accesses = await getAllAccesses();
  const wa = await getSessionWa();

  const req = await loadByToken(token);
  if (!req) return { error: 'Pengajuan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };
  const decider = resolveDecider(req, await halaqahGenderOf(req.halaqah_id), accesses, wa);
  if (!decider) {
    return {
      error: req.request_type === 'claim_in'
        ? 'Hanya pengajar pemilik halaqah / koordinator ketua kelas yang bisa menyetujui pengambilan ini.'
        : 'Hanya pengajar tujuan yang bisa menyetujui pemindahan ini. Pastikan Anda login dengan akun yang benar.',
    };
  }

  // claim_in: halaqah pindah ke PENGAJU. transfer_out: ke pengajar tujuan (= pemutus).
  const isClaim = req.request_type === 'claim_in';
  const newPengajarId = isClaim ? req.requested_by_pengajar_id : decider.id;
  const newPengajarWa = isClaim ? req.requested_by_wa : (wa ?? req.target_wa);
  const newPengajarName = isClaim ? req.requested_by_name : decider.actor.name;
  const { error: upErr } = await supabaseAdmin
    .from('hits_halaqah')
    .update({
      pengajar_id: newPengajarId,
      pengajar_wa: newPengajarWa,
      pengajar_nama_sheet: newPengajarName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.halaqah_id);
  if (upErr) return { error: `Gagal memindahkan halaqah: ${upErr.message}` };

  await supabaseAdmin
    .from('hits_halaqah_pindah_request')
    .update({
      status: 'approved',
      decided_by_role: decider.role,
      decided_by_id: decider.id,
      decided_at: new Date().toISOString(),
      catatan: catatan || null,
    })
    .eq('id', req.id);

  await logAudit({
    actor: decider.actor,
    action: 'hits.halaqah.pindah.approve',
    targetTable: 'hits_halaqah_pindah_request',
    targetId: req.id,
    detail: { halaqah_id: req.halaqah_id, decided_by_role: decider.role, decided_by_id: decider.id },
  });

  revalidatePath('/hits/pengajar');

  // wa.me balik ke pengaju supaya cek list & tunjuk ketua.
  let requesterWaUrl: string | undefined;
  if (req.requested_by_wa) {
    let requesterGender: 'ikhwan' | 'akhwat' = 'ikhwan';
    if (req.requested_by_pengajar_id) {
      const { data: rp } = await supabaseAdmin
        .from('pengajar')
        .select('gender')
        .eq('id', req.requested_by_pengajar_id)
        .maybeSingle();
      if (rp?.gender === 'akhwat') requesterGender = 'akhwat';
    }
    const { data: hq } = await supabaseAdmin
      .from('hits_halaqah')
      .select('name')
      .eq('id', req.halaqah_id)
      .maybeSingle();
    const msg = tplPindahDisetujuiToRequester({
      requesterName: req.requested_by_name,
      requesterGender,
      targetName: decider.actor.name,
      halaqahName: hq?.name ?? 'halaqah',
      pengajarUrl: absUrl('/hits/pengajar'),
    });
    requesterWaUrl = buildWaMeUrl(req.requested_by_wa, msg);
  }

  return { ok: true, decided: 'approved', requesterWaUrl };
}

/** Pengajar tujuan menolak pengajuan. */
export async function rejectPindah(token: string, catatan: string): Promise<DecidePindahResult> {
  await requireOneOfRoles(['pengajar', 'koordinator_ketua_kelas']);
  const accesses = await getAllAccesses();
  const wa = await getSessionWa();

  const req = await loadByToken(token);
  if (!req) return { error: 'Pengajuan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };
  const decider = resolveDecider(req, await halaqahGenderOf(req.halaqah_id), accesses, wa);
  if (!decider) {
    return { error: 'Anda tidak berhak menolak pengajuan ini.' };
  }

  await supabaseAdmin
    .from('hits_halaqah_pindah_request')
    .update({
      status: 'rejected',
      decided_by_role: decider.role,
      decided_by_id: decider.id,
      decided_at: new Date().toISOString(),
      catatan: catatan || null,
    })
    .eq('id', req.id);

  await logAudit({
    actor: decider.actor,
    action: 'hits.halaqah.pindah.reject',
    targetTable: 'hits_halaqah_pindah_request',
    targetId: req.id,
    detail: { halaqah_id: req.halaqah_id, decided_by_role: decider.role, decided_by_id: decider.id },
  });

  return { ok: true, decided: 'rejected' };
}
