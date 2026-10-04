/**
 * pg-core.ts — koneksi Postgres langsung + metadata schema untuk shim.
 *
 * Menggantikan ketergantungan Supabase/PostgREST: aplikasi kini bicara ke
 * PostgreSQL polos via node-postgres. Modul ini menyediakan:
 *   - executor query (pool produksi, atau executor lain utk test/PGlite)
 *   - peta foreign key (table.col → tabel/kolom rujukan) untuk embedded join
 *   - tipe kolom per tabel (json/jsonb/array) untuk encode nilai saat write
 *
 * ENV: DATABASE_URL=postgres://user:pass@host:5432/db
 */
import { Pool, types } from 'pg';

// ── Samakan tipe hasil dengan supabase-js (PostgREST JSON) ──────────────────
// node-postgres default mengembalikan objek Date untuk date/timestamp dan string
// untuk numeric/int8. Kode aplikasi ditulis untuk keluaran supabase-js (JSON):
// tanggal = string, numeric = number. Selaraskan lewat type parser global supaya
// ~568 call-site tak perlu diubah (mis. `week_start.split('-')` butuh string).
//   1082 date        → "YYYY-MM-DD" (apa adanya)
//   1114 timestamp   → ISO-ish string (ganti spasi → 'T')
//   1184 timestamptz → ISO string (…Z)
//   1700 numeric     → number
//   20   int8/bigint → number
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, (v) => (v == null ? v : String(v).replace(' ', 'T')));
types.setTypeParser(1184, (v) => (v == null ? v : new Date(v).toISOString()));
types.setTypeParser(1700, (v) => (v == null ? v : parseFloat(v)));
types.setTypeParser(20, (v) => (v == null ? v : parseInt(v, 10)));

export type Row = Record<string, any>;
export type Exec = (text: string, params?: any[]) => Promise<{ rows: Row[]; rowCount: number }>;

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const cs = process.env.DATABASE_URL;
    if (!cs) throw new Error('DATABASE_URL belum di-set (postgres://user:pass@host:5432/db)');
    // PG_POOL_MAX opsional (default 10). Set 1 saat uji terhadap PGlite-socket
    // yang hanya melayani satu koneksi.
    const max = Number(process.env.PG_POOL_MAX ?? 10) || 10;
    pool = new Pool({ connectionString: cs, max });
  }
  return pool;
}

// Executor produksi (pakai pool).
export const poolExec: Exec = async (text, params) => {
  const r = await getPool().query(text, params);
  return { rows: r.rows, rowCount: r.rowCount ?? 0 };
};

// ── Metadata schema (di-cache; schema stabil selama proses) ──────────────────
export type Fk = { ref: string; refCol: string };
let fkMap: Map<string, Fk> | null = null;
let colTypes: Map<string, Map<string, string>> | null = null;

export async function loadMeta(exec: Exec): Promise<{
  fkMap: Map<string, Fk>;
  colTypes: Map<string, Map<string, string>>;
}> {
  if (!fkMap) {
    const { rows } = await exec(
      `SELECT tc.table_name AS src, kcu.column_name AS col,
              ccu.table_name AS ref, ccu.column_name AS refcol
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
      []
    );
    const m = new Map<string, Fk>();
    for (const r of rows) m.set(`${r.src}.${r.col}`, { ref: r.ref, refCol: r.refcol });
    fkMap = m;
  }
  if (!colTypes) {
    const { rows } = await exec(
      `SELECT table_name AS t, column_name AS c, data_type AS d
         FROM information_schema.columns WHERE table_schema='public'`,
      []
    );
    const m = new Map<string, Map<string, string>>();
    for (const r of rows) {
      if (!m.has(r.t)) m.set(r.t, new Map());
      m.get(r.t)!.set(r.c, r.d);
    }
    colTypes = m;
  }
  return { fkMap, colTypes };
}

// Reset cache (dipakai test antar-instance).
export function resetMeta(): void {
  fkMap = null;
  colTypes = null;
}

// Encode satu nilai utk parameter INSERT/UPDATE sesuai tipe kolom.
export function encodeValue(val: unknown, dataType: string | undefined): unknown {
  if (val === null || val === undefined) return null;
  if (dataType === 'json' || dataType === 'jsonb') return JSON.stringify(val);
  if (dataType === 'ARRAY') return val; // node-postgres serialisasi array JS → array PG
  // Objek di kolom non-json (harusnya tak terjadi) → stringify defensif.
  if (typeof val === 'object' && !Array.isArray(val)) return JSON.stringify(val);
  return val;
}
