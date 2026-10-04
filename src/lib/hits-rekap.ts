// Data dashboard koordinator ketua kelas HITS: agregasi keterangan harian
// per halaqah dalam satu bulan + ekspektasi pertemuan dari kaldik.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeHutangForHalaqahList } from '@/lib/hits-hutang';
import { deriveHalaqahProgram, PROGRAM_STAGES, programKaldikLevels, type KaldikHariLite, type PertemuanOverride } from '@/lib/hits-pertemuan';
import { todayJakarta } from '@/lib/maahir-presensi';
import {
  isKeteranganDinilai,
  todayJakartaISO,
  KETERANGAN_NILAI_COLS,
  type KeteranganNilaiFields,
} from '@/lib/hits-observasi';
import { berasalDariIzin } from '@/lib/shakwa-izin';
import type { Gender, HitsKondisi, HitsLevel } from '@/types/db';

export type HitsRekapRow = {
  halaqahId: string;
  batchId: string;
  batchName: string;
  level: HitsLevel | null;
  halaqahName: string;
  gender: Gender | null;
  jadwalRaw: string | null;
  pengajarNama: string | null;
  pengajarLinked: boolean; // pengajar_id ter-resolve (masuk matrix)
  ketuaNama: string | null;
  ketuaKelasId: string | null;
  ketuaWa: string | null;
  ketuaLoggedIn: boolean; // ketua sudah pernah login (last_login_at terisi)
  terisi: number; // pertemuan yang sudah diisi bulan ini
  expected: number; // pertemuan yang diharapkan s/d hari ini (dari kaldik)
  belumDiisi: number;
  kbbs: number;
  nonLibur: number;
  pctKbbs: number | null; // kedisiplinan
  latihanDone: number;
  pctLatihan: number | null; // tanggung jawab
  terlambat: number;
  kondisiCount: Record<HitsKondisi, number>;
  hutangSaldo: number; // total menit hutang belum terbayar (F2)
};

export type HitsBatchOption = { id: string; name: string };

/**
 * Jalankan query ber-`.in(col, ids)` dalam potongan kecil lalu gabung hasilnya.
 * Hindari (a) URL "414 Too Long" saat ids banyak (mis. 434 halaqah → ~16KB URL
 * gagal di gateway → data null → dashboard kosong) dan (b) cap default 1000 baris
 * PostgREST (potongan kecil → baris per-request jauh di bawah 1000).
 */
export async function fetchInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>,
  size = 80
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data } = await run(ids.slice(i, i + size));
    if (data) out.push(...data);
  }
  return out;
}

function monthBounds(month: string): { start: string; nextMonth: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const nextMonth =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, nextMonth };
}

export async function getHitsBatches(): Promise<HitsBatchOption[]> {
  const { data } = await supabaseAdmin
    .from('hits_batch')
    .select('id, name')
    .eq('active', true)
    .order('start_date', { ascending: false });
  return data ?? [];
}

export async function getHitsRekap(
  month: string,
  opts?: { batchId?: string; gender?: Gender; halaqahId?: string }
): Promise<HitsRekapRow[]> {
  const { start, nextMonth } = monthBounds(month);
  const today = todayJakarta();

  let hq = supabaseAdmin
    .from('hits_halaqah')
    .select(
      'id, batch_id, level, program, name, gender, jadwal_raw, jadwal_hari, pengajar_nama_sheet, pengajar_id, start_date'
    )
    .eq('active', true);
  if (opts?.halaqahId) hq = hq.eq('id', opts.halaqahId);
  if (opts?.batchId) hq = hq.eq('batch_id', opts.batchId);
  if (opts?.gender) hq = hq.eq('gender', opts.gender);
  const { data: halaqahList } = await hq;
  const halaqah = halaqahList ?? [];
  if (!halaqah.length) return [];

  const halaqahIds = halaqah.map((h) => h.id);
  const batchIds = [...new Set(halaqah.map((h) => h.batch_id))];

  // Query anak ber-.in(halaqahIds) DICHUNK — daftar ratusan id bisa bikin URL
  // gateway 414 (→ data null → ketua/keterangan kosong semua) atau kena cap 1000 baris.
  const [{ data: batchList }, { data: kaldikList }, ketList, ketuaList, overrideList] =
    await Promise.all([
      supabaseAdmin.from('hits_batch').select('id, name').in('id', batchIds),
      supabaseAdmin
        .from('hits_kaldik_hari')
        .select('batch_id, level, tanggal, pekan, is_libur')
        .in('batch_id', batchIds),
      fetchInChunks(halaqahIds, (ids) =>
        supabaseAdmin
          .from('hits_keterangan_harian')
          .select('halaqah_id, pertemuan_no, tanggal, kondisi, terlambat, latihan_diberikan, semua_selesai, status_latihan')
          .in('halaqah_id', ids)
          .gte('tanggal', start)
          .lt('tanggal', nextMonth)
      ),
      // Sumber tunggal ketua = tabel ketua_kelas (dipakai login/auth). Mencakup
      // ketua jalur manual yang tak ter-flag di hits_halaqah_peserta.
      fetchInChunks(halaqahIds, (ids) =>
        supabaseAdmin
          .from('ketua_kelas')
          .select('id, name, whatsapp_number, hits_halaqah_id, last_login_at')
          .in('hits_halaqah_id', ids)
          .eq('active', true)
      ),
      fetchInChunks(halaqahIds, (ids) =>
        supabaseAdmin
          .from('hits_kaldik_pertemuan')
          .select('halaqah_id, level, pertemuan_no, tanggal, pekan, is_skipped')
          .in('halaqah_id', ids)
      ),
    ]);

  const batchName = new Map((batchList ?? []).map((b) => [b.id, b.name]));
  // Bila satu halaqah punya >1 ketua aktif, prioritaskan yang sudah login.
  const ketuaByHalaqah = new Map<
    string,
    { id: string; nama: string; wa: string | null; loggedIn: boolean }
  >();
  for (const k of ketuaList ?? []) {
    if (!k.hits_halaqah_id) continue;
    const cur = ketuaByHalaqah.get(k.hits_halaqah_id);
    const loggedIn = !!k.last_login_at;
    if (!cur || (loggedIn && !cur.loggedIn)) {
      ketuaByHalaqah.set(k.hits_halaqah_id, {
        id: k.id,
        nama: k.name,
        wa: k.whatsapp_number,
        loggedIn,
      });
    }
  }

  const overridesByHL = new Map<string, PertemuanOverride[]>();
  for (const o of overrideList ?? []) {
    const key = `${o.halaqah_id}|${o.level}`;
    const arr = overridesByHL.get(key) ?? [];
    arr.push({ pertemuan_no: o.pertemuan_no, tanggal: o.tanggal, pekan: o.pekan, is_skipped: o.is_skipped });
    overridesByHL.set(key, arr);
  }

  // kaldik per (batch|level)
  const kaldikByBL = new Map<string, KaldikHariLite[]>();
  for (const r of kaldikList ?? []) {
    const key = `${r.batch_id}|${r.level}`;
    const arr = kaldikByBL.get(key) ?? [];
    arr.push({ tanggal: r.tanggal, pekan: r.pekan, is_libur: r.is_libur });
    kaldikByBL.set(key, arr);
  }

  const ketByHalaqah = new Map<string, typeof ketList>();
  for (const k of ketList ?? []) {
    const arr = ketByHalaqah.get(k.halaqah_id) ?? [];
    arr.push(k);
    ketByHalaqah.set(k.halaqah_id, arr);
  }

  const emptyKondisi = (): Record<HitsKondisi, number> => ({
    KBBS: 0, KMT: 0, JKG: 0, KBLA: 0, LIBUR: 0,
  });

  const rows: HitsRekapRow[] = halaqah.map((h) => {
    const kets = ketByHalaqah.get(h.id) ?? [];
    const kondisiCount = emptyKondisi();
    let kbbs = 0;
    let nonLibur = 0;
    let latihanDone = 0;
    let latihanDinilai = 0;
    let terlambat = 0;
    for (const k of kets) {
      kondisiCount[k.kondisi as HitsKondisi] += 1;
      if (k.kondisi !== 'LIBUR') nonLibur += 1;
      if (k.kondisi === 'KBBS') kbbs += 1;
      if (k.terlambat) terlambat += 1;
      // Rumus sama dgn matrix-compute.ts (tanggung jawab): PTML = tugas sudah
      // diberikan, pesertanya yang belum mengerjakan → pertemuan tak dinilai.
      if (k.kondisi !== 'LIBUR' && k.status_latihan !== 'PTML') {
        latihanDinilai += 1;
        if (k.latihan_diberikan && (k.semua_selesai || k.status_latihan === 'SML')) latihanDone += 1;
      }
    }

    // Ekspektasi pertemuan s/d hari ini (lintas tahap, dari kaldik + jadwal).
    const kaldikByLevel = new Map<HitsLevel, KaldikHariLite[]>();
    for (const lv of programKaldikLevels(h.program)) kaldikByLevel.set(lv, kaldikByBL.get(`${h.batch_id}|${lv}`) ?? []);
    const ovByLevel = new Map<HitsLevel, PertemuanOverride[]>();
    for (const lv of PROGRAM_STAGES[h.program] ?? PROGRAM_STAGES.dasar) ovByLevel.set(lv, overridesByHL.get(`${h.id}|${lv}`) ?? []);
    const derived = deriveHalaqahProgram(h.program, h.jadwal_hari ?? [], kaldikByLevel, ovByLevel, h.start_date);
    const expected = derived.filter((d) => d.tanggal >= start && d.tanggal < nextMonth && d.tanggal <= today).length;
    const terisi = kets.length;

    return {
      halaqahId: h.id,
      batchId: h.batch_id,
      batchName: batchName.get(h.batch_id) ?? '—',
      level: (h.level as HitsLevel) ?? null,
      halaqahName: h.name,
      gender: (h.gender as Gender) ?? null,
      jadwalRaw: h.jadwal_raw,
      pengajarNama: h.pengajar_nama_sheet,
      pengajarLinked: !!h.pengajar_id,
      ketuaNama: ketuaByHalaqah.get(h.id)?.nama ?? null,
      ketuaKelasId: ketuaByHalaqah.get(h.id)?.id ?? null,
      ketuaWa: ketuaByHalaqah.get(h.id)?.wa ?? null,
      ketuaLoggedIn: ketuaByHalaqah.get(h.id)?.loggedIn ?? false,
      terisi,
      expected,
      belumDiisi: Math.max(0, expected - terisi),
      kbbs,
      nonLibur,
      pctKbbs: nonLibur > 0 ? Math.round((kbbs / nonLibur) * 100) : null,
      latihanDone,
      pctLatihan: latihanDinilai > 0 ? Math.round((latihanDone / latihanDinilai) * 100) : null,
      terlambat,
      kondisiCount,
      hutangSaldo: 0,
    };
  });

  // F2: saldo hutang menit kumulatif per halaqah (bulk, query dichunk).
  const hutangMap = await computeHutangForHalaqahList(halaqahIds);
  for (const r of rows) r.hutangSaldo = hutangMap.get(r.halaqahId)?.saldo ?? 0;
  return rows;
}

/** Rekap satu halaqah (untuk dashboard ketua kelas). */
export async function getHitsRekapForHalaqah(
  halaqahId: string,
  month: string
): Promise<HitsRekapRow | null> {
  const rows = await getHitsRekap(month, { halaqahId });
  return rows[0] ?? null;
}

// ── Rekap Indisipliner & Tabayyun (koordinator) ──────────────────────────────
// Read-only: satu baris = satu insiden (satu keterangan indisipliner), di-LEFT
// JOIN ke tabayyun (1:1 via keterangan_id) untuk status/putusan udzur. Filter
// indisipliner dilakukan di JS karena pg-shim tak mendukung `.or`.

export type IndisiplinerBadge = 'KMT' | 'KBLA' | 'JKG' | 'TL';
export type IndisiplinerStatus =
  | 'belum_ditabayyun'
  | 'nunggu_alasan'
  | 'pending'
  | 'diputus';

export type IndisiplinerInsiden = {
  keteranganId: string;
  halaqahId: string;
  halaqahName: string;
  gender: Gender | null;
  pengajarNama: string | null;
  ketuaNama: string | null;
  ketuaWa: string | null;
  tanggal: string;
  pertemuanNo: number;
  pelanggaran: IndisiplinerBadge[];
  catatan: string | null;
  status: IndisiplinerStatus;
  alasanPengajar: string | null;
  /** Alasannya datang dari izin pra-kelas (Shakwa), bukan tabayyun susulan. */
  dariIzin: boolean;
  isUdzurSyari: boolean | null;
  keputusanCatatan: string | null;
  decidedAt: string | null;
};

export type IndisiplinerSummary = {
  total: number;
  belumDitabayyun: number;
  diputus: number;
  udzurDiterima: number;
  udzurTolak: number;
  pctUdzurDiterima: number | null;
  byBadge: Record<IndisiplinerBadge, number>;
};

export type IndisiplinerRekap = {
  insiden: IndisiplinerInsiden[];
  summary: IndisiplinerSummary;
};

function badgesOf(k: { kondisi: HitsKondisi; latihan_diberikan: boolean | null }): IndisiplinerBadge[] {
  const b: IndisiplinerBadge[] = [];
  if (k.kondisi === 'KMT' || k.kondisi === 'KBLA' || k.kondisi === 'JKG') b.push(k.kondisi);
  if (k.latihan_diberikan === false) b.push('TL');
  return b;
}

function statusOf(t: { status?: string } | undefined): IndisiplinerStatus {
  if (!t) return 'belum_ditabayyun';
  if (t.status === 'awaiting_reason') return 'nunggu_alasan';
  if (t.status === 'pending') return 'pending';
  return 'diputus';
}

function emptyIndisiplinerRekap(): IndisiplinerRekap {
  return {
    insiden: [],
    summary: {
      total: 0,
      belumDitabayyun: 0,
      diputus: 0,
      udzurDiterima: 0,
      udzurTolak: 0,
      pctUdzurDiterima: null,
      byBadge: { KMT: 0, KBLA: 0, JKG: 0, TL: 0 },
    },
  };
}

export async function getIndisiplinerRekap(
  month: string,
  opts?: { gender?: Gender; halaqahId?: string }
): Promise<IndisiplinerRekap> {
  const { start, nextMonth } = monthBounds(month);

  let hq = supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender, pengajar_id, pengajar_nama_sheet')
    .eq('active', true);
  if (opts?.halaqahId) hq = hq.eq('id', opts.halaqahId);
  if (opts?.gender) hq = hq.eq('gender', opts.gender);
  const { data: halaqahList } = await hq;
  const halaqah = (halaqahList ?? []) as Array<{
    id: string;
    name: string;
    gender: Gender | null;
    pengajar_id: string | null;
    pengajar_nama_sheet: string | null;
  }>;
  if (!halaqah.length) return emptyIndisiplinerRekap();

  const halaqahIds = halaqah.map((h) => h.id);

  // Ambil keterangan bulan ini lalu saring indisipliner di memori (bukan .or).
  const ketAll = await fetchInChunks<{
    id: string;
    halaqah_id: string;
    pertemuan_no: number;
    tanggal: string;
    kondisi: HitsKondisi;
    terlambat: boolean;
    latihan_diberikan: boolean | null;
    catatan: string | null;
    diisi_by_role: string | null;
    created_at: string | null;
  }>(halaqahIds, (ids) =>
    supabaseAdmin
      .from('hits_keterangan_harian')
      .select(`id, halaqah_id, pertemuan_no, tanggal, kondisi, terlambat, latihan_diberikan, catatan, ${KETERANGAN_NILAI_COLS}`)
      .in('halaqah_id', ids)
      .gte('tanggal', start)
      .lt('tanggal', nextMonth)
  );
  // Pertemuan yang belum terjadi & baris pra-generate impor bukan pelanggaran —
  // nilai bawaannya (latihan_diberikan=false) dulu memunculkan badge TL palsu.
  const hariIniObs = todayJakartaISO();
  const ket = ketAll.filter(
    (k) =>
      isKeteranganDinilai(k as unknown as KeteranganNilaiFields, hariIniObs) &&
      (k.kondisi === 'KMT' ||
        k.kondisi === 'KBLA' ||
        k.kondisi === 'JKG' ||
        k.latihan_diberikan === false)
  );
  if (!ket.length) return emptyIndisiplinerRekap();

  const ketIds = ket.map((k) => k.id);
  const pengajarIds = [
    ...new Set(halaqah.map((h) => h.pengajar_id).filter((x): x is string => !!x)),
  ];

  const [tabList, ketuaList, pengajarList] = await Promise.all([
    fetchInChunks<{
      keterangan_id: string;
      status: string;
      alasan_pengajar: string | null;
      is_udzur_syari: boolean | null;
      keputusan_catatan: string | null;
      decided_at: string | null;
    }>(ketIds, (ids) =>
      supabaseAdmin
        .from('hits_tabayyun')
        .select('keterangan_id, status, alasan_pengajar, is_udzur_syari, keputusan_catatan, decided_at')
        .in('keterangan_id', ids)
    ),
    fetchInChunks<{ name: string; whatsapp_number: string | null; hits_halaqah_id: string }>(
      halaqahIds,
      (ids) =>
        supabaseAdmin
          .from('ketua_kelas')
          .select('name, whatsapp_number, hits_halaqah_id')
          .in('hits_halaqah_id', ids)
          .eq('active', true)
    ),
    pengajarIds.length
      ? fetchInChunks<{ id: string; name: string }>(pengajarIds, (ids) =>
          supabaseAdmin.from('pengajar').select('id, name').in('id', ids)
        )
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);

  const tabByKet = new Map(tabList.map((t) => [t.keterangan_id, t]));
  const ketuaByHalaqah = new Map(ketuaList.map((k) => [k.hits_halaqah_id, k]));
  const pengajarById = new Map(pengajarList.map((p) => [p.id, p.name]));
  const halaqahById = new Map(halaqah.map((h) => [h.id, h]));

  const insiden: IndisiplinerInsiden[] = ket
    .map((k) => {
      const h = halaqahById.get(k.halaqah_id)!;
      const t = tabByKet.get(k.id);
      const ketua = ketuaByHalaqah.get(k.halaqah_id);
      return {
        keteranganId: k.id,
        halaqahId: k.halaqah_id,
        halaqahName: h.name,
        gender: h.gender,
        pengajarNama:
          (h.pengajar_id ? pengajarById.get(h.pengajar_id) : null) ??
          h.pengajar_nama_sheet ??
          null,
        ketuaNama: ketua?.name ?? null,
        ketuaWa: ketua?.whatsapp_number ?? null,
        tanggal: k.tanggal,
        pertemuanNo: k.pertemuan_no,
        pelanggaran: badgesOf(k),
        catatan: k.catatan,
        status: statusOf(t),
        alasanPengajar: t?.alasan_pengajar ?? null,
        dariIzin: berasalDariIzin(t?.alasan_pengajar),
        isUdzurSyari: t?.is_udzur_syari ?? null,
        keputusanCatatan: t?.keputusan_catatan ?? null,
        decidedAt: t?.decided_at ?? null,
      };
    })
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0));

  const byBadge: Record<IndisiplinerBadge, number> = { KMT: 0, KBLA: 0, JKG: 0, TL: 0 };
  let belumDitabayyun = 0;
  let diputus = 0;
  let udzurDiterima = 0;
  let udzurTolak = 0;
  for (const i of insiden) {
    for (const b of i.pelanggaran) byBadge[b] += 1;
    if (i.status === 'belum_ditabayyun') belumDitabayyun += 1;
    if (i.status === 'diputus') {
      diputus += 1;
      if (i.isUdzurSyari === true) udzurDiterima += 1;
      else if (i.isUdzurSyari === false) udzurTolak += 1;
    }
  }

  return {
    insiden,
    summary: {
      total: insiden.length,
      belumDitabayyun,
      diputus,
      udzurDiterima,
      udzurTolak,
      pctUdzurDiterima: diputus ? Math.round((udzurDiterima / diputus) * 100) : null,
      byBadge,
    },
  };
}
