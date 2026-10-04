'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildWaMeUrl } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { requireAdmin } from '@/lib/admin-guard';

const BCRYPT_COST = 12;
const PLAINTEXT_TTL_HOURS = 24;
// Password seragam untuk semua reset — pemohon wajib ganti sendiri setelah login.
const DEFAULT_RESET_PASSWORD = 'hits123';

const ROLE_TABLES = [
  'peserta',
  'musyrif',
  'koordinator',
  'syaikh',
  'pengajar',
  'ketua_kelas',
  'koordinator_ketua_kelas',
] as const;

type AcceptState = {
  error?: string;
  password?: string;
  waMeUrl?: string;
};

type DeclineState = {
  error?: string;
  ok?: boolean;
};

type ClearState = {
  error?: string;
  ok?: boolean;
};

function buildTemplate(name: string | null, newPassword: string): string {
  return [
    `Assalamu'alaikum ${name ?? ''}`.trim() + `,`,
    ``,
    `Password sementara Anda: *${newPassword}*`,
    ``,
    `Login di: ${absUrl('/')}`,
    ``,
    `Setelah berhasil masuk, mohon segera ganti password via menu Akun (foto profil → Akun → Ganti Password).`,
  ].join('\n');
}

async function applyAccept(
  id: string,
  whatsappNumber: string,
  requesterName: string | null,
  adminWa: string
): Promise<AcceptState> {
  const newPassword = DEFAULT_RESET_PASSWORD;
  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);

  await Promise.all(
    ROLE_TABLES.map((t) =>
      supabaseAdmin.from(t).update({ password_hash: hash }).eq('whatsapp_number', whatsappNumber)
    )
  );

  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + PLAINTEXT_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const { error: updErr } = await supabaseAdmin
    .from('password_reset_requests')
    .update({
      status: 'accepted',
      decided_at: nowIso,
      decided_by_wa: adminWa,
      new_password_plaintext: newPassword,
      plaintext_expires_at: expiresIso,
    })
    .eq('id', id);

  if (updErr) return { error: 'Gagal update status permintaan.' };

  const template = buildTemplate(requesterName, newPassword);
  return {
    password: newPassword,
    waMeUrl: buildWaMeUrl(whatsappNumber, template),
  };
}

export async function acceptResetRequest(
  _prev: AcceptState | undefined,
  formData: FormData
): Promise<AcceptState> {
  const { wa: adminWa } = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'ID permintaan tidak valid.' };

  const { data: req, error: fetchErr } = await supabaseAdmin
    .from('password_reset_requests')
    .select('id, whatsapp_number, requester_name, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !req) return { error: 'Permintaan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Permintaan sudah diproses.' };

  return applyAccept(id, req.whatsapp_number, req.requester_name, adminWa);
}

export async function regeneratePassword(
  _prev: AcceptState | undefined,
  formData: FormData
): Promise<AcceptState> {
  const { wa: adminWa } = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'ID permintaan tidak valid.' };

  const { data: req, error: fetchErr } = await supabaseAdmin
    .from('password_reset_requests')
    .select('id, whatsapp_number, requester_name, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !req) return { error: 'Permintaan tidak ditemukan.' };
  if (req.status !== 'accepted') {
    return { error: 'Hanya request yang sudah accepted yang bisa di-regenerate.' };
  }

  const result = await applyAccept(id, req.whatsapp_number, req.requester_name, adminWa);
  if (result.error) return result;
  revalidatePath(`/admin/reset-password/${id}`);
  return result;
}

export async function declineResetRequest(
  _prev: DeclineState | undefined,
  formData: FormData
): Promise<DeclineState> {
  const { wa: adminWa } = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'ID permintaan tidak valid.' };

  const { data: req } = await supabaseAdmin
    .from('password_reset_requests')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (!req) return { error: 'Permintaan tidak ditemukan.' };
  if (req.status !== 'pending') return { error: 'Permintaan sudah diproses.' };

  const { error: updErr } = await supabaseAdmin
    .from('password_reset_requests')
    .update({
      status: 'declined',
      decided_at: new Date().toISOString(),
      decided_by_wa: adminWa,
    })
    .eq('id', id);

  if (updErr) return { error: 'Gagal update status.' };

  revalidatePath(`/admin/reset-password/${id}`);
  return { ok: true };
}

export async function clearPlaintext(
  _prev: ClearState | undefined,
  formData: FormData
): Promise<ClearState> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'ID permintaan tidak valid.' };

  const { error } = await supabaseAdmin
    .from('password_reset_requests')
    .update({
      new_password_plaintext: null,
      plaintext_expires_at: null,
    })
    .eq('id', id);

  if (error) return { error: 'Gagal clear plaintext.' };

  revalidatePath(`/admin/reset-password/${id}`);
  return { ok: true };
}
