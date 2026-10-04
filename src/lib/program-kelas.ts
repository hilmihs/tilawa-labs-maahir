// Helper kelas program Maahir (kehadiran). Ketua/wakil diidentifikasi
// nomor WA karena bisa peserta, musyrif, atau koordinator.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { anggotaAktifPada, todayJakarta } from '@/lib/anggota-periode';
import type { RoleAccess } from '@/types/db';

const ROLE_TABLE: Record<string, { table: string; idField: string }> = {
  peserta: { table: 'peserta', idField: 'peserta_id' },
  musyrif: { table: 'musyrif', idField: 'musyrif_id' },
  koordinator: { table: 'koordinator', idField: 'koordinator_id' },
  koordinator_kehadiran: { table: 'koordinator', idField: 'koordinator_id' },
  syaikh: { table: 'syaikh', idField: 'syaikh_id' },
  pengajar: { table: 'pengajar', idField: 'pengajar_id' },
};

/** Nomor WA (normalized) dari sesi aktif — cek semua akses role. */
export async function getSessionWa(): Promise<string | null> {
  const s = await getSession();
  const accesses: RoleAccess[] = s.accesses ?? (s.session ? [s.session] : []);
  for (const a of accesses) {
    const cfg = ROLE_TABLE[a.role];
    if (!cfg) continue;
    const id = (a as unknown as Record<string, string>)[cfg.idField];
    if (!id) continue;
    const { data } = await supabaseAdmin
      .from(cfg.table)
      .select('whatsapp_number')
      .eq('id', id)
      .maybeSingle();
    if (data?.whatsapp_number) return data.whatsapp_number;
  }
  return null;
}

export const TAKHASSUS_IKHWAN = 'Maahir Takhassus Ikhwan';
export const TAKHASSUS_AKHWAT = 'Maahir Takhassus Akhwat';
const TAKHASSUS_NAMES = new Set<string>([TAKHASSUS_IKHWAN, TAKHASSUS_AKHWAT]);

/**
 * Hanya kelas Takhassus yang menyetor hafalan. Dipakai untuk memutuskan apakah
 * kolom `setoran_halaman` ditanyakan saat presensi — `program === 'kelas_maahir'`
 * saja terlalu longgar karena semua kelas Maahir ikut lolos.
 */
export function isTakhassusKelas(name: string): boolean {
  return TAKHASSUS_NAMES.has(name);
}

export type ProgramKelasRow = {
  id: string;
  name: string;
  gender: 'ikhwan' | 'akhwat';
  jadwal_hari: string[];
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  ketua_wa: string | null;
  wakil_wa: string | null;
  self_attendance: boolean;
  presensi_sifat: 'harian' | 'mingguan';
  /** Kelas mulai berjalan; presensi sebelum tanggal ini tak diminta. */
  mulai_tanggal: string | null;
  /**
   * false = kelas tidak ditagih sesi At-Tibyan Sabtu. Dipakai kelas halaqah
   * per-hari akhwat yang At-Tibyan-nya dicatat lewat satu kelas gabungan.
   */
  ikut_tibyan: boolean;
  /**
   * Mulai tanggal ini sesi kelas_maahir kelas ini tak dipresensi sendiri:
   * anggotanya dipresensi di kelas halaqah mereka (Takhassus akhwat, 28 Sep
   * 2026). Opsional karena tak semua select memuatnya — undefined = NULL.
   */
  presensi_via_halaqah_mulai?: string | null;
  /**
   * Label sesi yang menyatukan kelas per hari di tampilan ketua & koordinator
   * (0092, mis. 'Halaqah Tahfizh Pagi'). Hanya tampilan — tagihan, laporan,
   * dan SP tetap per kelas. Opsional seperti di atas; NULL = berdiri sendiri.
   */
  grup_sesi?: string | null;
};

const PK_COLS = 'id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa, self_attendance, presensi_sifat, mulai_tanggal, ikut_tibyan, presensi_via_halaqah_mulai, grup_sesi';

/**
 * Buang kelas yang sudah pensiun dari daftar milik ketua/wakil.
 *
 * `program_kelas` tak punya kolom aktif/selesai, dan menghapus barisnya akan
 * meng-CASCADE seluruh pertemuan & kehadirannya — riwayat yang masih dipakai
 * laporan bulanan dan SP. Jadi kelas dipensiunkan dengan memberi
 * `selesai_tanggal` pada semua anggotanya; kelas tanpa anggota aktif hari ini
 * dianggap sudah bubar dan tak perlu lagi tampil di layar ketua. Sisi
 * koordinator (rekap, laporan, SP) sengaja tidak disaring supaya riwayatnya
 * tetap terbaca.
 */
async function saringKelasBubar(rows: ProgramKelasRow[]): Promise<ProgramKelasRow[]> {
  if (rows.length === 0) return rows;
  const hariIni = todayJakarta();
  const { data } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('program_kelas_id, mulai_tanggal, selesai_tanggal')
    .in('program_kelas_id', rows.map((r) => r.id))
    .eq('active', true);
  const berjalan = new Set<string>();
  for (const a of (data ?? []) as Array<{
    program_kelas_id: string;
    mulai_tanggal: string | null;
    selesai_tanggal: string | null;
  }>) {
    if (anggotaAktifPada(a, hariIni)) berjalan.add(a.program_kelas_id);
  }
  return rows.filter((r) => berjalan.has(r.id));
}

/**
 * Kelas program di mana WA ini jadi ketua atau wakil.
 * Kelas self_attendance DIKECUALIKAN — seluruh presensinya (kelas_maahir &
 * At-Tibyan) diisi tiap peserta sendiri, jadi ketua tak mengisi apa pun.
 */
export async function findKetuaProgramKelas(wa: string): Promise<ProgramKelasRow[]> {
  const { data } = await supabaseAdmin
    .from('program_kelas')
    .select(PK_COLS)
    .eq('self_attendance', false)
    .or(`ketua_wa.eq.${wa},wakil_wa.eq.${wa}`);
  return saringKelasBubar((data ?? []) as ProgramKelasRow[]);
}

/**
 * Semua kelas di mana WA ini ketua atau wakil — TERMASUK kelas self_attendance
 * (takhassus). Dipakai fitur pengajuan libur (ketua/wakil takhassus juga boleh).
 */
export async function findKetuaWakilKelas(wa: string): Promise<ProgramKelasRow[]> {
  const { data } = await supabaseAdmin
    .from('program_kelas')
    .select(PK_COLS)
    .or(`ketua_wa.eq.${wa},wakil_wa.eq.${wa}`);
  return saringKelasBubar((data ?? []) as ProgramKelasRow[]);
}

/** Ambil satu kelas presensi-mandiri by id. null bila bukan self_attendance. */
export async function getSelfAttendanceKelas(id: string): Promise<ProgramKelasRow | null> {
  const { data } = await supabaseAdmin
    .from('program_kelas')
    .select(PK_COLS)
    .eq('id', id)
    .eq('self_attendance', true)
    .maybeSingle();
  return (data as ProgramKelasRow | null) ?? null;
}

/** Keanggotaan kelas presensi-mandiri untuk WA ini (akses lewat akun sendiri). */
export async function findSelfAttendanceMembership(
  wa: string
): Promise<{ kelas: ProgramKelasRow; anggotaId: string; anggotaName: string } | null> {
  const { data } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select(`id, name, program_kelas:program_kelas_id(${PK_COLS})`)
    .eq('whatsapp_number', wa)
    .eq('active', true);
  for (const a of data ?? []) {
    const k = a.program_kelas as unknown as ProgramKelasRow | null;
    if (k?.self_attendance) return { kelas: k, anggotaId: a.id as string, anggotaName: a.name as string };
  }
  return null;
}

/**
 * `grup_sesi` per kelas, untuk mengelompokkan tampilan rekap koordinator.
 * Sengaja tidak lewat getMaahirRekap: mesin rekap (dan API publik serta
 * ekspor yang memakainya) tak perlu tahu soal pengelompokan tampilan.
 */
export async function getGrupSesiKelas(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;
  const { data } = await supabaseAdmin
    .from('program_kelas')
    .select('id, grup_sesi')
    .in('id', ids);
  for (const r of (data ?? []) as Array<{ id: string; grup_sesi: string | null }>) {
    out.set(r.id, r.grup_sesi ?? null);
  }
  return out;
}
