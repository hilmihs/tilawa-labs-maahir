// Loader bersama untuk subsistem ketua kelas HITS: ambil halaqah + derivasi
// pertemuan (dengan override koordinator). Dipakai page /hits/ketua & action.

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  deriveHalaqahProgram,
  programKaldikLevels,
  type DerivedPertemuan,
  type KaldikHariLite,
  type PertemuanOverride,
} from '@/lib/hits-pertemuan';
import type { HitsLevel } from '@/types/db';

export type HalaqahLite = {
  id: string;
  batch_id: string;
  level: string | null;
  program: string;
  name: string;
  jadwal_raw: string | null;
  jadwal_hari: string[];
  pengajar_nama_sheet: string | null;
  pengajar_id: string | null;
  /** Nama pengajar otoritatif dari record pengajar (via pengajar_id), sama sumber Matrix. */
  pengajar_name: string | null;
  pengajar_wa: string | null;
  start_date: string | null;
};

export type HalaqahPertemuan = {
  halaqah: HalaqahLite;
  derived: DerivedPertemuan[];
};

/**
 * Otorisasi ketua kelas terhadap halaqah target (dukung ketua multi-halaqah via
 * switcher `?h=`). Verifikasi WA session aktif sebagai ketua halaqah tsb, lalu
 * kembalikan halaqahId final + ketua_kelas_id yang cocok utk halaqah itu (untuk
 * diisi_by_id / requested_by). Bila requestedHalaqahId kosong → pakai
 * session.hits_halaqah_id (default). Return null bila tidak berwenang.
 *
 * Tanpa ini, action memakai session.hits_halaqah_id (halaqah default) meski
 * ketua sedang mengisi halaqah lain lewat switcher → pertemuan tak ketemu di
 * kaldik halaqah default ("Pertemuan tidak ada di kaldik halaqah ini") atau,
 * lebih buruk, data tersimpan ke halaqah yang salah.
 */
export async function resolveKetuaHalaqah(
  session: { ketua_kelas_id: string; hits_halaqah_id?: string | null },
  requestedHalaqahId?: string | null
): Promise<{ halaqahId: string; ketuaKelasId: string } | null> {
  const target =
    requestedHalaqahId && /^[0-9a-f-]{36}$/.test(requestedHalaqahId)
      ? requestedHalaqahId
      : session.hits_halaqah_id;
  if (!target) return null;

  const { data: self } = await supabaseAdmin
    .from('ketua_kelas')
    .select('whatsapp_number')
    .eq('id', session.ketua_kelas_id)
    .maybeSingle();
  const wa = self?.whatsapp_number ?? null;
  if (!wa) {
    // Tanpa WA tak bisa cek peran ganda → hanya izinkan halaqah default session.
    return target === session.hits_halaqah_id
      ? { halaqahId: target, ketuaKelasId: session.ketua_kelas_id }
      : null;
  }
  const { data: row } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id')
    .eq('whatsapp_number', wa)
    .eq('active', true)
    .eq('hits_halaqah_id', target)
    .limit(1)
    .maybeSingle();
  if (!row) return null;
  return { halaqahId: target, ketuaKelasId: row.id as string };
}

/** Ambil halaqah + daftar pertemuan terderivasi (override-aware). */
export async function loadHalaqahPertemuan(
  halaqahId: string
): Promise<HalaqahPertemuan | null> {
  const { data: halaqahRow } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, batch_id, level, program, name, jadwal_raw, jadwal_hari, pengajar_id, pengajar_nama_sheet, start_date')
    .eq('id', halaqahId)
    .maybeSingle();
  if (!halaqahRow) return null;

  // Resolve pengajar via record (via pengajar_id) → nama + WA otoritatif, sama sumber
  // dengan Matrix Skill Guru. pengajar_nama_sheet (free-text) fallback bila belum ter-link.
  let pengajar_name: string | null = null;
  let pengajar_wa: string | null = null;
  if (halaqahRow.pengajar_id) {
    const { data: pg } = await supabaseAdmin
      .from('pengajar')
      .select('name, whatsapp_number')
      .eq('id', halaqahRow.pengajar_id)
      .maybeSingle();
    pengajar_name = pg?.name ?? null;
    pengajar_wa = pg?.whatsapp_number ?? null;
  }
  const halaqah = { ...halaqahRow, pengajar_name, pengajar_wa };

  const kaldikLevels = programKaldikLevels(halaqah.program);
  const [{ data: kaldikList }, { data: overrideList }] = await Promise.all([
    supabaseAdmin
      .from('hits_kaldik_hari')
      .select('level, tanggal, pekan, is_libur')
      .eq('batch_id', halaqah.batch_id)
      .in('level', kaldikLevels),
    supabaseAdmin
      .from('hits_kaldik_pertemuan')
      .select('level, pertemuan_no, tanggal, pekan, is_skipped')
      .eq('halaqah_id', halaqahId),
  ]);

  const kaldikByLevel = new Map<HitsLevel, KaldikHariLite[]>();
  for (const r of kaldikList ?? []) {
    const lv = r.level as HitsLevel;
    const arr = kaldikByLevel.get(lv) ?? [];
    arr.push({ tanggal: r.tanggal, pekan: r.pekan, is_libur: r.is_libur });
    kaldikByLevel.set(lv, arr);
  }
  const overridesByLevel = new Map<HitsLevel, PertemuanOverride[]>();
  for (const o of overrideList ?? []) {
    const lv = o.level as HitsLevel;
    const arr = overridesByLevel.get(lv) ?? [];
    arr.push({ pertemuan_no: o.pertemuan_no, tanggal: o.tanggal, pekan: o.pekan, is_skipped: o.is_skipped });
    overridesByLevel.set(lv, arr);
  }

  const derived: DerivedPertemuan[] = deriveHalaqahProgram(
    halaqah.program,
    halaqah.jadwal_hari ?? [],
    kaldikByLevel,
    overridesByLevel,
    halaqah.start_date
  );

  return { halaqah: halaqah as HalaqahLite, derived };
}
