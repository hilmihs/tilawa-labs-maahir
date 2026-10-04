// Cakupan observasi ketua kelas per pengajar — dipakai dashboard koordinator
// HITS untuk melihat pertemuan mana pada periode terpilih yang SUDAH punya
// hasil observasi ketua kelas dan mana yang belum.
//
// Kenapa perlu: badge pelanggaran (TL/KMT/KBLA/JKG) hanya bermakna kalau
// pertemuannya memang sudah diobservasi. Baris hasil pra-generate impor
// 2026-06-21 membawa nilai bawaan latihan_diberikan=false sehingga dulu tampak
// seperti pelanggaran padahal ketua kelas belum mengisi apa pun.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchInChunks } from '@/lib/hits-rekap';
import {
  deriveHalaqahProgram,
  PROGRAM_STAGES,
  programKaldikLevels,
  type KaldikHariLite,
  type PertemuanOverride,
} from '@/lib/hits-pertemuan';
import { ROLE_PRAGENERATE, todayJakartaISO } from '@/lib/hits-observasi';
import { lolosScope, type HalaqahScope } from '@/lib/hits-halaqah-scope';
import type { Gender, HitsLevel } from '@/types/db';

export type StatusObservasi =
  /** Ketua kelas sudah submit keterangan untuk pertemuan ini. */
  | 'sudah'
  /** Belum ada baris sama sekali. */
  | 'belum'
  /** Ada baris, tapi masih nilai bawaan pra-generate/impor (bukan observasi). */
  | 'pragenerate';

export type PertemuanObservasi = {
  tanggal: string; // YYYY-MM-DD
  halaqahId: string;
  halaqahName: string;
  pertemuanNo: number | null;
  status: StatusObservasi;
  /** Diisi ketua sebagai LIBUR — tetap terhitung sudah diobservasi. */
  libur: boolean;
};

export type CakupanPengajar = {
  pengajarId: string;
  pertemuan: PertemuanObservasi[]; // urut tanggal
  sudah: number;
  belum: number; // termasuk pragenerate
  total: number;
  persen: number | null; // sudah/total
};

/**
 * Cakupan observasi per pengajar untuk rentang [start, end).
 * Hanya menghitung pertemuan yang tanggalnya sudah tiba (≤ hari ini) — yang
 * belum terjadi bukan tunggakan ketua kelas.
 */
export async function getCakupanObservasi(opts: {
  start: string;
  end: string;
} & HalaqahScope): Promise<Map<string, CakupanPengajar>> {
  const { start, end, gender } = opts;
  const today = todayJakartaISO();

  let hq = supabaseAdmin
    .from('hits_halaqah')
    .select('id, batch_id, name, program, jadwal_hari, jadwal_raw, start_date, pengajar_id')
    .eq('active', true)
    .not('pengajar_id', 'is', null);
  if (gender) hq = hq.eq('gender', gender);
  const { data: halaqahList } = await hq;
  const halaqah = ((halaqahList ?? []) as Array<{
    id: string;
    batch_id: string;
    name: string;
    program: string;
    jadwal_hari: string[] | null;
    jadwal_raw: string | null;
    start_date: string | null;
    pengajar_id: string;
  }>).filter((h) => lolosScope(h, opts));
  if (!halaqah.length) return new Map();

  const halaqahIds = halaqah.map((h) => h.id);
  const batchIds = [...new Set(halaqah.map((h) => h.batch_id))];

  const [{ data: kaldikList }, ketList, overrideList] = await Promise.all([
    supabaseAdmin
      .from('hits_kaldik_hari')
      .select('batch_id, level, tanggal, pekan, is_libur')
      .in('batch_id', batchIds),
    fetchInChunks<{
      halaqah_id: string;
      tanggal: string;
      pertemuan_no: number | null;
      kondisi: string | null;
      diisi_by_role: string | null;
      created_at: string | null;
    }>(halaqahIds, (ids) =>
      supabaseAdmin
        .from('hits_keterangan_harian')
        .select('halaqah_id, tanggal, pertemuan_no, kondisi, diisi_by_role, created_at')
        .in('halaqah_id', ids)
        .gte('tanggal', start)
        .lt('tanggal', end)
    ),
    fetchInChunks<{
      halaqah_id: string;
      level: HitsLevel;
      pertemuan_no: number;
      tanggal: string;
      pekan: number | null;
      is_skipped: boolean;
    }>(halaqahIds, (ids) =>
      supabaseAdmin
        .from('hits_kaldik_pertemuan')
        .select('halaqah_id, level, pertemuan_no, tanggal, pekan, is_skipped')
        .in('halaqah_id', ids)
    ),
  ]);

  const kaldikByBL = new Map<string, KaldikHariLite[]>();
  for (const r of kaldikList ?? []) {
    const key = `${r.batch_id}|${r.level}`;
    const arr = kaldikByBL.get(key) ?? [];
    arr.push({ tanggal: r.tanggal, pekan: r.pekan, is_libur: r.is_libur });
    kaldikByBL.set(key, arr);
  }

  const overridesByHL = new Map<string, PertemuanOverride[]>();
  for (const o of overrideList ?? []) {
    const key = `${o.halaqah_id}|${o.level}`;
    const arr = overridesByHL.get(key) ?? [];
    arr.push({ pertemuan_no: o.pertemuan_no, tanggal: o.tanggal, pekan: o.pekan, is_skipped: o.is_skipped });
    overridesByHL.set(key, arr);
  }

  // Keterangan per (halaqah|tanggal) — sumber status observasi.
  const ketByKey = new Map<string, (typeof ketList)[number]>();
  for (const k of ketList ?? []) ketByKey.set(`${k.halaqah_id}|${k.tanggal}`, k);

  const out = new Map<string, CakupanPengajar>();
  for (const h of halaqah) {
    const kaldikByLevel = new Map<HitsLevel, KaldikHariLite[]>();
    for (const lv of programKaldikLevels(h.program)) {
      kaldikByLevel.set(lv, kaldikByBL.get(`${h.batch_id}|${lv}`) ?? []);
    }
    const ovByLevel = new Map<HitsLevel, PertemuanOverride[]>();
    for (const lv of PROGRAM_STAGES[h.program] ?? PROGRAM_STAGES.dasar) {
      ovByLevel.set(lv, overridesByHL.get(`${h.id}|${lv}`) ?? []);
    }
    const derived = deriveHalaqahProgram(
      h.program,
      h.jadwal_hari ?? [],
      kaldikByLevel,
      ovByLevel,
      h.start_date
    );

    // Hanya pertemuan dalam rentang DAN yang tanggalnya sudah tiba.
    const dalamRentang = derived.filter(
      (d) => d.tanggal >= start && d.tanggal < end && d.tanggal <= today
    );

    let agg = out.get(h.pengajar_id);
    if (!agg) {
      agg = { pengajarId: h.pengajar_id, pertemuan: [], sudah: 0, belum: 0, total: 0, persen: null };
      out.set(h.pengajar_id, agg);
    }

    for (const d of dalamRentang) {
      const k = ketByKey.get(`${h.id}|${d.tanggal}`);
      const status: StatusObservasi = !k
        ? 'belum'
        : k.diisi_by_role === ROLE_PRAGENERATE
          ? 'pragenerate'
          : 'sudah';
      agg.pertemuan.push({
        tanggal: d.tanggal,
        halaqahId: h.id,
        halaqahName: h.name,
        pertemuanNo: k?.pertemuan_no ?? d.pertemuan_no ?? null,
        status,
        libur: k?.kondisi === 'LIBUR',
      });
      agg.total += 1;
      if (status === 'sudah') agg.sudah += 1;
      else agg.belum += 1;
    }
  }

  for (const agg of out.values()) {
    agg.pertemuan.sort((a, b) =>
      a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.halaqahName.localeCompare(b.halaqahName)
    );
    agg.persen = agg.total > 0 ? Math.round((agg.sudah / agg.total) * 100) : null;
  }
  return out;
}
