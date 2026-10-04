// Derivasi pertemuan_no <-> tanggal untuk satu halaqah.
// pertemuan_no = sesiPerPekan*(pekan-1) + slot, di mana sesiPerPekan = jumlah hari
// jadwal halaqah (mis. [Senin,Rabu] -> 2, [Sabtu] -> 1) dan slot = urutan sesi dalam
// pekan (1..sesiPerPekan). Untuk 2 hari/pekan ini IDENTIK rumus lama (2*pekan-1 / 2*pekan)
// sehingga numbering batch lama tidak berubah; juga mendukung 1 hari/pekan (kursus
// mingguan panjang, mis. HITS Nurul Iman / ABK). 1 sesi = 1 pertemuan.

import { HARI_INDEX } from '@/lib/hits';
import { dayNameOf } from '@/lib/maahir-presensi';
import type { HitsLevel } from '@/types/db';

export type KaldikHariLite = {
  tanggal: string;
  pekan: number | null;
  is_libur: boolean;
};

export type DerivedPertemuan = {
  pertemuan_no: number;
  tanggal: string;
  pekan: number;
  level?: HitsLevel; // diisi oleh deriveHalaqahProgram (multi-tahap)
};

// Definisi tahap per program.
// - level      = tahap yang dicatat di keterangan (qoidah_nuroniyyah / perbaikan_bacaan)
// - kaldikLevel = kaldik mana yang dipakai untuk turunkan tanggal pertemuannya.
// Dasar: 2 tahap (Nuroniyyah pakai kaldik qoidah, lalu Perbaikan pakai kaldik perbaikan).
// Lanjutan: 1 tahap (Perbaikan) TAPI berjalan sejak KBM batch → pakai kaldik qoidah.
// kaldikFallback: dipakai bila kaldik `kaldikLevel` kosong. Batch lanjutan-only
// (mis. HITS Safar) kadang hanya punya kaldik perbaikan_bacaan (tak ada kaldik
// qoidah "KBM"), sehingga derive lanjutan yang mematok qoidah menghasilkan 0
// pertemuan. Fallback ke perbaikan_bacaan memakai satu-satunya kaldik yang ada.
export type StageDef = { level: HitsLevel; kaldikLevel: HitsLevel; kaldikFallback?: HitsLevel };
export const PROGRAM_STAGE_DEFS: Record<string, StageDef[]> = {
  dasar: [
    { level: 'qoidah_nuroniyyah', kaldikLevel: 'qoidah_nuroniyyah' },
    { level: 'perbaikan_bacaan', kaldikLevel: 'perbaikan_bacaan' },
  ],
  lanjutan: [{ level: 'perbaikan_bacaan', kaldikLevel: 'qoidah_nuroniyyah', kaldikFallback: 'perbaikan_bacaan' }],
};

// Level keterangan per program (untuk listing/grouping).
export const PROGRAM_STAGES: Record<string, HitsLevel[]> = {
  dasar: ['qoidah_nuroniyyah', 'perbaikan_bacaan'],
  lanjutan: ['perbaikan_bacaan'],
};

/** Kaldik level yang perlu dimuat untuk sebuah program (distinct). */
export function programKaldikLevels(program: string): HitsLevel[] {
  const defs = PROGRAM_STAGE_DEFS[program] ?? PROGRAM_STAGE_DEFS.dasar;
  const out = new Set<HitsLevel>();
  for (const d of defs) {
    out.add(d.kaldikLevel);
    if (d.kaldikFallback) out.add(d.kaldikFallback); // muat juga kaldik fallback
  }
  return [...out];
}

export const HITS_LEVEL_SHORT: Record<HitsLevel, string> = {
  qoidah_nuroniyyah: 'Nuroniyyah',
  perbaikan_bacaan: 'Perbaikan',
};

/** jadwal_hari (nama) -> set index getUTCDay(). */
function hariIndexSet(jadwalHari: string[]): Set<number> {
  const s = new Set<number>();
  for (const h of jadwalHari) {
    const idx = HARI_INDEX[h];
    if (idx !== undefined) s.add(idx);
  }
  return s;
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Petakan pertemuan_no -> tanggal untuk satu halaqah.
 * @param jadwalHari nama hari sesi (mis. ['Senin','Rabu'])
 * @param kaldik     baris kaldik (batch+level) — sudah difilter ke level halaqah
 */
export function deriveHalaqahPertemuan(
  jadwalHari: string[],
  kaldik: KaldikHariLite[]
): DerivedPertemuan[] {
  const wanted = hariIndexSet(jadwalHari);
  if (wanted.size === 0) return [];

  // Cadence per pekan = jumlah hari jadwal. [Sabtu,Ahad] -> 2, [Sabtu] -> 1.
  const sesiPerPekan = wanted.size;

  // group by pekan
  const byPekan = new Map<number, string[]>();
  for (const row of kaldik) {
    if (row.pekan == null || row.is_libur) continue;
    if (!wanted.has(weekdayOf(row.tanggal))) continue;
    const arr = byPekan.get(row.pekan) ?? [];
    arr.push(row.tanggal);
    byPekan.set(row.pekan, arr);
  }

  const out: DerivedPertemuan[] = [];
  for (const [pekan, dates] of [...byPekan.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...new Set(dates)].sort();
    // slot 1..sesiPerPekan; sesi lebih dari cadence dalam sepekan diabaikan.
    const n = Math.min(sorted.length, sesiPerPekan);
    for (let slot = 1; slot <= n; slot++) {
      out.push({ pertemuan_no: sesiPerPekan * (pekan - 1) + slot, tanggal: sorted[slot - 1], pekan });
    }
  }
  return out;
}

export type PertemuanOverride = {
  pertemuan_no: number;
  tanggal: string;
  pekan: number | null;
  is_skipped: boolean;
};

/**
 * Sama seperti deriveHalaqahPertemuan, tapi menerapkan override koordinator
 * (tabel hits_kaldik_pertemuan): ganti tanggal/pekan per pertemuan_no, drop
 * pertemuan yang is_skipped, dan tambahkan override manual yang tak terderivasi.
 */
export function deriveHalaqahPertemuanWithOverrides(
  jadwalHari: string[],
  kaldik: KaldikHariLite[],
  overrides: PertemuanOverride[]
): DerivedPertemuan[] {
  const base = deriveHalaqahPertemuan(jadwalHari, kaldik);
  if (overrides.length === 0) return base;

  const ovByNo = new Map<number, PertemuanOverride>();
  for (const o of overrides) ovByNo.set(o.pertemuan_no, o);

  const out: DerivedPertemuan[] = [];
  const seen = new Set<number>();
  for (const d of base) {
    seen.add(d.pertemuan_no);
    const ov = ovByNo.get(d.pertemuan_no);
    if (!ov) {
      out.push(d);
      continue;
    }
    if (ov.is_skipped) continue;
    out.push({ pertemuan_no: d.pertemuan_no, tanggal: ov.tanggal, pekan: ov.pekan ?? d.pekan });
  }
  // Override manual untuk pertemuan yang tidak diturunkan otomatis.
  for (const o of overrides) {
    if (seen.has(o.pertemuan_no) || o.is_skipped) continue;
    out.push({ pertemuan_no: o.pertemuan_no, tanggal: o.tanggal, pekan: o.pekan ?? 0 });
  }
  return out.sort((a, b) => a.pertemuan_no - b.pertemuan_no);
}

/** Map tanggal -> pertemuan_no (kebalikan, untuk lookup saat isi harian). */
export function pertemuanByDate(derived: DerivedPertemuan[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of derived) m.set(d.tanggal, d.pertemuan_no);
  return m;
}

/** Label pertemuan ringkas, mis. "Pertemuan 3 · Rabu 17 Jun". */
export function pertemuanLabel(d: DerivedPertemuan): string {
  return `Pertemuan ${d.pertemuan_no} · ${dayNameOf(d.tanggal)} ${d.tanggal}`;
}

/**
 * Derivasi seluruh tahap sebuah halaqah (multi-tahap, override-aware).
 * Untuk tiap tahap (level) di program halaqah, derive pertemuan dari kaldik
 * level tsb lalu tag `level`. Hasil digabung & diurutkan menurut tanggal —
 * timeline kontinu (pertemuan_no tetap reset per tahap).
 */
export function deriveHalaqahProgram(
  program: string,
  jadwalHari: string[],
  kaldikByLevel: Map<HitsLevel, KaldikHariLite[]>,
  overridesByLevel: Map<HitsLevel, PertemuanOverride[]>,
  startDate?: string | null
): DerivedPertemuan[] {
  const defs = PROGRAM_STAGE_DEFS[program] ?? PROGRAM_STAGE_DEFS.dasar;
  const out: DerivedPertemuan[] = [];
  let prevLast: string | null = null;
  for (const def of defs) {
    let kaldik = kaldikByLevel.get(def.kaldikLevel) ?? [];
    if (kaldik.length === 0 && def.kaldikFallback) {
      kaldik = kaldikByLevel.get(def.kaldikFallback) ?? []; // Safar: qoidah kosong → pakai perbaikan
    }
    if (kaldik.length === 0) continue;
    let derived = deriveHalaqahPertemuanWithOverrides(jadwalHari, kaldik, overridesByLevel.get(def.level) ?? []);
    if (prevLast) derived = derived.filter((d) => d.tanggal > prevLast!);
    if (derived.length === 0) continue;
    for (const d of derived) out.push({ ...d, level: def.level });
    prevLast = derived.reduce((mx, d) => (d.tanggal > mx ? d.tanggal : mx), prevLast ?? '');
  }
  const sorted = out.sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0));
  return startDate ? sorted.filter((d) => d.tanggal >= startDate) : sorted;
}
