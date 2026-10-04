/**
 * admin-crud-sql.ts — query builder MURNI untuk table browser admin.
 *
 * Tanpa side-effect, tanpa import DB / server-only → bisa di-unit-test langsung.
 * Semua identifier (nama tabel/kolom) di-quote; semua NILAI lewat parameter ($n)
 * → aman dari injeksi. Nama tabel/kolom diasumsikan sudah divalidasi lewat
 * information_schema oleh pemanggil (admin-crud.ts).
 */

export function quoteIdent(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

// ── Introspeksi schema (dipakai admin-crud.ts + test) ───────────────────────
export const TABLES_SQL =
  `SELECT relname AS name, n_live_tup AS rows FROM pg_stat_user_tables ` +
  `WHERE schemaname='public' ORDER BY relname`;

export const TABLE_EXISTS_SQL =
  `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`;

export const COLUMNS_SQL =
  `SELECT column_name, data_type, udt_name, is_nullable, column_default, ` +
  `is_generated, identity_generation ` +
  `FROM information_schema.columns ` +
  `WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`;

export const PK_SQL =
  `SELECT kcu.column_name FROM information_schema.table_constraints tc ` +
  `JOIN information_schema.key_column_usage kcu ` +
  `  ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema ` +
  `WHERE tc.table_schema='public' AND tc.table_name=$1 ` +
  `  AND tc.constraint_type='PRIMARY KEY' ORDER BY kcu.ordinal_position`;

export const ENUM_SQL =
  `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid ` +
  `WHERE t.typname=$1 ORDER BY e.enumsortorder`;

// ── Builder CRUD ────────────────────────────────────────────────────────────
export interface BrowseInput {
  table: string;
  textColumns: string[]; // kolom text yang bisa dicari
  orderColumns: string[]; // pk cols (fallback kolom pertama)
  search?: string;
  page: number;
  pageSize: number;
}

export interface BuiltQuery {
  text: string;
  params: any[];
}

export function buildBrowseQuery(inp: BrowseInput): BuiltQuery & { countText: string; countParams: any[] } {
  const ident = quoteIdent(inp.table);
  const params: any[] = [];
  let where = '';
  const search = (inp.search ?? '').trim();
  if (search && inp.textColumns.length) {
    params.push(`%${search}%`);
    where = ' WHERE ' + inp.textColumns.map((c) => `${quoteIdent(c)} ILIKE $1`).join(' OR ');
  }
  const countText = `SELECT count(*)::int AS n FROM ${ident}${where}`;
  const countParams = [...params];

  const order = inp.orderColumns.length ? inp.orderColumns.map(quoteIdent).join(', ') : '1';
  const limIdx = params.length + 1;
  const offIdx = params.length + 2;
  params.push(inp.pageSize, inp.page * inp.pageSize);
  const text = `SELECT * FROM ${ident}${where} ORDER BY ${order} LIMIT $${limIdx} OFFSET $${offIdx}`;
  return { text, params, countText, countParams };
}

export function buildInsertQuery(table: string, columns: string[], values: any[]): BuiltQuery {
  if (!columns.length) throw new Error('Tak ada kolom untuk insert.');
  const ident = quoteIdent(table);
  const cols = columns.map(quoteIdent).join(', ');
  const ph = columns.map((_, i) => `$${i + 1}`).join(', ');
  return { text: `INSERT INTO ${ident} (${cols}) VALUES (${ph}) RETURNING *`, params: values };
}

export function buildUpdateQuery(
  table: string,
  setColumns: string[],
  setValues: any[],
  pkColumns: string[],
  pkValues: any[]
): BuiltQuery {
  if (!setColumns.length) throw new Error('Tak ada perubahan.');
  if (!pkColumns.length) throw new Error('Tabel tanpa primary key.');
  const ident = quoteIdent(table);
  const set = setColumns.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(', ');
  const base = setColumns.length;
  const where = pkColumns.map((c, i) => `${quoteIdent(c)} = $${base + i + 1}`).join(' AND ');
  return { text: `UPDATE ${ident} SET ${set} WHERE ${where} RETURNING *`, params: [...setValues, ...pkValues] };
}

export function buildDeleteQuery(table: string, pkColumns: string[], pkValues: any[]): BuiltQuery {
  if (!pkColumns.length) throw new Error('Tabel tanpa primary key.');
  const ident = quoteIdent(table);
  const where = pkColumns.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(' AND ');
  return { text: `DELETE FROM ${ident} WHERE ${where}`, params: pkValues };
}

// ── Introspeksi borongan (untuk tab Skema — 1 query per jenis, bukan per-tabel) ──
export const ALL_COLUMNS_SQL =
  `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, ` +
  `is_generated, identity_generation, ordinal_position ` +
  `FROM information_schema.columns WHERE table_schema='public' ` +
  `ORDER BY table_name, ordinal_position`;

export const ALL_PK_SQL =
  `SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc ` +
  `JOIN information_schema.key_column_usage kcu ` +
  `  ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema ` +
  `WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY'`;

export const ALL_FK_SQL =
  `SELECT tc.table_name AS src, kcu.column_name AS col, ` +
  `       ccu.table_name AS ref, ccu.column_name AS refcol ` +
  `FROM information_schema.table_constraints tc ` +
  `JOIN information_schema.key_column_usage kcu ` +
  `  ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema ` +
  `JOIN information_schema.constraint_column_usage ccu ` +
  `  ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema ` +
  `WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`;

export const ALL_ENUM_SQL =
  `SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid ` +
  `ORDER BY t.typname, e.enumsortorder`;

// ── Klasifikasi domain tabel (untuk grouping tree) — pure, testable ─────────
export const SCHEMA_DOMAINS = [
  'Identitas & Role',
  'Setoran & Hafalan',
  'HITS',
  'Penilaian & Matrix',
  'Kehadiran & Program',
  'Tabayyun, Teguran & Alasan',
  'Sistem & Audit',
  'Lainnya',
] as const;

const DOMAIN_MAP: Record<string, string> = {
  peserta: 'Identitas & Role', musyrif: 'Identitas & Role', koordinator: 'Identitas & Role',
  koordinator_hits: 'Identitas & Role', syaikh: 'Identitas & Role', pengajar: 'Identitas & Role',
  ketua_kelas: 'Identitas & Role', koordinator_ketua_kelas: 'Identitas & Role',
  kelompok_pengajar: 'Identitas & Role', kelas: 'Identitas & Role', kelas_hits: 'Identitas & Role',
  setoran: 'Setoran & Hafalan', setoran_musyrif: 'Setoran & Hafalan',
  rekaman: 'Setoran & Hafalan', rekaman_musyrif: 'Setoran & Hafalan',
  maahir_setoran_target: 'Setoran & Hafalan',
  penilaian_masyaikh: 'Penilaian & Matrix', penilaian_pedagogis: 'Penilaian & Matrix',
  matrix_rekap: 'Penilaian & Matrix', indikator_standar: 'Penilaian & Matrix',
  checkin_pengajar: 'Kehadiran & Program', program_kehadiran: 'Kehadiran & Program',
  program_kelas_libur: 'Kehadiran & Program', program_kelas_libur_request: 'Kehadiran & Program',
  libur_program: 'Kehadiran & Program', jadwal_pindah: 'Kehadiran & Program',
  observasi_kelas: 'Kehadiran & Program',
  tabayyun: 'Tabayyun, Teguran & Alasan', teguran: 'Tabayyun, Teguran & Alasan',
  shakwa: 'Tabayyun, Teguran & Alasan', pengajuan_alasan: 'Tabayyun, Teguran & Alasan',
  ketua_dualrole_request: 'Tabayyun, Teguran & Alasan',
  audit_log: 'Sistem & Audit', session_log: 'Sistem & Audit', wa_reminder_log: 'Sistem & Audit',
  koordinator_notes: 'Sistem & Audit', batch_config: 'Sistem & Audit',
};

export function tableDomain(name: string): string {
  if (name.startsWith('hits_')) return 'HITS';
  return DOMAIN_MAP[name] ?? 'Lainnya';
}
