// Data Ranking Disiplin Pengajar untuk koordinator ketua kelas.
//
// Diangkat dari halaman /hits/koordinator supaya halaman itu, export XLSX, dan
// halaman cetak menarik dari SATU tempat — kalau resolusi periodenya berbeda
// sedikit saja, angka di layar dan di file tak akan cocok dan koordinator tak
// punya cara menebak mana yang benar.

import {
  getDisiplinRanking,
  getInsidenDetailByPengajar,
  type DisiplinRankRow,
  type InsidenDetail,
  type HutangRincianPengajar,
} from '@/lib/hits-ranking';
import { getCakupanObservasi, type CakupanPengajar } from '@/lib/hits-observasi-cakupan';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { KELAS_LABEL, type HalaqahScope, type KelasMode } from '@/lib/hits-halaqah-scope';
import { weekBounds, formatWeekRangeShort } from '@/lib/week';
import type { Gender } from '@/types/db';

export type HitsMode = 'bulan' | 'minggu';

/** Penyaring kelengkapan observasi ketua kelas. */
export type ObsFilter = 'semua' | 'belum' | 'lengkap';

export type RekapFilter = {
  /** true = hanya pengajar yang punya insiden pada periode ini. */
  masalah: boolean;
  obs: ObsFilter;
};

export const FILTER_NETRAL: RekapFilter = { masalah: false, obs: 'semua' };

export type RekapCounts = {
  total: number;
  bermasalah: number;
  obsBelum: number;
  obsLengkap: number;
};

export type HitsKoordinatorRekap = {
  mode: HitsMode;
  start: string; // inklusif
  end: string; // eksklusif
  periodeLabel: string;
  genderLabel: string;
  gender?: Gender;
  batchId?: string;
  /** Nama batch terpilih — null bila lintas-batch. */
  batchName: string | null;
  kelas?: KelasMode;
  /** "HITS Online April 2026 · Kelas offline" — null bila tak ada yang dipilih. */
  scopeLabel: string | null;
  /** Pengajar yang punya %KBBS (rank terisi), urut ranking — SUDAH tersaring. */
  ranked: DisiplinRankRow[];
  /** Pengajar tanpa data pertemuan pada periode ini — SUDAH tersaring. */
  noData: DisiplinRankRow[];
  insidenByPengajar: Map<string, InsidenDetail[]>;
  cakupanByPengajar: Map<string, CakupanPengajar>;
  /** Asal-usul kolom Hutang (mnt): pertemuan pembentuk debit + pembayarannya. */
  hutangByPengajar: Map<string, HutangRincianPengajar[]>;
  filter: RekapFilter;
  /** Hitungan SEBELUM penyaringan — dipakai angka di chip filter. */
  counts: RekapCounts;
};

/**
 * Bermasalah = punya insiden indisipliner pada periode ini. Dihitung dari kolom
 * yang memang tampil di tabel, supaya angka chip dan isi tabel tak bisa beda.
 */
export function isBermasalah(r: DisiplinRankRow): boolean {
  return r.kmt + r.kbla + r.jkg + r.tidakLatihan > 0;
}

/**
 * Observasi lengkap = semua pertemuan yang tanggalnya sudah lewat pada periode
 * ini sudah diisi ketua kelas. Pengajar tanpa cakupan sama sekali (blok "belum
 * ada data") dihitung BELUM lengkap — nol observasi memang belum lengkap.
 */
export function isObsLengkap(c: CakupanPengajar | undefined): boolean {
  return !!c && c.total > 0 && c.belum === 0;
}

/** Baca filter dari query-string; nilai asing jatuh ke netral, bukan error. */
export function parseRekapFilter(q: {
  masalah?: string | null;
  obs?: string | null;
}): RekapFilter {
  const obs = q.obs === 'belum' || q.obs === 'lengkap' ? q.obs : 'semua';
  return { masalah: q.masalah === '1', obs };
}

/** Potongan query-string filter — '' bila netral. */
export function filterQuery(f: RekapFilter): string {
  return (f.masalah ? '&masalah=1' : '') + (f.obs !== 'semua' ? `&obs=${f.obs}` : '');
}

export function filterAktif(f: RekapFilter): boolean {
  return f.masalah || f.obs !== 'semua';
}

/** Label ringkas filter aktif — dipakai judul halaman cetak & nama file XLSX. */
export function filterLabel(f: RekapFilter): string | null {
  const bagian: string[] = [];
  if (f.masalah) bagian.push('bermasalah');
  if (f.obs === 'belum') bagian.push('observasi belum lengkap');
  if (f.obs === 'lengkap') bagian.push('observasi lengkap');
  return bagian.length ? bagian.join(' · ') : null;
}

/**
 * Potongan query-string cakupan halaqah (batch + online/offline) — '' bila
 * keduanya kosong. Dipisah dari `filterQuery` karena cakupan menentukan
 * halaqah MANA yang dihitung, sedangkan filter hanya menyaring baris hasil.
 */
export function scopeQuery(s: HalaqahScope): string {
  return (s.batchId ? `&batch=${s.batchId}` : '') + (s.kelas ? `&kelas=${s.kelas}` : '');
}

export function scopeLabel(s: { batchName?: string | null; kelas?: KelasMode }): string | null {
  const bagian = [s.batchName, s.kelas ? KELAS_LABEL[s.kelas] : null].filter(Boolean);
  return bagian.length ? bagian.join(' · ') : null;
}

/** Batch untuk dropdown — terbaru dulu, yang aktif saja. */
export async function daftarBatch(): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabaseAdmin
    .from('hits_batch')
    .select('id, name, start_date')
    .eq('active', true)
    .order('start_date', { ascending: false });
  return (data ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));
}

async function namaBatch(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('hits_batch').select('name').eq('id', id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/** Rentang [start, end) untuk mode bulan: kalender penuh, bukan window 28–27. */
export function rentangBulan(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  return {
    start: `${month}-01`,
    end: m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`,
  };
}

export async function getHitsKoordinatorRekap(opts: {
  mode: HitsMode;
  month: string; // 'YYYY-MM' (dipakai bila mode=bulan)
  week: string; // 'YYYY-MM-DD' Senin (dipakai bila mode=minggu)
  /** Tanpa ini = tanpa penyaringan (semua pengajar). */
  filter?: RekapFilter;
} & HalaqahScope): Promise<HitsKoordinatorRekap> {
  const { mode, month, week, gender, batchId, kelas } = opts;
  const { start, end } =
    mode === 'minggu' ? weekBounds(week) : rentangBulan(month);
  const periodeLabel = mode === 'minggu' ? formatWeekRangeShort(week) : month;

  const scope: HalaqahScope = { gender, batchId, kelas };
  const { rows, hutangByPengajar } = await getDisiplinRanking({ start, end, ...scope });
  const insidenByPengajar = await getInsidenDetailByPengajar({ start, end, ...scope });
  const cakupanByPengajar = await getCakupanObservasi({ start, end, ...scope });
  const batchName = batchId ? await namaBatch(batchId) : null;

  const filter = opts.filter ?? FILTER_NETRAL;

  // Hitungan chip diambil sebelum penyaringan — kalau dihitung sesudahnya,
  // angka di chip akan menyusut mengikuti filter yang sedang aktif dan
  // koordinator kehilangan gambaran berapa banyak yang sebenarnya ada.
  const counts: RekapCounts = {
    total: rows.length,
    bermasalah: rows.filter(isBermasalah).length,
    obsBelum: rows.filter((r) => !isObsLengkap(cakupanByPengajar.get(r.pengajarId))).length,
    obsLengkap: rows.filter((r) => isObsLengkap(cakupanByPengajar.get(r.pengajarId))).length,
  };

  const lolos = (r: DisiplinRankRow) => {
    if (filter.masalah && !isBermasalah(r)) return false;
    if (filter.obs !== 'semua') {
      const lengkap = isObsLengkap(cakupanByPengajar.get(r.pengajarId));
      if (filter.obs === 'lengkap' && !lengkap) return false;
      if (filter.obs === 'belum' && lengkap) return false;
    }
    return true;
  };

  return {
    mode,
    start,
    end,
    periodeLabel,
    genderLabel: gender === 'ikhwan' ? 'Ikhwan' : gender === 'akhwat' ? 'Akhwat' : 'Ikhwan & Akhwat',
    gender,
    batchId,
    batchName,
    kelas,
    scopeLabel: scopeLabel({ batchName, kelas }),
    ranked: rows.filter((r) => r.rank !== null && lolos(r)),
    noData: rows.filter((r) => r.rank === null && lolos(r)),
    insidenByPengajar,
    cakupanByPengajar,
    hutangByPengajar,
    filter,
    counts,
  };
}
