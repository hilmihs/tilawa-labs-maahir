// Check-in kehadiran PENGAJAR Kelas Maahir + materi pertemuan (0076).
//
// Akses diturunkan dari nomor WA (seperti ketua kelas Maahir), bukan role
// sesi: `findPengajarMaahir(wa)` mengembalikan kelas yang diampu. Sesi
// terjadwal diturunkan dari `program_kelas.jadwal_hari` dikurangi libur —
// tak ada input jadwal terpisah. Tanpa aturan terlambat: `checked_in_at`
// hanya dicatat dan ditampilkan.
//
// Periode rekap 16–15 (`periode-pengajar.ts`); pengisian & sunting hanya
// untuk periode berjalan.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getLiburDatesForKelas } from '@/lib/maahir-libur';
import { expectedDaysInRange } from '@/lib/maahir-presensi';
import { todayJakarta } from '@/lib/anggota-periode';
import { logAudit } from '@/lib/audit';
import type { ProgramKelasRow } from '@/lib/program-kelas';
import {
  CHECKIN_PENGAJAR_ANCHOR,
  periodePengajarRange,
  periodePengajarTerbuka,
} from '@/lib/periode-pengajar';
import type {
  Gender,
  MaahirCheckinPengajar,
  MaahirPengajar,
  RoleAccess,
  StatusCheckinMaahir,
} from '@/types/db';

const PK_COLS =
  'id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa, self_attendance, presensi_sifat, mulai_tanggal, ikut_tibyan';

export const STATUS_CHECKIN_MAAHIR: readonly StatusCheckinMaahir[] = ['hadir', 'izin', 'sakit'];

export const LABEL_STATUS_CHECKIN: Record<StatusCheckinMaahir, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
};

const maxTgl = (a: string, b: string) => (a > b ? a : b);
const minTgl = (a: string, b: string) => (a < b ? a : b);

/** 'HH.MM' WIB dari timestamp. */
export function jamWib(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })
    .replace(':', '.');
}

/** 'Sen, 16 Sep' dari 'YYYY-MM-DD'. */
export function tanggalPendek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

// ============================================================
// Akses
// ============================================================

export type PengajarMaahirAkses = {
  pengajar: MaahirPengajar;
  /** Kelas yang diampu (pemetaan aktif). */
  kelas: ProgramKelasRow[];
};

/** Pengajar Maahir untuk WA ini beserta kelas yang diampu; null bila bukan. */
export async function findPengajarMaahir(wa: string): Promise<PengajarMaahirAkses | null> {
  if (!wa) return null;
  const { data: p } = await supabaseAdmin
    .from('maahir_pengajar')
    .select('id, name, gender, whatsapp_number, active, created_at')
    .eq('whatsapp_number', wa)
    .eq('active', true)
    .maybeSingle();
  if (!p) return null;
  const pengajar = p as MaahirPengajar;
  const { data: map } = await supabaseAdmin
    .from('maahir_pengajar_kelas')
    .select('program_kelas_id')
    .eq('pengajar_id', pengajar.id)
    .eq('active', true);
  const kelasIds = (map ?? []).map((r) => r.program_kelas_id as string);
  if (kelasIds.length === 0) return { pengajar, kelas: [] };
  const { data: kelasRows } = await supabaseAdmin
    .from('program_kelas')
    .select(PK_COLS)
    .in('id', kelasIds)
    .order('waktu_mulai')
    .order('name');
  return { pengajar, kelas: (kelasRows ?? []) as unknown as ProgramKelasRow[] };
}

/**
 * Apakah salah satu koordinator (by id) ber-flag `rekap_pengajar_maahir`?
 * Pengecekan sesi + superadmin ada di `maahir-checkin-pengajar-akses.ts`
 * (server-only); yang di sini murni DB supaya bisa diuji.
 */
export async function koordinatorBolehRekapPengajar(koorIds: string[]): Promise<boolean> {
  if (koorIds.length === 0) return false;
  const { data } = await supabaseAdmin
    .from('koordinator')
    .select('id')
    .in('id', koorIds)
    .eq('active', true)
    .eq('rekap_pengajar_maahir', true)
    .limit(1);
  return (data ?? []).length > 0;
}

// ============================================================
// Sesi terjadwal & isian
// ============================================================

export type SesiPengajar = {
  kelasId: string;
  kelasName: string;
  tanggal: string;
  waktuMulai: string | null;
  waktuSelesai: string | null;
  checkin: MaahirCheckinPengajar | null;
  /** Sudah lewat/hari ini (≤ hari ini) — dihitung sebagai terjadwal di rekap. */
  lampau: boolean;
  /** Boleh diisi/disunting sekarang: periode berjalan & tanggal ≤ hari ini. */
  bolehIsi: boolean;
};

/**
 * Tanggal sesi kelas_maahir satu kelas dalam [start, end], sesudah libur dan
 * anchor (global + `mulai_tanggal` kelas). Sesi At-Tibyan Sabtu yang
 * disisipkan `expectedDaysInRange` sengaja dibuang — At-Tibyan bukan kelas
 * yang diampu pengajar ini.
 */
export function sesiTerjadwalKelas(
  kelas: ProgramKelasRow,
  start: string,
  end: string,
  libur?: Set<string>
): Array<{ tanggal: string; waktuMulai: string | null; waktuSelesai: string | null }> {
  let dari = maxTgl(start, CHECKIN_PENGAJAR_ANCHOR);
  if (kelas.mulai_tanggal) dari = maxTgl(dari, kelas.mulai_tanggal);
  if (dari > end) return [];
  return expectedDaysInRange(kelas, dari, end, libur)
    .filter((d) => d.program === 'kelas_maahir')
    .map((d) => ({ tanggal: d.tanggal, waktuMulai: d.waktu_mulai, waktuSelesai: d.waktu_selesai }));
}

async function checkinRows(
  pengajarIds: string[],
  start: string,
  end: string
): Promise<MaahirCheckinPengajar[]> {
  if (pengajarIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('maahir_checkin_pengajar')
    .select('id, pengajar_id, program_kelas_id, tanggal, status, checked_in_at, susulan, materi, catatan, created_at, updated_at')
    .in('pengajar_id', pengajarIds)
    .gte('tanggal', start)
    .lte('tanggal', end);
  return (data ?? []) as MaahirCheckinPengajar[];
}

const urutSesi = (a: SesiPengajar, b: SesiPengajar) =>
  a.tanggal.localeCompare(b.tanggal) ||
  (a.waktuMulai ?? '').localeCompare(b.waktuMulai ?? '') ||
  a.kelasName.localeCompare(b.kelasName);

/**
 * Semua sesi seorang pengajar (semua kelas yang diampu) dalam satu periode
 * 16–15, urut menaik, TERMASUK sesi yang belum terjadi (ditandai `lampau=false`).
 */
export async function getSesiPengajar(
  akses: PengajarMaahirAkses,
  month: string,
  hariIni: string = todayJakarta()
): Promise<SesiPengajar[]> {
  const { start, end } = periodePengajarRange(month);
  if (akses.kelas.length === 0) return [];
  const kelasIds = akses.kelas.map((k) => k.id);
  const [liburByKelas, rows] = await Promise.all([
    getLiburDatesForKelas(kelasIds, start, end),
    checkinRows([akses.pengajar.id], start, end),
  ]);
  const byKey = new Map(rows.map((r) => [`${r.program_kelas_id}|${r.tanggal}`, r]));
  const out: SesiPengajar[] = [];
  for (const k of akses.kelas) {
    for (const s of sesiTerjadwalKelas(k, start, end, liburByKelas.get(k.id))) {
      const lampau = s.tanggal <= hariIni;
      out.push({
        kelasId: k.id,
        kelasName: k.name,
        tanggal: s.tanggal,
        waktuMulai: s.waktuMulai,
        waktuSelesai: s.waktuSelesai,
        checkin: byKey.get(`${k.id}|${s.tanggal}`) ?? null,
        lampau,
        bolehIsi: lampau && periodePengajarTerbuka(s.tanggal, hariIni),
      });
    }
  }
  return out.sort(urutSesi);
}

/** Isian yang sudah tersimpan, dalam bentuk yang dipakai form check-in (client). */
export type CheckinAwal = {
  status: StatusCheckinMaahir;
  materi: string;
  catatan: string;
  /** 'HH.MM' — jam isi yang sudah tersimpan. */
  jam: string;
  susulan: boolean;
} | null;

export function awalDari(s: SesiPengajar): CheckinAwal {
  if (!s.checkin) return null;
  return {
    status: s.checkin.status,
    materi: s.checkin.materi ?? '',
    catatan: s.checkin.catatan ?? '',
    jam: jamWib(s.checkin.checked_in_at),
    susulan: s.checkin.susulan,
  };
}

export type RingkasanSesi = {
  /** Sesi yang sudah lewat/hari ini. */
  terjadwal: number;
  hadir: number;
  izin: number;
  sakit: number;
  /** Sesi lampau tanpa isian. */
  belum: number;
  /** hadir / terjadwal × 100; null bila terjadwal 0. */
  persen: number | null;
  /** Sesi hadir yang materinya kosong. */
  materiKosong: number;
};

export function ringkasSesi(sesi: SesiPengajar[]): RingkasanSesi {
  const lampau = sesi.filter((s) => s.lampau);
  const r: RingkasanSesi = { terjadwal: lampau.length, hadir: 0, izin: 0, sakit: 0, belum: 0, persen: null, materiKosong: 0 };
  for (const s of lampau) {
    if (!s.checkin) { r.belum++; continue; }
    r[s.checkin.status]++;
    if (s.checkin.status === 'hadir' && !s.checkin.materi?.trim()) r.materiKosong++;
  }
  r.persen = r.terjadwal > 0 ? Math.round((r.hadir / r.terjadwal) * 100) : null;
  return r;
}

// ============================================================
// Rekap semua pengajar (pemantau)
// ============================================================

export type RekapPengajarRow = {
  pengajarId: string;
  name: string;
  gender: Gender;
  kelasNames: string[];
  ringkasan: RingkasanSesi;
  /** Sesi periode ini, urut menaik (termasuk yang belum terjadi). */
  sesi: SesiPengajar[];
};

export type RekapPengajarMaahir = {
  month: string;
  start: string;
  end: string;
  /** Tanggal terakhir yang dihitung (hari ini bila periode masih berjalan). */
  cutoff: string;
  list: RekapPengajarRow[];
};

export async function getRekapPengajarMaahir(
  month: string,
  hariIni: string = todayJakarta()
): Promise<RekapPengajarMaahir> {
  const { start, end } = periodePengajarRange(month);
  const cutoff = minTgl(end, hariIni);
  const { data: pengajarRows } = await supabaseAdmin
    .from('maahir_pengajar')
    .select('id, name, gender, whatsapp_number, active, created_at')
    .eq('active', true)
    .order('name');
  const pengajarList = (pengajarRows ?? []) as MaahirPengajar[];
  if (pengajarList.length === 0) return { month, start, end, cutoff, list: [] };

  const { data: mapRows } = await supabaseAdmin
    .from('maahir_pengajar_kelas')
    .select('pengajar_id, program_kelas_id')
    .in('pengajar_id', pengajarList.map((p) => p.id))
    .eq('active', true);
  const kelasIds = [...new Set((mapRows ?? []).map((r) => r.program_kelas_id as string))];
  const { data: kelasRows } = kelasIds.length
    ? await supabaseAdmin.from('program_kelas').select(PK_COLS).in('id', kelasIds)
    : { data: [] as unknown[] };
  const kelasById = new Map(((kelasRows ?? []) as unknown as ProgramKelasRow[]).map((k) => [k.id, k]));
  const kelasByPengajar = new Map<string, ProgramKelasRow[]>();
  for (const r of mapRows ?? []) {
    const k = kelasById.get(r.program_kelas_id as string);
    if (!k) continue;
    const arr = kelasByPengajar.get(r.pengajar_id as string) ?? [];
    arr.push(k);
    kelasByPengajar.set(r.pengajar_id as string, arr);
  }

  const [liburByKelas, rows] = await Promise.all([
    getLiburDatesForKelas(kelasIds, start, end),
    checkinRows(pengajarList.map((p) => p.id), start, end),
  ]);
  const byKey = new Map(rows.map((r) => [`${r.pengajar_id}|${r.program_kelas_id}|${r.tanggal}`, r]));

  const list: RekapPengajarRow[] = pengajarList.map((p) => {
    const kelas = (kelasByPengajar.get(p.id) ?? []).sort(
      (a, b) => (a.waktu_mulai ?? '').localeCompare(b.waktu_mulai ?? '') || a.name.localeCompare(b.name)
    );
    const sesi: SesiPengajar[] = [];
    for (const k of kelas) {
      for (const s of sesiTerjadwalKelas(k, start, end, liburByKelas.get(k.id))) {
        const lampau = s.tanggal <= hariIni;
        sesi.push({
          kelasId: k.id,
          kelasName: k.name,
          tanggal: s.tanggal,
          waktuMulai: s.waktuMulai,
          waktuSelesai: s.waktuSelesai,
          checkin: byKey.get(`${p.id}|${k.id}|${s.tanggal}`) ?? null,
          lampau,
          bolehIsi: lampau && periodePengajarTerbuka(s.tanggal, hariIni),
        });
      }
    }
    sesi.sort(urutSesi);
    return {
      pengajarId: p.id,
      name: p.name,
      gender: p.gender,
      kelasNames: kelas.map((k) => k.name),
      ringkasan: ringkasSesi(sesi),
      sesi,
    };
  });
  return { month, start, end, cutoff, list };
}

// ============================================================
// Tulis
// ============================================================

export type SimpanCheckinInput = {
  kelasId: string;
  tanggal: string;
  status: StatusCheckinMaahir;
  materi: string;
  catatan: string;
};

export type HasilTulis = { ok: true; checkin: MaahirCheckinPengajar } | { ok: false; error: string };

/** 'YYYY-MM-DD' yang benar-benar ada di kalender (menolak 2026-02-30). */
function tanggalValid(t: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const [y, m, d] = t.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const bersih = (s: string) => {
  const t = s.trim();
  return t ? t : null;
};

/**
 * Check-in / perbarui isian satu sesi milik pengajar ini. Validasi: kelas
 * diampu, tanggal memang sesi terjadwal (bukan libur), tanggal ≤ hari ini,
 * dan periodenya masih berjalan. `susulan` ditetapkan saat baris pertama
 * dibuat (tanggal < hari ini) dan tak berubah oleh suntingan berikutnya.
 */
export async function simpanCheckinPengajar(
  akses: PengajarMaahirAkses,
  input: SimpanCheckinInput,
  actor: RoleAccess,
  hariIni: string = todayJakarta()
): Promise<HasilTulis> {
  const kelas = akses.kelas.find((k) => k.id === input.kelasId);
  if (!kelas) return { ok: false, error: 'Kelas bukan kelas yang Anda ampu.' };
  if (!tanggalValid(input.tanggal)) return { ok: false, error: 'Tanggal tidak valid.' };
  if (!STATUS_CHECKIN_MAAHIR.includes(input.status)) return { ok: false, error: 'Status tidak valid.' };
  if (input.tanggal > hariIni) return { ok: false, error: 'Sesi belum berlangsung — check-in hanya untuk hari ini atau sesi yang sudah lewat.' };
  if (!periodePengajarTerbuka(input.tanggal, hariIni)) {
    return { ok: false, error: 'Periode sesi ini sudah ditutup (pengisian hanya sampai tanggal 15). Hubungi koordinator untuk koreksi.' };
  }
  const libur = await getLiburDatesForKelas([kelas.id], input.tanggal, input.tanggal);
  const terjadwal = sesiTerjadwalKelas(kelas, input.tanggal, input.tanggal, libur.get(kelas.id));
  if (terjadwal.length === 0) return { ok: false, error: 'Tanggal ini bukan jadwal kelas tersebut (atau libur).' };
  if (input.status !== 'hadir' && !bersih(input.catatan)) {
    return { ok: false, error: 'Izin/sakit wajib disertai alasan.' };
  }

  const { data: ada } = await supabaseAdmin
    .from('maahir_checkin_pengajar')
    .select('id, susulan')
    .eq('pengajar_id', akses.pengajar.id)
    .eq('program_kelas_id', kelas.id)
    .eq('tanggal', input.tanggal)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const payload = {
    status: input.status,
    materi: bersih(input.materi),
    catatan: bersih(input.catatan),
    updated_at: nowIso,
  };
  let row: MaahirCheckinPengajar | null = null;
  if (ada) {
    const { data, error } = await supabaseAdmin
      .from('maahir_checkin_pengajar')
      .update(payload)
      .eq('id', ada.id as string)
      .select('id, pengajar_id, program_kelas_id, tanggal, status, checked_in_at, susulan, materi, catatan, created_at, updated_at')
      .single();
    if (error) return { ok: false, error: `Gagal simpan: ${error.message}` };
    row = data as MaahirCheckinPengajar;
  } else {
    const { data, error } = await supabaseAdmin
      .from('maahir_checkin_pengajar')
      .insert({
        pengajar_id: akses.pengajar.id,
        program_kelas_id: kelas.id,
        tanggal: input.tanggal,
        checked_in_at: nowIso,
        susulan: input.tanggal < hariIni,
        ...payload,
      })
      .select('id, pengajar_id, program_kelas_id, tanggal, status, checked_in_at, susulan, materi, catatan, created_at, updated_at')
      .single();
    if (error) return { ok: false, error: `Gagal simpan: ${error.message}` };
    row = data as MaahirCheckinPengajar;
  }

  await logAudit({
    actor,
    action: ada ? 'maahir_checkin.update' : 'maahir_checkin.submit',
    targetTable: 'maahir_checkin_pengajar',
    targetId: row.id,
    detail: {
      pengajar_id: akses.pengajar.id,
      program_kelas_id: kelas.id,
      tanggal: input.tanggal,
      status: input.status,
      susulan: row.susulan,
      materi_terisi: !!row.materi,
    },
  });
  return { ok: true, checkin: row };
}
