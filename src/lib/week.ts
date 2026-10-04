// Cycle barnamij 2in1. Dua era: 2-pekan (anchor 2026-06-01) sampai
// 27 September 2026, lalu bulanan 28 → 27 sejak 2026-09-28. Selaras dengan
// fungsi SQL `cycle_start_of()`. Semua perhitungan di timezone Asia/Jakarta.

const TZ = 'Asia/Jakarta';

function toJakartaDateString(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

function jakartaYMD(d: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  return {
    y: parseInt(parts.find((p) => p.type === 'year')!.value),
    m: parseInt(parts.find((p) => p.type === 'month')!.value),
    d: parseInt(parts.find((p) => p.type === 'day')!.value),
  };
}

/**
 * Panjang cycle era lama. Dipertahankan sebagai konstanta karena riwayat
 * sebelum `MONTHLY_SWITCH` tetap dihitung 14 hari — bukan sisa kode mati.
 */
export const CYCLE_LENGTH_DAYS = 14;
export const CYCLE_ANCHOR = '2026-06-01'; // Senin

/**
 * Sejak tanggal ini barnamij 2in1 berjalan sebulan sekali: 28 bulan ini
 * sampai 27 bulan depan. Sebelumnya cycle 2-pekan dari anchor.
 *
 * Dipisah begini, bukan diganti total, supaya rekap dan rapot bulan-bulan
 * lampau tidak berubah angkanya — `week_start` lama tetap sah.
 *
 * Akibat sampingan yang disengaja: cycle 14-hari terakhir (2026-09-21)
 * terpotong jadi 21–27 September, tujuh hari. Tidak ada setoran yang
 * tertinggal di sana.
 */
export const MONTHLY_SWITCH = '2026-09-28';
/** Tanggal mulai tiap cycle bulanan. */
const MONTHLY_ANCHOR_DAY = 28;

function isoOf(y: number, m: number, d: number): string {
  return toJakartaDateString(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Awal cycle dari tanggal manapun. Dua era:
 *   · < 2026-09-28 — cycle 2-pekan, anchor 2026-06-01 (selalu Senin)
 *   · ≥ 2026-09-28 — bulanan, mulai tanggal 28
 *
 * Harus sejalan dengan fungsi SQL `cycle_start_of()` (migrasi 0086).
 */
export function cycleStartOf(d: Date = new Date()): string {
  const { y, m, d: day } = jakartaYMD(d);
  const iso = isoOf(y, m, day);
  if (iso < MONTHLY_SWITCH) {
    const dateUTC = new Date(Date.UTC(y, m - 1, day));
    const [ay, am, ad] = CYCLE_ANCHOR.split('-').map(Number);
    const anchorUTC = new Date(Date.UTC(ay, am - 1, ad));
    const diffDays = Math.floor((dateUTC.getTime() - anchorUTC.getTime()) / 86400000);
    const cycleOffset = Math.floor(diffDays / CYCLE_LENGTH_DAYS) * CYCLE_LENGTH_DAYS;
    const result = new Date(anchorUTC);
    result.setUTCDate(result.getUTCDate() + cycleOffset);
    return toJakartaDateString(result);
  }
  if (day >= MONTHLY_ANCHOR_DAY) return isoOf(y, m, MONTHLY_ANCHOR_DAY);
  return isoOf(y, m - 1, MONTHLY_ANCHOR_DAY);
}

/**
 * Awal cycle yang sedang berjalan.
 */
export function currentCycleStart(): string {
  return cycleStartOf(new Date());
}

/** Apakah cycle ini sudah memakai aturan bulanan. */
export function isMonthlyCycle(cycleStartISO: string): boolean {
  return cycleStartISO >= MONTHLY_SWITCH;
}

/**
 * Tanggal terakhir cycle. Era lama: start + 13 hari, kecuali cycle terakhir
 * yang terpotong oleh pergantian aturan. Era bulanan: tanggal 27 bulan
 * berikutnya.
 */
export function cycleEndOf(cycleStartISO: string): string {
  const [y, m, d] = cycleStartISO.split('-').map(Number);
  if (isMonthlyCycle(cycleStartISO)) {
    return isoOf(y, m + 1, MONTHLY_ANCHOR_DAY - 1);
  }
  const end = new Date(Date.UTC(y, m - 1, d));
  end.setUTCDate(end.getUTCDate() + (CYCLE_LENGTH_DAYS - 1));
  const iso = toJakartaDateString(end);
  // Cycle 14-hari yang menabrak pergantian aturan berhenti sehari sebelumnya.
  return iso >= MONTHLY_SWITCH ? previousDay(MONTHLY_SWITCH) : iso;
}

function previousDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return toJakartaDateString(dt);
}

/** Awal cycle sesudah `cycleStartISO`. */
export function nextCycleStart(cycleStartISO: string): string {
  const [y, m, d] = cycleStartISO.split('-').map(Number);
  if (isMonthlyCycle(cycleStartISO)) return isoOf(y, m + 1, MONTHLY_ANCHOR_DAY);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + CYCLE_LENGTH_DAYS);
  const iso = toJakartaDateString(dt);
  // Lompat dari era lama langsung ke cycle bulanan pertama.
  return iso >= MONTHLY_SWITCH ? MONTHLY_SWITCH : iso;
}

/** Awal cycle sebelum `cycleStartISO`. */
export function prevCycleStart(cycleStartISO: string): string {
  if (cycleStartISO === MONTHLY_SWITCH) {
    // Cycle terakhir era lama.
    return cycleStartOf(new Date(`${previousDay(MONTHLY_SWITCH)}T00:00:00Z`));
  }
  const [y, m, d] = cycleStartISO.split('-').map(Number);
  if (isMonthlyCycle(cycleStartISO)) return isoOf(y, m - 1, MONTHLY_ANCHOR_DAY);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - CYCLE_LENGTH_DAYS);
  return toJakartaDateString(dt);
}

/**
 * Label rentang cycle untuk UI, mis: "1 – 14 Juni 2026", lintas-bulan
 * "29 Juni – 12 Juli 2026", atau bulanan "28 September – 27 Oktober 2026".
 */
export function formatCycleRange(cycleStartISO: string): string {
  const [sy, sm, sd] = cycleStartISO.split('-').map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const [ey, em, ed] = cycleEndOf(cycleStartISO).split('-').map(Number);
  const end = new Date(Date.UTC(ey, em - 1, ed));

  const sameMonth = sm === em && sy === ey;

  const fmtDayMonth = (dt: Date) =>
    dt.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  const fmtDay = (dt: Date) =>
    dt.toLocaleDateString('id-ID', { day: 'numeric', timeZone: 'UTC' });
  const year = end.toLocaleDateString('id-ID', { year: 'numeric', timeZone: 'UTC' });

  if (sameMonth) {
    return `${fmtDay(start)} – ${fmtDayMonth(end)} ${year}`;
  }
  return `${fmtDayMonth(start)} – ${fmtDayMonth(end)} ${year}`;
}

/**
 * Label rentang cycle tanpa tahun, mis: "1 – 14 Juni" atau lintas-bulan
 * "29 Juni – 12 Juli". Dipakai untuk tag "Periode …" di header.
 */
export function formatCycleRangeShort(cycleStartISO: string): string {
  const [sy, sm, sd] = cycleStartISO.split('-').map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const [ey, em, ed] = cycleEndOf(cycleStartISO).split('-').map(Number);
  const end = new Date(Date.UTC(ey, em - 1, ed));
  const sameMonth = sm === em && sy === ey;
  const fmtDayMonth = (dt: Date) =>
    dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fmtDay = (dt: Date) => dt.toLocaleDateString('id-ID', { day: 'numeric', timeZone: 'UTC' });
  if (sameMonth) return `${fmtDay(start)} – ${fmtDayMonth(end)}`;
  return `${fmtDayMonth(start)} – ${fmtDayMonth(end)}`;
}

/** Nama hari ala pesantren — id-ID memunculkan "Minggu", bukan "Ahad". */
const NAMA_HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

/**
 * Label deadline cycle untuk pesan WA, mis: "Ahad, 14 Juni 2026".
 * Cycle 2-pekan selalu berakhir Ahad; cycle bulanan berakhir tanggal 27,
 * hari apa pun — jadi harinya dihitung, tidak lagi ditulis literal.
 */
export function formatCycleDeadline(cycleStartISO: string): string {
  const endISO = cycleEndOf(cycleStartISO);
  const [y, m, d] = endISO.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d));
  const tanggal = end.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${NAMA_HARI[end.getUTCDay()]}, ${tanggal}`;
}

/**
 * Cycle-cycle sebelum cycle berjalan (untuk dropdown riwayat).
 */
export function previousCycles(count: number): string[] {
  const result: string[] = [];
  let cur = currentCycleStart();
  for (let i = 0; i < count; i++) {
    cur = prevCycleStart(cur);
    result.push(cur);
  }
  return result;
}

/**
 * Semua cycle start dari anchor (2026-06-01) s/d cycle berjalan, inklusif.
 * Urut menaik (terlama → terbaru). Dipakai untuk riwayat & deteksi periode
 * terlewat di POV peserta.
 */
export function allCyclesSinceAnchor(): string[] {
  const current = currentCycleStart();
  const result: string[] = [];
  let cur = CYCLE_ANCHOR;
  for (;;) {
    result.push(cur);
    if (cur >= current) break;
    cur = nextCycleStart(cur);
  }
  return result;
}

/**
 * Validasi cycle start untuk backfill: harus benar-benar awal cycle, tidak
 * sebelum anchor, dan tidak di masa depan (≤ cycle berjalan).
 */
export function isValidCycleStart(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (cycleStartOf(new Date(Date.UTC(y, m - 1, d))) !== s) return false;
  return s >= CYCLE_ANCHOR && s <= currentCycleStart();
}

/**
 * Cycle-cycle yang berakhir di dalam bulan kalender tertentu.
 *
 * Jumlahnya tidak tetap: era 2-pekan memberi dua, era bulanan satu, dan
 * September 2026 — bulan pergantian aturan — memberi tiga. Karena itu ia
 * mengembalikan array, bukan pasangan tetap seperti dulu.
 */
export function cyclesInMonth(year: number, month: number): string[] {
  const awalBulan = `${year}-${String(month).padStart(2, '0')}-01`;
  const akhirBulan = toJakartaDateString(new Date(Date.UTC(year, month, 0)));
  const out: string[] = [];
  let cur = cycleStartOf(new Date(`${awalBulan}T00:00:00Z`));
  for (;;) {
    const akhir = cycleEndOf(cur);
    if (akhir >= awalBulan && akhir <= akhirBulan) out.push(cur);
    if (cur > akhirBulan) break;
    const next = nextCycleStart(cur);
    if (next === cur) break;
    cur = next;
  }
  return out;
}

/**
 * Tahun dan bulan berjalan di timezone Jakarta.
 */
export function currentYearMonth(): { year: number; month: number; label: string } {
  const now = new Date();
  const str = now.toLocaleDateString('id-ID', {
    timeZone: TZ,
    year: 'numeric',
    month: 'long',
  });
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  return {
    year: parseInt(parts.find((p) => p.type === 'year')!.value),
    month: parseInt(parts.find((p) => p.type === 'month')!.value),
    label: str,
  };
}

// ---------- Backward-compat aliases ----------
// Beberapa modul lama masih mungkin di-import sebelum semua callsite
// di-refactor; alias ini memetakan API lama → API cycle baru supaya
// build tidak break secara tiba-tiba.
export const weekStartOf = cycleStartOf;
export const currentWeekStart = currentCycleStart;
export const formatWeekRange = formatCycleRange;
export const previousWeeks = previousCycles;

// ── Minggu kalender 7-hari (Senin–Minggu) untuk report F5. Terpisah dari
//    cycle 14-hari di atas. Anchor 2026-06-01 kebetulan Senin juga. ──
const WEEK_ANCHOR = '2026-06-01'; // Senin
const BULAN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Senin dari minggu yang memuat `d` (WIB), 'YYYY-MM-DD'. */
export function weekStartMonday(d: Date = new Date()): string {
  const { y, m, d: day } = jakartaYMD(d);
  const dateUTC = new Date(Date.UTC(y, m - 1, day));
  const [ay, am, ad] = WEEK_ANCHOR.split('-').map(Number);
  const anchorUTC = new Date(Date.UTC(ay, am - 1, ad));
  const diffDays = Math.floor((dateUTC.getTime() - anchorUTC.getTime()) / 86400000);
  const offset = Math.floor(diffDays / 7) * 7;
  const res = new Date(anchorUTC);
  res.setUTCDate(res.getUTCDate() + offset);
  return toJakartaDateString(res);
}

/** Batas minggu: {start: Senin, end: Senin+7 eksklusif}. */
export function weekBounds(mondayISO: string): { start: string; end: string } {
  const [y, m, d] = mondayISO.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d));
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: mondayISO, end: toJakartaDateString(end) };
}

/** Label ringkas 'D Mmm–D Mmm' (Senin..Minggu). */
export function formatWeekRangeShort(mondayISO: string): string {
  const [sy, sm, sd] = mondayISO.split('-').map(Number);
  const endDate = new Date(Date.UTC(sy, sm - 1, sd));
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const [, em, ed] = toJakartaDateString(endDate).split('-').map(Number);
  return `${sd} ${BULAN_SHORT[sm - 1]}–${ed} ${BULAN_SHORT[em - 1]}`;
}

/** N Senin terakhir (terbaru dulu), termasuk minggu ini. */
export function recentMondays(count: number): string[] {
  const thisMon = weekStartMonday();
  const [y, m, d] = thisMon.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(base);
    dt.setUTCDate(dt.getUTCDate() - i * 7);
    out.push(toJakartaDateString(dt));
  }
  return out;
}
