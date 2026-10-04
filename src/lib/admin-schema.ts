import 'server-only';
import { poolExec } from './pg-core';
import {
  TABLES_SQL,
  ALL_COLUMNS_SQL,
  ALL_PK_SQL,
  ALL_FK_SQL,
  ALL_ENUM_SQL,
  SCHEMA_DOMAINS,
  tableDomain,
} from './admin-crud-sql';

/**
 * admin-schema.ts — introspeksi struktur DB untuk tab "Skema" (read-only).
 * Lima query borongan → dirakit jadi grup domain → tabel → kolom + relasi.
 */

export interface SchemaColumn {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  isPk: boolean;
  hasDefault: boolean;
  defaultText: string | null;
  isGenerated: boolean;
  fk: { table: string; column: string } | null;
  enumValues?: string[];
}

export interface SchemaTable {
  name: string;
  rows: number;
  domain: string;
  columns: SchemaColumn[];
  referencedBy: { table: string; column: string }[]; // "dipakai oleh"
}

export interface SchemaGroup {
  domain: string;
  tables: SchemaTable[];
}

export async function getSchemaTree(): Promise<SchemaGroup[]> {
  const [tbl, cols, pks, fks, enums] = await Promise.all([
    poolExec(TABLES_SQL),
    poolExec(ALL_COLUMNS_SQL),
    poolExec(ALL_PK_SQL),
    poolExec(ALL_FK_SQL),
    poolExec(ALL_ENUM_SQL),
  ]);

  // enum type → labels
  const enumByType = new Map<string, string[]>();
  for (const r of enums.rows) {
    const arr = enumByType.get(r.typname) ?? [];
    arr.push(r.enumlabel);
    enumByType.set(r.typname, arr);
  }
  // pk: table → Set(col)
  const pkByTable = new Map<string, Set<string>>();
  for (const r of pks.rows) {
    const s = pkByTable.get(r.table_name) ?? new Set<string>();
    s.add(r.column_name);
    pkByTable.set(r.table_name, s);
  }
  // fk: `table.col` → {table,column}; reverse: refTable → [{table,column}]
  const fkByCol = new Map<string, { table: string; column: string }>();
  const reverseByTable = new Map<string, { table: string; column: string }[]>();
  for (const r of fks.rows) {
    fkByCol.set(`${r.src}.${r.col}`, { table: r.ref, column: r.refcol });
    const arr = reverseByTable.get(r.ref) ?? [];
    arr.push({ table: r.src, column: r.col });
    reverseByTable.set(r.ref, arr);
  }
  // columns grouped by table (sudah terurut ordinal_position dari SQL)
  const colsByTable = new Map<string, any[]>();
  for (const r of cols.rows) {
    const arr = colsByTable.get(r.table_name) ?? [];
    arr.push(r);
    colsByTable.set(r.table_name, arr);
  }

  const tables: SchemaTable[] = tbl.rows.map((t: any) => {
    const name = t.name as string;
    const columns: SchemaColumn[] = (colsByTable.get(name) ?? []).map((c: any) => {
      const isEnum = c.data_type === 'USER-DEFINED';
      const enumValues = isEnum ? enumByType.get(c.udt_name) : undefined;
      return {
        name: c.column_name,
        dataType: c.data_type,
        udtName: c.udt_name,
        nullable: c.is_nullable === 'YES',
        isPk: pkByTable.get(name)?.has(c.column_name) ?? false,
        hasDefault: c.column_default != null,
        defaultText: c.column_default ?? null,
        isGenerated: c.is_generated === 'ALWAYS' || c.identity_generation != null,
        fk: fkByCol.get(`${name}.${c.column_name}`) ?? null,
        enumValues: enumValues && enumValues.length ? enumValues : undefined,
      };
    });
    return {
      name,
      rows: Number(t.rows ?? 0),
      domain: tableDomain(name),
      columns,
      // dedup per tabel (satu tabel bisa punya >1 kolom FK ke tabel ini) —
      // chip cuma tampilkan nama tabel, jadi buang duplikat.
      referencedBy: Array.from(
        new Map((reverseByTable.get(name) ?? []).map((r) => [r.table, r])).values()
      ).sort((a, b) => a.table.localeCompare(b.table)),
    };
  });

  // Grup per domain sesuai urutan SCHEMA_DOMAINS; buang grup kosong.
  const byDomain = new Map<string, SchemaTable[]>();
  for (const t of tables) {
    const arr = byDomain.get(t.domain) ?? [];
    arr.push(t);
    byDomain.set(t.domain, arr);
  }
  const groups: SchemaGroup[] = [];
  for (const domain of SCHEMA_DOMAINS) {
    const list = byDomain.get(domain);
    if (list && list.length) {
      groups.push({ domain, tables: list.sort((a, b) => a.name.localeCompare(b.name)) });
    }
  }
  return groups;
}
