// Parser kaldik HITS: satu tab CSV berisi DUA blok level berdampingan
// (Qoidah Nuroniyyah kiri, Perbaikan Bacaan kanan). Tiap blok kolom:
// Level | Hari | Tanggal | Pekan | Pertemuan | Keterangan.
// Output: satu baris per tanggal per level (untuk hits_kaldik_hari).

import { parseCsv } from '@/lib/csv';
import { dayNameOf } from '@/lib/maahir-presensi';
import type { HitsLevel } from '@/types/db';

export type KaldikHariRow = {
  level: HitsLevel;
  tanggal: string; // ISO YYYY-MM-DD
  hari: string;
  pekan: number | null;
  is_libur: boolean;
  libur_note: string | null;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7,
  aug: 8, agu: 8, agt: 8, sep: 9, sept: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
};

/** "12-Jan-26" / "1-Feb-26" / "6-Apr-25" -> "2026-01-12". null bila bukan tanggal. */
export function parseKaldikDate(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]+)[-/\s](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const mon = MONTHS[m[2].toLowerCase()];
  if (!mon) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (day < 1 || day > 31) return null;
  return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function detectLevel(cellText: string, fallback: HitsLevel): HitsLevel {
  const t = cellText.toUpperCase();
  if (t.includes('NURONIYYAH') || t.includes('NURANIYAH') || t.includes('QOIDAH')) {
    return 'qoidah_nuroniyyah';
  }
  if (t.includes('PERBAIKAN') || t.includes('BACAAN')) return 'perbaikan_bacaan';
  return fallback;
}

export function parseKaldikTab(csv: string): KaldikHariRow[] {
  const rows = parseCsv(csv);

  // Cari baris header: punya >=2 sel 'Pertemuan' + ada 'Tanggal'.
  let headerIdx = -1;
  let pertCols: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].map((c) => c.trim().toLowerCase());
    const cols = cells.map((c, i) => (c === 'pertemuan' ? i : -1)).filter((i) => i >= 0);
    if (cols.length >= 1 && cells.includes('tanggal') && cells.includes('hari')) {
      headerIdx = r;
      pertCols = cols;
      break;
    }
  }
  if (headerIdx < 0) return [];

  pertCols.sort((a, b) => a - b);
  const blocks = pertCols.map((pertCol, bi) => ({
    levelCol: pertCol - 4,
    hariCol: pertCol - 3,
    tanggalCol: pertCol - 2,
    pekanCol: pertCol - 1,
    pertCol,
    ketCol: pertCol + 1,
    level: (bi === 0 ? 'qoidah_nuroniyyah' : 'perbaikan_bacaan') as HitsLevel,
  }));

  // Refine level dari isi kolom Level (cari sel non-kosong pertama per blok).
  for (const b of blocks) {
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const v = (rows[r][b.levelCol] ?? '').trim();
      if (v) {
        b.level = detectLevel(v, b.level);
        break;
      }
    }
  }

  const out: KaldikHariRow[] = [];
  const pekanState: Record<number, number | null> = {};

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi];
      const rawTgl = (row[b.tanggalCol] ?? '').trim();
      const ket = (row[b.ketCol] ?? '').trim();
      const pekanRaw = (row[b.pekanCol] ?? '').trim();

      if (pekanRaw && /^\d+$/.test(pekanRaw)) {
        pekanState[bi] = Number(pekanRaw);
      }

      const iso = parseKaldikDate(rawTgl);
      if (!iso) continue; // baris span libur / kosong — tak bisa dipetakan per tanggal

      const liburHit = /libur/i.test(rawTgl) || /libur/i.test(ket);
      out.push({
        level: b.level,
        tanggal: iso,
        hari: dayNameOf(iso),
        pekan: pekanState[bi] ?? null,
        is_libur: liburHit,
        libur_note: liburHit ? ket || rawTgl : null,
      });
    }
  }

  return out;
}

/** Tanggal pekan-1 paling awal per level (untuk default-guess level halaqah & start_date batch). */
export function startDatesByLevel(rows: KaldikHariRow[]): Record<HitsLevel, string | null> {
  const out: Record<HitsLevel, string | null> = {
    qoidah_nuroniyyah: null,
    perbaikan_bacaan: null,
  };
  for (const r of rows) {
    if (r.is_libur) continue;
    const cur = out[r.level];
    if (!cur || r.tanggal < cur) out[r.level] = r.tanggal;
  }
  return out;
}
