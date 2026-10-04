// Hutang menit HITS (F2). Debit dihitung dari hits_pelanggaran (sumber kebenaran):
//   KMT  -> max(0, menit - 5)   (toleransi tetap 5 menit)
//   KBLA -> menit               (tanpa toleransi)
//   JKG  -> 90                  (1 pertemuan = 90 menit; cicil hanya rencana bayar)
//   BADAL, TIDAK_LATIHAN -> 0
// Credit (pembayaran) disimpan di hits_hutang_bayar; saldo = debit - bayar.
import { supabaseAdmin } from '@/lib/supabase-admin';
import { TOLERANSI_KMT } from '@/lib/hits-pelanggaran-kategori';
import type { HitsPelanggaran } from '@/types/db';

// Sumbernya di hits-pelanggaran-kategori.ts (modul murni, dipakai matrix &
// ranking juga). Di-re-export supaya pemanggil lama tak perlu diubah.
export { TOLERANSI_KMT } from '@/lib/hits-pelanggaran-kategori';
export const JKG_MENIT = 90;
// Hutang menit hanya dihitung untuk pertemuan pada/sesudah tanggal ini. Pelanggaran
// lama (termasuk 163 JKG hasil backfill F1 tanpa menit riil) TAK jadi hutang.
export const HUTANG_ANCHOR = '2026-07-06';

/**
 * Debit menit satu pelanggaran. Murni. JKG hanya berhutang bila `jkg_opsi` terisi
 * (tanda entri form F1 asli); JKG hasil backfill lama (jkg_opsi null) = 0.
 */
export function hutangMenit(p: Pick<HitsPelanggaran, 'jenis' | 'menit' | 'jkg_opsi'>): number {
  switch (p.jenis) {
    case 'KMT':
      return Math.max(0, (p.menit ?? 0) - TOLERANSI_KMT);
    case 'KBLA':
      return p.menit ?? 0;
    case 'JKG':
      return p.jkg_opsi ? JKG_MENIT : 0;
    default:
      return 0; // BADAL, TIDAK_LATIHAN
  }
}

export type HutangItem = {
  keterangan_id: string;
  tanggal: string;
  jenis: string; // jenis debit dominan pertemuan
  debit: number;
};

export type HutangRincian = HutangItem & {
  terbayar: number;
  sisa: number;
  status: 'belum' | 'sebagian' | 'lunas';
};

export type HutangHalaqah = {
  halaqah_id: string;
  pengajar_id: string | null;
  total_debit: number;
  total_bayar: number;
  saldo: number;
  rincian: HutangRincian[];
};

/**
 * Alokasi pembayaran ke daftar hutang secara FIFO (lunasi pertemuan terlama
 * dulu, urut tanggal). Murni — tanpa DB. `items` sudah harus per-pertemuan.
 */
export function allocateHutang(items: HutangItem[], totalBayar: number): HutangRincian[] {
  const sorted = [...items].sort((a, b) =>
    a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0
  );
  let remaining = Math.max(0, totalBayar);
  return sorted.map((i) => {
    const terbayar = Math.min(i.debit, remaining);
    remaining -= terbayar;
    const sisa = i.debit - terbayar;
    const status: HutangRincian['status'] = sisa <= 0 ? 'lunas' : terbayar > 0 ? 'sebagian' : 'belum';
    return { ...i, terbayar, sisa, status };
  });
}

// Severity utk pilih jenis debit dominan pertemuan (hanya jenis pembawa debit).
const SEV_RANK: Record<string, number> = { JKG: 0, KBLA: 1, KMT: 2 };

type KetLite = { id: string; tanggal: string };
type PelLite = { keterangan_id: string; jenis: string; menit: number | null; jkg_opsi: string | null };
type BayarLite = { menit: number };

/** Rakit hutang satu halaqah dari baris yang sudah diambil. Inti (dipakai single & bulk). */
export function buildHutang(
  halaqahId: string,
  pengajarId: string | null,
  kets: KetLite[],
  pels: PelLite[],
  bayars: BayarLite[]
): HutangHalaqah {
  const tanggalByKet = new Map(kets.map((k) => [k.id, k.tanggal]));
  // Agregasi debit per keterangan (satu pertemuan bisa >1 pelanggaran).
  const byKet = new Map<string, { debit: number; jenis: string; sev: number }>();
  for (const p of pels) {
    const tgl = tanggalByKet.get(p.keterangan_id);
    // Anchor: hanya pertemuan pada/sesudah HUTANG_ANCHOR yang berhutang.
    if (!tgl || tgl < HUTANG_ANCHOR) continue;
    const d = hutangMenit(p as Pick<HitsPelanggaran, 'jenis' | 'menit' | 'jkg_opsi'>);
    if (d <= 0) continue;
    const sev = SEV_RANK[p.jenis] ?? 99;
    const cur = byKet.get(p.keterangan_id) ?? { debit: 0, jenis: p.jenis, sev };
    cur.debit += d;
    if (sev < cur.sev) { cur.sev = sev; cur.jenis = p.jenis; }
    byKet.set(p.keterangan_id, cur);
  }
  const items: HutangItem[] = [...byKet.entries()].map(([kid, a]) => ({
    keterangan_id: kid,
    tanggal: tanggalByKet.get(kid) ?? '',
    jenis: a.jenis,
    debit: a.debit,
  }));
  const total_debit = items.reduce((s, i) => s + i.debit, 0);
  const total_bayar = bayars.reduce((s, b) => s + (b.menit ?? 0), 0);
  const rincian = allocateHutang(items, total_bayar);
  const saldo = Math.max(0, total_debit - total_bayar);
  return { halaqah_id: halaqahId, pengajar_id: pengajarId, total_debit, total_bayar, saldo, rincian };
}

/** Ambil daftar id dalam potongan (hindari URL 414 & cap 1000 baris PostgREST). */
async function chunked<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const SIZE = 100;
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += SIZE) {
    const { data } = await run(ids.slice(i, i + SIZE));
    if (data) out.push(...data);
  }
  return out;
}

/** Hitung hutang satu halaqah dari sumber (pelanggaran + pembayaran). */
export async function computeHutangForHalaqah(halaqahId: string): Promise<HutangHalaqah> {
  const { data: hal } = await supabaseAdmin
    .from('hits_halaqah').select('pengajar_id').eq('id', halaqahId).maybeSingle();
  const pengajarId = (hal?.pengajar_id as string | null) ?? null;

  const { data: kets } = await supabaseAdmin
    .from('hits_keterangan_harian').select('id, tanggal')
    .eq('halaqah_id', halaqahId).gte('tanggal', HUTANG_ANCHOR);
  const ketList = (kets ?? []) as KetLite[];
  const ketIds = ketList.map((k) => k.id);

  const pels = ketIds.length
    ? ((await supabaseAdmin.from('hits_pelanggaran').select('keterangan_id, jenis, menit, jkg_opsi').in('keterangan_id', ketIds)).data ?? [])
    : [];
  const { data: bayars } = await supabaseAdmin
    .from('hits_hutang_bayar').select('menit').eq('halaqah_id', halaqahId);

  return buildHutang(halaqahId, pengajarId, ketList, pels as PelLite[], (bayars ?? []) as BayarLite[]);
}

/**
 * Hutang untuk banyak halaqah sekaligus (dashboard koordinator). Query dichunk
 * (~4 set query total, bukan N×3), lalu hitung per-halaqah in-memory. Debit
 * kumulatif lintas-waktu (bukan hanya bulan berjalan).
 */
export async function computeHutangForHalaqahList(halaqahIds: string[]): Promise<Map<string, HutangHalaqah>> {
  const result = new Map<string, HutangHalaqah>();
  if (!halaqahIds.length) return result;

  const halRows = await chunked<{ id: string; pengajar_id: string | null }>(halaqahIds, (ids) =>
    supabaseAdmin.from('hits_halaqah').select('id, pengajar_id').in('id', ids));
  const pengajarByHal = new Map(halRows.map((h) => [h.id, h.pengajar_id ?? null]));

  const kets = await chunked<{ id: string; halaqah_id: string; tanggal: string }>(halaqahIds, (ids) =>
    supabaseAdmin.from('hits_keterangan_harian').select('id, halaqah_id, tanggal')
      .in('halaqah_id', ids).gte('tanggal', HUTANG_ANCHOR));
  const ketByHal = new Map<string, KetLite[]>();
  const halByKet = new Map<string, string>();
  for (const k of kets) {
    halByKet.set(k.id, k.halaqah_id);
    const arr = ketByHal.get(k.halaqah_id) ?? [];
    arr.push({ id: k.id, tanggal: k.tanggal });
    ketByHal.set(k.halaqah_id, arr);
  }

  const ketIds = kets.map((k) => k.id);
  const pels = await chunked<PelLite>(ketIds, (ids) =>
    supabaseAdmin.from('hits_pelanggaran').select('keterangan_id, jenis, menit, jkg_opsi').in('keterangan_id', ids));
  const pelByHal = new Map<string, PelLite[]>();
  for (const p of pels) {
    const hid = halByKet.get(p.keterangan_id);
    if (!hid) continue;
    const arr = pelByHal.get(hid) ?? [];
    arr.push(p);
    pelByHal.set(hid, arr);
  }

  const bayars = await chunked<{ halaqah_id: string; menit: number }>(halaqahIds, (ids) =>
    supabaseAdmin.from('hits_hutang_bayar').select('halaqah_id, menit').in('halaqah_id', ids));
  const bayarByHal = new Map<string, BayarLite[]>();
  for (const b of bayars) {
    const arr = bayarByHal.get(b.halaqah_id) ?? [];
    arr.push({ menit: b.menit });
    bayarByHal.set(b.halaqah_id, arr);
  }

  for (const hid of halaqahIds) {
    result.set(hid, buildHutang(
      hid, pengajarByHal.get(hid) ?? null,
      ketByHal.get(hid) ?? [], pelByHal.get(hid) ?? [], bayarByHal.get(hid) ?? []
    ));
  }
  return result;
}
