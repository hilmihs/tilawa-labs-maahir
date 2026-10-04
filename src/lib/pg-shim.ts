/**
 * pg-shim.ts — implementasi minimal API query-builder supabase-js di atas
 * PostgreSQL langsung (node-postgres). Tujuan: mengganti `supabaseAdmin`
 * TANPA mengubah 568 call-site di aplikasi.
 *
 * Didukung (sesuai pemakaian aplikasi):
 *   .from(t).select(cols, {count, head})
 *   .insert(rows) .update(obj) .upsert(rows,{onConflict,ignoreDuplicates}) .delete()
 *   filter: .eq .neq .in .gte .lte .gt .lt .is .ilike
 *   .order(col,{ascending,nullsFirst}) .limit(n) .range(a,b)
 *   .single() .maybeSingle()
 *   embedded to-one join: `alias:fk_col(subcols)` (rekursif) via subquery JSON
 *   .select() setelah mutation → RETURNING
 * Hasil resolve {data, error, count, status} (tak pernah reject — mirror supabase-js).
 *
 * TIDAK didukung (tidak dipakai app): .rpc, embed to-many, .or, filter kolom
 * embedded (a.b). Bila dipakai kelak → lempar error jelas.
 */
import type { Exec, Fk, Row } from './pg-core';
import { loadMeta, encodeValue } from './pg-core';

type Meta = { fkMap: Map<string, Fk>; colTypes: Map<string, Map<string, string>> };

export type PgError = { message: string; code?: string; details?: string; hint?: string } | null;
type BaseResult = { error: PgError; count: number | null; status: number };
// Await builder default → data array (mirror supabase-js: `.map(p=>...)` bebas
// noImplicitAny karena elemen array bertipe any). `.single()/.maybeSingle()` →
// data objek (any) sehingga akses `.field` juga bebas error.
export type ResultMany = BaseResult & { data: any[] };
export type ResultOne = BaseResult & { data: any };
type Result = BaseResult & { data: any };

type Filter = { col: string; op: string; val: any };
type NotFilter = { col: string; op: string; val: any };
type Order = { col: string; asc: boolean; nullsFirst?: boolean };

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

// Pisah daftar select di koma level atas (hormati kurung embed).
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

class PgBuilder implements PromiseLike<ResultMany> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private cols = '*';
  private countOpt: 'exact' | 'planned' | 'estimated' | null = null;
  private headOnly = false;
  private filters: Filter[] = [];
  private notFilters: NotFilter[] = [];
  private orFilters: string[] = [];
  private orders: Order[] = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private values: Row[] = [];
  private onConflict: string | null = null;
  private ignoreDuplicates = false;
  private returning: string | null = null; // cols utk RETURNING (mutation + .select())
  private mode: 'many' | 'single' | 'maybe' = 'many';

  constructor(
    private exec: Exec,
    private table: string
  ) {}

  // ── entry ops ──
  select(cols = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): this {
    if (this.op === 'select') {
      this.cols = cols || '*';
      if (opts?.count) this.countOpt = opts.count;
      if (opts?.head) this.headOnly = true;
    } else {
      // .insert(...).select(...) → RETURNING
      this.returning = cols || '*';
    }
    return this;
  }
  insert(values: Row | Row[], opts?: { count?: 'exact' | 'planned' | 'estimated' }): this {
    this.op = 'insert';
    this.values = Array.isArray(values) ? values : [values];
    if (opts?.count) this.countOpt = opts.count;
    return this;
  }
  update(values: Row, opts?: { count?: 'exact' | 'planned' | 'estimated' }): this {
    this.op = 'update';
    this.values = [values];
    if (opts?.count) this.countOpt = opts.count;
    return this;
  }
  upsert(
    values: Row | Row[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean; count?: 'exact' | 'planned' | 'estimated' }
  ): this {
    this.op = 'upsert';
    this.values = Array.isArray(values) ? values : [values];
    this.onConflict = opts?.onConflict ?? null;
    this.ignoreDuplicates = opts?.ignoreDuplicates ?? false;
    if (opts?.count) this.countOpt = opts.count;
    return this;
  }
  delete(opts?: { count?: 'exact' | 'planned' | 'estimated' }): this {
    this.op = 'delete';
    if (opts?.count) this.countOpt = opts.count;
    return this;
  }

  // ── filters ──
  private addFilter(col: string, op: string, val: any): this {
    this.filters.push({ col, op, val });
    return this;
  }
  eq(c: string, v: any) { return this.addFilter(c, '=', v); }
  neq(c: string, v: any) { return this.addFilter(c, '<>', v); }
  gt(c: string, v: any) { return this.addFilter(c, '>', v); }
  gte(c: string, v: any) { return this.addFilter(c, '>=', v); }
  lt(c: string, v: any) { return this.addFilter(c, '<', v); }
  lte(c: string, v: any) { return this.addFilter(c, '<=', v); }
  ilike(c: string, v: any) { return this.addFilter(c, 'ILIKE', v); }
  like(c: string, v: any) { return this.addFilter(c, 'LIKE', v); }
  in(c: string, v: any[]) { return this.addFilter(c, 'IN', v); }
  is(c: string, v: null | boolean) { return this.addFilter(c, 'IS', v); }
  // .not(col, op, val) — op memakai nama operator PostgREST ('is','in','eq',...).
  not(c: string, op: string, v: any): this {
    this.notFilters.push({ col: c, op, val: v });
    return this;
  }
  // .or('col.op.val,col2.op.val,and(...)') — sintaks or-filter PostgREST.
  or(raw: string): this {
    this.orFilters.push(raw);
    return this;
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number): this { this._limit = n; return this; }
  range(from: number, to: number): this {
    this._offset = from;
    this._limit = to - from + 1;
    return this;
  }
  // Terminal — await menghasilkan ResultOne (data: any objek/null).
  single(): PromiseLike<ResultOne> {
    this.mode = 'single';
    return this as unknown as PromiseLike<ResultOne>;
  }
  maybeSingle(): PromiseLike<ResultOne> {
    this.mode = 'maybe';
    return this as unknown as PromiseLike<ResultOne>;
  }

  // ── build select-list (rekursif utk embed) ──
  private buildSelectExprs(table: string, alias: string, cols: string, meta: Meta): string {
    const tokens = splitTop(cols);
    const exprs: string[] = [];
    let embedN = 0;
    for (const tok of tokens) {
      if (tok.includes('(')) {
        // embed: alias:fkcol(inner)  ATAU  fkcol(inner)
        const m = tok.match(/^(?:([\w]+)\s*:\s*)?([\w]+)\s*\(([\s\S]*)\)$/);
        if (!m) throw new Error(`shim: gagal parse embed "${tok}"`);
        const outName = m[1] ?? m[2];
        const fkCol = m[2];
        const inner = m[3];
        const fk = meta.fkMap.get(`${table}.${fkCol}`);
        if (!fk) throw new Error(`shim: FK tak ditemukan utk ${table}.${fkCol} (embed "${tok}")`);
        const childAlias = `${alias}_${embedN++}`;
        const innerExprs = this.buildSelectExprs(fk.ref, childAlias, inner, meta);
        exprs.push(
          `(SELECT to_jsonb(_e) FROM (SELECT ${innerExprs} FROM public.${q(fk.ref)} ${q(childAlias)} ` +
            `WHERE ${q(childAlias)}.${q(fk.refCol)} = ${q(alias)}.${q(fkCol)}) _e) AS ${q(outName)}`
        );
      } else if (tok === '*') {
        exprs.push(`${q(alias)}.*`);
      } else {
        // scalar, mungkin "alias:col"
        const m = tok.match(/^(?:([\w]+)\s*:\s*)?([\w]+)$/);
        if (!m) throw new Error(`shim: gagal parse kolom "${tok}"`);
        if (m[1]) exprs.push(`${q(alias)}.${q(m[2])} AS ${q(m[1])}`);
        else exprs.push(`${q(alias)}.${q(m[2])}`);
      }
    }
    return exprs.join(', ');
  }

  // Predikat gaya PostgREST utk .or()/.not() (op = nama PostgREST).
  private pgrstPredicate(col: string, op: string, val: any, params: any[], alias: string): string {
    const c = `${q(alias)}.${q(col)}`;
    switch (op) {
      case 'is':
        if (val === 'null' || val === null) return `${c} IS NULL`;
        if (val === 'true' || val === true) return `${c} IS TRUE`;
        if (val === 'false' || val === false) return `${c} IS FALSE`;
        params.push(val);
        return `${c} IS NOT DISTINCT FROM $${params.length}`;
      case 'in': {
        let arr: any[];
        if (Array.isArray(val)) arr = val;
        else {
          const inner = String(val).replace(/^\(/, '').replace(/\)$/, '');
          arr = inner.length ? inner.split(',').map((s) => s.trim().replace(/^"|"$/g, '')) : [];
        }
        params.push(arr);
        return `${c} = ANY($${params.length})`;
      }
      case 'eq': params.push(val); return `${c} = $${params.length}`;
      case 'neq': params.push(val); return `${c} <> $${params.length}`;
      case 'gt': params.push(val); return `${c} > $${params.length}`;
      case 'gte': params.push(val); return `${c} >= $${params.length}`;
      case 'lt': params.push(val); return `${c} < $${params.length}`;
      case 'lte': params.push(val); return `${c} <= $${params.length}`;
      case 'like': params.push(val); return `${c} LIKE $${params.length}`;
      case 'ilike': params.push(val); return `${c} ILIKE $${params.length}`;
      default: throw new Error(`shim: operator PostgREST '${op}' belum didukung`);
    }
  }

  // Parse satu token or-filter: `col.op.value` | `and(...)` | `or(...)`.
  private parseOrToken(tok: string, params: any[], alias: string): string {
    tok = tok.trim();
    const grp = tok.match(/^(and|or)\(([\s\S]*)\)$/);
    if (grp) {
      const join = grp[1] === 'and' ? ' AND ' : ' OR ';
      const parts = splitTop(grp[2]).map((p) => this.parseOrToken(p, params, alias));
      return '(' + parts.join(join) + ')';
    }
    const first = tok.indexOf('.');
    const second = tok.indexOf('.', first + 1);
    if (first < 0 || second < 0) throw new Error(`shim .or: token tak valid "${tok}"`);
    const col = tok.slice(0, first);
    const op = tok.slice(first + 1, second);
    const val = tok.slice(second + 1);
    return this.pgrstPredicate(col, op, val, params, alias);
  }

  private buildWhere(alias: string, params: any[]): string {
    const parts: string[] = [];
    for (const f of this.filters) {
      const col = `${q(alias)}.${q(f.col)}`;
      if (f.op === 'IS') {
        if (f.val === null) parts.push(`${col} IS NULL`);
        else if (f.val === true) parts.push(`${col} IS TRUE`);
        else if (f.val === false) parts.push(`${col} IS FALSE`);
        else { params.push(f.val); parts.push(`${col} IS NOT DISTINCT FROM $${params.length}`); }
      } else if (f.op === 'IN') {
        params.push(f.val);
        parts.push(`${col} = ANY($${params.length})`);
      } else {
        params.push(f.val);
        parts.push(`${col} ${f.op} $${params.length}`);
      }
    }
    for (const nf of this.notFilters) {
      parts.push('NOT (' + this.pgrstPredicate(nf.col, nf.op, nf.val, params, alias) + ')');
    }
    for (const raw of this.orFilters) {
      const tokens = splitTop(raw).map((t) => this.parseOrToken(t, params, alias));
      parts.push('(' + tokens.join(' OR ') + ')');
    }
    return parts.length ? ' WHERE ' + parts.join(' AND ') : '';
  }

  private buildTail(alias: string): string {
    let s = '';
    if (this.orders.length) {
      s +=
        ' ORDER BY ' +
        this.orders
          .map((o) => {
            let e = `${q(alias)}.${q(o.col)} ${o.asc ? 'ASC' : 'DESC'}`;
            if (o.nullsFirst !== undefined) e += o.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
            return e;
          })
          .join(', ');
    }
    if (this._limit !== null) s += ` LIMIT ${this._limit}`;
    if (this._offset !== null) s += ` OFFSET ${this._offset}`;
    return s;
  }

  private encodeRow(row: Row, meta: Meta): { cols: string[]; vals: any[] } {
    const types = meta.colTypes.get(this.table) ?? new Map();
    const cols = Object.keys(row);
    const vals = cols.map((c) => encodeValue(row[c], types.get(c)));
    return { cols, vals };
  }

  // RETURNING / select expr utk mutation (kolom skalar saja; embed diabaikan).
  private returningClause(): string {
    if (!this.returning) return '';
    if (this.returning.trim() === '*') return ' RETURNING *';
    const cols = splitTop(this.returning)
      .filter((t) => !t.includes('(')) // buang embed pada RETURNING
      .map((t) => {
        const m = t.match(/^(?:([\w]+)\s*:\s*)?([\w*]+)$/);
        if (!m) return null;
        if (m[2] === '*') return '*';
        return m[1] ? `${q(m[2])} AS ${q(m[1])}` : q(m[2]);
      })
      .filter(Boolean);
    return cols.length ? ` RETURNING ${cols.join(', ')}` : ' RETURNING *';
  }

  private async run(): Promise<Result> {
    const A = 't';
    try {
      // loadMeta DI DALAM try: bila gagal (mis. cold start / pool sibuk saat
      // warm-up pertama) harus jadi {error} yang ditangani call-site, BUKAN
      // reject tak tertangkap yang menembus ke error boundary halaman
      // ("Terjadi kendala"). Meta di-cache; sukses pertama → tak diquery lagi.
      const meta = await loadMeta(this.exec);
      if (this.op === 'select') {
        let count: number | null = null;
        if (this.countOpt) {
          const cp: any[] = [];
          const cwhere = this.buildWhere(A, cp);
          const { rows } = await this.exec(
            `SELECT count(*)::int AS n FROM public.${q(this.table)} ${q(A)}${cwhere}`,
            cp
          );
          count = rows[0]?.n ?? 0;
        }
        if (this.headOnly) {
          return { data: (this.mode === 'many' ? [] : null) as any, error: null, count, status: 200 };
        }
        const params: any[] = [];
        const selectList = this.buildSelectExprs(this.table, A, this.cols, meta);
        const where = this.buildWhere(A, params);
        const tail = this.buildTail(A);
        const sql = `SELECT ${selectList} FROM public.${q(this.table)} ${q(A)}${where}${tail}`;
        const { rows } = await this.exec(sql, params);
        return this.shape(rows, count);
      }

      // ── mutations ──
      if (this.op === 'insert' || this.op === 'upsert') {
        if (this.values.length === 0) return { data: null as any, error: null, count: null, status: 200 };
        const colSet = Array.from(new Set(this.values.flatMap((r) => Object.keys(r))));
        const params: any[] = [];
        const tuples = this.values.map((row) => {
          const ph = colSet.map((c) => {
            const types = meta.colTypes.get(this.table) ?? new Map();
            params.push(encodeValue(row[c] ?? null, types.get(c)));
            return `$${params.length}`;
          });
          return `(${ph.join(', ')})`;
        });
        let sql = `INSERT INTO public.${q(this.table)} (${colSet.map(q).join(', ')}) VALUES ${tuples.join(', ')}`;
        if (this.op === 'upsert') {
          const confl = (this.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          if (this.ignoreDuplicates || confl.length === 0) {
            sql += confl.length ? ` ON CONFLICT (${confl.map(q).join(', ')}) DO NOTHING` : ` ON CONFLICT DO NOTHING`;
          } else {
            const upd = colSet
              .filter((c) => !confl.includes(c))
              .map((c) => `${q(c)} = EXCLUDED.${q(c)}`);
            sql += ` ON CONFLICT (${confl.map(q).join(', ')}) DO UPDATE SET ${
              upd.length ? upd.join(', ') : confl.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')
            }`;
          }
        }
        sql += this.returningClause();
        const { rows, rowCount } = await this.exec(sql, params);
        return this.shape(this.returning ? rows : null, this.countOpt ? rowCount : null);
      }

      if (this.op === 'update') {
        const row = this.values[0] ?? {};
        const params: any[] = [];
        const types = meta.colTypes.get(this.table) ?? new Map();
        const sets = Object.keys(row).map((c) => {
          params.push(encodeValue(row[c], types.get(c)));
          return `${q(c)} = $${params.length}`;
        });
        const where = this.buildWhere(A, params);
        const sql = `UPDATE public.${q(this.table)} ${q(A)} SET ${sets.join(', ')}${where}${this.returningClause()}`;
        const { rows, rowCount } = await this.exec(sql, params);
        return this.shape(this.returning ? rows : null, this.countOpt ? rowCount : null);
      }

      // delete
      const params: any[] = [];
      const where = this.buildWhere(A, params);
      const sql = `DELETE FROM public.${q(this.table)} ${q(A)}${where}${this.returningClause()}`;
      const { rows, rowCount } = await this.exec(sql, params);
      return this.shape(this.returning ? rows : null, this.countOpt ? rowCount : null);
    } catch (e: any) {
      return {
        data: null as any,
        error: { message: e?.message ?? String(e), code: e?.code, details: e?.detail, hint: e?.hint },
        count: null,
        status: 400,
      };
    }
  }

  private shape(rows: Row[] | null, count: number | null): Result {
    if (rows === null) return { data: null as any, error: null, count, status: 200 };
    if (this.mode === 'single') {
      if (rows.length !== 1) {
        return {
          data: null as any,
          error: { message: `Expected 1 row, got ${rows.length}`, code: 'PGRST116' },
          count,
          status: 406,
        };
      }
      return { data: rows[0] as any, error: null, count, status: 200 };
    }
    if (this.mode === 'maybe') {
      if (rows.length > 1) {
        return {
          data: null as any,
          error: { message: `Expected 0-1 rows, got ${rows.length}`, code: 'PGRST116' },
          count,
          status: 406,
        };
      }
      return { data: (rows[0] ?? null) as any, error: null, count, status: 200 };
    }
    return { data: rows as any, error: null, count, status: 200 };
  }

  // thenable — await builder → jalankan query. Await menghasilkan Result
  // (data: any) sehingga call-site lama (mengandalkan tipe supabase-js) tetap
  // kompatibel tanpa perubahan.
  then<R1 = ResultMany, R2 = never>(
    onFulfilled?: ((v: ResultMany) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
  ): Promise<R1 | R2> {
    return this.run().then(
      onFulfilled ? (v) => onFulfilled(v as unknown as ResultMany) : undefined,
      onRejected ?? undefined
    );
  }
}

export type PgShimClient = {
  from: (table: string) => PgBuilder;
};

export function createPgClient(exec: Exec): PgShimClient {
  return {
    from: (table: string) => new PgBuilder(exec, table),
  };
}
