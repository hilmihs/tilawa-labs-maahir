// Deteksi hari presensi Maahir yang belum diisi oleh ketua/wakil kelas.
// Strict: semua hari program sejak PRESENSI_ANCHOR wajib terisi.
// 2 program: Kelas Maahir (jadwal per-kelas), Kajian At-Tibyan (Sabtu).
// (Muallim Najih dihapus dari penilaian.)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { findKetuaProgramKelas, getSelfAttendanceKelas, type ProgramKelasRow } from '@/lib/program-kelas';
import { getLiburDates, getLiburDatesForKelas } from '@/lib/maahir-libur';
import { anggotaAktifPada, todayJakarta } from '@/lib/anggota-periode';
import { batasAwalPengisian } from '@/lib/periode-laporan';

export const PRESENSI_ANCHOR = '2026-06-01'; // strict mulai Juni 2026

/**
 * Tanggal awal presensi wajib untuk SATU kelas.
 *
 * Kelas yang baru dibentuk di tengah jalan (mis. hasil penggabungan) tak boleh
 * diminta mengisi presensi sejak anchor global — riwayat sebelum kelas itu ada
 * memang milik kelas lamanya.
 */
export function anchorKelas(k: { mulai_tanggal?: string | null }): string {
  const m = k.mulai_tanggal;
  return m && m > PRESENSI_ANCHOR ? m : PRESENSI_ANCHOR;
}

/**
 * Awal rentang yang masih boleh DITAGIH ke ketua/peserta.
 *
 * Sejak kebijakan kunci tanggal 28, periode lama tak bisa diisi lagi — menagih
 * tanggalnya hanya menghasilkan angka "belum diisi" yang mustahil dinolkan.
 * Jadi tagihan dipotong di awal periode berjalan, bukan di anchor kelas.
 */
export function awalTagihan(k: { mulai_tanggal?: string | null }): string {
  const a = anchorKelas(k);
  const batas = batasAwalPengisian();
  return a > batas ? a : batas;
}
export const TIBYAN_HARI = 'Sabtu'; // at_tibyan 08:30–10:30, seragam semua kelas

export const TIBYAN_WAKTU = { mulai: '08:30', selesai: '10:30' };

export const PROGRAM_LABEL: Record<string, string> = {
  kelas_maahir: 'Kelas Maahir',
  at_tibyan: 'At-Tibyan',
};

// Urutan program kalau jatuh di tanggal yang sama (kelas dulu, lalu tibyan).
const PROGRAM_ORDER: Record<string, number> = {
  kelas_maahir: 0,
  at_tibyan: 1,
};

export type MaahirProgram = 'kelas_maahir' | 'at_tibyan';

export type UnfilledDay = {
  program_kelas_id: string;
  kelasName: string;
  gender: 'ikhwan' | 'akhwat';
  program: MaahirProgram;
  tanggal: string; // YYYY-MM-DD (mingguan: tanggal Senin kanonik pekan)
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  namaKegiatan: string;
  mingguan: boolean; // true = slot mewakili 1 pekan (Senin–Jum'at), bukan hari spesifik
  totalRemaining: number;
  /**
   * grup_sesi kelasnya (0092) — hanya untuk judul di layar ketua. Diisi
   * getUnfilledMaahirDays; tak dipakai perhitungan apa pun.
   */
  grupSesi?: string | null;
};

// Index getUTCDay() → nama hari sesuai format jadwal_hari di seed.
const DAY_NAME: Record<number, string> = {
  0: 'Ahad',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: "Jum'at",
  6: 'Sabtu',
};

/** Index hari (0 Ahad .. 6 Sabtu) untuk tanggal 'YYYY-MM-DD'. */
export function dayIndexOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Nama hari (format seed) untuk tanggal kalender 'YYYY-MM-DD'. */
export function dayNameOf(dateStr: string): string {
  return DAY_NAME[dayIndexOf(dateStr)];
}

/** Tanggal Senin pada pekan yang memuat dateStr (kanonik pekan). 'YYYY-MM-DD'. */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 Ahad .. 6 Sabtu
  const diff = dow === 0 ? -6 : 1 - dow; // mundur ke Senin
  dt.setUTCDate(dt.getUTCDate() + diff);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

/** Label rentang pekan (Senin–Jum'at) dari tanggal Senin kanonik. */
export function weekRangeLabel(mondayStr: string): string {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const mon = new Date(Date.UTC(y, m - 1, d));
  const fri = new Date(mon);
  fri.setUTCDate(fri.getUTCDate() + 4);
  const fmt = (dt: Date, withYear: boolean) =>
    dt.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  return `Pekan ${fmt(mon, false)} – ${fmt(fri, true)}`;
}

/**
 * Kunci pencocokan "terisi" untuk (kelas, program, tanggal).
 * - harian  : per (program, tanggal) persis.
 * - mingguan: per pekan (Senin–Jum'at), apa pun harinya → hadir sekali = lengkap.
 */
export function filledKeyOf(
  k: ProgramKelasRow,
  program: string,
  tanggal: string
): string {
  if (k.presensi_sifat === 'mingguan') return `W|${mondayOf(tanggal)}`;
  return `${program}|${tanggal}`;
}

export { todayJakarta };

/** Semua tanggal dalam rentang [start, end] (inklusif), urut menaik. 'YYYY-MM-DD'. */
export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const [ay, am, ad] = start.split('-').map(Number);
  const [ty, tm, td] = end.split('-').map(Number);
  let cur = Date.UTC(ay, am - 1, ad);
  const last = Date.UTC(ty, tm - 1, td);
  const DAY = 86400000;
  while (cur <= last) {
    const dt = new Date(cur);
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
        dt.getUTCDate()
      ).padStart(2, '0')}`
    );
    cur += DAY;
  }
  return out;
}

export type ExpectedDay = Omit<UnfilledDay, 'totalRemaining' | 'grupSesi'>;

/**
 * Hari program yang diharapkan untuk satu kelas dalam rentang [start, end].
 * @param libur set tanggal libur (YYYY-MM-DD) yang dikecualikan.
 */
export function expectedDaysInRange(
  k: ProgramKelasRow,
  start: string,
  end: string,
  libur?: Set<string>
): ExpectedDay[] {
  return expectedDaysForKelas(k, datesInRange(start, end), libur);
}

/**
 * Sesi kelas_maahir ini dialihkan ke kelas halaqah anggotanya? Kelas ber-
 * `presensi_via_halaqah_mulai` (Takhassus akhwat) tetap terjadwal — pengajarnya
 * tetap check-in — tapi mulai tanggal itu tak dipresensi sendiri.
 */
export function presensiDialihkan(
  k: { presensi_via_halaqah_mulai?: string | null },
  program: string,
  tanggal: string
): boolean {
  const mulai = k.presensi_via_halaqah_mulai;
  return program === 'kelas_maahir' && !!mulai && tanggal >= mulai;
}

/**
 * Sesi yang harus DIPRESENSI satu kelas dalam [start, end]: `expectedDaysInRange`
 * minus sesi yang dialihkan ke kelas halaqah (`presensiDialihkan`). Dipakai
 * tagihan ketua, rekap "belum diisi", dan "presensi tak terisi" laporan.
 * Check-in pengajar & sesi target setoran tetap memakai `expectedDaysInRange`.
 */
export function expectedPresensiInRange(
  k: ProgramKelasRow,
  start: string,
  end: string,
  libur?: Set<string>
): ExpectedDay[] {
  return expectedDaysInRange(k, start, end, libur).filter(
    (d) => !presensiDialihkan(k, d.program, d.tanggal)
  );
}

/** Hari program yang diharapkan untuk satu kelas, untuk daftar tanggal yang diberikan. */
function expectedDaysForKelas(
  k: ProgramKelasRow,
  dates: string[],
  libur?: Set<string>
): ExpectedDay[] {
  const out: ExpectedDay[] = [];

  // Mingguan: 1 slot kelas_maahir per pekan (Senin–Jum'at), tanpa At-Tibyan.
  // Slot dikanonikkan ke tanggal Senin pekan tsb. Pekan dilewati bila semua
  // hari kerjanya (dalam rentang) libur.
  if (k.presensi_sifat === 'mingguan') {
    const weekdaysByMonday = new Map<string, string[]>();
    for (const tanggal of dates) {
      const idx = dayIndexOf(tanggal);
      if (idx < 1 || idx > 5) continue; // hanya Senin..Jum'at
      const mon = mondayOf(tanggal);
      const arr = weekdaysByMonday.get(mon) ?? [];
      arr.push(tanggal);
      weekdaysByMonday.set(mon, arr);
    }
    for (const [mon, days] of weekdaysByMonday) {
      if (libur && days.every((d) => libur.has(d))) continue;
      out.push({
        program_kelas_id: k.id,
        kelasName: k.name,
        gender: k.gender,
        program: 'kelas_maahir',
        tanggal: mon,
        waktu_mulai: k.waktu_mulai,
        waktu_selesai: k.waktu_selesai,
        namaKegiatan: PROGRAM_LABEL.kelas_maahir,
        mingguan: true,
      });
    }
    return out;
  }

  // Harian: tiap hari jadwal + At-Tibyan tiap Sabtu (bila ikut_tibyan), kecuali tanggal libur.
  const jadwal = new Set(k.jadwal_hari ?? []);
  for (const tanggal of dates) {
    if (libur?.has(tanggal)) continue;
    const hari = dayNameOf(tanggal);

    if (jadwal.has(hari)) {
      out.push({
        program_kelas_id: k.id,
        kelasName: k.name,
        gender: k.gender,
        program: 'kelas_maahir',
        tanggal,
        waktu_mulai: k.waktu_mulai,
        waktu_selesai: k.waktu_selesai,
        namaKegiatan: PROGRAM_LABEL.kelas_maahir,
        mingguan: false,
      });
    }
    // Kelas ber-ikut_tibyan=false (halaqah per-hari akhwat) tak menagih Sabtu;
    // At-Tibyan mereka dicatat lewat satu kelas gabungan supaya orang yang ada
    // di beberapa kelas tak tertagih dan terhitung berulang.
    if (hari === TIBYAN_HARI && k.ikut_tibyan !== false) {
      out.push({
        program_kelas_id: k.id,
        kelasName: k.name,
        gender: k.gender,
        program: 'at_tibyan',
        tanggal,
        waktu_mulai: TIBYAN_WAKTU.mulai,
        waktu_selesai: TIBYAN_WAKTU.selesai,
        namaKegiatan: PROGRAM_LABEL.at_tibyan,
        mingguan: false,
      });
    }
  }
  return out;
}

/**
 * Daftar hari presensi yang BELUM diisi oleh ketua/wakil (urut paling lama dulu).
 * "Terisi" = ada pertemuan_program untuk (kelas, program, tanggal) yang punya
 * minimal satu baris kehadiran_peserta dengan diisi_at not null.
 */
export async function getUnfilledMaahirDays(wa: string): Promise<UnfilledDay[]> {
  const myKelas = await findKetuaProgramKelas(wa);
  if (myKelas.length === 0) return [];

  const today = todayJakarta();
  const kelasIds = myKelas.map((k) => k.id);
  const kelasById = new Map(myKelas.map((k) => [k.id, k]));

  // Tanggal libur per kelas (dikecualikan dari presensi yang diharapkan).
  const liburByKelas = await getLiburDatesForKelas(kelasIds, PRESENSI_ANCHOR, today);

  // Hari yang diharapkan untuk semua kelas yang dipimpin (anchor s/d hari ini).
  // Kelas self_attendance tak masuk (findKetuaProgramKelas sudah mengecualikan).
  const expected: ExpectedDay[] = [];
  for (const k of myKelas) {
    expected.push(...expectedPresensiInRange(k, awalTagihan(k), today, liburByKelas.get(k.id)));
  }
  if (expected.length === 0) return [];

  // Pertemuan sejak anchor untuk kelas-kelas ini.
  const { data: pertemuanList } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal')
    .in('program_kelas_id', kelasIds)
    .gte('tanggal', PRESENSI_ANCHOR);

  const pertemuanIds = (pertemuanList ?? []).map((p) => p.id);

  // Pertemuan mana yang sudah punya kehadiran tersubmit (diisi_at not null).
  const filledPertemuanIds = new Set<string>();
  if (pertemuanIds.length > 0) {
    const { data: kehadiran } = await supabaseAdmin
      .from('kehadiran_peserta')
      .select('pertemuan_id, diisi_at')
      .in('pertemuan_id', pertemuanIds)
      .not('diisi_at', 'is', null);
    for (const k of kehadiran ?? []) filledPertemuanIds.add(k.pertemuan_id);
  }

  // Key (kelas|matchKey) → terisi? matchKey harian per tanggal, mingguan per pekan.
  const filledKeys = new Set<string>();
  for (const p of pertemuanList ?? []) {
    if (!filledPertemuanIds.has(p.id)) continue;
    const k = kelasById.get(p.program_kelas_id);
    if (!k) continue;
    filledKeys.add(`${p.program_kelas_id}|${filledKeyOf(k, p.program, p.tanggal)}`);
  }

  // Anggota + rentang keanggotaannya. Tanggal yang sudah lewat masa semua
  // anggotanya (mis. kelas selesai, semua diberi selesai_tanggal) tak boleh
  // diminta lagi ke ketua: formnya akan tampil dengan daftar kosong (0/0).
  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('program_kelas_id, mulai_tanggal, selesai_tanggal')
    .in('program_kelas_id', kelasIds)
    .eq('active', true);
  const anggotaByKelas = new Map<
    string,
    Array<{ mulai_tanggal: string | null; selesai_tanggal: string | null }>
  >();
  for (const a of anggotaRows ?? []) {
    const arr = anggotaByKelas.get(a.program_kelas_id) ?? [];
    arr.push({ mulai_tanggal: a.mulai_tanggal ?? null, selesai_tanggal: a.selesai_tanggal ?? null });
    anggotaByKelas.set(a.program_kelas_id, arr);
  }
  const adaAnggotaPada = (kelasId: string, tanggal: string): boolean =>
    (anggotaByKelas.get(kelasId) ?? []).some((a) => anggotaAktifPada(a, tanggal));

  const unfilled = expected.filter((e) => {
    const k = kelasById.get(e.program_kelas_id);
    if (!k) return true;
    if (!adaAnggotaPada(e.program_kelas_id, e.tanggal)) return false;
    return !filledKeys.has(`${e.program_kelas_id}|${filledKeyOf(k, e.program, e.tanggal)}`);
  });

  unfilled.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    return PROGRAM_ORDER[a.program] - PROGRAM_ORDER[b.program];
  });

  return unfilled.map((u) => ({
    ...u,
    grupSesi: kelasById.get(u.program_kelas_id)?.grup_sesi ?? null,
    totalRemaining: unfilled.length,
  }));
}

// ============================================================
// Presensi MANDIRI (per peserta) — kelas self_attendance
// ============================================================

/**
 * Hari presensi yang belum diisi oleh SATU anggota (peserta) pada kelas
 * presensi-mandiri. "Terisi" = ada kehadiran_peserta utk (pertemuan, anggota_id)
 * dengan diisi_at not null. Urut paling lama dulu.
 */
export async function getUnfilledDaysForAnggota(
  kelas: ProgramKelasRow,
  anggotaId: string
): Promise<UnfilledDay[]> {
  const today = todayJakarta();
  // Sama seperti tagihan ketua: periode yang sudah terkunci tak ditagih lagi.
  const anchor = awalTagihan(kelas);
  const libur = await getLiburDates(kelas.id, anchor, today);
  // Peserta mengisi SELURUH presensinya: kelas_maahir & At-Tibyan.
  let expected = expectedDaysInRange(kelas, anchor, today, libur);
  if (expected.length === 0) return [];

  // Batasi ke masa keanggotaannya: sebelum ia masuk / sesudah ia keluar tak
  // perlu diisi (sejalan dgn penyaring di presensi ketua kelas).
  const { data: anggota } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('mulai_tanggal, selesai_tanggal')
    .eq('id', anggotaId)
    .maybeSingle();
  const mulai = (anggota as { mulai_tanggal?: string | null } | null)?.mulai_tanggal ?? null;
  const selesai = (anggota as { selesai_tanggal?: string | null } | null)?.selesai_tanggal ?? null;
  if (mulai || selesai) {
    expected = expected.filter(
      (e) => (!mulai || e.tanggal >= mulai) && (!selesai || e.tanggal <= selesai)
    );
    if (expected.length === 0) return [];
  }

  const { data: pertemuanList } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal')
    .eq('program_kelas_id', kelas.id)
    .gte('tanggal', anchor);

  const pertemuanIds = (pertemuanList ?? []).map((p) => p.id);
  const filledPertemuanIds = new Set<string>();
  if (pertemuanIds.length > 0) {
    const { data: kehadiran } = await supabaseAdmin
      .from('kehadiran_peserta')
      .select('pertemuan_id, diisi_at')
      .in('pertemuan_id', pertemuanIds)
      .eq('anggota_id', anggotaId)
      .not('diisi_at', 'is', null);
    for (const k of kehadiran ?? []) filledPertemuanIds.add(k.pertemuan_id);
  }

  const filledKeys = new Set<string>();
  for (const p of pertemuanList ?? []) {
    if (filledPertemuanIds.has(p.id)) filledKeys.add(filledKeyOf(kelas, p.program, p.tanggal));
  }

  const unfilled = expected.filter(
    (e) => !filledKeys.has(filledKeyOf(kelas, e.program, e.tanggal))
  );
  unfilled.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    return PROGRAM_ORDER[a.program] - PROGRAM_ORDER[b.program];
  });
  return unfilled.map((u) => ({ ...u, totalRemaining: unfilled.length }));
}

export { getSelfAttendanceKelas };
