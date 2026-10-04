'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { normalizeWhatsApp } from '@/lib/whatsapp';
import { extractSpreadsheetId, enumerateTabs, newTabsToRegister } from '@/lib/hits-sheets';
import { syncBatch, linkPengajarByWa } from '@/lib/hits-sync';
import { batchSlug } from '@/lib/hits';
import { logAudit } from '@/lib/audit';
import type { HitsLevel } from '@/types/db';

type Res = { error?: string; ok?: boolean; info?: string };

async function guard() {
  return requireKoordinatorKetuaKelas();
}

export async function createBatch(_prev: Res | undefined, fd: FormData): Promise<Res> {
  const actor = await guard();
  const name = String(fd.get('name') ?? '').trim();
  const startDate = String(fd.get('start_date') ?? '').trim();
  if (!name || !startDate) return { error: 'Nama batch & tanggal mulai wajib.' };
  const slug = batchSlug(name);
  const { error } = await supabaseAdmin
    .from('hits_batch')
    .insert({ name, slug, start_date: startDate });
  if (error) return { error: `Gagal: ${error.message}` };
  await logAudit({ actor, action: 'hits.batch.create', targetTable: 'hits_batch', targetId: null, detail: { name } });
  revalidatePath('/hits/koordinator/validasi');
  return { ok: true };
}

export async function addSource(_prev: Res | undefined, fd: FormData): Promise<Res> {
  await guard();
  const batchId = String(fd.get('batch_id') ?? '');
  const kind = String(fd.get('kind') ?? '') as 'kaldik' | 'presensi';
  const url = String(fd.get('url') ?? '').trim();
  const gid = String(fd.get('gid') ?? '').trim();
  const label = String(fd.get('label') ?? '').trim();
  if (!batchId || !kind || !url) return { error: 'Batch, jenis, dan URL wajib.' };
  const spreadsheetId = extractSpreadsheetId(url);
  const { error } = await supabaseAdmin.from('hits_sheet_source').insert({
    batch_id: batchId,
    kind,
    spreadsheet_id: spreadsheetId,
    gid: gid || null,
    label: label || null,
  });
  if (error) return { error: `Gagal: ${error.message}` };
  revalidatePath('/hits/koordinator/validasi');
  return { ok: true };
}

/** Enumerasi tab presensi dari pubhtml dan buat satu hits_sheet_source per tab. */
export async function enumeratePresensiTabs(_prev: Res | undefined, fd: FormData): Promise<Res> {
  await guard();
  const batchId = String(fd.get('batch_id') ?? '');
  const url = String(fd.get('url') ?? '').trim();
  if (!batchId || !url) return { error: 'Batch & URL wajib.' };
  const spreadsheetId = extractSpreadsheetId(url);
  const tabs = await enumerateTabs(spreadsheetId);
  if (!tabs.length) {
    return {
      error:
        'Tidak bisa enumerasi tab. Pastikan "Publish entire document" aktif, atau tambahkan tiap tab manual (gid).',
    };
  }
  // Dedup: hits_sheet_source tak punya unique constraint, jadi upsert tanpa
  // onConflict akan selalu INSERT (konflik ke PK id yang kosong) → duplikat tiap
  // re-enumerate. Ambil gid yang sudah terdaftar utk spreadsheet ini, sisipkan
  // hanya tab baru.
  const { data: existing } = await supabaseAdmin
    .from('hits_sheet_source')
    .select('gid')
    .eq('batch_id', batchId)
    .eq('kind', 'presensi')
    .eq('spreadsheet_id', spreadsheetId);
  const existingGids = (existing ?? []).map((r) => r.gid).filter((g): g is string => !!g);
  const fresh = newTabsToRegister(tabs, existingGids);
  if (fresh.length === 0) {
    return { ok: true, info: `${tabs.length} tab; semua sudah terdaftar.` };
  }
  const rows = fresh.map((t) => ({
    batch_id: batchId,
    kind: 'presensi' as const,
    spreadsheet_id: spreadsheetId,
    gid: t.gid,
    label: t.name,
  }));
  const { error } = await supabaseAdmin.from('hits_sheet_source').insert(rows);
  if (error) return { error: `Gagal: ${error.message}` };
  revalidatePath('/hits/koordinator/validasi');
  return { ok: true, info: `${fresh.length} tab baru ditambahkan (${tabs.length} total di sheet).` };
}

export async function runSync(_prev: Res | undefined, fd: FormData): Promise<Res> {
  const actor = await guard();
  const batchId = String(fd.get('batch_id') ?? '');
  if (!batchId) return { error: 'Batch wajib.' };
  const result = await syncBatch(batchId);
  await logAudit({ actor, action: 'hits.sync', targetTable: 'hits_batch', targetId: batchId, detail: result });
  revalidatePath('/hits/koordinator/validasi');
  revalidatePath('/hits/koordinator');
  if (!result.ok) {
    return { error: `Sync selesai dengan error: ${result.errors.slice(0, 3).join(' | ')}` };
  }
  return { ok: true, info: `Sync ok — ${result.halaqah} halaqah, ${result.peserta} peserta, ${result.kaldikRows} baris kaldik.` };
}

export async function setHalaqahLevel(_prev: Res | undefined, fd: FormData): Promise<Res> {
  await guard();
  const id = String(fd.get('halaqah_id') ?? '');
  const level = String(fd.get('level') ?? '') as HitsLevel | '';
  if (!id || !level) return { error: 'Halaqah & level wajib.' };
  const { error } = await supabaseAdmin.from('hits_halaqah').update({ level }).eq('id', id);
  if (error) return { error: `Gagal: ${error.message}` };
  revalidatePath('/hits/koordinator/validasi');
  return { ok: true };
}

export async function setPengajarWa(_prev: Res | undefined, fd: FormData): Promise<Res> {
  await guard();
  const id = String(fd.get('halaqah_id') ?? '');
  const wa = String(fd.get('pengajar_wa') ?? '').trim();
  if (!id || !wa) return { error: 'Halaqah & WA wajib.' };
  const { linked } = await linkPengajarByWa(id, wa);
  revalidatePath('/hits/koordinator/validasi');
  revalidatePath('/hits/koordinator');
  return {
    ok: true,
    info: linked
      ? 'WA cocok dengan pengajar terdaftar — masuk Matrix.'
      : 'WA disimpan, tapi belum ada pengajar terdaftar dengan nomor itu (skor belum masuk matrix).',
  };
}

/** Buat baris pengajar baru dari nama sheet + WA, lalu link ke halaqah. */
export async function provisionPengajar(_prev: Res | undefined, fd: FormData): Promise<Res> {
  await guard();
  const id = String(fd.get('halaqah_id') ?? '');
  const name = String(fd.get('name') ?? '').trim();
  const wa = String(fd.get('pengajar_wa') ?? '').trim();
  const gender = String(fd.get('gender') ?? 'ikhwan') as 'ikhwan' | 'akhwat';
  if (!id || !name || !wa) return { error: 'Halaqah, nama, dan WA wajib.' };
  const normWa = normalizeWhatsApp(wa);
  // butuh kelompok_pengajar; pakai/auto-buat satu placeholder per gender.
  let { data: kelompok } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id')
    .eq('gender', gender)
    .limit(1)
    .maybeSingle();
  if (!kelompok) {
    const { data: k } = await supabaseAdmin
      .from('kelompok_pengajar')
      .insert({ name: `Pengajar HITS ${gender}`, gender })
      .select('id')
      .single();
    kelompok = k;
  }
  const { data: pengajar, error } = await supabaseAdmin
    .from('pengajar')
    .upsert(
      { name, gender, whatsapp_number: normWa, password_hash: '', kelompok_id: kelompok!.id, active: true },
      { onConflict: 'whatsapp_number' }
    )
    .select('id')
    .single();
  if (error) return { error: `Gagal: ${error.message}` };
  await supabaseAdmin
    .from('hits_halaqah')
    .update({ pengajar_id: pengajar!.id, pengajar_wa: normWa })
    .eq('id', id);
  revalidatePath('/hits/koordinator/validasi');
  return { ok: true, info: 'Pengajar dibuat & ditautkan.' };
}

export async function addManualHalaqah(_prev: Res | undefined, fd: FormData): Promise<Res> {
  await guard();
  const batchId = String(fd.get('batch_id') ?? '');
  const name = String(fd.get('name') ?? '').trim();
  const level = String(fd.get('level') ?? '') as HitsLevel | '';
  const gender = String(fd.get('gender') ?? '') as 'ikhwan' | 'akhwat' | '';
  if (!batchId || !name) return { error: 'Batch & nama halaqah wajib.' };
  const { error } = await supabaseAdmin.from('hits_halaqah').insert({
    batch_id: batchId,
    name,
    level: level || null,
    gender: gender || null,
    source: 'manual',
  });
  if (error) return { error: `Gagal: ${error.message}` };
  revalidatePath('/hits/koordinator/validasi');
  return { ok: true };
}

export async function deleteHalaqah(_prev: Res | undefined, fd: FormData): Promise<Res> {
  await guard();
  const id = String(fd.get('halaqah_id') ?? '');
  if (!id) return { error: 'Halaqah wajib.' };
  const { error } = await supabaseAdmin.from('hits_halaqah').delete().eq('id', id);
  if (error) return { error: `Gagal: ${error.message}` };
  revalidatePath('/hits/koordinator/validasi');
  return { ok: true };
}

export async function addManualPeserta(_prev: Res | undefined, fd: FormData): Promise<Res> {
  await guard();
  const halaqahId = String(fd.get('halaqah_id') ?? '');
  const nama = String(fd.get('nama') ?? '').trim();
  if (!halaqahId || !nama) return { error: 'Halaqah & nama wajib.' };
  const { error } = await supabaseAdmin
    .from('hits_halaqah_peserta')
    .insert({ halaqah_id: halaqahId, nama, source: 'manual', status_peserta: 'Aktif' });
  if (error) return { error: `Gagal: ${error.message}` };
  revalidatePath('/hits/koordinator/validasi');
  return { ok: true };
}

export async function deletePeserta(_prev: Res | undefined, fd: FormData): Promise<Res> {
  await guard();
  const id = String(fd.get('peserta_id') ?? '');
  if (!id) return { error: 'Peserta wajib.' };
  const { error } = await supabaseAdmin.from('hits_halaqah_peserta').delete().eq('id', id);
  if (error) return { error: `Gagal: ${error.message}` };
  revalidatePath('/hits/koordinator/validasi');
  return { ok: true };
}
