// Nonaktifkan/aktifkan SEORANG (bukan satu baris role). Satu orang punya baris
// di banyak tabel yang dihubungkan nomor WA — pengajar, peserta setoran,
// musyrif, ketua kelas, anggota kelas Maahir. Menonaktifkan hanya satu baris
// menyisakan dia di daftar lain, jadi toggle di sini menyapu semuanya sekaligus.
//
// `koordinator` dan `syaikh` sengaja TIDAK disentuh — koordinator tak boleh
// menonaktifkan sesamanya lewat halaman ini.

import { supabaseAdmin } from '@/lib/supabase-admin';

/** Tabel yang ikut di-toggle, semuanya punya kolom `whatsapp_number` + `active`. */
export const TABEL_TERKENA = [
  'pengajar',
  'peserta',
  'musyrif',
  'ketua_kelas',
  'koordinator_ketua_kelas',
  'program_kelas_anggota',
] as const;

/** Tabel yang kebal — dipakai untuk menolak penonaktifan sesama koordinator. */
const TABEL_KEBAL = ['koordinator', 'syaikh'] as const;

export type OrangRow = {
  wa: string;
  name: string;
  gender: 'ikhwan' | 'akhwat';
  active: boolean;
  kelompok: string | null;
  /** Tabel lain tempat WA ini punya baris aktif — ditampilkan sbg peringatan. */
  peran: string[];
};

const LABEL_PERAN: Record<string, string> = {
  peserta: 'peserta setoran',
  musyrif: 'musyrif',
  ketua_kelas: 'ketua kelas',
  koordinator_ketua_kelas: 'koordinator ketua kelas',
  program_kelas_anggota: 'anggota kelas Maahir',
};

/** true bila WA ini koordinator/syaikh — tak boleh dinonaktifkan dari sini. */
export async function isKebal(wa: string): Promise<boolean> {
  for (const t of TABEL_KEBAL) {
    const { data } = await supabaseAdmin
      .from(t)
      .select('id')
      .eq('whatsapp_number', wa)
      .eq('active', true)
      .limit(1);
    if ((data ?? []).length > 0) return true;
  }
  return false;
}

/**
 * Daftar semua pengajar + peran lain yang melekat pada nomor WA-nya.
 * Pengajar dipakai sebagai daftar induk karena semua orang yang relevan
 * (ketua kelas, peserta setoran, anggota Maahir) punya baris pengajar.
 */
export async function listOrang(): Promise<OrangRow[]> {
  const { data: pengajarRows } = await supabaseAdmin
    .from('pengajar')
    .select('name, gender, whatsapp_number, active, kelompok_id')
    .order('name');

  const { data: kelompokRows } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name');
  const kelompokById = new Map((kelompokRows ?? []).map((k) => [k.id as string, k.name as string]));

  // Peran lain per WA — satu query per tabel, lalu dikelompokkan.
  const peranByWa = new Map<string, string[]>();
  for (const t of TABEL_TERKENA) {
    if (t === 'pengajar') continue;
    const { data } = await supabaseAdmin.from(t).select('whatsapp_number').eq('active', true);
    for (const r of data ?? []) {
      const wa = r.whatsapp_number as string | null;
      if (!wa) continue;
      const arr = peranByWa.get(wa) ?? [];
      if (!arr.includes(LABEL_PERAN[t])) arr.push(LABEL_PERAN[t]);
      peranByWa.set(wa, arr);
    }
  }

  return (pengajarRows ?? []).map((p) => ({
    wa: p.whatsapp_number as string,
    name: p.name as string,
    gender: p.gender as 'ikhwan' | 'akhwat',
    active: p.active as boolean,
    kelompok: p.kelompok_id ? kelompokById.get(p.kelompok_id as string) ?? null : null,
    peran: peranByWa.get(p.whatsapp_number as string) ?? [],
  }));
}

export type ToggleHasil = { terpengaruh: Record<string, number> };

/**
 * Set `active` di semua tabel untuk satu nomor WA.
 * Mengembalikan jumlah baris tersentuh per tabel (untuk audit + pesan UI).
 */
export async function setOrangAktif(wa: string, next: boolean): Promise<ToggleHasil> {
  const terpengaruh: Record<string, number> = {};
  for (const t of TABEL_TERKENA) {
    const { data, error } = await supabaseAdmin
      .from(t)
      .update({ active: next })
      .eq('whatsapp_number', wa)
      .select('id');
    if (error) throw new Error(`Gagal update ${t}: ${error.message}`);
    if ((data ?? []).length > 0) terpengaruh[t] = (data ?? []).length;
  }
  return { terpengaruh };
}
