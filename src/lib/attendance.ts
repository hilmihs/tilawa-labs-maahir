import { supabaseAdmin } from './supabase-admin';
import { scaleKehadiran } from './scales';

const TZ = 'Asia/Jakarta';

const HARI_MAP: Record<string, number> = {
  senin: 1, selasa: 2, rabu: 3, kamis: 4,
  jumat: 5, sabtu: 6, minggu: 0,
};

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

function jakartaNow(): Date {
  const nowStr = new Date().toLocaleString('sv-SE', { timeZone: TZ });
  return new Date(nowStr);
}

function dayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00+07:00');
  return d.getDay();
}

function hariToNumber(hari: string): number {
  return HARI_MAP[hari.toLowerCase()] ?? -1;
}

export interface ProgramToday {
  type: 'program' | 'kelas_maahir';
  id: string;
  name: string;
  waktu_mulai: string;
  waktu_selesai: string;
  tanggal: string;
}

type JadwalPengajar = {
  programs: { id: string; name: string; hari: string[]; waktu_mulai: string; waktu_selesai: string }[];
  kelas: {
    id: string;
    name: string;
    jadwal_hari: string | null;
    jadwal_waktu_mulai: string | null;
    jadwal_waktu_selesai: string | null;
  }[];
};

async function loadJadwal(pengajarId: string): Promise<JadwalPengajar> {
  const [{ data: programs }, { data: kelas }] = await Promise.all([
    supabaseAdmin
      .from('program_kehadiran')
      .select('id, name, hari, waktu_mulai, waktu_selesai')
      .eq('active', true),
    supabaseAdmin
      .from('kelas_hits')
      .select('id, name, jadwal_hari, jadwal_waktu_mulai, jadwal_waktu_selesai')
      .eq('pengajar_id', pengajarId),
  ]);
  return { programs: programs ?? [], kelas: kelas ?? [] };
}

/** Kunci libur `program:<id>:<tgl>` / `kelas_maahir:<id>:<tgl>` dalam rentang [from, to]. */
async function loadLibur(from: string, to: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('libur_program')
    .select('program_id, kelas_hits_id, tanggal')
    .gte('tanggal', from)
    .lte('tanggal', to);
  const set = new Set<string>();
  for (const l of data ?? []) {
    if (l.program_id) set.add(`program:${l.program_id}:${l.tanggal}`);
    if (l.kelas_hits_id) set.add(`kelas_maahir:${l.kelas_hits_id}:${l.tanggal}`);
  }
  return set;
}

function programsOn(dateStr: string, jadwal: JadwalPengajar, libur: Set<string>): ProgramToday[] {
  const dow = dayOfWeek(dateStr);
  const result: ProgramToday[] = [];

  for (const p of jadwal.programs) {
    if (!p.hari.some((h) => hariToNumber(h) === dow)) continue;
    if (libur.has(`program:${p.id}:${dateStr}`)) continue;
    result.push({
      type: 'program',
      id: p.id,
      name: p.name,
      waktu_mulai: p.waktu_mulai,
      waktu_selesai: p.waktu_selesai,
      tanggal: dateStr,
    });
  }

  for (const k of jadwal.kelas) {
    if (!k.jadwal_hari || hariToNumber(k.jadwal_hari) !== dow) continue;
    if (libur.has(`kelas_maahir:${k.id}:${dateStr}`)) continue;
    result.push({
      type: 'kelas_maahir',
      id: k.id,
      name: `Kelas Maahir — ${k.name}`,
      waktu_mulai: k.jadwal_waktu_mulai ?? '16:00',
      waktu_selesai: k.jadwal_waktu_selesai ?? '19:00',
      tanggal: dateStr,
    });
  }

  return result;
}

export async function getProgramsForDate(
  pengajarId: string,
  dateStr: string
): Promise<ProgramToday[]> {
  const [jadwal, libur] = await Promise.all([loadJadwal(pengajarId), loadLibur(dateStr, dateStr)]);
  return programsOn(dateStr, jadwal, libur);
}

export function deriveIsTerlambat(
  checkinTime: Date,
  waktuMulai: string,
  tanggal: string
): boolean {
  const [h, m] = waktuMulai.split(':').map(Number);
  const startTime = new Date(`${tanggal}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`);
  return checkinTime > startTime;
}

export function isAlpa(
  waktuSelesai: string,
  tanggal: string
): boolean {
  const now = jakartaNow();
  const [h, m] = waktuSelesai.split(':').map(Number);
  const endTime = new Date(`${tanggal}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`);
  return now > endTime;
}

export async function getUnfilledDates(
  pengajarId: string,
  maxBackfill = 5
): Promise<ProgramToday[]> {
  const today = jakartaToday();
  // 14 hari ke belakang, terbaru dulu.
  const dates: string[] = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today + 'T12:00:00+07:00');
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const from = dates[dates.length - 1];
  const to = dates[0];

  // Empat query paralel untuk seluruh rentang — dulu dua-tiga query per hari
  // per sesi secara berurutan, terasa sejak beranda ikut memanggil ini.
  const [jadwal, libur, { data: checkins }] = await Promise.all([
    loadJadwal(pengajarId),
    loadLibur(from, to),
    supabaseAdmin
      .from('checkin_pengajar')
      .select('program_id, kelas_hits_id, tanggal')
      .eq('pengajar_id', pengajarId)
      .gte('tanggal', from)
      .lte('tanggal', to),
  ]);
  const terisi = new Set<string>();
  for (const c of checkins ?? []) {
    if (c.program_id) terisi.add(`program:${c.program_id}:${c.tanggal}`);
    if (c.kelas_hits_id) terisi.add(`kelas_maahir:${c.kelas_hits_id}:${c.tanggal}`);
  }

  const unfilled: ProgramToday[] = [];
  for (const dateStr of dates) {
    for (const prog of programsOn(dateStr, jadwal, libur)) {
      if (unfilled.length >= maxBackfill) break;
      if (!terisi.has(kunciSesi(prog))) unfilled.push(prog);
    }
    if (unfilled.length >= maxBackfill) break;
  }

  return unfilled.reverse();
}

export type AntrianCheckin = {
  today: string;
  /** Sesi lampau yang belum diisi, paling lama dulu. */
  lampau: ProgramToday[];
  /** Semua sesi hari ini (sudah maupun belum diisi). */
  hariIni: ProgramToday[];
  /** Kunci `${type}:${id}:${tanggal}` sesi hari ini yang sudah diisi. */
  terisiHariIni: string[];
};

export function kunciSesi(p: Pick<ProgramToday, 'type' | 'id' | 'tanggal'>): string {
  return `${p.type}:${p.id}:${p.tanggal}`;
}

/**
 * Antrian check-in pengajar: sesi lampau yang terlewat + sesi hari ini.
 * Dipakai halaman /kehadiran/pengajar dan kartu "Perlu diselesaikan" di beranda.
 */
export async function getAntrianCheckin(
  pengajarId: string,
  maxBackfill = 5
): Promise<AntrianCheckin> {
  const today = jakartaToday();
  const [hariIni, lampau] = await Promise.all([
    getProgramsForDate(pengajarId, today),
    getUnfilledDates(pengajarId, maxBackfill),
  ]);

  const { data: checkinHariIni } = hariIni.length
    ? await supabaseAdmin
        .from('checkin_pengajar')
        .select('program_id, kelas_hits_id, tanggal')
        .eq('pengajar_id', pengajarId)
        .eq('tanggal', today)
    : { data: [] };
  const sudah = new Set(
    (checkinHariIni ?? []).map((c) =>
      c.program_id ? `program:${c.program_id}:${c.tanggal}` : `kelas_maahir:${c.kelas_hits_id}:${c.tanggal}`
    )
  );
  const terisiHariIni = hariIni.map(kunciSesi).filter((k) => sudah.has(k));

  return { today, lampau, hariIni, terisiHariIni };
}

export async function calculateMonthlyAttendancePercent(
  pengajarId: string,
  opts: { programId?: string; kelasHitsId?: string },
  yearMonth: string
): Promise<number> {
  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = `${yearMonth}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

  let query = supabaseAdmin
    .from('checkin_pengajar')
    .select('id, status, invalidated_at')
    .eq('pengajar_id', pengajarId)
    .gte('tanggal', startDate)
    .lte('tanggal', endDate)
    .is('invalidated_at', null);

  if (opts.programId) {
    query = query.eq('program_id', opts.programId);
  } else if (opts.kelasHitsId) {
    query = query.eq('kelas_hits_id', opts.kelasHitsId);
  }

  const { data: checkins } = await query;
  if (!checkins || checkins.length === 0) return 0;

  const totalSessions = checkins.length;
  const hadirCount = checkins.filter((c) => c.status === 'hadir').length;
  return Math.round((hadirCount / totalSessions) * 100);
}

export function attendancePercentToScale(
  percent: number
): 0 | 1 | 2 | 3 | 4 {
  return scaleKehadiran(percent);
}
