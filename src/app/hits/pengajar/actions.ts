'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePengajar } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { buildWaMeUrl, normalizeWhatsApp, tplKetuaKelasTerpilih, tplPindahHalaqahToTarget, tplKetuaDualRoleApproval, tplKlaimHalaqahApproval } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { logAudit } from '@/lib/audit';
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
import { validateKlaimMenit } from '@/lib/hits-tabayyun';
import type { PengajarSession } from '@/types/db';

const BCRYPT_COST = 12;

type Res = { error?: string; ok?: boolean; waUrl?: string; pendingApproval?: boolean; info?: string };

/** Pengajar mengirim alasan/klarifikasi atas tabayyun (kondisi kelas non-KBBS). */
export async function submitAlasanTabayyun(_prev: Res | undefined, fd: FormData): Promise<Res> {
  const session = await requirePengajar();
  const wa = await getSessionWa();

  const tabayyunId = String(fd.get('tabayyun_id') ?? '');
  const alasan = String(fd.get('alasan_pengajar') ?? '').trim();
  if (!tabayyunId) return { error: 'Tabayyun tidak ditemukan.' };
  if (!alasan) return { error: 'Alasan wajib diisi.' };

  // Pastikan tabayyun ini milik halaqah pengajar yang login.
  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select('id, status, halaqah_id, hits_halaqah:halaqah_id(pengajar_id, pengajar_wa)')
    .eq('id', tabayyunId)
    .maybeSingle();
  if (!tab) return { error: 'Tabayyun tidak ditemukan.' };
  const h = tab.hits_halaqah as unknown as { pengajar_id: string | null; pengajar_wa: string | null } | null;
  const owned = h?.pengajar_id === session.pengajar_id || (!!wa && h?.pengajar_wa === wa);
  if (!owned) return { error: 'Tabayyun ini bukan untuk halaqah Anda.' };
  if (tab.status === 'decided') return { error: 'Tabayyun ini sudah diputuskan.' };

  const { saldo } = await computeHutangForHalaqah(tab.halaqah_id as string);
  const klaim = validateKlaimMenit(String(fd.get('bayar_menit_klaim') ?? ''), saldo);
  if ('error' in klaim) return { error: klaim.error };
  const bayarCatatan = String(fd.get('bayar_catatan') ?? '').trim();

  const { error } = await supabaseAdmin
    .from('hits_tabayyun')
    .update({
      alasan_pengajar: alasan,
      alasan_submitted_at: new Date().toISOString(),
      bayar_menit_klaim: saldo > 0 ? klaim.menit : null,
      bayar_catatan: saldo > 0 && bayarCatatan ? bayarCatatan : null,
      status: 'awaiting_reason',
    })
    .eq('id', tabayyunId);
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'hits.tabayyun.alasan',
    targetTable: 'hits_tabayyun',
    targetId: tabayyunId,
    detail: { halaqah_id: tab.halaqah_id },
  });

  revalidatePath('/hits/pengajar');
  return { ok: true };
}

export async function electKetua(_prev: Res | undefined, fd: FormData): Promise<Res> {
  const session = await requirePengajar();
  const wa = await getSessionWa();

  const halaqahId = String(fd.get('halaqah_id') ?? '');
  const pesertaId = String(fd.get('peserta_id') ?? '');
  // Mode manual: nama ketua diketik langsung saat tidak ada di daftar peserta.
  const ketuaNamaManual = String(fd.get('ketua_nama') ?? '').trim();
  const ketuaWa = String(fd.get('ketua_wa') ?? '').trim();
  if (!halaqahId || !ketuaWa || (!pesertaId && !ketuaNamaManual)) {
    return { error: 'Pilih/tulis nama peserta dan isi nomor WA ketua kelas.' };
  }

  const { data: halaqah } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender, pengajar_id, pengajar_wa')
    .eq('id', halaqahId)
    .maybeSingle();
  if (!halaqah) return { error: 'Halaqah tidak ditemukan.' };
  const owned = halaqah.pengajar_id === session.pengajar_id || (wa && halaqah.pengajar_wa === wa);
  if (!owned) return { error: 'Halaqah ini bukan milik Anda.' };

  // Nama ketua: dari peserta terpilih, atau ketikan manual.
  let ketuaNama = ketuaNamaManual;
  if (pesertaId) {
    const { data: chosen } = await supabaseAdmin
      .from('hits_halaqah_peserta')
      .select('id, nama')
      .eq('id', pesertaId)
      .eq('halaqah_id', halaqahId)
      .maybeSingle();
    if (!chosen) return { error: 'Peserta tidak ditemukan di halaqah ini.' };
    ketuaNama = chosen.nama;
  }
  if (!ketuaNama) return { error: 'Nama ketua kelas wajib diisi.' };

  const normWa = normalizeWhatsApp(ketuaWa);
  if (normWa.length < 11) {
    return { error: 'Nomor WA ketua tidak valid. Pakai nomor pribadi ketua yang benar.' };
  }
  const gender = halaqah.gender ?? session.gender;

  // Peran ganda: WA ini SUDAH jadi ketua aktif di halaqah LAIN. Tidak langsung
  // diaktifkan — buat pengajuan yang harus disetujui (pengajar existing /
  // koordinator KK) supaya peran ganda di-acc dulu sebelum auth diinfokan.
  const { data: existingKetua } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, name, hits_halaqah_id')
    .eq('whatsapp_number', normWa)
    .eq('active', true)
    .neq('hits_halaqah_id', halaqahId);
  if (existingKetua && existingKetua.length > 0) {
    // Peran ganda hanya valid untuk ORANG YANG SAMA (nama sama). Kalau nomor ini
    // sudah dipakai ketua BERBEDA nama → hampir pasti salah ketik / nomor
    // placeholder (mis. nomor pengassign). Tolak keras supaya tak dua orang
    // berbagi 1 login (nomor & password awal jadi sama).
    const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const sameName = existingKetua.some((r) => normName(r.name) === normName(ketuaNama));
    if (!sameName) {
      const others = Array.from(new Set(existingKetua.map((r) => r.name))).join(', ');
      return {
        error: `Nomor WA ini sudah dipakai ketua kelas lain (${others}). Peran ganda hanya untuk orang yang sama — pastikan nomor pribadi ${ketuaNama} yang benar, jangan pakai nomor bersama.`,
      };
    }
    return requestKetuaDualRole({
      session,
      halaqahId,
      halaqahName: halaqah.name,
      gender,
      ketuaNama,
      normWa,
      pesertaId,
      existingHalaqahIds: existingKetua.map((r) => r.hits_halaqah_id).filter((x): x is string => !!x),
      requesterWa: wa,
    });
  }

  // Reset ketua lama di halaqah, set yang baru (hanya bila pilih dari daftar peserta).
  if (pesertaId) {
    await supabaseAdmin
      .from('hits_halaqah_peserta')
      .update({ is_ketua: false, ketua_wa: null })
      .eq('halaqah_id', halaqahId)
      .eq('is_ketua', true);
    await supabaseAdmin
      .from('hits_halaqah_peserta')
      .update({ is_ketua: true, ketua_wa: normWa })
      .eq('id', pesertaId);
  }

  // Nonaktifkan ketua_kelas lama utk halaqah ini, buat baru (magic-link).
  await supabaseAdmin
    .from('ketua_kelas')
    .update({ active: false })
    .eq('hits_halaqah_id', halaqahId)
    .eq('active', true);

  const magicToken = crypto.randomUUID();
  // Password awal = 6 digit akhir nomor WA ketua. Deterministik supaya bisa
  // diinfokan & dipakai login WA+password; ketua diimbau ganti setelah login.
  const initialPassword = normWa.slice(-6);
  const passwordHash = await bcrypt.hash(initialPassword, BCRYPT_COST);
  const { data: inserted, error } = await supabaseAdmin
    .from('ketua_kelas')
    .insert({
      name: ketuaNama,
      gender,
      whatsapp_number: normWa,
      hits_halaqah_id: halaqahId,
      hits_halaqah_peserta_id: pesertaId || null,
      magic_token: magicToken,
      password_hash: passwordHash,
      active: true,
    })
    .select('id')
    .single();
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'hits.ketua.elect',
    targetTable: 'ketua_kelas',
    targetId: inserted?.id ?? null,
    detail: { halaqah_id: halaqahId, peserta_id: pesertaId || null, manual: !pesertaId },
  });

  const magicUrl = absUrl(`/api/auth/magic-link?token=${magicToken}`);
  const msg = tplKetuaKelasTerpilih({
    ketuaKelasName: ketuaNama,
    ketuaKelasGender: gender,
    kelasName: halaqah.name,
    magicUrl,
    linkGrupWa: null,
    loginUrl: absUrl('/'),
    loginWa: normWa,
    initialPassword,
  });
  return { ok: true, waUrl: buildWaMeUrl(normWa, msg) };
}

/**
 * Buat pengajuan peran ganda ketua kelas. Approver = pengajar halaqah existing
 * (bila tepat 1 & ber-WA) atau koordinator ketua kelas (bila >1 / tanpa WA).
 * Mengembalikan wa.me ke approver berisi magic approval link.
 */
async function requestKetuaDualRole(args: {
  session: PengajarSession;
  halaqahId: string;
  halaqahName: string;
  gender: 'ikhwan' | 'akhwat';
  ketuaNama: string;
  normWa: string;
  pesertaId: string;
  existingHalaqahIds: string[];
  requesterWa: string | null;
}): Promise<Res> {
  const { session, halaqahId, halaqahName, gender, ketuaNama, normWa, pesertaId, existingHalaqahIds, requesterWa } = args;

  // Idempotent: sudah ada pengajuan pending utk (ketua, halaqah baru)? kirim ulang.
  const { data: existingReq } = await supabaseAdmin
    .from('ketua_dualrole_request')
    .select('token, target_wa, target_name, approver_kind')
    .eq('ketua_wa', normWa)
    .eq('new_halaqah_id', halaqahId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();

  let approverKind: 'pengajar' | 'koordinator_kk' = 'koordinator_kk';
  let targetPengajarId: string | null = null;
  let targetWa: string | null = existingReq?.target_wa ?? null;
  let targetName: string | null = existingReq?.target_name ?? null;
  let approverGender: 'ikhwan' | 'akhwat' = gender;

  if (existingReq) {
    approverKind = existingReq.approver_kind as 'pengajar' | 'koordinator_kk';
  } else {
    const distinctOther = Array.from(new Set(existingHalaqahIds));
    if (distinctOther.length === 1) {
      const { data: hq } = await supabaseAdmin
        .from('hits_halaqah')
        .select('pengajar_id, pengajar_wa, pengajar_nama_sheet, gender')
        .eq('id', distinctOther[0])
        .maybeSingle();
      if (hq?.pengajar_wa) {
        approverKind = 'pengajar';
        targetPengajarId = hq.pengajar_id ?? null;
        targetWa = hq.pengajar_wa;
        targetName = hq.pengajar_nama_sheet ?? 'Pengajar';
        approverGender = (hq.gender as 'ikhwan' | 'akhwat') ?? gender;
      }
    }
    if (approverKind === 'koordinator_kk') {
      const { data: koorList } = await supabaseAdmin
        .from('koordinator_ketua_kelas')
        .select('id, name, gender, whatsapp_number')
        .eq('active', true);
      const pick =
        (koorList ?? []).find((k) => k.gender === gender && k.whatsapp_number) ??
        (koorList ?? []).find((k) => k.whatsapp_number);
      if (!pick) {
        return { error: 'Tidak ada koordinator ketua kelas ber-WA untuk menyetujui peran ganda. Hubungi admin.' };
      }
      targetWa = pick.whatsapp_number;
      targetName = pick.name;
      approverGender = (pick.gender as 'ikhwan' | 'akhwat') ?? gender;
    }
  }

  let token = existingReq?.token;
  if (!token) {
    token = crypto.randomUUID();
    const { error: insErr } = await supabaseAdmin.from('ketua_dualrole_request').insert({
      ketua_wa: normWa,
      ketua_name: ketuaNama,
      gender,
      new_halaqah_id: halaqahId,
      new_peserta_id: pesertaId || null,
      requested_by_pengajar_id: session.pengajar_id,
      requested_by_name: session.name,
      requested_by_wa: requesterWa,
      approver_kind: approverKind,
      target_pengajar_id: targetPengajarId,
      target_wa: targetWa,
      target_name: targetName,
      token,
    });
    if (insErr) return { error: `Gagal membuat pengajuan: ${insErr.message}` };

    await logAudit({
      actor: session,
      action: 'hits.ketua.dualrole.request',
      targetTable: 'ketua_dualrole_request',
      targetId: null,
      detail: { new_halaqah_id: halaqahId, ketua_wa: normWa, approver_kind: approverKind },
    });
  }

  if (!targetWa) {
    return { error: 'Approver tidak punya nomor WA. Hubungi admin.' };
  }

  const approveUrl = absUrl(`/hits/ketua-dual/${token}`);
  const msg = tplKetuaDualRoleApproval({
    approverName: targetName ?? 'Ustadz/ah',
    approverGender,
    ketuaName: ketuaNama,
    newHalaqahName: halaqahName,
    requesterName: session.name,
    approveUrl,
    loginUrl: absUrl('/'),
  });

  return {
    ok: true,
    pendingApproval: true,
    info:
      approverKind === 'pengajar'
        ? 'Ketua ini sudah memimpin halaqah lain. Kirim WA ke pengajar halaqah tsb untuk menyetujui peran ganda.'
        : 'Ketua ini sudah memimpin halaqah lain. Kirim WA ke koordinator ketua kelas untuk menyetujui peran ganda.',
    waUrl: buildWaMeUrl(targetWa, msg),
  };
}

// ============================================================
// Pemindahan halaqah (transfer pengajar) — wizard + pengajuan
// ============================================================

export type PindahResult = { ok?: boolean; error?: string; waUrl?: string };

/** Daftar halaqah dalam satu batch + nama pengajar saat ini (untuk wizard). */
export async function listHalaqahForBatch(batchId: string): Promise<{
  halaqah: { id: string; name: string; gender: 'ikhwan' | 'akhwat' | null; pengajarNama: string | null; pengajarLinked: boolean }[];
}> {
  await requirePengajar();
  if (!batchId) return { halaqah: [] };
  const { data } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender, pengajar_id, pengajar_nama_sheet')
    .eq('batch_id', batchId)
    .eq('active', true)
    .order('name');
  return {
    halaqah: (data ?? []).map((h) => ({
      id: h.id,
      name: h.name,
      gender: h.gender,
      pengajarNama: h.pengajar_nama_sheet,
      pengajarLinked: !!h.pengajar_id,
    })),
  };
}

/** Peserta aktif sebuah halaqah (preview sebelum konfirmasi pindah). */
export async function listPesertaForHalaqah(halaqahId: string): Promise<{
  peserta: { id: string; nama: string; status_peserta: string | null; is_ketua: boolean }[];
}> {
  await requirePengajar();
  if (!halaqahId) return { peserta: [] };
  const { data } = await supabaseAdmin
    .from('hits_halaqah_peserta')
    .select('id, nama, status_peserta, is_ketua')
    .eq('halaqah_id', halaqahId)
    .eq('active', true)
    .order('nama');
  return { peserta: data ?? [] };
}

/** Daftar pengajar aktif (opsi tujuan), opsional filter gender. */
export async function listPengajarOptions(gender?: 'ikhwan' | 'akhwat'): Promise<{
  pengajar: { id: string; name: string; whatsapp_number: string | null }[];
}> {
  await requirePengajar();
  let q = supabaseAdmin
    .from('pengajar')
    .select('id, name, whatsapp_number, gender')
    .eq('active', true)
    .order('name');
  if (gender) q = q.eq('gender', gender);
  const { data } = await q;
  return {
    pengajar: (data ?? []).map((p) => ({ id: p.id, name: p.name, whatsapp_number: p.whatsapp_number })),
  };
}

/** Pengaju (pengajar mana pun) mengajukan pemindahan halaqah ke pengajar tujuan. */
export async function ajukanPindahHalaqah(_prev: PindahResult | undefined, fd: FormData): Promise<PindahResult> {
  const session = await requirePengajar();
  const wa = await getSessionWa();

  const halaqahId = String(fd.get('halaqah_id') ?? '');
  const batchId = String(fd.get('batch_id') ?? '') || null;
  const targetPengajarId = String(fd.get('target_pengajar_id') ?? '').trim();
  const targetNamaManual = String(fd.get('target_name') ?? '').trim();
  const targetWaRaw = String(fd.get('target_wa') ?? '').trim();
  if (!halaqahId) return { error: 'Halaqah wajib dipilih.' };
  if (!targetPengajarId && (!targetNamaManual || !targetWaRaw)) {
    return { error: 'Pilih pengajar tujuan dari daftar, atau isi nama + nomor WA secara manual.' };
  }

  const { data: halaqah } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender, batch_id')
    .eq('id', halaqahId)
    .maybeSingle();
  if (!halaqah) return { error: 'Halaqah tidak ditemukan.' };

  // Resolve target: dari daftar pengajar (kanonik) atau ketikan manual.
  let targetName = targetNamaManual;
  let targetWa: string | null = targetWaRaw ? normalizeWhatsApp(targetWaRaw) : null;
  let resolvedTargetId: string | null = null;
  if (targetPengajarId) {
    if (targetPengajarId === session.pengajar_id) return { error: 'Tidak bisa memindahkan ke diri sendiri.' };
    const { data: tp } = await supabaseAdmin
      .from('pengajar')
      .select('id, name, whatsapp_number, gender')
      .eq('id', targetPengajarId)
      .maybeSingle();
    if (!tp) return { error: 'Pengajar tujuan tidak ditemukan.' };
    // Gender-strict: ikhwan↔ikhwan, akhwat↔akhwat.
    if (halaqah.gender && tp.gender !== halaqah.gender) {
      return { error: 'Pengajar tujuan harus sesama gender dengan halaqah.' };
    }
    resolvedTargetId = tp.id;
    targetName = tp.name;
    targetWa = tp.whatsapp_number ? normalizeWhatsApp(tp.whatsapp_number) : null;
  }
  if (!targetName) return { error: 'Nama pengajar tujuan wajib diisi.' };

  const token = crypto.randomUUID();
  const { error: insErr } = await supabaseAdmin
    .from('hits_halaqah_pindah_request')
    .insert({
      halaqah_id: halaqahId,
      batch_id: batchId ?? halaqah.batch_id,
      requested_by_pengajar_id: session.pengajar_id,
      requested_by_name: session.name,
      requested_by_wa: wa,
      target_pengajar_id: resolvedTargetId,
      target_name: targetName,
      target_wa: targetWa,
      token,
      status: 'pending',
      request_type: 'transfer_out',
    });
  if (insErr) {
    if (insErr.code === '23505') return { error: 'Halaqah ini sudah ada pengajuan pemindahan yang menunggu keputusan.' };
    return { error: `Gagal mengajukan: ${insErr.message}` };
  }

  await logAudit({
    actor: session,
    action: 'hits.halaqah.pindah.ajukan',
    targetTable: 'hits_halaqah_pindah_request',
    targetId: null,
    detail: { halaqah_id: halaqahId, target_pengajar_id: resolvedTargetId, manual: !resolvedTargetId },
  });

  revalidatePath('/hits/pengajar');

  if (!targetWa) {
    return { ok: true, error: 'Pengajuan tersimpan, tapi nomor WA pengajar tujuan belum ada — kirim link manual.' };
  }
  const msg = tplPindahHalaqahToTarget({
    targetName,
    targetGender: (halaqah.gender ?? session.gender) as 'ikhwan' | 'akhwat',
    requesterName: session.name,
    halaqahName: halaqah.name,
    approveUrl: absUrl(`/hits/pindah-halaqah/${token}`),
    loginUrl: absUrl('/'),
  });
  return { ok: true, waUrl: buildWaMeUrl(targetWa, msg) };
}

/** Kirim ulang WA ke pengajar tujuan pengajuan pindah yang masih pending (reminder). */
export async function remindPindahTarget(halaqahId: string): Promise<PindahResult> {
  const session = await requirePengajar();
  if (!halaqahId) return { error: 'Halaqah tidak valid.' };
  const { data: req } = await supabaseAdmin
    .from('hits_halaqah_pindah_request')
    .select('token, target_name, target_wa, halaqah:halaqah_id(name, gender)')
    .eq('halaqah_id', halaqahId)
    .eq('status', 'pending')
    .eq('request_type', 'transfer_out')
    .maybeSingle();
  if (!req) return { error: 'Tidak ada pengajuan pemindahan yang menunggu untuk halaqah ini.' };
  if (!req.target_wa) return { error: 'Pengajar tujuan belum ada nomor WA — bagikan link manual.' };
  const hal = req.halaqah as unknown as { name: string; gender: string | null } | null;
  const msg = tplPindahHalaqahToTarget({
    targetName: req.target_name,
    targetGender: (hal?.gender ?? session.gender) as 'ikhwan' | 'akhwat',
    requesterName: session.name,
    halaqahName: hal?.name ?? 'halaqah',
    approveUrl: absUrl(`/hits/pindah-halaqah/${req.token}`),
    loginUrl: absUrl('/'),
  });
  return { ok: true, waUrl: buildWaMeUrl(req.target_wa, msg) };
}

/** Daftar halaqah dalam batch, gender-strict (untuk fitur klaim/tambah halaqah). */
export async function listClaimableHalaqah(batchId: string): Promise<{
  halaqah: { id: string; name: string; pengajarNama: string | null; pengajarLinked: boolean }[];
}> {
  const session = await requirePengajar();
  if (!batchId) return { halaqah: [] };
  const { data } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, pengajar_id, pengajar_nama_sheet')
    .eq('batch_id', batchId)
    .eq('gender', session.gender)
    .eq('active', true)
    .order('name');
  return {
    halaqah: (data ?? []).map((h) => ({
      id: h.id,
      name: h.name,
      pengajarNama: h.pengajar_nama_sheet,
      pengajarLinked: !!h.pengajar_id,
    })),
  };
}

/**
 * Pengajar mengajukan KLAIM halaqah (menjadi pengajarnya). Perlu persetujuan:
 * owner halaqah bila sudah ada pengajar, atau koordinator ketua kelas bila kosong.
 */
export async function ajukanKlaimHalaqah(_prev: PindahResult | undefined, fd: FormData): Promise<PindahResult> {
  const session = await requirePengajar();
  const wa = await getSessionWa();

  const halaqahId = String(fd.get('halaqah_id') ?? '');
  if (!halaqahId) return { error: 'Halaqah wajib dipilih.' };

  const { data: halaqah } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender, batch_id, pengajar_id, pengajar_wa, pengajar_nama_sheet')
    .eq('id', halaqahId)
    .maybeSingle();
  if (!halaqah) return { error: 'Halaqah tidak ditemukan.' };
  if (halaqah.gender && halaqah.gender !== session.gender) {
    return { error: 'Halaqah harus sesama gender dengan Anda.' };
  }
  if (halaqah.pengajar_id === session.pengajar_id) {
    return { error: 'Halaqah ini sudah Anda pegang.' };
  }

  // Tentukan approver: owner bila ada, else koordinator ketua kelas gender-match.
  let approverKind: 'pengajar' | 'koordinator_kk';
  let approverWa: string | null;
  let approverPengajarId: string | null = null;
  let approverName: string;
  const approverGender = (halaqah.gender ?? session.gender) as 'ikhwan' | 'akhwat';

  if (halaqah.pengajar_id && halaqah.pengajar_wa) {
    approverKind = 'pengajar';
    approverPengajarId = halaqah.pengajar_id;
    approverWa = normalizeWhatsApp(halaqah.pengajar_wa);
    approverName = halaqah.pengajar_nama_sheet ?? 'Pengajar';
  } else {
    approverKind = 'koordinator_kk';
    const { data: koorList } = await supabaseAdmin
      .from('koordinator_ketua_kelas')
      .select('id, name, gender, whatsapp_number')
      .eq('active', true);
    const pick =
      (koorList ?? []).find((k) => k.gender === approverGender && k.whatsapp_number) ??
      (koorList ?? []).find((k) => k.whatsapp_number);
    if (!pick) return { error: 'Tidak ada koordinator ketua kelas ber-WA untuk menyetujui. Hubungi admin.' };
    approverWa = pick.whatsapp_number ? normalizeWhatsApp(pick.whatsapp_number) : null;
    approverName = pick.name;
  }

  const token = crypto.randomUUID();
  const { error: insErr } = await supabaseAdmin.from('hits_halaqah_pindah_request').insert({
    halaqah_id: halaqahId,
    batch_id: halaqah.batch_id,
    requested_by_pengajar_id: session.pengajar_id,
    requested_by_name: session.name,
    requested_by_wa: wa,
    target_pengajar_id: session.pengajar_id, // klaim: tujuan = pengaju sendiri
    target_name: session.name,
    target_wa: wa,
    token,
    status: 'pending',
    request_type: 'claim_in',
    approver_kind: approverKind,
    approver_wa: approverWa,
    approver_pengajar_id: approverPengajarId,
  });
  if (insErr) {
    if (insErr.code === '23505') return { error: 'Halaqah ini sudah ada pengajuan yang menunggu keputusan.' };
    return { error: `Gagal mengajukan: ${insErr.message}` };
  }

  await logAudit({
    actor: session,
    action: 'hits.halaqah.klaim.ajukan',
    targetTable: 'hits_halaqah_pindah_request',
    targetId: null,
    detail: { halaqah_id: halaqahId, approver_kind: approverKind },
  });

  if (!approverWa) return { ok: true, error: 'Pengajuan tersimpan, tapi approver belum ada WA — bagikan link manual.' };
  const msg = tplKlaimHalaqahApproval({
    approverName,
    approverGender,
    requesterName: session.name,
    halaqahName: halaqah.name,
    approveUrl: absUrl(`/hits/pindah-halaqah/${token}`),
    loginUrl: absUrl('/'),
    ownerKind: approverKind,
  });
  return { ok: true, waUrl: buildWaMeUrl(approverWa, msg) };
}

/** Pengajar mengubah level halaqahnya (dasar ↔ lanjutan). */
export async function ubahLevelHalaqah(_prev: Res | undefined, fd: FormData): Promise<Res> {
  const session = await requirePengajar();
  const wa = await getSessionWa();
  const halaqahId = fd.get('halaqah_id') as string;
  const newProgram = fd.get('program') as string;

  if (!halaqahId || !['dasar', 'lanjutan'].includes(newProgram)) {
    return { error: 'Data tidak valid.' };
  }

  // Pastikan halaqah ini milik pengajar yang login.
  const orFilter = wa
    ? `pengajar_id.eq.${session.pengajar_id},pengajar_wa.eq.${wa}`
    : `pengajar_id.eq.${session.pengajar_id}`;
  const { data: halaqah } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, program, level')
    .eq('id', halaqahId)
    .or(orFilter)
    .single();

  if (!halaqah) return { error: 'Halaqah tidak ditemukan atau bukan milik Anda.' };

  const newLevel = newProgram === 'dasar' ? 'qoidah_nuroniyyah' : 'perbaikan_bacaan';
  const { error } = await supabaseAdmin
    .from('hits_halaqah')
    .update({ program: newProgram, level: newLevel, updated_at: new Date().toISOString() })
    .eq('id', halaqahId);

  if (error) return { error: error.message };

  await logAudit({
    actor: session as PengajarSession,
    action: 'ubah_level_halaqah',
    targetTable: 'hits_halaqah',
    targetId: halaqahId,
    detail: { from: halaqah.program, to: newProgram },
  });

  revalidatePath('/hits/pengajar');
  return { ok: true };
}
