/**
 * check-api-registry.ts — cocokkan registry API publik ke information_schema prod.
 *
 * Tiga penjaga (spesifikasi §9):
 *   1. setiap kolom di registry + tiap `order.column` benar-benar ada di prod;
 *   2. tak ada kolom terlarang (FORBIDDEN_COLUMNS) yang bocor ke `columns` entitas;
 *   3. peringatkan kolom prod yang belum dikenal registry (penjaga ke depan).
 *
 * Jalankan sebelum deploy: npm run check-api
 * Butuh jaringan ke prod + ADMIN_API_TOKEN di .env.local.
 *
 * Nama tabel di query di-interpolasi dari registry (tepercaya, bukan input
 * eksternal). Endpoint admin/db menerima string SQL mentah tanpa bind param.
 */
import { ENTITIES, FORBIDDEN_COLUMNS } from '../src/lib/api-public/registry';

async function runSql(sql: string): Promise<Array<Record<string, unknown>>> {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) {
    console.error('✗ ADMIN_API_TOKEN belum di-set di .env.local');
    process.exit(2);
  }
  const base = (process.env.ADMIN_API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) {
    console.error('✗ ADMIN_API_URL / NEXT_PUBLIC_APP_URL belum di-set di .env.local');
    process.exit(2);
  }
  const res = await fetch(`${base}/api/admin/db`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ sql, confirm: false, allowNonTx: false }),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; rows?: Array<Record<string, unknown>>; error?: string }
    | null;
  if (!res.ok || !data || data.ok === false) {
    const detail = data?.error ? `: ${data.error}` : '';
    console.error(`✗ HTTP ${res.status} saat query information_schema${detail}`);
    process.exit(1);
  }
  return data.rows ?? [];
}

async function prodColumns(table: string): Promise<Set<string>> {
  const rows = await runSql(
    `select column_name from information_schema.columns where table_name = '${table}'`,
  );
  return new Set(rows.map((r) => String(r.column_name)));
}

async function main() {
  let problems = 0;

  // cache kolom per tabel supaya tak query berulang
  const tableCache = new Map<string, Set<string>>();
  async function colsOf(table: string): Promise<Set<string>> {
    if (!tableCache.has(table)) tableCache.set(table, await prodColumns(table));
    return tableCache.get(table)!;
  }

  // known = tabel.kolom yang dikenal registry (utk laporan kolom prod tak dikenal)
  const known = new Set<string>();

  for (const def of Object.values(ENTITIES)) {
    const cols = await colsOf(def.table);
    if (cols.size === 0) {
      console.error(`✗ ${def.route}: tabel '${def.table}' tak ditemukan di prod (0 kolom)`);
      problems++;
      continue;
    }
    // §1 kolom + order.column harus ada; §2 tak ada kolom terlarang di columns
    const toCheck = [...def.columns, def.order.column];
    for (const c of toCheck) {
      if (!cols.has(c)) {
        console.error(`✗ ${def.route}: kolom '${c}' tak ada di prod ${def.table}`);
        problems++;
      }
      if (FORBIDDEN_COLUMNS.includes(c)) {
        console.error(`✗ ${def.route}: kolom terlarang '${c}' lolos ke registry`);
        problems++;
      }
      known.add(`${def.table}.${c}`);
    }
  }

  // §3 laporan kolom prod yang belum dikenal registry (hanya peringatan)
  for (const [table, cols] of tableCache) {
    for (const c of cols) {
      if (FORBIDDEN_COLUMNS.includes(c)) continue; // memang sengaja ditahan
      if (!known.has(`${table}.${c}`)) {
        console.warn(`… ${table}.${c} ada di prod, belum dikenal registry`);
      }
    }
  }

  console.log(
    problems
      ? `\n${problems} masalah — perbaiki registry sebelum deploy.`
      : '\n✓ registry cocok dgn prod.',
  );
  if (problems) process.exit(1);
}

main().catch((err) => {
  console.error('✗ Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
