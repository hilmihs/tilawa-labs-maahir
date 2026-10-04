// query.ts — terjemah query-string → filter tervalidasi + jalankan ke pg-shim.
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EntityDef, ScopeName } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedFilter { column: string; kind: string; value: string | boolean }
export type ParseResult =
  | { ok: true; page: number; limit: number; urut: 'asc' | 'desc'; filters: ParsedFilter[] }
  | { ok: false; code: 'bad_param'; message: string };

const RESERVED = new Set(['page', 'limit', 'urut']);

/** Gerbang scope: key hanya boleh akses entitas yang scope-nya ia miliki. */
export function scopeAllows(keyScopes: ScopeName[], entityScope: ScopeName): boolean {
  return keyScopes.includes(entityScope);
}

export function parseRequest(params: URLSearchParams, def: EntityDef): ParseResult {
  const byParam = new Map(def.filters.map(f => [f.param, f]));
  const filters: ParsedFilter[] = [];

  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue;
    const fd = byParam.get(k);
    if (!fd) return { ok: false, code: 'bad_param', message: `Filter tak dikenal: '${k}'.` };
    if (
      fd.kind === 'date_from' || fd.kind === 'date_to' || fd.kind === 'since' ||
      fd.kind === 'ts_from' || fd.kind === 'ts_to' || fd.kind === 'ts_since'
    ) {
      if (!DATE_RE.test(v)) return { ok: false, code: 'bad_param', message: `Tanggal harus YYYY-MM-DD: '${k}'.` };
      filters.push({ column: fd.column, kind: fd.kind, value: v });
    } else if (fd.kind === 'bool' || fd.kind === 'is_null') {
      if (v !== 'true' && v !== 'false') return { ok: false, code: 'bad_param', message: `Nilai boolean harus true/false: '${k}'.` };
      filters.push({ column: fd.column, kind: fd.kind, value: v === 'true' });
    } else {
      filters.push({ column: fd.column, kind: fd.kind, value: v });
    }
  }

  const pageRaw = params.get('page');
  const limitRaw = params.get('limit');
  const page = pageRaw === null ? 1 : Number(pageRaw);
  const limit = limitRaw === null ? 100 : Number(limitRaw);
  if (!Number.isInteger(page) || page < 1) return { ok: false, code: 'bad_param', message: 'page harus bilangan >= 1.' };
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return { ok: false, code: 'bad_param', message: 'limit harus 1–500.' };

  const urutRaw = params.get('urut');
  if (urutRaw !== null && urutRaw !== 'asc' && urutRaw !== 'desc')
    return { ok: false, code: 'bad_param', message: "urut harus 'asc' atau 'desc'." };
  const urut = (urutRaw as 'asc' | 'desc') ?? def.order.dir;

  return { ok: true, page, limit, urut, filters };
}

/** Jalankan query entitas ke DB. Mengembalikan {rows,total}. */
export async function runEntity(def: EntityDef, parsed: Extract<ParseResult, { ok: true }>) {
  let q = supabaseAdmin.from(def.table).select(def.columns.join(', '), { count: 'exact' });
  for (const f of parsed.filters) {
    if (f.kind === 'eq' || f.kind === 'bool') q = q.eq(f.column, f.value);
    else if (f.kind === 'date_from') q = q.gte(f.column, f.value);
    else if (f.kind === 'date_to') q = q.lte(f.column, f.value);
    else if (f.kind === 'since') q = q.gte(f.column, f.value);
    // timestamptz sadar-WIB: awal/akhir hari Asia/Jakarta (UTC+7), inklusif.
    else if (f.kind === 'ts_from' || f.kind === 'ts_since') q = q.gte(f.column, `${f.value as string}T00:00:00+07:00`);
    else if (f.kind === 'ts_to') q = q.lte(f.column, `${f.value as string}T23:59:59.999+07:00`);
    else if (f.kind === 'is_null') { if (f.value === true) q = q.is(f.column, null); else q = q.not(f.column, 'is', null); }
  }
  q = q.order(def.order.column, { ascending: parsed.urut === 'asc' });
  // Pemutus seri WAJIB: paginasi memakai OFFSET, dan kolom urut default sering
  // tidak unik (`evaluasi/sesi.tgl_jadwal` null di semua baris, `urutan` hampir
  // selalu 0). Tanpa kunci unik, urutan baris yang seri tidak dijamin sama antar
  // halaman — konsumen melihat baris terlewat & terulang padahal tiap halaman 200
  // (dashboard 30 Sep 2026: 10.302 dari 13.805 evaluasi/nilai, 1.558 dari 1.896 sesi).
  const kunci = def.columns.includes('id') ? 'id' : def.columns[0];
  if (kunci !== def.order.column) q = q.order(kunci, { ascending: true });
  const from = (parsed.page - 1) * parsed.limit;
  q = q.range(from, from + parsed.limit - 1);
  const { data, count } = await q;
  return { rows: data ?? [], total: count ?? 0 };
}

/** Injeksi ketua_nama ke baris kajian-presensi tanpa pernah membocorkan ketua_wa. */
export async function resolveKajianPresensi(rows: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  if (!rows.length) return rows;
  const ids = rows.map(r => r.id as string);
  // 1) ambil ketua_wa per baris (kolom ini TIDAK ada di columns entitas → query terpisah)
  const { data: waRows } = await supabaseAdmin.from('hits_kajian_presensi').select('id, ketua_wa').in('id', ids);
  const idToWa = new Map<string, string | null>();
  for (const w of (waRows ?? []) as Array<{ id: string; ketua_wa: string | null }>) idToWa.set(w.id, w.ketua_wa);
  // 2) peta ketua_wa → nama dari hits_halaqah_peserta
  const { data: pesRows } = await supabaseAdmin.from('hits_halaqah_peserta').select('ketua_wa, nama');
  const waToName = new Map<string, string>();
  for (const p of (pesRows ?? []) as Array<{ ketua_wa: string | null; nama: string }>) {
    if (p.ketua_wa) waToName.set(p.ketua_wa, p.nama);
  }
  // 3) set ketua_nama; JANGAN pernah menaruh ketua_wa ke baris keluaran
  return rows.map(r => {
    const wa = idToWa.get(r.id as string) ?? null;
    return { ...r, ketua_nama: wa ? (waToName.get(wa) ?? null) : null };
  });
}
