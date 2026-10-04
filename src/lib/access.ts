import 'server-only';
import { supabaseAdmin } from './supabase-admin';
import { findRoleRowByWa } from './role-lookup';
import type { Gender, RoleAccess } from '@/types/db';

/**
 * Muat semua akses role (aktif) untuk satu nomor WA. Sumber kebenaran sama
 * dengan login(): 1 WA membuka semua role-nya. PURE READ — tidak sync hash,
 * tidak stamp last_login. Dipakai impersonation & tampilan "per orang".
 *
 * Bukan di auth.ts ('use server') agar tidak terekspos sebagai server action.
 */
export async function loadAccessesForWa(wa: string): Promise<RoleAccess[]> {
  if (!wa) return [];
  // findRoleRowByWa (bukan .maybeSingle()) supaya baris kembar tak membuat
  // perannya lenyap diam-diam — lihat src/lib/role-lookup.ts.
  const [peserta, musyrif, koor, syaikh, pengajar, { data: ketuaKelas }, koorKK] = await Promise.all([
    findRoleRowByWa<{ id: string; name: string; gender: Gender; kelas_id: string; active: boolean }>('peserta', 'id, name, gender, kelas_id, active', wa),
    findRoleRowByWa<{ id: string; name: string; gender: Gender; active: boolean }>('musyrif', 'id, name, gender, active', wa),
    findRoleRowByWa<{ id: string; name: string; gender: Gender; active: boolean; kehadiran_only: boolean }>('koordinator', 'id, name, gender, active, kehadiran_only', wa),
    findRoleRowByWa<{ id: string; name: string; gender: Gender; active: boolean }>('syaikh', 'id, name, gender, active', wa),
    findRoleRowByWa<{ id: string; name: string; gender: Gender; kelompok_id: string; is_ketua: boolean; active: boolean }>('pengajar', 'id, name, gender, kelompok_id, is_ketua, active', wa),
    // ketua_kelas: WA tak unik (peran ganda) → ambil 1 baris aktif untuk identitas sesi.
    supabaseAdmin.from('ketua_kelas').select('id, name, gender, kelas_hits_id, hits_halaqah_id, active').eq('whatsapp_number', wa).eq('active', true).order('created_at', { ascending: true }).limit(1).maybeSingle(),
    findRoleRowByWa<{ id: string; name: string; gender: Gender; active: boolean }>('koordinator_ketua_kelas', 'id, name, gender, active', wa),
  ]);

  const out: RoleAccess[] = [];
  if (peserta?.active) out.push({ role: 'peserta', peserta_id: peserta.id, name: peserta.name, gender: peserta.gender, kelas_id: peserta.kelas_id });
  if (musyrif?.active) out.push({ role: 'musyrif', musyrif_id: musyrif.id, name: musyrif.name, gender: musyrif.gender });
  if (koor?.active) {
    // kehadiran_only → role TERBATAS (hanya rekap Kehadiran Maahir), bukan
    // koordinator penuh. Deny-by-default: halaman koordinator lain tetap tertutup.
    out.push(
      koor.kehadiran_only
        ? { role: 'koordinator_kehadiran', koordinator_id: koor.id, name: koor.name, gender: koor.gender }
        : { role: 'koordinator', koordinator_id: koor.id, name: koor.name, gender: koor.gender }
    );
  }
  if (syaikh?.active) out.push({ role: 'syaikh', syaikh_id: syaikh.id, name: syaikh.name, gender: syaikh.gender });
  if (pengajar?.active) out.push({ role: 'pengajar', pengajar_id: pengajar.id, name: pengajar.name, gender: pengajar.gender, kelompok_id: pengajar.kelompok_id, is_ketua: pengajar.is_ketua });
  if (ketuaKelas?.active) out.push({ role: 'ketua_kelas', ketua_kelas_id: ketuaKelas.id, name: ketuaKelas.name, gender: ketuaKelas.gender, kelas_hits_id: ketuaKelas.kelas_hits_id, hits_halaqah_id: ketuaKelas.hits_halaqah_id ?? null });
  if (koorKK?.active) out.push({ role: 'koordinator_ketua_kelas', koordinator_kk_id: koorKK.id, name: koorKK.name, gender: koorKK.gender });
  return out;
}
