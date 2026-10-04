// Loader monitoring observasi HARIAN untuk koordinator ketua kelas, di atas
// sistem hits_* (menggantikan kelas_hits/observasi_kelas legacy).
//
// "Hari ini" = halaqah yang punya pertemuan terderivasi (kaldik + jadwal +
// override) jatuh pada tanggal hari ini. Padanan observasi_kelas(today) lama.

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  deriveHalaqahProgram,
  PROGRAM_STAGES,
  programKaldikLevels,
  type KaldikHariLite,
  type PertemuanOverride,
} from '@/lib/hits-pertemuan';
import type { Gender, HitsKondisi, HitsStatusLatihan, HitsLevel } from '@/types/db';

// Tanggal sistem observasi HITS mulai efektif (gating reminder/fitur).
export const OBSERVASI_EFEKTIF = '2026-06-22';

export type HalaqahHariIni = {
  halaqah_id: string;
  halaqah_name: string;
  pertemuan_no: number;
  tanggal: string;
  pengajar_id: string | null;
  pengajar_name: string | null;
  pengajar_wa: string | null;
  jadwal_hari: string[];
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  ketua: { id: string; name: string; whatsapp_number: string } | null;
  keterangan: {
    id: string;
    kondisi: HitsKondisi;
    terlambat: boolean;
    latihan_diberikan: boolean | null;
    status_latihan: HitsStatusLatihan | null;
    semua_selesai: boolean | null;
    catatan: string | null;
  } | null;
};

export type HitsHarian = {
  rows: HalaqahHariIni[];
  kaldikMissing: boolean; // true bila tak ada kaldik sama sekali (derivasi mustahil)
};

export async function getHitsHarian(today: string, gender: Gender): Promise<HitsHarian> {
  const { data: halaqahRows } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, batch_id, level, program, name, jadwal_hari, waktu_mulai, waktu_selesai, pengajar_id, pengajar_wa')
    .eq('active', true)
    .eq('gender', gender);
  const halaqah = halaqahRows ?? [];
  if (halaqah.length === 0) return { rows: [], kaldikMissing: false };

  const batchIds = [...new Set(halaqah.map((h) => h.batch_id))];
  const halaqahIds = halaqah.map((h) => h.id);

  const [{ data: kaldikList }, { data: overrideList }] = await Promise.all([
    supabaseAdmin
      .from('hits_kaldik_hari')
      .select('batch_id, level, tanggal, pekan, is_libur')
      .in('batch_id', batchIds),
    supabaseAdmin
      .from('hits_kaldik_pertemuan')
      .select('halaqah_id, level, pertemuan_no, tanggal, pekan, is_skipped')
      .in('halaqah_id', halaqahIds),
  ]);

  // kaldik per (batch, level) + override per (halaqah, level).
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

  // Tentukan halaqah yang punya pertemuan hari ini (lintas tahap).
  const scheduled: { halaqah: (typeof halaqah)[number]; pertemuan_no: number; level: HitsLevel }[] = [];
  for (const h of halaqah) {
    const kaldikByLevel = new Map<HitsLevel, KaldikHariLite[]>();
    for (const lv of programKaldikLevels(h.program)) kaldikByLevel.set(lv, kaldikByBL.get(`${h.batch_id}|${lv}`) ?? []);
    const ovByLevel = new Map<HitsLevel, PertemuanOverride[]>();
    for (const lv of PROGRAM_STAGES[h.program] ?? PROGRAM_STAGES.dasar) ovByLevel.set(lv, overridesByHL.get(`${h.id}|${lv}`) ?? []);
    const derived = deriveHalaqahProgram(h.program, h.jadwal_hari ?? [], kaldikByLevel, ovByLevel);
    const todayPert = derived.find((d) => d.tanggal === today);
    if (todayPert) scheduled.push({ halaqah: h, pertemuan_no: todayPert.pertemuan_no, level: todayPert.level as HitsLevel });
  }

  if (scheduled.length === 0) {
    return { rows: [], kaldikMissing: (kaldikList ?? []).length === 0 };
  }

  const schedIds = scheduled.map((s) => s.halaqah.id);
  const pengajarIds = [...new Set(scheduled.map((s) => s.halaqah.pengajar_id).filter(Boolean))] as string[];

  const [{ data: ketRows }, { data: ketuaRows }, { data: pengajarRows }] = await Promise.all([
    supabaseAdmin
      .from('hits_keterangan_harian')
      .select('id, halaqah_id, pertemuan_no, kondisi, terlambat, latihan_diberikan, status_latihan, semua_selesai, catatan')
      .in('halaqah_id', schedIds)
      .eq('tanggal', today),
    supabaseAdmin
      .from('ketua_kelas')
      .select('id, name, whatsapp_number, hits_halaqah_id')
      .in('hits_halaqah_id', schedIds)
      .eq('active', true),
    pengajarIds.length
      ? supabaseAdmin.from('pengajar').select('id, name, whatsapp_number').in('id', pengajarIds)
      : Promise.resolve({ data: [] as { id: string; name: string; whatsapp_number: string }[] }),
  ]);

  type KetRow = {
    id: string; halaqah_id: string; pertemuan_no: number; kondisi: string;
    terlambat: boolean; latihan_diberikan: boolean | null;
    status_latihan: string | null; semua_selesai: boolean | null; catatan: string | null;
  };
  const ketByHalaqah = new Map<string, KetRow>();
  for (const k of (ketRows ?? []) as KetRow[]) ketByHalaqah.set(k.halaqah_id, k);
  const ketuaByHalaqah = new Map<string, { id: string; name: string; whatsapp_number: string }>();
  for (const k of ketuaRows ?? []) {
    if (k.hits_halaqah_id) ketuaByHalaqah.set(k.hits_halaqah_id, { id: k.id, name: k.name, whatsapp_number: k.whatsapp_number });
  }
  const pengajarById = new Map((pengajarRows ?? []).map((p) => [p.id, { name: p.name, wa: p.whatsapp_number }]));

  const rows: HalaqahHariIni[] = scheduled.map(({ halaqah: h, pertemuan_no }) => {
    const ket = ketByHalaqah.get(h.id);
    const peng = h.pengajar_id ? pengajarById.get(h.pengajar_id) : undefined;
    return {
      halaqah_id: h.id,
      halaqah_name: h.name,
      pertemuan_no,
      tanggal: today,
      pengajar_id: h.pengajar_id,
      pengajar_name: peng?.name ?? null,
      pengajar_wa: peng?.wa ?? h.pengajar_wa ?? null,
      jadwal_hari: (h.jadwal_hari as string[]) ?? [],
      waktu_mulai: h.waktu_mulai ?? null,
      waktu_selesai: h.waktu_selesai ?? null,
      ketua: ketuaByHalaqah.get(h.id) ?? null,
      keterangan: ket
        ? {
            id: ket.id,
            kondisi: ket.kondisi as HitsKondisi,
            terlambat: ket.terlambat,
            latihan_diberikan: ket.latihan_diberikan,
            status_latihan: ket.status_latihan as HitsStatusLatihan | null,
            semua_selesai: ket.semua_selesai,
            catatan: ket.catatan,
          }
        : null,
    };
  });

  return { rows, kaldikMissing: false };
}
