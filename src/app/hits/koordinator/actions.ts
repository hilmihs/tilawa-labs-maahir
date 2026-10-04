'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplKetuaKelasTerpilih } from '@/lib/whatsapp';
import { logAudit } from '@/lib/audit';

export type ResendKetuaResult = { ok?: boolean; error?: string; waUrl?: string };

/**
 * Kirim-ulang pesan login ke ketua kelas yang belum pernah login.
 * Password awal = 6 digit akhir nomor WA (deterministik). Hanya untuk ketua
 * yang last_login_at masih kosong — yang sudah login mungkin sudah ganti password.
 */
export async function resendKetuaLogin(
  _prev: ResendKetuaResult | undefined,
  fd: FormData
): Promise<ResendKetuaResult> {
  const actor = await requireKoordinatorKetuaKelas();
  const ketuaKelasId = String(fd.get('ketua_kelas_id') ?? '');
  if (!ketuaKelasId) return { error: 'Ketua kelas tidak ditemukan.' };

  const { data: kk } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, name, gender, whatsapp_number, magic_token, last_login_at, active, hits_halaqah_id')
    .eq('id', ketuaKelasId)
    .maybeSingle();
  if (!kk || !kk.active) return { error: 'Ketua kelas tidak aktif.' };
  if (kk.last_login_at) {
    return { error: 'Ketua ini sudah pernah login — password mungkin sudah diganti.' };
  }
  if (!kk.whatsapp_number) return { error: 'Nomor WA ketua kosong.' };

  const { data: hq } = await supabaseAdmin
    .from('hits_halaqah')
    .select('name')
    .eq('id', kk.hits_halaqah_id)
    .maybeSingle();

  const initialPassword = kk.whatsapp_number.slice(-6);
  const magicUrl = absUrl(`/api/auth/magic-link?token=${kk.magic_token}`);
  const msg = tplKetuaKelasTerpilih({
    ketuaKelasName: kk.name,
    ketuaKelasGender: kk.gender,
    kelasName: hq?.name ?? 'halaqah Anda',
    magicUrl,
    linkGrupWa: null,
    loginUrl: absUrl('/'),
    loginWa: kk.whatsapp_number,
    initialPassword,
  });

  await logAudit({
    actor,
    action: 'hits.ketua.resend_login',
    targetTable: 'ketua_kelas',
    targetId: kk.id,
    detail: { hits_halaqah_id: kk.hits_halaqah_id },
  });

  return { ok: true, waUrl: buildWaMeUrl(kk.whatsapp_number, msg) };
}
