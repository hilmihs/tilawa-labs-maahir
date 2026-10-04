/**
 * load-data.ts — muat data hasil export (_backup_supabase/data/*.json) ke
 * Postgres tujuan.
 *
 * Dipakai 2 cara:
 *   1. CLI  : DATABASE_URL=postgres://... tsx db-migration/load-data.ts
 *             (butuh `npm i pg`; connect ke Postgres asli)
 *   2. Modul: import { loadData } — dipanggil harness test (PGlite) & CLI.
 *
 * Cara kerja:
 *   - session_replication_role = replica  → matikan trigger & cek FK saat load,
 *     jadi urutan tabel tidak masalah.
 *   - Introspeksi tipe kolom dari information_schema → kolom json/jsonb di-
 *     stringify + cast ::jsonb, kolom lain dikirim apa adanya.
 *   - Insert per-batch (500 baris) dgn placeholder $n.
 *
 * PRASYARAT: schema sudah dibuat (00_roles.sql lalu schema.sql).
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type QueryFn = (
  text: string,
  params?: unknown[]
) => Promise<{ rows: any[] }>;

const BATCH = 500;

type ColMeta = { name: string; isJson: boolean };

async function tableColumns(q: QueryFn, table: string): Promise<ColMeta[]> {
  const { rows } = await q(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
      ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((r) => ({
    name: r.column_name,
    isJson: r.data_type === 'json' || r.data_type === 'jsonb',
  }));
}

function encode(val: unknown, isJson: boolean): unknown {
  if (val === null || val === undefined) return null;
  if (isJson) return JSON.stringify(val);
  // Kolom non-json yg kebetulan berisi object (harusnya tak terjadi utk schema
  // ini) → stringify defensif.
  if (typeof val === 'object' && !Array.isArray(val)) return JSON.stringify(val);
  return val;
}

export async function loadData(
  q: QueryFn,
  dataDir: string,
  opts: { truncate?: boolean; log?: (s: string) => void } = {}
): Promise<{ counts: Record<string, number>; total: number }> {
  const log = opts.log ?? (() => {});
  const files = (await readdir(dataDir)).filter((f) => f.endsWith('.json')).sort();

  await q(`SET session_replication_role = replica`);

  // Truncate semua tabel target dulu (idempotent) bila diminta.
  if (opts.truncate) {
    for (const f of files) {
      const table = f.replace(/\.json$/, '');
      await q(`TRUNCATE TABLE public."${table}" CASCADE`).catch(() => {});
    }
  }

  const counts: Record<string, number> = {};
  let total = 0;

  for (const f of files) {
    const table = f.replace(/\.json$/, '');
    const rows: Record<string, unknown>[] = JSON.parse(
      await readFile(join(dataDir, f), 'utf8')
    );
    counts[table] = 0;
    if (rows.length === 0) continue;

    const cols = await tableColumns(q, table);
    if (cols.length === 0) {
      log(`  ! lewati ${table}: tabel tak ada di schema tujuan`);
      continue;
    }
    const colByName = new Map(cols.map((c) => [c.name, c]));
    // Kolom yg dipakai = irisan kunci JSON & kolom tabel (urutan tabel).
    const useCols = cols.filter((c) =>
      Object.prototype.hasOwnProperty.call(rows[0], c.name)
    );
    const colList = useCols.map((c) => `"${c.name}"`).join(',');

    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const params: unknown[] = [];
      const tuples: string[] = [];
      for (const row of chunk) {
        const ph: string[] = [];
        for (const c of useCols) {
          params.push(encode(row[c.name], colByName.get(c.name)!.isJson));
          ph.push(`$${params.length}`);
        }
        tuples.push(`(${ph.join(',')})`);
      }
      await q(
        `INSERT INTO public."${table}" (${colList}) VALUES ${tuples.join(',')}`,
        params
      );
    }
    counts[table] = rows.length;
    total += rows.length;
    log(`  ✓ ${table.padEnd(38)} ${rows.length}`);
  }

  await q(`SET session_replication_role = default`);
  return { counts, total };
}

// ── CLI (Postgres asli via node-postgres) ───────────────────────────────────
async function cli() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL=postgres://user:pass@host:5432/db');
  // Import dinamis supaya modul ini tetap bisa di-import harness tanpa `pg`.
  const pg = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const q: QueryFn = (text, params) => client.query(text, params as any[]);
  const dataDir = join(process.cwd(), '_backup_supabase', 'data');
  console.log(`Muat data dari ${dataDir} → ${url.replace(/:[^:@/]*@/, ':****@')}`);
  const { counts, total } = await loadData(q, dataDir, {
    truncate: true,
    log: (s) => console.log(s),
  });
  await client.end();
  console.log(`\nSelesai: ${Object.keys(counts).length} tabel, ${total} baris.`);
}

// Jalankan CLI hanya bila dieksekusi langsung.
if (import.meta.url === `file://${process.argv[1]}`) {
  cli().catch((e) => {
    console.error('LOAD GAGAL:', e);
    process.exit(1);
  });
}
