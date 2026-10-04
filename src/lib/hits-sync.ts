// Orkestrasi sinkronisasi spreadsheet -> tabel hits_*.
// Sheet = source of truth: upsert by stable key, baris hilang -> active=false.
// Pengecualian: baris source='manual' kebal rekonsiliasi. Kolom curated
// koordinator (level, pengajar_id/wa, is_ketua, ketua_wa) tak ditimpa.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWhatsApp } from '@/lib/whatsapp';
import { fetchCsv, enumerateTabs, newTabsToRegister } from '@/lib/hits-sheets';
import { parseKaldikTab, startDatesByLevel } from '@/lib/hits-kaldik-parse';
import { parsePresensiTab } from '@/lib/hits-presensi-parse';
import { guessLevel } from '@/lib/hits';
import type { HitsLevel } from '@/types/db';

const STALE_MS = 30 * 60 * 1000; // 30 menit

export type SyncResult = {
  ok: boolean;
  kaldikRows: number;
  halaqah: number;
  peserta: number;
  errors: string[];
};

/** Sinkron satu batch bila data sudah basi (>30 menit) atau force=true. */
export async function syncBatchIfStale(batchId: string, force = false): Promise<SyncResult | null> {
  if (!force) {
    const { data } = await supabaseAdmin
      .from('hits_sheet_source')
      .select('last_synced_at')
      .eq('batch_id', batchId)
      .eq('active', true)
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle();
    const last = data?.last_synced_at ? new Date(data.last_synced_at).getTime() : 0;
    if (last && Date.now() - last < STALE_MS) return null;
  }
  return syncBatch(batchId);
}

export async function syncBatch(batchId: string): Promise<SyncResult> {
  const errors: string[] = [];
  let kaldikRows = 0;
  let halaqah = 0;
  let peserta = 0;

  const { data: sources } = await supabaseAdmin
    .from('hits_sheet_source')
    .select('*')
    .eq('batch_id', batchId)
    .eq('active', true);

  const kaldikSources = (sources ?? []).filter((s) => s.kind === 'kaldik');
  let presensiSources = (sources ?? []).filter((s) => s.kind === 'presensi');

  // 1) Kaldik
  let startByLevel: Record<HitsLevel, string | null> = {
    qoidah_nuroniyyah: null,
    perbaikan_bacaan: null,
  };
  for (const src of kaldikSources) {
    try {
      const csv = await fetchCsv(src.spreadsheet_id, src.gid ?? '0');
      const rows = parseKaldikTab(csv);
      kaldikRows += rows.length;
      const starts = startDatesByLevel(rows);
      startByLevel = {
        qoidah_nuroniyyah: starts.qoidah_nuroniyyah ?? startByLevel.qoidah_nuroniyyah,
        perbaikan_bacaan: starts.perbaikan_bacaan ?? startByLevel.perbaikan_bacaan,
      };
      if (rows.length) {
        await supabaseAdmin.from('hits_kaldik_hari').upsert(
          rows.map((r) => ({
            batch_id: batchId,
            level: r.level,
            tanggal: r.tanggal,
            hari: r.hari,
            pekan: r.pekan,
            is_libur: r.is_libur,
            libur_note: r.libur_note,
            source: 'sheet' as const,
          })),
          { onConflict: 'batch_id,level,tanggal' }
        );
      }
      await stampSource(src.id, 'ok');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`kaldik: ${msg}`);
      await stampSource(src.id, msg);
    }
  }

  // Update batch.start_date dari tanggal paling awal antar level.
  const earliest = [startByLevel.qoidah_nuroniyyah, startByLevel.perbaikan_bacaan]
    .filter(Boolean)
    .sort()[0];
  if (earliest) {
    await supabaseAdmin.from('hits_batch').update({ start_date: earliest }).eq('id', batchId);
  }

  // 1b) Auto-discover tab presensi baru dari sheet.
  // Fix "halaqah baru selalu miss": enumerasi manual (enumeratePresensiTabs)
  // hanya jalan sekali; tab yang ditambah ke sheet setelahnya tak pernah punya
  // baris hits_sheet_source → sync melewatkannya selamanya. Di sini kita
  // re-enumerate tiap sync dan daftarkan gid yang belum ada.
  if (presensiSources.length > 0) {
    const gidsBySpreadsheet = new Map<string, Set<string>>();
    for (const s of presensiSources) {
      if (!s.spreadsheet_id) continue;
      const set = gidsBySpreadsheet.get(s.spreadsheet_id) ?? new Set<string>();
      if (s.gid) set.add(s.gid);
      gidsBySpreadsheet.set(s.spreadsheet_id, set);
    }
    const newRows: {
      batch_id: string;
      kind: 'presensi';
      spreadsheet_id: string;
      gid: string;
      label: string;
    }[] = [];
    for (const [spreadsheetId, gids] of gidsBySpreadsheet) {
      const tabs = await enumerateTabs(spreadsheetId);
      for (const t of newTabsToRegister(tabs, gids)) {
        newRows.push({ batch_id: batchId, kind: 'presensi', spreadsheet_id: spreadsheetId, gid: t.gid, label: t.name });
      }
    }
    if (newRows.length > 0) {
      const { error } = await supabaseAdmin.from('hits_sheet_source').insert(newRows);
      if (error) {
        errors.push(`auto-discover tab: ${error.message}`);
      } else {
        // Re-fetch supaya tab baru (dengan id) ikut diproses run ini.
        const { data: refreshed } = await supabaseAdmin
          .from('hits_sheet_source')
          .select('*')
          .eq('batch_id', batchId)
          .eq('active', true);
        presensiSources = (refreshed ?? []).filter((s) => s.kind === 'presensi');
      }
    }
  }

  // 2) Presensi — kumpulkan nama halaqah yang terlihat untuk rekonsiliasi.
  const seenHalaqah = new Set<string>();
  for (const src of presensiSources) {
    try {
      const csv = await fetchCsv(src.spreadsheet_id, src.gid ?? '0');
      const parsed = parsePresensiTab(csv);
      if (!parsed) {
        errors.push(`presensi gid=${src.gid}: header tak ditemukan`);
        await stampSource(src.id, 'header tak ditemukan');
        continue;
      }
      seenHalaqah.add(parsed.name);
      const hid = await upsertHalaqah(batchId, src.gid ?? null, parsed, startByLevel);
      halaqah++;
      const np = await upsertPeserta(hid, parsed.peserta);
      peserta += np;
      await stampSource(src.id, 'ok');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`presensi gid=${src.gid}: ${msg}`);
      await stampSource(src.id, msg);
    }
  }

  // 3) Rekonsiliasi halaqah sheet-sourced yang hilang dari sheet.
  if (presensiSources.length > 0) {
    const { data: sheetHalaqah } = await supabaseAdmin
      .from('hits_halaqah')
      .select('id, name')
      .eq('batch_id', batchId)
      .eq('source', 'sheet');
    for (const h of sheetHalaqah ?? []) {
      const shouldBeActive = seenHalaqah.has(h.name);
      await supabaseAdmin.from('hits_halaqah').update({ active: shouldBeActive }).eq('id', h.id);
    }
  }

  return { ok: errors.length === 0, kaldikRows, halaqah, peserta, errors };
}

async function stampSource(id: string, status: string) {
  await supabaseAdmin
    .from('hits_sheet_source')
    .update({ last_synced_at: new Date().toISOString(), last_sync_status: status })
    .eq('id', id);
}

async function upsertHalaqah(
  batchId: string,
  gid: string | null,
  parsed: NonNullable<ReturnType<typeof parsePresensiTab>>,
  startByLevel: Record<HitsLevel, string | null>
): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, level')
    .eq('batch_id', batchId)
    .eq('name', parsed.name)
    .maybeSingle();

  // Kolom dari sheet (boleh ditimpa). Kolom curated (level, pengajar_*) TIDAK.
  const sheetCols: Record<string, unknown> = {
    sheet_gid: gid,
    jadwal_raw: parsed.jadwal_raw,
    jadwal_hari: parsed.jadwal_hari,
    waktu_mulai: parsed.waktu_mulai,
    waktu_selesai: parsed.waktu_selesai,
    gender: parsed.gender,
    pengajar_nama_sheet: parsed.pengajar_nama_sheet,
    active: true,
  };

  // Guard: jangan timpa jadwal existing dengan kosong. Sebagian halaqah punya sel
  // jadwal kosong di sheet → jadwal diisi manual (koordinator). Sync berikutnya
  // TIDAK boleh menghapusnya. Hanya lewati kolom jadwal saat parse kosong.
  const jadwalKosong = !parsed.jadwal_hari || parsed.jadwal_hari.length === 0;
  if (jadwalKosong) {
    delete sheetCols.jadwal_hari;
    delete sheetCols.jadwal_raw;
    delete sheetCols.waktu_mulai;
    delete sheetCols.waktu_selesai;
  }

  if (existing) {
    await supabaseAdmin.from('hits_halaqah').update(sheetCols).eq('id', existing.id);
    return existing.id;
  }

  // Default-guess level dari tanggal sesi pertama (best-effort).
  const level = guessLevel(
    null, // tanpa derive penuh; koordinator akan tag saat validasi
    startByLevel.qoidah_nuroniyyah,
    startByLevel.perbaikan_bacaan
  );
  const { data: inserted } = await supabaseAdmin
    .from('hits_halaqah')
    .insert({ batch_id: batchId, name: parsed.name, level, source: 'sheet', ...sheetCols })
    .select('id')
    .single();
  return inserted!.id;
}

async function upsertPeserta(
  halaqahId: string,
  peserta: NonNullable<ReturnType<typeof parsePresensiTab>>['peserta']
): Promise<number> {
  const seen = new Set<string>();
  for (const p of peserta) {
    if (!p.murid_id) continue; // baris tanpa MURID_ID dilewati (tak punya stable key)
    seen.add(p.murid_id);
    const { data: existing } = await supabaseAdmin
      .from('hits_halaqah_peserta')
      .select('id')
      .eq('halaqah_id', halaqahId)
      .eq('murid_id', p.murid_id)
      .maybeSingle();
    const sheetCols = {
      nama: p.nama,
      jenis_kelamin: p.jenis_kelamin,
      status_peserta: p.status_peserta,
      active: true,
    };
    if (existing) {
      await supabaseAdmin.from('hits_halaqah_peserta').update(sheetCols).eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('hits_halaqah_peserta')
        .insert({ halaqah_id: halaqahId, murid_id: p.murid_id, source: 'sheet', ...sheetCols });
    }
  }

  // Rekonsiliasi peserta sheet-sourced yang hilang.
  const { data: sheetPeserta } = await supabaseAdmin
    .from('hits_halaqah_peserta')
    .select('id, murid_id')
    .eq('halaqah_id', halaqahId)
    .eq('source', 'sheet');
  for (const sp of sheetPeserta ?? []) {
    const active = sp.murid_id ? seen.has(sp.murid_id) : true;
    await supabaseAdmin.from('hits_halaqah_peserta').update({ active }).eq('id', sp.id);
  }

  return seen.size;
}

/**
 * Coba resolusi pengajar_id dari WA yang diinput koordinator untuk halaqah.
 * Dipanggil dari action validasi. Mengembalikan {linked, pengajarId}.
 */
export async function linkPengajarByWa(
  halaqahId: string,
  waInput: string
): Promise<{ linked: boolean; pengajarId: string | null; wa: string }> {
  const wa = normalizeWhatsApp(waInput);
  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('id')
    .eq('whatsapp_number', wa)
    .eq('active', true)
    .maybeSingle();
  await supabaseAdmin
    .from('hits_halaqah')
    .update({ pengajar_wa: wa, pengajar_id: pengajar?.id ?? null })
    .eq('id', halaqahId);
  return { linked: !!pengajar, pengajarId: pengajar?.id ?? null, wa };
}
