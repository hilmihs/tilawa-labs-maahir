// Pemutihan absensi: kehadiran seorang peserta pada tanggal (atau seluruh bulan)
// tertentu tidak dihitung. Baris presensi aslinya TIDAK diubah — hanya
// perhitungan laporan & SP yang mengabaikannya.
//
// Dua bentuk, dibedakan oleh kolom `tanggal`:
//   tanggal = '2026-08-04' → hanya pertemuan tanggal itu yang dianulir
//   tanggal = NULL         → seluruh bulan (bentuk lama, dianggap hadir penuh)
//
// Pembatalan tidak menghapus baris: ia diberi `dibatalkan_pada`/`dibatalkan_oleh`
// supaya Pendataan SP tetap menyimpan bank data siapa pernah diputihkan, oleh
// siapa, dan kapan.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { periodeMonthOf } from '@/lib/periode-laporan';

export type Pemutihan = {
  id: string;
  anggotaId: string;
  month: string; // 'YYYY-MM' — periode laporan (28 bulan lalu s/d 27)
  /** null = seluruh bulan. */
  tanggal: string | null;
  alasan: string | null;
  dibuatOleh: string | null;
  createdAt: string;
  dibatalkanPada: string | null;
  dibatalkanOleh: string | null;
};

const COLS =
  'id, anggota_id, month, tanggal, alasan, dibuat_oleh, created_at, dibatalkan_pada, dibatalkan_oleh';

function mapRow(r: Record<string, unknown>): Pemutihan {
  return {
    id: r.id as string,
    anggotaId: r.anggota_id as string,
    month: r.month as string,
    tanggal: (r.tanggal as string | null) ?? null,
    alasan: (r.alasan as string | null) ?? null,
    dibuatOleh: (r.dibuat_oleh as string | null) ?? null,
    createdAt: r.created_at as string,
    dibatalkanPada: (r.dibatalkan_pada as string | null) ?? null,
    dibatalkanOleh: (r.dibatalkan_oleh as string | null) ?? null,
  };
}

// Window 28–27 kini tinggal di modul murni supaya bisa dipakai tanpa menyeret
// akses DB. Di-ekspor ulang di sini karena banyak pemanggil lama mengimpornya
// dari modul pemutihan.
export { periodeMonthOf } from '@/lib/periode-laporan';

/** Pemutihan yang masih berlaku (opsional difilter bulan). */
export async function getPemutihan(month?: string): Promise<Pemutihan[]> {
  let q = supabaseAdmin.from('maahir_pemutihan').select(COLS).is('dibatalkan_pada', null);
  if (month) q = q.eq('month', month);
  const { data } = await q;
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
}

/** Semua pemutihan TERMASUK yang sudah dibatalkan — bank data / riwayat. */
export async function getRiwayatPemutihan(month?: string): Promise<Pemutihan[]> {
  let q = supabaseAdmin.from('maahir_pemutihan').select(COLS);
  if (month) q = q.eq('month', month);
  const { data } = await q;
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(mapRow);
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * anggotaId → alasan, untuk pemutihan SEBULAN PENUH pada satu bulan.
 * Sengaja hanya baris `tanggal IS NULL`: hanya bentuk itu yang berarti
 * "dianggap hadir penuh" di laporan bulanan. Pemutihan per-tanggal ditangani
 * lewat `getPemutihanKeys().tanggal` — sesinya dikeluarkan dari penyebut,
 * bukan diubah jadi hadir.
 */
export async function getPemutihanMap(month: string): Promise<Map<string, string | null>> {
  const rows = await getPemutihan(month);
  return new Map(rows.filter((r) => r.tanggal === null).map((r) => [r.anggotaId, r.alasan]));
}

export type PemutihanKeys = {
  /** `${anggotaId}|${YYYY-MM}` — seluruh bulan diputihkan. */
  bulan: Set<string>;
  /** `${anggotaId}|${YYYY-MM-DD}` — satu tanggal diputihkan. */
  tanggal: Set<string>;
};

/** Kunci pencocokan dari baris yang sudah diambil (hindari query ganda). */
export function pemutihanKeysDari(rows: Pemutihan[]): PemutihanKeys {
  const keys: PemutihanKeys = { bulan: new Set(), tanggal: new Set() };
  for (const r of rows) {
    if (r.tanggal) keys.tanggal.add(`${r.anggotaId}|${r.tanggal}`);
    else keys.bulan.add(`${r.anggotaId}|${r.month}`);
  }
  return keys;
}

/** Kunci pencocokan pemutihan aktif untuk semua bulan (dipakai SP kumulatif). */
export async function getPemutihanKeys(): Promise<PemutihanKeys> {
  return pemutihanKeysDari(await getPemutihan());
}

/** true bila kehadiran anggota pada tanggal tsb diputihkan (per-tanggal / sebulan). */
export function diputihkanPada(keys: PemutihanKeys, anggotaId: string, tanggal: string): boolean {
  return (
    keys.tanggal.has(`${anggotaId}|${tanggal}`) ||
    keys.bulan.has(`${anggotaId}|${periodeMonthOf(tanggal)}`)
  );
}

/**
 * Simpan satu pemutihan. Indeks uniknya parsial (hanya baris aktif), yang tak
 * bisa dipakai `ON CONFLICT` lewat pg-shim — jadi baris yang sudah ada dicari
 * dulu lalu alasannya diperbarui.
 */
async function simpanSatu(
  anggotaId: string,
  month: string,
  tanggal: string | null,
  alasan: string | null,
  dibuatOleh: string | null
): Promise<{ error?: string }> {
  let cari = supabaseAdmin
    .from('maahir_pemutihan')
    .select('id')
    .eq('anggota_id', anggotaId)
    .eq('month', month)
    .is('dibatalkan_pada', null);
  cari = tanggal === null ? cari.is('tanggal', null) : cari.eq('tanggal', tanggal);
  const { data: ada } = await cari.maybeSingle();

  if (ada?.id) {
    const { error } = await supabaseAdmin
      .from('maahir_pemutihan')
      .update({ alasan, dibuat_oleh: dibuatOleh })
      .eq('id', ada.id as string);
    return error ? { error: error.message } : {};
  }

  const { error } = await supabaseAdmin
    .from('maahir_pemutihan')
    .insert({ anggota_id: anggotaId, month, tanggal, alasan, dibuat_oleh: dibuatOleh });
  return error ? { error: error.message } : {};
}

/** Putihkan seluruh bulan (bentuk lama — dianggap hadir penuh). */
export async function putihkanBulan(
  anggotaId: string,
  month: string,
  alasan: string | null,
  dibuatOleh: string | null
): Promise<{ error?: string }> {
  return simpanSatu(anggotaId, month, null, alasan, dibuatOleh);
}

/** Putihkan tanggal-tanggal tertentu. Bulannya diturunkan dari tiap tanggal. */
export async function putihkanTanggal(
  anggotaId: string,
  tanggalList: string[],
  alasan: string | null,
  dibuatOleh: string | null
): Promise<{ error?: string }> {
  for (const tanggal of tanggalList) {
    const r = await simpanSatu(anggotaId, periodeMonthOf(tanggal), tanggal, alasan, dibuatOleh);
    if (r.error) return r;
  }
  return {};
}

/** Batalkan — barisnya tetap ada sebagai jejak, hanya ditandai. */
export async function batalkanPemutihan(
  id: string,
  oleh: string | null
): Promise<{ error?: string }> {
  const { error } = await supabaseAdmin
    .from('maahir_pemutihan')
    .update({ dibatalkan_pada: new Date().toISOString(), dibatalkan_oleh: oleh })
    .eq('id', id)
    .is('dibatalkan_pada', null);
  return error ? { error: error.message } : {};
}
