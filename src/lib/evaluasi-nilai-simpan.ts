/**
 * Simpan satu baris `evaluasi_nilai` dengan PENJAGA VERSI (optimistic lock).
 *
 * Dulu upsert baris penuh = siapa terakhir menulis, dia menang: tab lama atau
 * HP kedua yang masih memegang data basi diam-diam menimpa nilai yang lebih
 * baru, dan pengajar mengira isiannya "hilang lagi". Kini klien mengirim
 * `updated_at` yang ia kenal (`expected`); penulisan hanya terjadi bila baris
 * di server masih versi itu. Bila tidak, pemanggil mendapat isi terkini untuk
 * ditampilkan — bukan ditimpa.
 *
 * Tanpa migrasi: `evaluasi_nilai.updated_at` sudah ada sejak 0051 dan
 * dimajukan trigger `set_updated_at` di tiap UPDATE. Perbandingan dilakukan
 * dengan toleransi < 1 ms karena presisi yang sampai ke klien hanya milidetik
 * (parser timestamptz di pg-core → `toISOString()`, mikrodetik terpotong).
 *
 * Sesi 'terkirim' ikut dijaga di DALAM pernyataan yang sama, jadi tak ada
 * jendela antara cek status dan penulisan (kirim yang menyelip di tengah).
 */
import { getPool } from '@/lib/pg-core';
import { ALL_LAHN, columnsToCounts, type LahnCounts } from '@/lib/evaluasi';

export interface NilaiTulis {
  sesi_id: string;
  peserta_id: string;
  hadir: boolean;
  ayat_terakhir: number | null;
  /** Kolom lahn (jk_*, kh_*) → jumlah. */
  cols: Record<string, number>;
  skor: number;
  catatan: string | null;
  confirmed: boolean;
  done: boolean;
}

/** Isi baris di server, dalam bentuk yang dipakai layar pengajar. */
export interface NilaiTerkini {
  hadir: boolean;
  counts: LahnCounts;
  catatan: string;
  confirmed: boolean;
  done: boolean;
  updated_at: string;
}

export type HasilSimpanBerversi =
  | { ok: true; updated_at: string }
  | { ok: false; alasan: 'terkirim' }
  | { ok: false; alasan: 'konflik'; current: NilaiTerkini | null };

const KOLOM_LAHN = ALL_LAHN.map((d) => d.column);

function isoAtauNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function keTerkini(row: Record<string, unknown>): NilaiTerkini {
  return {
    hadir: row.hadir !== false,
    counts: columnsToCounts(row),
    catatan: (row.catatan as string | null) ?? '',
    confirmed: !!row.confirmed,
    done: !!row.done,
    updated_at: isoAtauNull(row.updated_at) ?? '',
  };
}

/** Isi server sama persis dengan yang hendak ditulis? (kiriman ulang yang jawabannya hilang) */
function isiSama(row: Record<string, unknown>, t: NilaiTulis): boolean {
  if ((row.hadir !== false) !== t.hadir) return false;
  if (!!row.confirmed !== t.confirmed) return false;
  if (!!row.done !== t.done) return false;
  if (((row.catatan as string | null) ?? '') !== (t.catatan ?? '')) return false;
  for (const c of KOLOM_LAHN) {
    if (Number(row[c] || 0) !== Number(t.cols[c] || 0)) return false;
  }
  return true;
}

/**
 * Tulis bila versi server masih `expected`.
 *
 * - `expected === null` → klien yakin baris BELUM ada: hanya INSERT; bila baris
 *   ternyata sudah dibuat perangkat lain → konflik.
 * - `expected` berisi → hanya UPDATE baris yang updated_at-nya masih itu; baris
 *   yang sudah berubah ATAU sudah dihapus (reset di perangkat lain) → konflik.
 *
 * Kiriman ulang yang jawaban pertamanya hilang di jalan (sinyal HP putus setelah
 * server menulis) akan terlihat seperti konflik terhadap dirinya sendiri. Kasus
 * itu dikenali dari isinya yang identik dan dijawab sukses.
 */
export async function simpanNilaiBerversi(
  t: NilaiTulis,
  expected: string | null
): Promise<HasilSimpanBerversi> {
  const pool = getPool();
  const nilaiLahn = KOLOM_LAHN.map((c) => t.cols[c] ?? 0);
  // $1 sesi, $2 peserta, $3 hadir, $4 ayat, $5 skor, $6 catatan, $7 confirmed,
  // $8 done, $9.. kolom lahn berurutan, lalu (UPDATE saja) versi.
  const dasar: unknown[] = [
    t.sesi_id,
    t.peserta_id,
    t.hadir,
    t.ayat_terakhir,
    t.skor,
    t.catatan,
    t.confirmed,
    t.done,
    ...nilaiLahn,
  ];
  // Cast eksplisit: di INSERT … SELECT parameter tanpa tipe dianggap text dan
  // Postgres menolak text → boolean/smallint.
  const posLahn = KOLOM_LAHN.map((_, i) => `$${9 + i}::smallint`);
  const sesiTerbuka = `exists (select 1 from evaluasi_sesi s where s.id = $1::uuid and s.status <> 'terkirim')`;

  let rows: Record<string, unknown>[];
  if (expected === null) {
    const r = await pool.query(
      `insert into evaluasi_nilai
         (sesi_id, peserta_id, hadir, ayat_terakhir, skor, catatan, confirmed, done, ${KOLOM_LAHN.join(', ')}, updated_at)
       select $1::uuid, $2::text, $3::boolean, $4::smallint, $5::smallint, $6::text, $7::boolean, $8::boolean,
              ${posLahn.join(', ')}, now()
        where ${sesiTerbuka}
       on conflict (sesi_id, peserta_id) do nothing
       returning updated_at`,
      dasar
    );
    rows = r.rows;
  } else {
    const posVersi = `$${9 + KOLOM_LAHN.length}`;
    const r = await pool.query(
      `update evaluasi_nilai
          set hadir = $3::boolean, ayat_terakhir = $4::smallint, skor = $5::smallint, catatan = $6::text,
              confirmed = $7::boolean, done = $8::boolean,
              ${KOLOM_LAHN.map((c, i) => `${c} = ${posLahn[i]}`).join(', ')},
              updated_at = now()
        where sesi_id = $1::uuid and peserta_id = $2::text
          and updated_at > ${posVersi}::timestamptz - interval '1 millisecond'
          and updated_at < ${posVersi}::timestamptz + interval '1 millisecond'
          and ${sesiTerbuka}
       returning updated_at`,
      [...dasar, expected]
    );
    rows = r.rows;
  }

  if (rows.length) {
    return { ok: true, updated_at: isoAtauNull(rows[0].updated_at) ?? new Date().toISOString() };
  }

  // Tak ada yang tertulis — cari tahu sebabnya.
  const sesi = await pool.query(`select status from evaluasi_sesi where id = $1::uuid`, [t.sesi_id]);
  if (sesi.rows[0]?.status === 'terkirim') return { ok: false, alasan: 'terkirim' };

  const cur = await pool.query(
    `select hadir, catatan, confirmed, done, updated_at, ${KOLOM_LAHN.join(', ')}
       from evaluasi_nilai where sesi_id = $1::uuid and peserta_id = $2`,
    [t.sesi_id, t.peserta_id]
  );
  const row = cur.rows[0] as Record<string, unknown> | undefined;
  if (row && isiSama(row, t)) {
    return { ok: true, updated_at: isoAtauNull(row.updated_at) ?? new Date().toISOString() };
  }
  return { ok: false, alasan: 'konflik', current: row ? keTerkini(row) : null };
}
