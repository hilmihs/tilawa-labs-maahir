'use server';

import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { logAudit } from '@/lib/audit';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplKetuaKelasTerpilih, tplKetuaDualRoleInfo, tplKetuaDualRoleDisetujui } from '@/lib/whatsapp';
import type { RoleAccess } from '@/types/db';

const BCRYPT_COST = 12;

export type DecideDualRoleResult = {
  ok?: boolean;
  error?: string;
  decided?: 'approved' | 'rejected';
  ketuaWaUrl?: string;
  pengajarWaUrl?: string;
};

type DualReq = {
  id: string;
  ketua_wa: string;
  ketua_name: string;
  gender: 'ikhwan' | 'akhwat';
  new_halaqah_id: string;
  new_peserta_id: string | null;
  approver_kind: 'pengajar' | 'koordinator_kk';
  target_pengajar_id: string | null;
  target_wa: string | null;
  requested_by_wa: string | null;
  requested_by_name: string | null;
  status: string;
};

async function loadByToken(token: string): Promise<DualReq | null> {
  const { data } = await supabaseAdmin
    .from('ketua_dualrole_request')
    .select('id, ketua_wa, ketua_name, gender, new_halaqah_id, new_peserta_id, approver_kind, target_pengajar_id, target_wa, requested_by_wa, requested_by_name, status')
    .eq('token', token)
    .maybeSingle();
  return (data as DualReq | null) ?? null;
}

/** Apakah sesi yang login berhak menyetujui pengajuan ini. */
function authorizedApprover(req: DualReq, accesses: RoleAccess[], wa: string | null): { ok: boolean; actor: RoleAccess | null } {
  if (req.approver_kind === 'pengajar') {
    const p = accesses.find(
      (a) => a.role === 'pengajar' && req.target_pengajar_id && a.pengajar_id === req.target_pengajar_id
    );
    if (p) return { ok: true, actor: p };
    if (req.target_wa && wa && wa === req.target_wa) {
      return { ok: true, actor: accesses.find((a) => a.role === 'pengajar') ?? accesses[0] ?? null };
    }
    return { ok: false, actor: null };
  }
  // koordinator_kk
  const k = accesses.find((a) => a.role === 'koordinator_ketua_kelas');
  if (k) return { ok: true, actor: k };
  if (req.target_wa && wa && wa === req.target_wa) {
    return { ok: true, actor: accesses[0] ?? null };
  }
  return { ok: false, actor: null };
}

export async function approveDualRole(token: string, catatan: string): Promise<DecideDualRoleResult> {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  if (accesses.length === 0) return { error: 'Anda belum login.' };
  const wa = await getSessionWa();

  const req = await loadByToken(token);
  if (!req) return { error: 'Pengajuan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };

  const auth = authorizedApprover(req, accesses, wa);
  if (!auth.ok) {
    return { error: 'Anda tidak berhak menyetujui pengajuan ini. Pastikan login dengan akun yang benar.' };
  }

  // Akun ketua existing (baris aktif mana pun untuk WA ini) → sumber password & status onboarding.
  const { data: existing } = await supabaseAdmin
    .from('ketua_kelas')
    .select('password_hash, last_login_at')
    .eq('whatsapp_number', req.ketua_wa)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  // Tandai ketua di halaqah baru (reset ketua lama halaqah tsb dulu).
  if (req.new_peserta_id) {
    await supabaseAdmin
      .from('hits_halaqah_peserta')
      .update({ is_ketua: false, ketua_wa: null })
      .eq('halaqah_id', req.new_halaqah_id)
      .eq('is_ketua', true);
    await supabaseAdmin
      .from('hits_halaqah_peserta')
      .update({ is_ketua: true, ketua_wa: req.ketua_wa })
      .eq('id', req.new_peserta_id);
  }

  // Nonaktifkan ketua_kelas lama halaqah ini, buat baris aktif baru.
  await supabaseAdmin
    .from('ketua_kelas')
    .update({ active: false })
    .eq('hits_halaqah_id', req.new_halaqah_id)
    .eq('active', true);

  const magicToken = crypto.randomUUID();
  const initialPassword = req.ketua_wa.slice(-6);
  const passwordHash = existing?.password_hash ?? (await bcrypt.hash(initialPassword, BCRYPT_COST));
  const { error: insErr } = await supabaseAdmin.from('ketua_kelas').insert({
    name: req.ketua_name,
    gender: req.gender,
    whatsapp_number: req.ketua_wa,
    hits_halaqah_id: req.new_halaqah_id,
    hits_halaqah_peserta_id: req.new_peserta_id ?? null,
    magic_token: magicToken,
    password_hash: passwordHash,
    active: true,
  });
  if (insErr) return { error: `Gagal mengaktifkan ketua: ${insErr.message}` };

  await supabaseAdmin
    .from('ketua_dualrole_request')
    .update({
      status: 'approved',
      decided_by_role: auth.actor?.role ?? null,
      decided_at: new Date().toISOString(),
      catatan: catatan || null,
    })
    .eq('id', req.id);

  if (auth.actor) {
    await logAudit({
      actor: auth.actor,
      action: 'hits.ketua.dualrole.approve',
      targetTable: 'ketua_dualrole_request',
      targetId: req.id,
      detail: { new_halaqah_id: req.new_halaqah_id, ketua_wa: req.ketua_wa },
    });
  }

  // wa.me ke ketua: sudah pernah login → info saja; belum → info login + password awal.
  const { data: hq } = await supabaseAdmin
    .from('hits_halaqah')
    .select('name')
    .eq('id', req.new_halaqah_id)
    .maybeSingle();
  const halaqahName = hq?.name ?? 'halaqah';
  const alreadyOnboarded = !!existing?.last_login_at;
  const ketuaMsg = alreadyOnboarded
    ? tplKetuaDualRoleInfo({ ketuaName: req.ketua_name, newHalaqahName: halaqahName, loginUrl: absUrl('/') })
    : tplKetuaKelasTerpilih({
        ketuaKelasName: req.ketua_name,
        ketuaKelasGender: req.gender,
        kelasName: halaqahName,
        magicUrl: absUrl(`/api/auth/magic-link?token=${magicToken}`),
        linkGrupWa: null,
        loginUrl: absUrl('/'),
        loginWa: req.ketua_wa,
        initialPassword,
      });

  const pengajarWaUrl = req.requested_by_wa
    ? buildWaMeUrl(
        req.requested_by_wa,
        tplKetuaDualRoleDisetujui({
          pengajarName: req.requested_by_name ?? 'Pengajar',
          ketuaName: req.ketua_name,
          newHalaqahName: halaqahName,
        })
      )
    : undefined;

  return { ok: true, decided: 'approved', ketuaWaUrl: buildWaMeUrl(req.ketua_wa, ketuaMsg), pengajarWaUrl };
}

export async function rejectDualRole(token: string, catatan: string): Promise<DecideDualRoleResult> {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  if (accesses.length === 0) return { error: 'Anda belum login.' };
  const wa = await getSessionWa();

  const req = await loadByToken(token);
  if (!req) return { error: 'Pengajuan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };

  const auth = authorizedApprover(req, accesses, wa);
  if (!auth.ok) return { error: 'Anda tidak berhak menolak pengajuan ini.' };

  await supabaseAdmin
    .from('ketua_dualrole_request')
    .update({
      status: 'rejected',
      decided_by_role: auth.actor?.role ?? null,
      decided_at: new Date().toISOString(),
      catatan: catatan || null,
    })
    .eq('id', req.id);

  if (auth.actor) {
    await logAudit({
      actor: auth.actor,
      action: 'hits.ketua.dualrole.reject',
      targetTable: 'ketua_dualrole_request',
      targetId: req.id,
      detail: { new_halaqah_id: req.new_halaqah_id, ketua_wa: req.ketua_wa },
    });
  }

  return { ok: true, decided: 'rejected' };
}
