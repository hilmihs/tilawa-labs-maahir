// Ambil SEMUA baris dari query PostgREST yang bisa melebihi limit default (1000).
// PostgREST membatasi hasil per-request; tanpa paginasi, query besar terpotong
// diam-diam. Gunakan build(from,to) + .range() dengan .order() STABIL agar tak
// ada baris terlewat/terduplikat antar-halaman.

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize: number = PAGE_SIZE
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}
