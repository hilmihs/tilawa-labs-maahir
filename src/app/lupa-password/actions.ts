'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWhatsApp, buildWaMeUrl } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { ADMIN_WA } from '@/lib/constants';

type State = { error?: string; waMeUrl?: string };

const ROLE_TABLES = [
  'peserta',
  'musyrif',
  'koordinator',
  'syaikh',
  'pengajar',
  'ketua_kelas',
  'koordinator_ketua_kelas',
] as const;

export async function requestPasswordReset(
  _prev: State | undefined,
  formData: FormData
): Promise<State> {
  const wa = normalizeWhatsApp(String(formData.get('whatsapp_number') ?? ''));
  if (!wa || wa.length < 10) {
    return { error: 'Nomor WhatsApp wajib diisi.' };
  }

  // Cari nama pemohon di salah satu tabel role (active).
  // CATATAN: whatsapp_number TIDAK unik — satu nomor bisa punya beberapa baris
  // (duplikat atau dipakai >1 orang). Jangan pakai .maybeSingle() karena akan
  // error saat >1 baris dan salah lapor "tidak terdaftar". Ambil baris aktif pertama.
  let requesterName: string | null = null;
  for (const t of ROLE_TABLES) {
    const { data } = await supabaseAdmin
      .from(t)
      .select('name')
      .eq('whatsapp_number', wa)
      .eq('active', true)
      .limit(1);
    if (data && data.length > 0) {
      requesterName = data[0].name;
      break;
    }
  }

  if (!requesterName) {
    return { error: 'Nomor WhatsApp tidak terdaftar di sistem.' };
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('password_reset_requests')
    .insert({
      whatsapp_number: wa,
      requester_name: requesterName,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return { error: 'Gagal membuat permintaan. Coba lagi.' };
  }

  const processUrl = absUrl(`/admin/reset-password/${inserted.id}`);
  const template = [
    `Assalamu'alaikum, mohon bantuan reset password.`,
    ``,
    `Nama: ${requesterName}`,
    `WA: ${wa}`,
    ``,
    `Link proses:`,
    processUrl,
  ].join('\n');

  return { waMeUrl: buildWaMeUrl(ADMIN_WA, template) };
}
