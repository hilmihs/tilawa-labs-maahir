'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, getAdminActor } from '@/lib/admin-guard';
import { logAudit } from '@/lib/audit';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, normalizeWhatsApp, tplKetuaKelasTerpilih } from '@/lib/whatsapp';
import { USER_ROLE_TABLES, isUserRole, type UserRole } from '@/lib/admin-users';

const BCRYPT_COST = 12;
const DEFAULT_RESET_PASSWORD = 'hits123';
const ALL_TABLES = Object.values(USER_ROLE_TABLES).map((t) => t.table);

export type AdminActionResult = { ok?: boolean; error?: string; waUrl?: string; password?: string; info?: string };

function tplResetPassword(name: string | null): string {
  return [
    `Assalamu'alaikum ${name ?? ''}`.trim() + `,`,
    ``,
    `Password sementara Anda: *${DEFAULT_RESET_PASSWORD}*`,
    ``,
    `Login di: ${absUrl('/')}`,
    ``,
    `Setelah masuk, mohon segera ganti password via menu Akun.`,
  ].join('\n');
}

/** Aktif/nonaktifkan satu row user. */
export async function toggleUserActive(_prev: AdminActionResult | undefined, fd: FormData): Promise<AdminActionResult> {
  await requireAdmin();
  const role = String(fd.get('role') ?? '');
  const id = String(fd.get('id') ?? '');
  const next = String(fd.get('next') ?? '') === 'true';
  if (!isUserRole(role) || !id) return { error: 'Parameter tidak valid.' };

  const { error } = await supabaseAdmin.from(USER_ROLE_TABLES[role].table).update({ active: next }).eq('id', id);
  if (error) return { error: `Gagal: ${error.message}` };

  const actor = await getAdminActor();
  if (actor) await logAudit({ actor, action: 'admin.user.toggle_active', targetTable: USER_ROLE_TABLES[role].table, targetId: id, detail: { role, to: next } });
  revalidatePath('/admin/users');
  return { ok: true, info: next ? 'Diaktifkan.' : 'Dinonaktifkan.' };
}

/** Edit nama / nomor WA satu row, dengan guard tabrakan WA. */
export async function editUserIdentity(_prev: AdminActionResult | undefined, fd: FormData): Promise<AdminActionResult> {
  await requireAdmin();
  const role = String(fd.get('role') ?? '');
  const id = String(fd.get('id') ?? '');
  const nameRaw = String(fd.get('name') ?? '').trim();
  const waRaw = String(fd.get('whatsapp_number') ?? '').trim();
  if (!isUserRole(role) || !id) return { error: 'Parameter tidak valid.' };
  if (!nameRaw && !waRaw) return { error: 'Tidak ada perubahan.' };

  const table = USER_ROLE_TABLES[role].table;
  const { data: current } = await supabaseAdmin.from(table).select('name, whatsapp_number').eq('id', id).maybeSingle();
  if (!current) return { error: 'User tidak ditemukan.' };

  const update: Record<string, string> = {};
  if (nameRaw && nameRaw !== current.name) update.name = nameRaw;

  let newWa: string | null = null;
  if (waRaw) {
    newWa = normalizeWhatsApp(waRaw);
    if (newWa !== current.whatsapp_number) {
      // Guard tabrakan: WA baru sudah dipakai row lain dgn NAMA berbeda?
      const targetName = (nameRaw || current.name).trim().toLowerCase();
      const found = await Promise.all(
        ALL_TABLES.map((t) => supabaseAdmin.from(t).select('id, name').eq('whatsapp_number', newWa))
      );
      for (const res of found) {
        for (const row of res.data ?? []) {
          if (row.id === id) continue;
          if ((row.name as string).trim().toLowerCase() !== targetName) {
            return { error: `WA ${newWa} sudah dipakai orang lain: ${row.name}. Batalkan untuk hindari tabrakan akun.` };
          }
        }
      }
      update.whatsapp_number = newWa;
    }
  }

  if (Object.keys(update).length === 0) return { error: 'Tidak ada perubahan.' };
  const { error } = await supabaseAdmin.from(table).update(update).eq('id', id);
  if (error) return { error: `Gagal: ${error.message}` };

  const actor = await getAdminActor();
  if (actor) await logAudit({ actor, action: update.whatsapp_number ? 'admin.user.edit_wa' : 'admin.user.edit_name', targetTable: table, targetId: id, detail: { role, old: { name: current.name, wa: current.whatsapp_number }, new: update } });
  revalidatePath('/admin/users');
  return { ok: true, info: 'Tersimpan.' + (update.whatsapp_number ? ' (WA login row ini berubah)' : '') };
}

/** Reset password ke default, sinkron ke semua row dgn WA yang sama. */
export async function adminResetPassword(_prev: AdminActionResult | undefined, fd: FormData): Promise<AdminActionResult> {
  await requireAdmin();
  let wa = String(fd.get('whatsapp_number') ?? '').trim();
  const role = String(fd.get('role') ?? '');
  const id = String(fd.get('id') ?? '');
  let name: string | null = null;
  if (!wa && isUserRole(role) && id) {
    const { data } = await supabaseAdmin.from(USER_ROLE_TABLES[role].table).select('whatsapp_number, name').eq('id', id).maybeSingle();
    wa = data?.whatsapp_number ?? '';
    name = data?.name ?? null;
  }
  if (!wa) return { error: 'Nomor WA tidak ditemukan.' };
  wa = normalizeWhatsApp(wa);

  const hash = await bcrypt.hash(DEFAULT_RESET_PASSWORD, BCRYPT_COST);
  await Promise.all(ALL_TABLES.map((t) => supabaseAdmin.from(t).update({ password_hash: hash }).eq('whatsapp_number', wa)));

  const actor = await getAdminActor();
  if (actor) await logAudit({ actor, action: 'admin.user.reset_password', targetTable: 'whatsapp', targetId: wa, detail: { scope: 'all_roles' } });
  revalidatePath('/admin/users');
  return { ok: true, password: DEFAULT_RESET_PASSWORD, waUrl: buildWaMeUrl(wa, tplResetPassword(name)) };
}

/** Kirim-ulang info login. Ketua: magic-link. Role lain: hanya bila belum pernah login. */
export async function adminResendLogin(_prev: AdminActionResult | undefined, fd: FormData): Promise<AdminActionResult> {
  await requireAdmin();
  const role = String(fd.get('role') ?? '');
  const id = String(fd.get('id') ?? '');
  if (!isUserRole(role) || !id) return { error: 'Parameter tidak valid.' };

  if (role === 'ketua_kelas') {
    const { data: kk } = await supabaseAdmin
      .from('ketua_kelas')
      .select('id, name, gender, whatsapp_number, magic_token, hits_halaqah_id, active')
      .eq('id', id)
      .maybeSingle();
    if (!kk || !kk.active) return { error: 'Ketua kelas tidak aktif.' };
    if (!kk.whatsapp_number) return { error: 'Nomor WA kosong.' };
    let token = kk.magic_token;
    if (!token) {
      token = crypto.randomUUID();
      await supabaseAdmin.from('ketua_kelas').update({ magic_token: token }).eq('id', id);
    }
    const { data: hq } = kk.hits_halaqah_id
      ? await supabaseAdmin.from('hits_halaqah').select('name').eq('id', kk.hits_halaqah_id).maybeSingle()
      : { data: null };
    const initialPassword = kk.whatsapp_number.slice(-6);
    const msg = tplKetuaKelasTerpilih({
      ketuaKelasName: kk.name,
      ketuaKelasGender: kk.gender,
      kelasName: hq?.name ?? 'halaqah Anda',
      magicUrl: absUrl(`/api/auth/magic-link?token=${token}`),
      linkGrupWa: null,
      loginUrl: absUrl('/'),
      loginWa: kk.whatsapp_number,
      initialPassword,
    });
    const actor = await getAdminActor();
    if (actor) await logAudit({ actor, action: 'admin.user.resend_login', targetTable: 'ketua_kelas', targetId: id, detail: { role } });
    return { ok: true, waUrl: buildWaMeUrl(kk.whatsapp_number, msg) };
  }

  // Role lain: pakai reset password (kirim password sementara). Setara "resend login".
  return adminResetPassword(undefined, fd);
}
