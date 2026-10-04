import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsMode, KsPeriode, KsSlot } from '@/types/db';
import { lokasiBaku, uraikanSlot } from '@/lib/ketersediaan-slot';

/**
 * Periode penarikan ketersediaan + master slotnya.
 *
 * Periode sengaja lepas dari batch HITS: satu periode dapat melahirkan halaqah
 * di beberapa batch sekaligus, sejalan dengan prinsip "slot, bukan tanggal" di
 * dokumen konsep. Delapan batch berjalan bersamaan, jadi mengikat periode ke
 * satu batch justru mengulang masalah yang hendak dibuang.
 */

/** Periode aktif terbaru. null bila belum ada yang dibuat. */
export async function getPeriodeAktif(): Promise<KsPeriode | null> {
  const { data } = await supabaseAdmin
    .from('ks_periode')
    .select('*')
    .eq('aktif', true)
    .order('mulai', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as KsPeriode | null) ?? null;
}

/**
 * Periode aktif yang formnya sedang terbuka, mulai paling awal lebih dulu.
 * Dipakai halaman pengajar: tahap yang lebih dekat KBM-nya didahulukan.
 */
export async function periodeTerbukaUntukPengajar(sekarang: Date): Promise<KsPeriode[]> {
  const { data } = await supabaseAdmin
    .from('ks_periode')
    .select('*')
    .eq('aktif', true)
    .order('mulai', { ascending: true });
  return ((data ?? []) as KsPeriode[]).filter((p) => formTerbuka(p, sekarang));
}

export async function getPeriode(id: string): Promise<KsPeriode | null> {
  const { data } = await supabaseAdmin.from('ks_periode').select('*').eq('id', id).maybeSingle();
  return (data as KsPeriode | null) ?? null;
}

export async function listPeriode(): Promise<KsPeriode[]> {
  const { data } = await supabaseAdmin
    .from('ks_periode')
    .select('*')
    .order('mulai', { ascending: false });
  return (data ?? []) as KsPeriode[];
}

/**
 * Apakah form ketersediaan sedang menerima isian.
 * `form_tutup` null berarti tidak pernah ditutup — itu bentuk bergulir yang
 * dipilih, bukan kelalaian data.
 */
export function formTerbuka(p: KsPeriode, sekarang: Date): boolean {
  if (!p.aktif) return false;
  const t = sekarang.getTime();
  if (p.form_buka && new Date(p.form_buka).getTime() > t) return false;
  if (p.form_tutup && new Date(p.form_tutup).getTime() < t) return false;
  return true;
}

export async function listSlot(periodeId: string, opts?: { hanyaAktif?: boolean }): Promise<KsSlot[]> {
  let q = supabaseAdmin.from('ks_slot').select('*').eq('periode_id', periodeId);
  if (opts?.hanyaAktif) q = q.eq('aktif', true);
  const { data } = await q.order('urutan', { ascending: true });
  return (data ?? []) as KsSlot[];
}

// ── Master slot bawaan ─────────────────────────────────────────────────────

export interface SlotBawaan {
  kelompok: Gender;
  mode: KsMode;
  teks: string;
  lokasi?: string;
}

/**
 * Salinan sheet MASTER_SLOT dari Template_Ketersediaan_Mengajar_HITS.xlsx,
 * dipakai sebagai isi awal saat koordinator membuat periode baru. Bukan
 * kebenaran mutlak: setelah periode dibuat, master di basis data yang berlaku
 * dan koordinator boleh menambah/menonaktifkan.
 *
 * Catatan dokumen konsep: daftar slot offline disalin dari berkas Juni 2026 dan
 * belum diverifikasi ke koordinator lokasi — karena itu lokasinya sengaja
 * dikosongkan agar dipaksa diisi manusia sebelum dipakai.
 */
export const SLOT_BAWAAN: SlotBawaan[] = [
  { kelompok: 'ikhwan', mode: 'online', teks: 'Sabtu & Ahad 06:00 - 07:30 WIB' },
  { kelompok: 'ikhwan', mode: 'online', teks: 'Sabtu & Ahad 13:00 - 14:30 WIB' },
  { kelompok: 'ikhwan', mode: 'online', teks: 'Selasa & Kamis 06:00 - 07:30 WIB' },
  { kelompok: 'ikhwan', mode: 'online', teks: 'Selasa & Kamis 20:00 - 21:30 WIB' },
  { kelompok: 'ikhwan', mode: 'online', teks: 'Senin & Rabu 06:00 - 07:30 WIB' },
  { kelompok: 'ikhwan', mode: 'online', teks: 'Senin & Rabu 20:00 - 21:30 WIB' },

  { kelompok: 'akhwat', mode: 'online', teks: 'Sabtu & Ahad 06:00 - 07:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Sabtu & Ahad 11:00 - 12:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Sabtu & Ahad 13:00 - 14:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Senin & Rabu 06:00 - 07:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Senin & Rabu 08:00 - 09:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Senin & Rabu 10:00 - 11:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Senin & Rabu 16:00 - 17:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Senin & Rabu 20:00 - 21:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Selasa & Kamis 06:00 - 07:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Selasa & Kamis 08:00 - 09:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Selasa & Kamis 10:00 - 11:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Selasa & Kamis 16:00 - 17:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: 'Selasa & Kamis 20:00 - 21:30 WIB' },
  { kelompok: 'akhwat', mode: 'online', teks: "Selasa & Jum'at 06:00 - 07:30 WIB" },
  { kelompok: 'akhwat', mode: 'online', teks: "Selasa & Jum'at 08:00 - 09:30 WIB" },
  { kelompok: 'akhwat', mode: 'online', teks: "Selasa & Jum'at 10:00 - 11:30 WIB" },
  { kelompok: 'akhwat', mode: 'online', teks: "Selasa & Jum'at 16:00 - 17:30 WIB" },

  { kelompok: 'ikhwan', mode: 'offline', teks: 'Senin & Rabu 20:10 - 21:40 WIB' },
  { kelompok: 'ikhwan', mode: 'offline', teks: 'Selasa & Kamis 20:10 - 21:40 WIB' },
  { kelompok: 'ikhwan', mode: 'offline', teks: "Selasa & Jum'at 18:30 - 20:00 WIB" },
  { kelompok: 'akhwat', mode: 'offline', teks: 'Senin & Rabu 16:30 - 18:00 WIB' },
];

export interface BarisSlotBaru {
  periode_id: string;
  kelompok: Gender;
  mode: KsMode;
  label: string;
  hari: string[];
  hari_idx: number[];
  waktu_mulai: string;
  waktu_selesai: string;
  lokasi: string | null;
  urutan: number;
}

/**
 * Ubah daftar teks slot menjadi baris siap sisip. Teks yang tidak dapat diurai
 * dikembalikan terpisah supaya pemanggil menampilkannya, bukan membuangnya diam-diam.
 */
export function siapkanSlot(
  periodeId: string,
  bawaan: readonly SlotBawaan[],
  opts?: { lokasiWajibDefault?: string }
): { baris: BarisSlotBaru[]; gagal: string[] } {
  const baris: BarisSlotBaru[] = [];
  const gagal: string[] = [];
  bawaan.forEach((s, i) => {
    const urai = uraikanSlot(s.teks);
    if (!urai) {
      gagal.push(s.teks);
      return;
    }
    baris.push({
      periode_id: periodeId,
      kelompok: s.kelompok,
      mode: s.mode,
      label: urai.label,
      hari: urai.hari,
      hari_idx: urai.hari_idx,
      waktu_mulai: urai.waktu_mulai,
      waktu_selesai: urai.waktu_selesai,
      // Batasan basis data: mode offline wajib berlokasi. Dokumen konsep mencatat
      // daftar offline belum diverifikasi ke koordinator lokasi, jadi diberi
      // penanda yang jelas-jelas menuntut diisi, bukan lokasi karangan.
      lokasi: s.mode === 'offline' ? lokasiBaku(s.lokasi ?? opts?.lokasiWajibDefault) : null,
      urutan: i,
    });
  });
  return { baris, gagal };
}
