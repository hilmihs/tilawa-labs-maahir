// Badal pada izin Shakwa — siapa boleh menggantikan pengajar yang izin.
//
// Satu aturan untuk dua pintu tulis: formulir izin pengajar (kirimShakwa) dan
// koreksi koordinator (ubahBadalIzin). Keduanya server action = POST publik,
// jadi dropdown di UI bukan penjaga; cekBadal-lah yang menolak id asing,
// pengajar nonaktif, dan badal lintas gender.

import { supabaseAdmin } from './supabase-admin';
import type { Gender } from '@/types/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CalonBadal = { id: string; name: string; gender: Gender; active: boolean };

/**
 * null = boleh jadi badal; string = alasan ditolak, tanpa awalan baris
 * (pemanggil menambahkan "Rincian ke-N:" bila perlu).
 */
export function cekBadal(
  calon: CalonBadal | null,
  pemilik: { id: string; gender: Gender }
): string | null {
  if (!calon) return 'pengajar badal tidak ditemukan.';
  if (!calon.active) return 'pengajar badal sudah tidak aktif.';
  if (calon.gender !== pemilik.gender) return `pengajar badal harus sesama ${pemilik.gender}.`;
  if (calon.id === pemilik.id) return 'tidak bisa membadalkan diri sendiri.';
  return null;
}

/** Pilihan dropdown: pengajar aktif segender, urut nama, tanpa `kecualiId`. */
export async function daftarCalonBadal(
  gender: Gender,
  kecualiId?: string
): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabaseAdmin
    .from('pengajar')
    .select('id, name')
    .eq('gender', gender)
    .eq('active', true)
    .order('name');
  if (error) {
    console.error('daftarCalonBadal: gagal query', error);
    return [];
  }
  return ((data ?? []) as Array<{ id: string; name: string }>).filter((p) => p.id !== kecualiId);
}

/** Baris pengajar untuk divalidasi cekBadal (+ nomor WA untuk link kabar). */
export async function ambilCalonBadal(
  ids: string[]
): Promise<Map<string, CalonBadal & { whatsapp_number: string }>> {
  // Id bukan UUID dibuang dulu: Postgres menolak seluruh query bila satu saja
  // salah format, padahal yang benar cukup dijawab "tidak ditemukan".
  const unik = [...new Set(ids.filter((id) => UUID_RE.test(id)))];
  if (!unik.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, active, whatsapp_number')
    .in('id', unik);
  if (error) {
    console.error('ambilCalonBadal: gagal query', error);
    return new Map();
  }
  return new Map(
    ((data ?? []) as Array<CalonBadal & { whatsapp_number: string }>).map((p) => [p.id, p])
  );
}
