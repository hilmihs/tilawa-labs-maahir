import { getIronSession, SessionOptions } from 'iron-session';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ROLE_LANDING } from '@/lib/roles';
import type {
  RoleAccess,
  PesertaSession,
  MusyrifSession,
  KoordinatorSession,
  SyaikhSession,
  PengajarSession,
  KetuaKelasSession,
  KoordinatorKetuaKelasSession,
} from '@/types/db';

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set and at least 32 characters');
}

export const sessionOptions: SessionOptions = {
  password: sessionSecret,
  cookieName: 'maahir-hits-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365 * 10,
  },
};

export interface ImpersonationState {
  adminWa: string;
  adminAccesses: RoleAccess[];
  targetWa: string;
  targetName: string;
  startedAt: string;
}

interface IronSessionData {
  session?: RoleAccess;
  accesses?: RoleAccess[];
  // Diisi saat admin "login sebagai" user lain; simpan snapshot akses admin
  // agar bisa kembali tanpa login ulang.
  impersonator?: ImpersonationState;
}

export async function getSession() {
  return getIronSession<IronSessionData>(cookies(), sessionOptions);
}

export async function getImpersonation(): Promise<ImpersonationState | null> {
  const s = await getSession();
  return s.impersonator ?? null;
}

/**
 * Akses ditolak (bukan 500):
 * - Sudah login tapi role salah → ke landing role sendiri (HINDARI loop dgn
 *   home yang redirect balik ke ?next).
 * - Belum login → ke /?next=<path> (login + redirect-after-login).
 */
function unauthorized(s: IronSessionData): never {
  const current = s.session ?? s.accesses?.[0];
  if (current) redirect(ROLE_LANDING[current.role] ?? '/');
  let next = '/';
  try { next = headers().get('x-pathname') || '/'; } catch { /* di luar request scope */ }
  const q = next.startsWith('/') && !next.startsWith('//') ? `?next=${encodeURIComponent(next)}` : '';
  redirect(`/${q}`);
}

function requireRole<T extends RoleAccess>(role: T['role']) {
  return async (): Promise<T> => {
    const s = await getSession();
    if (s.accesses && s.accesses.length > 0) {
      const match = s.accesses.find((a) => a.role === role);
      if (match) return match as T;
    }
    if (s.session?.role === role) return s.session as T;
    return unauthorized(s);
  };
}

export const requirePeserta = requireRole<PesertaSession>('peserta');
export const requireMusyrif = requireRole<MusyrifSession>('musyrif');
export const requireKoordinator = requireRole<KoordinatorSession>('koordinator');
export const requireSyaikh = requireRole<SyaikhSession>('syaikh');
export const requirePengajar = requireRole<PengajarSession>('pengajar');
export const requireKetuaKelas = requireRole<KetuaKelasSession>('ketua_kelas');
export const requireKoordinatorKetuaKelas = requireRole<KoordinatorKetuaKelasSession>('koordinator_ketua_kelas');

export async function requireKetuaKelompok(): Promise<PengajarSession> {
  const s = await getSession();
  if (s.accesses) {
    const match = s.accesses.find(
      (a) => a.role === 'pengajar' && a.is_ketua
    ) as PengajarSession | undefined;
    if (match) return match;
  }
  if (s.session?.role === 'pengajar' && s.session.is_ketua) {
    return s.session;
  }
  return unauthorized(s);
}

export async function requireOneOfRoles<R extends RoleAccess['role']>(
  roles: R[]
): Promise<Extract<RoleAccess, { role: R }>> {
  const s = await getSession();
  if (s.accesses) {
    const match = s.accesses.find((a) => roles.includes(a.role as R));
    if (match) return match as Extract<RoleAccess, { role: R }>;
  }
  if (s.session && roles.includes(s.session.role as R)) {
    return s.session as Extract<RoleAccess, { role: R }>;
  }
  return unauthorized(s);
}

export async function getActiveSession(): Promise<RoleAccess | null> {
  const s = await getSession();
  return s.session ?? null;
}

export async function getAllAccesses(): Promise<RoleAccess[]> {
  const s = await getSession();
  return s.accesses ?? (s.session ? [s.session] : []);
}
