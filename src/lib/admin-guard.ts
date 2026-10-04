import 'server-only';
import { redirect } from 'next/navigation';
import { getSession } from './session';
import { supabaseAdmin } from './supabase-admin';
import { ADMIN_WA, SUPERADMIN_WAS } from './constants';
import { loadAccessesForWa } from './access';
import type { RoleAccess } from '@/types/db';

const ROLE_TABLE_MAP: Record<RoleAccess['role'], { table: string; idField: keyof RoleAccess | string }> = {
  peserta: { table: 'peserta', idField: 'peserta_id' },
  musyrif: { table: 'musyrif', idField: 'musyrif_id' },
  koordinator: { table: 'koordinator', idField: 'koordinator_id' },
  koordinator_kehadiran: { table: 'koordinator', idField: 'koordinator_id' },
  syaikh: { table: 'syaikh', idField: 'syaikh_id' },
  pengajar: { table: 'pengajar', idField: 'pengajar_id' },
  ketua_kelas: { table: 'ketua_kelas', idField: 'ketua_kelas_id' },
  koordinator_ketua_kelas: { table: 'koordinator_ketua_kelas', idField: 'koordinator_kk_id' },
};

async function getSessionWaNumber(session: RoleAccess): Promise<string | null> {
  const entry = ROLE_TABLE_MAP[session.role];
  if (!entry) return null;
  const id = (session as unknown as Record<string, unknown>)[entry.idField as string] as string | undefined;
  if (!id) return null;
  const { data } = await supabaseAdmin
    .from(entry.table)
    .select('whatsapp_number')
    .eq('id', id)
    .maybeSingle();
  return data?.whatsapp_number ?? null;
}

// Pastikan user yang sedang login adalah admin (WA = ADMIN_WA).
// Cek lewat accesses dulu (kalau ada role yang WA-nya ADMIN_WA), fallback ke active session.
export async function requireAdmin(): Promise<{ wa: string }> {
  const s = await getSession();
  if (!s.session) redirect('/');

  // Cek semua role yang dimiliki — kalau salah satu WA-nya termasuk superadmin, allow.
  const candidates: RoleAccess[] = s.accesses && s.accesses.length > 0 ? s.accesses : [s.session];
  for (const acc of candidates) {
    const wa = await getSessionWaNumber(acc);
    if (wa && SUPERADMIN_WAS.includes(wa)) return { wa };
  }

  redirect('/');
}

/** Boolean non-redirect: apakah user yang login superadmin (WA ∈ SUPERADMIN_WAS). */
export async function isSuperadmin(): Promise<boolean> {
  const s = await getSession();
  const candidates: RoleAccess[] = s.accesses && s.accesses.length > 0 ? s.accesses : s.session ? [s.session] : [];
  for (const acc of candidates) {
    const wa = await getSessionWaNumber(acc);
    if (wa && SUPERADMIN_WAS.includes(wa)) return true;
  }
  return false;
}

/**
 * Superadmin, ATAU sesi yang sedang di-impersonate OLEH superadmin.
 *
 * HANYA untuk menyembunyikan/menampilkan menu dan halaman — jangan dipakai
 * menjaga mutasi. `isSuperadmin()` sengaja tidak dilonggarkan: ia menjaga
 * wewenang nyata (mis. terapkan sync hilmihs), dan sesi impersonate tidak boleh
 * mewarisi wewenang itu.
 *
 * Bedanya di sini: saat superadmin memakai "login sebagai" untuk menguji halaman
 * pengajar, sesi aktifnya adalah milik target sehingga `isSuperadmin()` bernilai
 * false. Padahal yang mengemudikan tetap superadmin — snapshot-nya tersimpan di
 * `impersonator.adminWa`. Tanpa pemeriksaan ini, fitur yang disembunyikan tidak
 * akan pernah bisa diuji lewat jalur yang memang disediakan untuk itu.
 */
export async function bolehLihatFiturTersembunyi(): Promise<boolean> {
  if (await isSuperadmin()) return true;
  const s = await getSession();
  const wa = s.impersonator?.adminWa;
  return Boolean(wa && SUPERADMIN_WAS.includes(wa));
}

/**
 * RoleAccess milik admin (dari ADMIN_WA) untuk atribusi audit yang benar —
 * dipakai saat mutasi admin / impersonate agar audit teratribusi ke admin asli,
 * bukan ke target yang sedang di-impersonate. Tidak melakukan guard sendiri;
 * panggil requireAdmin() lebih dulu di action.
 */
export async function getAdminActor(): Promise<RoleAccess | null> {
  // Atribusikan ke superadmin yang sedang login (bukan selalu ADMIN_WA) agar
  // audit benar saat ada >1 superadmin.
  const s = await getSession();
  const candidates: RoleAccess[] = s.accesses && s.accesses.length > 0 ? s.accesses : s.session ? [s.session] : [];
  for (const acc of candidates) {
    const wa = await getSessionWaNumber(acc);
    if (wa && SUPERADMIN_WAS.includes(wa)) {
      const accesses = await loadAccessesForWa(wa);
      if (accesses[0]) return accesses[0];
    }
  }
  const fallback = await loadAccessesForWa(ADMIN_WA);
  return fallback[0] ?? null;
}
