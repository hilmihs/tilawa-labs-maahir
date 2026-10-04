// Fungsi MURNI: bandingkan baris mirror-shape hasil fetch vs baris mirror sekarang,
// hasilkan daftar diff (create/update/deactivate). Deactivate = ada di mirror
// (aktif) tapi hilang dari fetch. Update = field pembanding berubah.
import type { MirrorEntity } from './types';
import { isPesertaManual } from '../evaluasi-peserta';

export interface DiffRow {
  entity: MirrorEntity;
  op: 'create' | 'update' | 'deactivate';
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  flags: string[];
}

type Row = { id: string; aktif?: boolean; kurasi?: string[] } & Record<string, unknown>;

/**
 * Kolom yang sudah disunting lokal pada baris ini (migrasi 0074). Dibaca dari
 * barisnya sendiri, bukan lewat src/lib/evaluasi-kurasi.ts, supaya file ini
 * tetap murni — helper di sana menyentuh DB.
 */
function kolomTerkurasi(row: Row): string[] {
  return Array.isArray(row.kurasi) ? row.kurasi.map((x) => String(x)) : [];
}

/**
 * @param compareCols kolom yang memicu 'update' bila berbeda.
 * Baris current yang sudah aktif=false diabaikan untuk deactivate (tak dobel).
 */
export function diffEntity(
  entity: MirrorEntity,
  fetched: Row[],
  current: Row[],
  compareCols: string[]
): DiffRow[] {
  const curById = new Map(current.map((r) => [r.id, r]));
  const fetchedIds = new Set(fetched.map((r) => r.id));
  const out: DiffRow[] = [];

  for (const f of fetched) {
    const c = curById.get(f.id);
    if (!c) {
      out.push({ entity, op: 'create', entity_id: f.id, before: null, after: f, flags: [] });
      continue;
    }
    // Kolom terkurasi lokal (nama/level halaqah, nama peserta, dst.) tak boleh
    // memicu update: pengajar sudah membetulkannya di sini dan hulu belum tentu
    // menyusul. Tanpa ini tiap pull menstage ulang usulan yang sama.
    const terkurasi = kolomTerkurasi(c);
    const changed = compareCols.some(
      (k) => !terkurasi.includes(k) && normalize(c[k]) !== normalize(f[k])
    );
    if (changed) {
      out.push({ entity, op: 'update', entity_id: f.id, before: c, after: f, flags: [] });
    }
  }
  for (const c of current) {
    if (fetchedIds.has(c.id) || c.aktif === false) continue;
    // Peserta yang ditambahkan pengajar lewat aplikasi memang tak akan pernah
    // muncul di fetch hilmihs. Tanpa pengecualian ini setiap pull menstage
    // penonaktifan mereka, dan daftar approve koordinator jadi ranjau: sekali
    // ter-approve, peserta itu hilang dari layar pengajar tanpa sebab yang
    // kelihatan. Lihat src/lib/evaluasi-peserta.ts.
    if (entity === 'peserta' && isPesertaManual(c.id)) continue;
    out.push({ entity, op: 'deactivate', entity_id: c.id, before: c, after: null, flags: [] });
  }
  return out;
}

function normalize(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}
