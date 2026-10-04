import 'server-only';
import { getSession } from '@/lib/session';
import { isSuperadmin } from '@/lib/admin-guard';
import { getSessionWa } from '@/lib/program-kelas';
import {
  findPengajarMaahir,
  koordinatorBolehRekapPengajar,
  type PengajarMaahirAkses,
} from '@/lib/maahir-checkin-pengajar';
import type { RoleAccess } from '@/types/db';

/**
 * Boleh membuka rekap semua pengajar Maahir? Superadmin, atau salah satu
 * akses koordinator di sesi ini ber-flag `rekap_pengajar_maahir`. Dicek
 * per-request (bukan disimpan di cookie) supaya perubahan flag berlaku tanpa
 * login ulang.
 */
export async function bolehLihatRekapPengajarMaahir(): Promise<boolean> {
  if (await isSuperadmin()) return true;
  const s = await getSession();
  const accesses: RoleAccess[] = s.accesses ?? (s.session ? [s.session] : []);
  const koorIds = accesses
    .filter((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran')
    .map((a) => (a as { koordinator_id: string }).koordinator_id)
    .filter(Boolean);
  return koordinatorBolehRekapPengajar(koorIds);
}

/** Akses pengajar Maahir untuk sesi yang sedang login (lewat nomor WA). */
export async function getPengajarMaahirSesi(): Promise<PengajarMaahirAkses | null> {
  const wa = await getSessionWa();
  return wa ? findPengajarMaahir(wa) : null;
}

/**
 * Opsi `featureLinksFor` untuk sesi ini — dua akses yang tak terbaca dari
 * role. Dipakai beranda.
 */
export async function fiturOptsMaahirPengajar(): Promise<{
  pengajarMaahir: boolean;
  rekapPengajarMaahir: boolean;
}> {
  const [p, r] = await Promise.all([getPengajarMaahirSesi(), bolehLihatRekapPengajarMaahir()]);
  return { pengajarMaahir: !!p && p.kelas.length > 0, rekapPengajarMaahir: r };
}
