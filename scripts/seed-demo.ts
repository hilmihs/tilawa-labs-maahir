/**
 * Demo seed — the only data the public demo deployment ever holds.
 *
 * Everything is invented. Names come from fixed lists, every WhatsApp number
 * sits in the reserved 62899 test range, and no row derives from production.
 * The existing `seed` script is too thin for the demo (one coordinator, two
 * classes, six participants), and `seed-matrix-mei2026` reads a JSON extracted
 * from a real spreadsheet of named teachers and their scores — that file is
 * deleted on this branch and must never come back.
 *
 * What this fills, in priority order, because they are what the demo is meant
 * to show:
 *   1. Matrix Skill Guru — three consecutive months so ranking, month-over-month
 *      movement and the cumulative reprimand count all have something to say.
 *   2. The monthly report — the same three months of attendance and submissions.
 *   3. The dashboards — classes, participants and weekly submissions underneath.
 *
 * Deterministic: the same seed value every run, so a nightly reset reproduces
 * the same screenshots and yesterday's visitors leave no trace.
 *
 *   npx tsx --env-file=.env.local scripts/seed-demo.ts
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';

const PASSWORD = 'demo123';

const IKHWAN = ['Adam Barakat','Bilal Haddad','Dawud Najjar','Faris Qureshi','Hakim Tamimi',
  'Idris Mansour','Jamil Zaidan','Karim Younes','Luqman Fahmy','Munir Siddiqui'];
const AKHWAT = ['Aisha Rahmani','Dalia Khalidi','Farida Jabari','Hana Wahbi','Inas Abdallah',
  'Karima Barakat','Layla Mansour','Maryam Tamimi'];
const PESERTA_I = ['Anas','Basim','Hadi','Nadir','Rafi','Sami','Tariq','Wasim','Yasin','Zahir','Amir','Salim'];
const PESERTA_A = ['Amina','Bushra','Hiba','Nadia','Rania','Salma','Thuraya','Wafa','Yusra','Zaynab','Asma','Rahma'];
const MARGA = ['Abdallah','Haddad','Jabari','Khalidi','Mansour','Najjar','Qureshi','Rahmani',
  'Siddiqui','Tamimi','Wahbi','Younes','Zaidan','Barakat','Fahmy'];
const BLOK = ['takhassus','koordinator','tahfizh','talaqqi','maahir6'] as const;

/** Fixed-seed PRNG: a reset must reproduce the same demo, not a new one. */
let benih = 20260401;
const acak = () => ((benih = (benih * 1103515245 + 12345) % 2147483648) / 2147483648);
const antara = (lo: number, hi: number) => lo + Math.floor(acak() * (hi - lo + 1));
const pilih = <T,>(xs: readonly T[]): T => xs[Math.floor(acak() * xs.length)];

/** The three months the demo shows, oldest first. */
function bulanTerakhir(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Mondays going back from this week, oldest first — setoran is keyed by week_start. */
function pekanTerakhir(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // this week's Monday
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() - i * 7);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Multi-row INSERT.
 *
 * The first version issued one statement per row: about 450 round-trips to a
 * pooled database in another country. Locally that is slow; called from the
 * reset endpoint it exceeded the serverless function's time limit outright, so
 * the nightly reset could never have completed. Batching takes it to a handful
 * of statements.
 */
async function bulk(db: Client, tabel: string, kolom: string[], baris: unknown[][]): Promise<void> {
  if (!baris.length) return;
  const nilai = baris
    .map((r, i) => `(${r.map((_, j) => `$${i * kolom.length + j + 1}`).join(', ')})`)
    .join(', ');
  await db.query(
    `insert into ${tabel} (${kolom.join(', ')}) values ${nilai}`,
    baris.flat(),
  );
}

export async function seedDemo(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();

  // One hash reused everywhere: bcrypt at cost 12 for forty accounts would
  // dominate the runtime of a seed that is otherwise a few hundred inserts.
  const hash = await bcrypt.hash(PASSWORD, 12);

  console.log('clearing previous demo data…');
  for (const t of ['matrix_rekap','hits_teguran','setoran','program_kelas_anggota','program_kelas',
                   'peserta','kelas','pengajar','kelompok_pengajar','musyrif','koordinator']) {
    await db.query(`delete from ${t}`);
  }

  // ── people ────────────────────────────────────────────────────────────────
  const kelompok: Record<'ikhwan' | 'akhwat', string> = { ikhwan: '', akhwat: '' };
  for (const g of ['ikhwan', 'akhwat'] as const) {
    const { rows } = await db.query(
      `insert into kelompok_pengajar (name, gender) values ($1, $2) returning id`,
      [g === 'ikhwan' ? 'Kelompok Ikhwan' : 'Kelompok Akhwat', g]);
    kelompok[g] = rows[0].id;
  }

  await db.query(
    `insert into koordinator (name, whatsapp_number, password_hash, gender, active)
     values ($1, $2, $3, 'ikhwan', true)`,
    ['Demo Coordinator', '6289900000001', hash]);

  const musyrif: Record<'ikhwan' | 'akhwat', string> = { ikhwan: '', akhwat: '' };
  let nomor = 2;
  for (const g of ['ikhwan', 'akhwat'] as const) {
    const { rows } = await db.query(
      `insert into musyrif (name, gender, whatsapp_number, password_hash, active)
       values ($1, $2, $3, $4, true) returning id`,
      [g === 'ikhwan' ? 'Demo Musyrif' : 'Demo Musyrifah', g,
       `62899000000${String(nomor++).padStart(2, '0')}`, hash]);
    musyrif[g] = rows[0].id;
  }

  const pengajar: { id: string; nama: string; gender: 'ikhwan' | 'akhwat' }[] = [];
  {
    const baris: unknown[][] = [];
    for (const [daftar, g] of [[IKHWAN, 'ikhwan'], [AKHWAT, 'akhwat']] as const) {
      for (const nama of daftar) {
        const id = randomUUID();
        pengajar.push({ id, nama, gender: g });
        baris.push([id, nama, g, `62899001${String(nomor++).padStart(5, '0')}`, hash,
                    kelompok[g], true, pilih(BLOK), false]);
      }
    }
    await bulk(db, 'pengajar',
      ['id','name','gender','whatsapp_number','password_hash','kelompok_id','active','matrix_blok','matrix_exclude'],
      baris);
  }
  console.log(`people: 1 coordinator, 2 musyrif, ${pengajar.length} teachers`);

  // ── Matrix Skill Guru: three months, fourteen indicators ───────────────────
  //
  // Scores are drawn around a per-teacher baseline that drifts slightly month to
  // month. Flat scores would make the ranking arbitrary and hide the one thing
  // the screen exists to show — who is moving, and in which direction.
  // Indicators are scored 0–4 (matrix-indicators.ts: `standar: number; // skala 0-4`)
  // and stored as smallint; only the category averages are decimal. A teacher's
  // baseline is held in tenths so the month-to-month drift can be finer than a
  // whole point, then rounded when it lands in the column.
  const bulan = bulanTerakhir(3);
  const dasar = new Map(pengajar.map((p) => [p.id, antara(20, 36) / 10]));
  let barisMatrix = 0;

  for (const [iBulan, ym] of bulan.entries()) {
    const baris: { id: string; rata: number; sql: unknown[] }[] = [];

    for (const p of pengajar) {
      // Drift is small and upward: a demo where the ranking reshuffles completely
      // every month shows nothing, and one that never moves shows less.
      const b = dasar.get(p.id)! + iBulan * 0.15 + (antara(-2, 2) / 10);
      const n = () => Math.max(0, Math.min(4, Math.round(b + antara(-5, 5) / 10)));

      const hard = [n(), n(), n(), n(), n(), n()];
      const peda = [n(), n(), n(), n()];
      // skor_komitmen_jadwal is the one decimal indicator — it is a ratio of
      // sessions kept, not a judgement on a 0–4 ladder.
      const komitmen = Number(Math.max(0, Math.min(4, b + antara(-3, 3) / 10)).toFixed(2));
      const soft = [n(), komitmen, n(), n()];
      const rata = (xs: number[]) => Number((xs.reduce((a, c) => a + c, 0) / xs.length).toFixed(2));
      const rh = rata(hard), rp = rata(peda), rs = rata(soft);
      const keseluruhan = Number(((rh + rp + rs) / 3).toFixed(2));

      baris.push({ id: p.id, rata: keseluruhan, sql: [p.id, ym, ...hard, rh, ...peda, rp, ...soft, rs, keseluruhan] });
    }

    // Ranking is per month and dense by overall average — the screen reads it
    // straight out of the column, it is not computed at render time.
    baris.sort((a, b) => b.rata - a.rata);
    const barisMatrixSql: unknown[][] = [];
    const barisTeguran: unknown[][] = [];
    for (const [i, r] of baris.entries()) {
      const teguranBulan = acak() < 0.18 ? antara(1, 2) : 0;
      barisMatrixSql.push([
        ...r.sql, i + 1, teguranBulan, teguranBulan + (iBulan > 0 ? antara(0, 2) : 0),
        // Only closed months are finalised; the current one stays open, which is
        // what the "finalized" badge on the screen is there to distinguish.
        iBulan === bulan.length - 1 ? null : new Date().toISOString(),
      ]);
      barisMatrix += 1;

      if (teguranBulan > 0) {
        barisTeguran.push([r.id, ym, pilih(['kedisiplinan', 'administrasi', 'kehadiran']),
                           teguranBulan, 'koordinator', r.id, 'Demo record — synthetic data.']);
      }
    }

    await bulk(db, 'matrix_rekap', [
      'pengajar_id','year_month',
      'skor_bacaan','skor_hafalan','skor_tajwid',
      'skor_kehadiran_maahir','skor_kehadiran_tibyan','skor_kehadiran_muallim','rata_rata_hard_skill',
      'skor_metode_pengajaran','skor_kepatuhan_silabus','skor_manajemen_halaqah',
      'skor_evaluasi_penguasaan','rata_rata_pedagogis',
      'skor_kedisiplinan_waktu','skor_komitmen_jadwal','skor_tanggung_jawab',
      'skor_kepatuhan_sop','rata_rata_soft_skill',
      'rata_rata_keseluruhan','ranking','total_teguran_bulan','total_teguran_kumulatif','finalized_at',
    ], barisMatrixSql);

    await bulk(db, 'hits_teguran',
      ['pengajar_id','year_month','category','nomor_teguran','issued_by_role','issued_by_id','keterangan'],
      barisTeguran);
  }
  console.log(`matrix: ${barisMatrix} rows across ${bulan.join(', ')}`);

  // ── classes, participants, weekly submissions ─────────────────────────────
  const kelasIds: { id: string; gender: 'ikhwan' | 'akhwat' }[] = [];
  for (const g of ['ikhwan', 'akhwat'] as const) {
    for (const huruf of ['A', 'B']) {
      const { rows } = await db.query(
        `insert into kelas (name, gender, musyrif_id, jadwal_hari) values ($1, $2, $3, $4) returning id`,
        [`Kelas ${huruf} ${g === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}`, g, musyrif[g], [pilih(['Senin','Selasa','Rabu','Kamis'])]]);
      kelasIds.push({ id: rows[0].id, gender: g });
    }
  }

  const peserta: { id: string }[] = [];
  {
    const baris: unknown[][] = [];
    for (const k of kelasIds) {
      const nama = k.gender === 'ikhwan' ? PESERTA_I : PESERTA_A;
      for (let i = 0; i < 12; i += 1) {
        const id = randomUUID();
        peserta.push({ id });
        baris.push([id, `${nama[i]} ${pilih(MARGA)}`, k.gender, k.id,
                    `62899002${String(nomor++).padStart(5, '0')}`, hash, true]);
      }
    }
    await bulk(db, 'peserta',
      ['id','name','gender','kelas_id','whatsapp_number','password_hash','active'], baris);
  }

  const pekan = pekanTerakhir(8);
  const sekarang = new Date().toISOString();
  const barisSetoran: unknown[][] = [];
  for (const p of peserta) {
    for (const w of pekan) {
      // Not every week is submitted — the gaps are what a musyrif's screen is for.
      const r = acak();
      const status = r < 0.70 ? 'checked' : r < 0.86 ? 'submitted' : null;
      if (!status) continue;
      barisSetoran.push([p.id, w, status, sekarang,
        status === 'checked' ? sekarang : null,
        status === 'checked' ? musyrif.ikhwan : null]);
    }
  }
  await bulk(db, 'setoran',
    ['peserta_id','week_start','status','submitted_at','checked_at','checked_by_musyrif_id'],
    barisSetoran);
  const setoran = barisSetoran.length;
  console.log(`classes: ${kelasIds.length}, participants: ${peserta.length}, submissions: ${setoran}`);

  // ── Maahir programme classes ──────────────────────────────────────────────
  for (const g of ['ikhwan', 'akhwat'] as const) {
    const { rows } = await db.query(
      `insert into program_kelas (name, gender, jadwal_hari, waktu_mulai, waktu_selesai)
       values ($1, $2, $3, '16:00', '17:30') returning id`,
      [`Tahfizh ${g === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}`, g, [pilih(['Senin','Rabu','Sabtu'])]]);
    const pk = rows[0].id;
    await bulk(db, 'program_kelas_anggota',
      ['program_kelas_id','name','whatsapp_number','active'],
      pengajar.filter((x) => x.gender === g).slice(0, 6)
        .map((p) => [pk, p.nama, `62899003${String(nomor++).padStart(5, '0')}`, true]));
  }

  console.log(`\ndemo seeded. every account's password is "${PASSWORD}".`);
  console.log(`coordinator 6289900000001 · musyrif 6289900000002 / 6289900000003`);
  await db.end();
}

// Running the file directly seeds once and exits; the reset route imports seedDemo.
if (process.argv[1]?.endsWith('seed-demo.ts')) {
  seedDemo().catch((e) => { console.error(e); process.exit(1); });
}
