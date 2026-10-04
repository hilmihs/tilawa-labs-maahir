'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePengajar } from '@/lib/session';
import {
  getProgramsForDate,
  deriveIsTerlambat,
} from '@/lib/attendance';
import {
  buildWaMeUrl,
  normalizeWhatsApp,
  tplPengajarAlasanToKetuaKelompok,
  tplKetuaKelasTerpilih,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { logAudit } from '@/lib/audit';
import type { StatusCheckin } from '@/types/db';

export async function submitCheckin(
  _prev: { error?: string; ok?: boolean; waUrl?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean; waUrl?: string }> {
  const session = await requirePengajar();

  const tanggal = String(formData.get('tanggal') ?? '');
  const status = String(formData.get('status') ?? '') as StatusCheckin;
  const programId = formData.get('program_id') as string | null;
  const kelasHitsId = formData.get('kelas_hits_id') as string | null;

  if (!tanggal || !status) {
    return { error: 'Data tidak lengkap.' };
  }
  if (!['hadir', 'izin', 'sakit'].includes(status)) {
    return { error: 'Status tidak valid.' };
  }
  if (!programId && !kelasHitsId) {
    return { error: 'Program tidak ditemukan.' };
  }

  let waktuMulai = '00:00';
  if (programId) {
    const { data: prog } = await supabaseAdmin
      .from('program_kehadiran')
      .select('waktu_mulai')
      .eq('id', programId)
      .maybeSingle();
    if (prog) waktuMulai = prog.waktu_mulai;
  } else if (kelasHitsId) {
    const { data: kelas } = await supabaseAdmin
      .from('kelas_hits')
      .select('jadwal_waktu_mulai')
      .eq('id', kelasHitsId)
      .maybeSingle();
    if (kelas) waktuMulai = kelas.jadwal_waktu_mulai ?? '16:00';
  }

  const now = new Date();
  const isTerlambat = status === 'hadir' && deriveIsTerlambat(now, waktuMulai, tanggal);

  const insertData: Record<string, unknown> = {
    pengajar_id: session.pengajar_id,
    tanggal,
    status,
    checked_in_at: now.toISOString(),
    is_terlambat: isTerlambat,
  };
  if (programId) insertData.program_id = programId;
  if (kelasHitsId) insertData.kelas_hits_id = kelasHitsId;

  const { error: insertErr } = await supabaseAdmin
    .from('checkin_pengajar')
    .upsert(insertData, {
      onConflict: programId
        ? 'pengajar_id,program_id,tanggal'
        : 'pengajar_id,kelas_hits_id,tanggal',
    });

  if (insertErr) {
    return { error: `Gagal simpan: ${insertErr.message}` };
  }

  await logAudit({
    actor: session,
    action: 'checkin.submit',
    targetTable: 'checkin_pengajar',
    targetId: null,
    detail: { tanggal, status, program_id: programId, kelas_hits_id: kelasHitsId, is_terlambat: isTerlambat },
  });

  return { ok: true };
}

export async function submitCheckout(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requirePengajar();

  const checkinId = String(formData.get('checkin_id') ?? '');
  if (!checkinId) return { error: 'ID checkin tidak ditemukan.' };

  const { data: checkin } = await supabaseAdmin
    .from('checkin_pengajar')
    .select('id, pengajar_id, checkout_at')
    .eq('id', checkinId)
    .maybeSingle();

  if (!checkin || checkin.pengajar_id !== session.pengajar_id) {
    return { error: 'Checkin tidak ditemukan atau bukan milik Anda.' };
  }
  if (checkin.checkout_at) {
    return { error: 'Sudah checkout sebelumnya.' };
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from('checkin_pengajar')
    .update({ checkout_at: nowIso })
    .eq('id', checkinId);

  if (updateErr) return { error: `Gagal simpan: ${updateErr.message}` };

  await logAudit({
    actor: session,
    action: 'checkin.checkout',
    targetTable: 'checkin_pengajar',
    targetId: checkinId,
    detail: { checkout_at: nowIso },
  });

  return { ok: true };
}

export async function submitAlasan(
  _prev: { error?: string; ok?: boolean; waUrl?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean; waUrl?: string }> {
  const session = await requirePengajar();

  const tanggal = String(formData.get('tanggal') ?? '');
  const jenis = String(formData.get('jenis') ?? '') as 'terlambat' | 'alpa';
  const alasan = String(formData.get('alasan') ?? '').trim();
  const programId = formData.get('program_id') as string | null;
  const kelasHitsId = formData.get('kelas_hits_id') as string | null;

  if (!tanggal || !jenis || !alasan) {
    return { error: 'Data tidak lengkap.' };
  }

  const insertData: Record<string, unknown> = {
    pengajar_id: session.pengajar_id,
    tanggal,
    jenis,
    alasan,
    status: 'pending',
  };
  if (programId) insertData.program_id = programId;
  if (kelasHitsId) insertData.kelas_hits_id = kelasHitsId;

  const { data: insertedAlasan, error: insertErr } = await supabaseAdmin
    .from('pengajuan_alasan')
    .insert(insertData)
    .select('id')
    .single();

  if (insertErr) {
    return { error: `Gagal simpan: ${insertErr.message}` };
  }

  await logAudit({
    actor: session,
    action: 'alasan.submit',
    targetTable: 'pengajuan_alasan',
    targetId: insertedAlasan?.id ?? null,
    detail: { tanggal, jenis, alasan },
  });

  const { data: ketua } = await supabaseAdmin
    .from('pengajar')
    .select('name, gender, whatsapp_number')
    .eq('kelompok_id', session.kelompok_id)
    .eq('is_ketua', true)
    .maybeSingle();

  let waUrl: string | undefined;
  if (ketua) {
    const programName = programId
      ? (await supabaseAdmin.from('program_kehadiran').select('name').eq('id', programId).maybeSingle()).data?.name ?? 'Program'
      : 'Kelas Maahir';

    const msg = tplPengajarAlasanToKetuaKelompok({
      pengajarName: session.name,
      pengajarGender: session.gender,
      ketuaGender: ketua.gender,
      ketuaName: ketua.name,
      programName,
      tanggal,
      jenis,
      alasan,
      reviewUrl: absUrl('/kehadiran/ketua-kelompok'),
    });
    waUrl = buildWaMeUrl(ketua.whatsapp_number, msg);
  }

  return { ok: true, waUrl };
}

export async function submitKetuaKelas(
  _prev: { error?: string; ok?: boolean; waUrl?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean; waUrl?: string }> {
  const session = await requirePengajar();

  const kelasHitsId = String(formData.get('kelas_hits_id') ?? '');
  const ketuaName = String(formData.get('ketua_name') ?? '').trim();
  const ketuaWa = String(formData.get('ketua_wa') ?? '').trim();

  if (!kelasHitsId || !ketuaName || !ketuaWa) {
    return { error: 'Nama dan nomor WA ketua kelas wajib diisi.' };
  }

  const { data: kelas } = await supabaseAdmin
    .from('kelas_hits')
    .select('id, name, gender, pengajar_id')
    .eq('id', kelasHitsId)
    .maybeSingle();

  if (!kelas || kelas.pengajar_id !== session.pengajar_id) {
    return { error: 'Kelas tidak ditemukan atau bukan kelas Anda.' };
  }

  const { data: batch } = await supabaseAdmin
    .from('batch_config')
    .select('id')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!batch) {
    return { error: 'Konfigurasi batch belum tersedia.' };
  }

  await supabaseAdmin
    .from('ketua_kelas')
    .update({ active: false })
    .eq('kelas_hits_id', kelasHitsId)
    .eq('active', true);

  const magicToken = crypto.randomUUID();
  const normalizedWa = normalizeWhatsApp(ketuaWa);

  const { data: insertedKetua, error: insertErr } = await supabaseAdmin
    .from('ketua_kelas')
    .insert({
      name: ketuaName,
      gender: kelas.gender,
      whatsapp_number: normalizedWa,
      kelas_hits_id: kelasHitsId,
      batch_id: batch.id,
      magic_token: magicToken,
      active: true,
    })
    .select('id')
    .single();

  if (insertErr) {
    return { error: `Gagal menyimpan: ${insertErr.message}` };
  }

  await logAudit({
    actor: session,
    action: 'ketua_kelas.elect',
    targetTable: 'ketua_kelas',
    targetId: insertedKetua?.id ?? null,
    detail: { kelas_hits_id: kelasHitsId, ketua_name: ketuaName },
  });

  const { data: koorKK } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('link_grup_wa')
    .eq('gender', kelas.gender)
    .eq('active', true)
    .maybeSingle();

  const magicUrl = absUrl(`/api/auth/magic-link?token=${magicToken}`);
  const msg = tplKetuaKelasTerpilih({
    ketuaKelasName: ketuaName,
    ketuaKelasGender: kelas.gender,
    kelasName: kelas.name,
    magicUrl,
    linkGrupWa: koorKK?.link_grup_wa ?? null,
  });
  const waUrl = buildWaMeUrl(normalizedWa, msg);

  return { ok: true, waUrl };
}
