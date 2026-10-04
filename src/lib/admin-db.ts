import 'server-only';
import { getPool } from './pg-core';
import { logAudit } from './audit';
import { loadAccessesForWa } from './access';
import { ADMIN_WA } from './constants';
import type { RoleAccess } from '@/types/db';

/**
 * admin-db.ts — core eksekusi SQL admin (superadmin-only).
 *
 * Dipakai dua entry point:
 *   - API route  /api/admin/db  (bearer token, jalur cepat Claude)
 *   - Server actions halaman /admin/db (cookie + requireAdmin, jalur human)
 *
 * Aturan safety (guarded writes):
 *   - READ  (SELECT/WITH/EXPLAIN/SHOW/TABLE/VALUES) → jalan dalam transaksi
 *     READ ONLY. Kalau ada tulis nyelip (mis. `WITH ... DELETE`), Postgres
 *     menolak → tak ada perubahan data. Hasil dipangkas MAX_ROWS.
 *   - WRITE (sisanya) → dibungkus transaksi utk PREVIEW: jalankan, ambil
 *     rowCount, lalu ROLLBACK bila `confirm !== true` (balikkan wouldAffect
 *     tanpa commit). COMMIT hanya bila `confirm === true`.
 *   - Statement non-transaksional (VACUUM, CREATE INDEX CONCURRENTLY, dst) tak
 *     bisa di-preview → butuh `confirm` + `allowNonTx` untuk jalan langsung.
 *   - Setiap statement yang benar-benar jalan diaudit ke audit_log
 *     (action 'admin_sql'). Audit dilakukan SETELAH koneksi tx dilepas supaya
 *     tak deadlock saat pool max=1.
 */

const READ_KEYWORDS = new Set(['SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'TABLE', 'VALUES']);
const MAX_ROWS = 1000;

// Statement yang tak boleh/bisa jalan di dalam blok transaksi (preview mustahil).
const NON_TX_RE =
  /\b(VACUUM|REINDEX|CLUSTER|CREATE\s+DATABASE|DROP\s+DATABASE|ALTER\s+SYSTEM|CREATE\s+INDEX\s+CONCURRENTLY|DROP\s+INDEX\s+CONCURRENTLY)\b/i;

export type AdminSqlSource = 'api' | 'console';

export interface AdminSqlResult {
  kind: 'read' | 'write';
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  committed: boolean;
  requiresConfirm?: boolean;
  wouldAffect?: number;
  truncated?: boolean;
  notice?: string;
}

export interface RunAdminSqlOpts {
  confirm?: boolean;
  source: AdminSqlSource;
  /** Actor utk audit. Bila null → di-resolve dari ADMIN_WA. */
  actor?: RoleAccess | null;
  /** Izinkan statement non-transaksional jalan langsung (tanpa preview). */
  allowNonTx?: boolean;
}

/** Ambil keyword pertama, mengabaikan komentar `-- ...` dan block-comment di depan. */
function firstKeyword(sql: string): string {
  const cleaned = sql.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/, '');
  const m = cleaned.match(/^\s*([a-zA-Z]+)/);
  return m ? m[1].toUpperCase() : '';
}

function classify(sql: string): 'read' | 'write' {
  return READ_KEYWORDS.has(firstKeyword(sql)) ? 'read' : 'write';
}

/** node-postgres bisa balikkan array (multi-statement); ambil result terakhir. */
function pickResult(res: any): any {
  if (Array.isArray(res)) return res[res.length - 1] ?? res[0] ?? {};
  return res ?? {};
}

function columnsOf(res: any, rows: Record<string, any>[]): string[] {
  if (res.fields?.length) return res.fields.map((f: any) => f.name);
  return rows[0] ? Object.keys(rows[0]) : [];
}

async function audit(
  opts: RunAdminSqlOpts,
  sql: string,
  kind: 'read' | 'write',
  rowCount: number,
  committed: boolean
): Promise<void> {
  let actor = opts.actor ?? null;
  if (!actor) {
    const accesses = await loadAccessesForWa(ADMIN_WA);
    actor = accesses[0] ?? null;
  }
  if (!actor) return; // best-effort; audit_log.actor_id NOT NULL butuh actor valid
  await logAudit({
    actor,
    action: 'admin_sql',
    targetTable: 'admin_db',
    targetId: null,
    detail: { sql: sql.slice(0, 4000), source: opts.source, kind, rowCount, committed },
  });
}

export async function runAdminSql(sql: string, opts: RunAdminSqlOpts): Promise<AdminSqlResult> {
  const trimmed = (sql ?? '').trim();
  if (!trimmed) throw new Error('SQL kosong.');
  const kind = classify(trimmed);

  let result: AdminSqlResult;
  // Audit hanya untuk statement yang benar-benar dieksekusi terhadap data.
  let auditInfo: { rowCount: number; committed: boolean } | null = null;

  const client = await getPool().connect();
  try {
    if (kind === 'read') {
      // ── READ: transaksi READ ONLY (guard tulis nyelip) ──────────────────
      await client.query('BEGIN');
      await client.query('SET TRANSACTION READ ONLY');
      let raw: any;
      try {
        raw = await client.query(trimmed);
      } finally {
        await client.query('ROLLBACK').catch(() => {});
      }
      const res = pickResult(raw);
      const rowsAll: Record<string, any>[] = res.rows ?? [];
      const rows = rowsAll.slice(0, MAX_ROWS);
      const rowCount = res.rowCount ?? rowsAll.length;
      result = {
        kind,
        columns: columnsOf(res, rows),
        rows,
        rowCount,
        committed: true,
        truncated: rowsAll.length > MAX_ROWS,
      };
      auditInfo = { rowCount, committed: true };
    } else if (NON_TX_RE.test(trimmed)) {
      // ── WRITE non-transaksional (tak bisa di-preview) ───────────────────
      if (!(opts.confirm === true && opts.allowNonTx === true)) {
        result = {
          kind,
          columns: [],
          rows: [],
          rowCount: 0,
          committed: false,
          requiresConfirm: true,
          notice:
            'Statement non-transaksional (VACUUM/CONCURRENTLY/dst) — tak bisa di-preview. ' +
            'Jalankan ulang dengan confirm=true DAN allowNonTx=true untuk eksekusi langsung.',
        };
        // tidak dieksekusi → tidak diaudit
      } else {
        const res = pickResult(await client.query(trimmed));
        result = { kind, columns: [], rows: res.rows ?? [], rowCount: res.rowCount ?? 0, committed: true };
        auditInfo = { rowCount: res.rowCount ?? 0, committed: true };
      }
    } else {
      // ── WRITE transaksional: preview → confirm ──────────────────────────
      await client.query('BEGIN');
      try {
        const res = pickResult(await client.query(trimmed));
        const affected = res.rowCount ?? 0;
        if (opts.confirm === true) {
          await client.query('COMMIT');
          const rows: Record<string, any>[] = res.rows ?? [];
          result = { kind, columns: columnsOf(res, rows), rows, rowCount: affected, committed: true };
          auditInfo = { rowCount: affected, committed: true };
        } else {
          await client.query('ROLLBACK');
          result = {
            kind,
            columns: [],
            rows: [],
            rowCount: affected,
            committed: false,
            requiresConfirm: true,
            wouldAffect: affected,
            notice: `Preview: ${affected} baris terdampak. Jalankan ulang dengan confirm=true untuk commit.`,
          };
          auditInfo = { rowCount: affected, committed: false };
        }
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      }
    }
  } finally {
    client.release();
  }

  // Audit setelah koneksi dilepas (aman utk pool max=1).
  if (auditInfo) {
    await audit(opts, trimmed, kind, auditInfo.rowCount, auditInfo.committed);
  }
  return result;
}
