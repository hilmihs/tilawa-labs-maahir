import 'server-only';
import { getPool, poolExec } from './pg-core';
import { logAudit } from './audit';
import { loadAccessesForWa } from './access';
import { ADMIN_WA } from './constants';
import type { RoleAccess } from '@/types/db';
import {
  TABLES_SQL,
  TABLE_EXISTS_SQL,
  COLUMNS_SQL,
  PK_SQL,
  ENUM_SQL,
  buildBrowseQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
} from './admin-crud-sql';

/**
 * admin-crud.ts — table browser CRUD terpandu (superadmin-only).
 *
 * Semua nama tabel divalidasi lewat information_schema; nilai selalu lewat
 * parameter. Tulis (insert/update/delete) dibungkus transaksi: preview jumlah
 * baris + ROLLBACK bila `confirm !== true`, COMMIT bila `confirm === true`.
 * Tiap mutasi diaudit ke audit_log.
 */

const TEXT_TYPES = new Set(['text', 'character varying', 'character', 'citext', 'name']);

export interface ColumnMeta {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  isPk: boolean;
  hasDefault: boolean;
  isGenerated: boolean;
  isText: boolean;
  enumValues?: string[];
}

export interface BrowseResult {
  columns: ColumnMeta[];
  rows: Record<string, any>[];
  total: number;
  page: number;
  pageSize: number;
  pkColumns: string[];
}

export interface MutateResult {
  rowCount: number;
  committed: boolean;
  requiresConfirm: boolean;
  wouldAffect: number;
  rows: Record<string, any>[];
}

async function assertTable(table: string): Promise<void> {
  const { rows } = await poolExec(TABLE_EXISTS_SQL, [table]);
  if (!rows.length) throw new Error(`Tabel tidak dikenal: ${table}`);
}

export async function getTables(): Promise<{ name: string; rows: number }[]> {
  const { rows } = await poolExec(TABLES_SQL);
  return rows.map((r: any) => ({ name: r.name as string, rows: Number(r.rows ?? 0) }));
}

export async function getColumns(table: string): Promise<ColumnMeta[]> {
  await assertTable(table);
  const [{ rows: cols }, { rows: pks }] = await Promise.all([
    poolExec(COLUMNS_SQL, [table]),
    poolExec(PK_SQL, [table]),
  ]);
  const pkSet = new Set(pks.map((r: any) => r.column_name));
  const enumCache = new Map<string, string[]>();
  const out: ColumnMeta[] = [];
  for (const c of cols) {
    let enumValues: string[] | undefined;
    if (c.data_type === 'USER-DEFINED') {
      if (!enumCache.has(c.udt_name)) {
        const { rows: ev } = await poolExec(ENUM_SQL, [c.udt_name]);
        enumCache.set(c.udt_name, ev.map((r: any) => r.enumlabel));
      }
      const vals = enumCache.get(c.udt_name)!;
      if (vals.length) enumValues = vals;
    }
    out.push({
      name: c.column_name,
      dataType: c.data_type,
      udtName: c.udt_name,
      nullable: c.is_nullable === 'YES',
      isPk: pkSet.has(c.column_name),
      hasDefault: c.column_default != null,
      isGenerated: c.is_generated === 'ALWAYS' || c.identity_generation != null,
      isText: TEXT_TYPES.has(c.data_type),
      enumValues,
    });
  }
  return out;
}

export async function browseTable(
  table: string,
  opts: { search?: string; page?: number; pageSize?: number }
): Promise<BrowseResult> {
  const columns = await getColumns(table);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const page = Math.max(opts.page ?? 0, 0);
  const textColumns = columns.filter((c) => c.isText).map((c) => c.name);
  const pkColumns = columns.filter((c) => c.isPk).map((c) => c.name);
  const orderColumns = pkColumns.length ? pkColumns : columns[0] ? [columns[0].name] : [];

  const q = buildBrowseQuery({ table, textColumns, orderColumns, search: opts.search, page, pageSize });
  const { rows: cnt } = await poolExec(q.countText, q.countParams);
  const total = cnt[0]?.n ?? 0;
  const { rows } = await poolExec(q.text, q.params);
  return { columns, rows, total, page, pageSize, pkColumns };
}

// ── Coercion nilai form (string) → tipe kolom ───────────────────────────────
function coerce(meta: ColumnMeta | undefined, raw: any): any {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw);
  if (s === '') return meta && meta.nullable ? null : meta && !meta.isText ? null : '';
  if (!meta) return s;
  if (meta.dataType === 'boolean') return s === 'true' || s === 't' || s === '1';
  // int/uuid/timestamp/numeric/enum/json/jsonb → biar PostgreSQL yang cast dari text
  return s;
}

async function resolveActor(actor?: RoleAccess | null): Promise<RoleAccess | null> {
  if (actor) return actor;
  const a = await loadAccessesForWa(ADMIN_WA);
  return a[0] ?? null;
}

async function txRun(
  text: string,
  params: any[],
  confirm: boolean
): Promise<{ rowCount: number; committed: boolean; rows: any[] }> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(text, params);
    const rowCount = res.rowCount ?? 0;
    if (confirm) {
      await client.query('COMMIT');
      return { rowCount, committed: true, rows: res.rows ?? [] };
    }
    await client.query('ROLLBACK');
    return { rowCount, committed: false, rows: res.rows ?? [] };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function auditCrud(
  actor: RoleAccess | null | undefined,
  action: string,
  table: string,
  detail: Record<string, unknown>
): Promise<void> {
  const a = await resolveActor(actor);
  if (!a) return;
  await logAudit({ actor: a, action, targetTable: table, targetId: null, detail: { source: 'browser', ...detail } });
}

export async function insertRow(
  table: string,
  values: Record<string, any>,
  opts: { confirm: boolean; actor?: RoleAccess | null }
): Promise<MutateResult> {
  const columns = await getColumns(table);
  const metaByName = new Map(columns.map((c) => [c.name, c]));
  const cols: string[] = [];
  const params: any[] = [];
  for (const c of columns) {
    if (c.isGenerated) continue;
    if (!Object.prototype.hasOwnProperty.call(values, c.name)) continue;
    const v = values[c.name];
    if ((v === '' || v === null || v === undefined) && (c.hasDefault || c.nullable)) continue; // biar default/NULL
    cols.push(c.name);
    params.push(coerce(metaByName.get(c.name), v));
  }
  const q = buildInsertQuery(table, cols, params);
  const r = await txRun(q.text, q.params, opts.confirm);
  await auditCrud(opts.actor, 'admin_insert', table, { columns: cols, committed: r.committed });
  return { rowCount: r.rowCount, committed: r.committed, requiresConfirm: !r.committed, wouldAffect: r.rowCount, rows: r.rows };
}

export async function updateRow(
  table: string,
  pk: Record<string, any>,
  changes: Record<string, any>,
  opts: { confirm: boolean; actor?: RoleAccess | null }
): Promise<MutateResult> {
  const columns = await getColumns(table);
  const metaByName = new Map(columns.map((c) => [c.name, c]));
  const pkCols = columns.filter((c) => c.isPk).map((c) => c.name);
  if (!pkCols.length) throw new Error('Tabel tanpa primary key — pakai SQL Console.');

  const setEntries = Object.entries(changes).filter(([k]) => metaByName.has(k) && !pkCols.includes(k));
  if (!setEntries.length) throw new Error('Tak ada perubahan.');
  const setCols = setEntries.map(([k]) => k);
  const setVals = setEntries.map(([k, v]) => coerce(metaByName.get(k), v));
  const pkVals = pkCols.map((c) => coerce(metaByName.get(c), pk[c]));

  const q = buildUpdateQuery(table, setCols, setVals, pkCols, pkVals);
  const r = await txRun(q.text, q.params, opts.confirm);
  await auditCrud(opts.actor, 'admin_update', table, { pk, columns: setCols, rowCount: r.rowCount, committed: r.committed });
  return { rowCount: r.rowCount, committed: r.committed, requiresConfirm: !r.committed, wouldAffect: r.rowCount, rows: r.rows };
}

export async function deleteRow(
  table: string,
  pk: Record<string, any>,
  opts: { confirm: boolean; actor?: RoleAccess | null }
): Promise<MutateResult> {
  const columns = await getColumns(table);
  const metaByName = new Map(columns.map((c) => [c.name, c]));
  const pkCols = columns.filter((c) => c.isPk).map((c) => c.name);
  if (!pkCols.length) throw new Error('Tabel tanpa primary key — pakai SQL Console.');
  const pkVals = pkCols.map((c) => coerce(metaByName.get(c), pk[c]));

  const q = buildDeleteQuery(table, pkCols, pkVals);
  const r = await txRun(q.text, q.params, opts.confirm);
  await auditCrud(opts.actor, 'admin_delete', table, { pk, rowCount: r.rowCount, committed: r.committed });
  return { rowCount: r.rowCount, committed: r.committed, requiresConfirm: !r.committed, wouldAffect: r.rowCount, rows: r.rows };
}
