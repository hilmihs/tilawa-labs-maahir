// Peserta Takhassus yang dipresensi lewat kelas halaqah (Takhassus akhwat,
// mulai 28 Sep 2026). Kelas Takhassus-nya ber-`presensi_via_halaqah_mulai`;
// sejak tanggal itu ketua kelas halaqah tempat peserta hadir yang mengisi
// kehadiran DAN setoran hariannya. Pencocokan lewat WA, karena baris anggota di
// kelas halaqah dan di kelas Takhassus adalah baris yang berbeda.
// Spec: docs/superpowers/specs/2026-09-23-takhassus-akhwat-via-halaqah-design.md

import { supabaseAdmin } from '@/lib/supabase-admin';

export type TakhassusVia = {
  wa: string;
  /** Kelas Takhassus asal (sumber target & baris laporan). */
  kelasId: string;
  /** Baris anggota di kelas Takhassus. */
  anggotaId: string;
  /** presensi_via_halaqah_mulai kelas Takhassus-nya. */
  mulai: string;
};

/** WA → keanggotaan Takhassus-via-halaqah. Hanya anggota aktif. */
export async function getTakhassusVia(): Promise<Map<string, TakhassusVia>> {
  const { data: kelas } = await supabaseAdmin
    .from('program_kelas')
    .select('id, presensi_via_halaqah_mulai')
    .not('presensi_via_halaqah_mulai', 'is', null);
  const mulaiByKelas = new Map(
    ((kelas ?? []) as Array<{ id: string; presensi_via_halaqah_mulai: string }>).map((k) => [
      k.id,
      k.presensi_via_halaqah_mulai,
    ])
  );
  const out = new Map<string, TakhassusVia>();
  if (mulaiByKelas.size === 0) return out;

  const { data: anggota } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, whatsapp_number')
    .in('program_kelas_id', [...mulaiByKelas.keys()])
    .eq('active', true);
  for (const a of (anggota ?? []) as Array<{
    id: string;
    program_kelas_id: string;
    whatsapp_number: string | null;
  }>) {
    if (!a.whatsapp_number) continue;
    out.set(a.whatsapp_number, {
      wa: a.whatsapp_number,
      kelasId: a.program_kelas_id,
      anggotaId: a.id,
      mulai: mulaiByKelas.get(a.program_kelas_id)!,
    });
  }
  return out;
}

/**
 * Baris anggota (di kelas lain, bukan Takhassus-nya) ini menyetor lewat
 * halaqah pada tanggal tsb?
 */
export function setorViaHalaqah(
  via: Map<string, TakhassusVia>,
  anggota: { program_kelas_id: string; whatsapp_number: string | null },
  tanggal: string
): boolean {
  if (!anggota.whatsapp_number) return false;
  const t = via.get(anggota.whatsapp_number);
  return !!t && t.kelasId !== anggota.program_kelas_id && tanggal >= t.mulai;
}

/** Ada peserta Takhassus-via-halaqah yang aktif di salah satu kelas ini? */
export async function adaTakhassusVia(kelasIds: string[]): Promise<boolean> {
  if (kelasIds.length === 0) return false;
  const via = await getTakhassusVia();
  if (via.size === 0) return false;
  const { data } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, whatsapp_number')
    .in('program_kelas_id', kelasIds)
    .in('whatsapp_number', [...via.keys()])
    .eq('active', true);
  return ((data ?? []) as Array<{ program_kelas_id: string; whatsapp_number: string }>).some(
    (a) => via.get(a.whatsapp_number)?.kelasId !== a.program_kelas_id
  );
}
