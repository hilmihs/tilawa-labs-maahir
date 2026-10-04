'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, findKetuaWakilKelas } from '@/lib/program-kelas';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplLiburToKoordinator } from '@/lib/whatsapp';

export type AjukanLiburResult = { ok?: boolean; error?: string; waUrl?: string };

// Koordinator tujuan per gender (sesuai arahan: ikhwan → Aisyah Shofia Safitri,
// akhwat → Zahra Wafa Lestari). Prefer nama tsb; fallback koordinator aktif segender.
async function resolveKoordinator(gender: 'ikhwan' | 'akhwat') {
  const preferName = gender === 'ikhwan' ? 'Aisyah Shofia Safitri' : 'Salma';
  const { data: preferred } = await supabaseAdmin
    .from('koordinator')
    .select('id, name, whatsapp_number')
    .eq('gender', gender)
    .eq('name', preferName)
    .not('whatsapp_number', 'is', null)
    .limit(1)
    .maybeSingle();
  if (preferred?.whatsapp_number) return preferred;
  const { data: fallback } = await supabaseAdmin
    .from('koordinator')
    .select('id, name, whatsapp_number')
    .eq('gender', gender)
    .not('whatsapp_number', 'is', null)
    .limit(1)
    .maybeSingle();
  return fallback ?? null;
}

/** Ketua/wakil kelas Maahir mengajukan libur untuk sebuah tanggal → koordinator. */
export async function ajukanLibur(
  _prev: AjukanLiburResult | undefined,
  fd: FormData
): Promise<AjukanLiburResult> {
  const wa = await getSessionWa();
  if (!wa) return { error: 'Sesi tidak dikenali. Silakan login ulang.' };

  const kelasId = String(fd.get('program_kelas_id') ?? '');
  const tanggal = String(fd.get('tanggal') ?? '');
  const alasan = String(fd.get('alasan') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { error: 'Tanggal tidak valid.' };

  // Kelas harus dipimpin WA ini (ketua/wakil), termasuk takhassus (self).
  const myKelas = await findKetuaWakilKelas(wa);
  const kelas = myKelas.find((k) => k.id === kelasId);
  if (!kelas) return { error: 'Kelas tidak ditemukan atau Anda bukan ketua/wakilnya.' };

  // Nama pengaju (dari anggota kelas bila ada).
  const { data: anggota } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('name')
    .eq('program_kelas_id', kelas.id)
    .eq('whatsapp_number', wa)
    .limit(1)
    .maybeSingle();
  const requesterName = anggota?.name ?? 'Ketua/Wakil kelas';

  const token = crypto.randomUUID();
  const { error: insErr } = await supabaseAdmin.from('program_kelas_libur_request').insert({
    program_kelas_id: kelas.id,
    tanggal,
    alasan: alasan || null,
    gender: kelas.gender,
    requester_wa: wa,
    requester_name: requesterName,
    token,
    status: 'pending',
  });
  if (insErr) {
    if (insErr.code === '23505') return { error: 'Tanggal ini sudah diajukan & menunggu keputusan koordinator.' };
    return { error: `Gagal mengajukan: ${insErr.message}` };
  }

  const koor = await resolveKoordinator(kelas.gender);
  if (!koor?.whatsapp_number) {
    return { ok: true, error: 'Pengajuan tersimpan, tapi nomor koordinator belum diset.' };
  }

  const tanggalLabel = new Date(tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const msg = tplLiburToKoordinator({
    requesterName,
    kelasName: kelas.name,
    tanggalLabel,
    alasan,
    approveUrl: absUrl(`/2in1/libur/${token}`),
  });
  return { ok: true, waUrl: buildWaMeUrl(koor.whatsapp_number, msg) };
}
