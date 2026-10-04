'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, findKetuaWakilKelas } from '@/lib/program-kelas';
import { revalidatePath } from 'next/cache';

export type MarkLiburResult = { ok?: boolean; error?: string };

/**
 * Ketua/wakil kelas Maahir menandai pertemuan LIBUR langsung dari presensi
 * (tanpa ACC koordinator). Menulis program_kelas_libur → resolver otomatis
 * skip tanggal itu → seluruh presensi kelas hari itu jadi libur (cascade).
 *
 * Harian: 1 tanggal. Mingguan: seluruh pekan (Senin kanonik .. +6 hari) supaya
 * benar-benar di-skip (resolver skip pekan hanya bila semua harinya libur).
 */
export async function markLibur(
  programKelasId: string,
  tanggal: string,
  mingguan: boolean
): Promise<MarkLiburResult> {
  const wa = await getSessionWa();
  if (!wa) return { error: 'Sesi tidak dikenali. Silakan login ulang.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { error: 'Tanggal tidak valid.' };

  const myKelas = await findKetuaWakilKelas(wa);
  const kelas = myKelas.find((k) => k.id === programKelasId);
  if (!kelas) return { error: 'Anda bukan ketua/wakil kelas ini.' };

  let mulai = tanggal;
  let selesai = tanggal;
  if (mingguan) {
    const d = new Date(tanggal + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 6);
    selesai = d.toISOString().slice(0, 10);
  }

  // Idempotent: sudah ada libur yang meliputi tanggal ini?
  const { data: existing } = await supabaseAdmin
    .from('program_kelas_libur')
    .select('id')
    .eq('program_kelas_id', programKelasId)
    .lte('tanggal_mulai', tanggal)
    .gte('tanggal_selesai', tanggal)
    .limit(1)
    .maybeSingle();
  if (existing) {
    revalidatePath('/2in1/ketua-kelas/presensi');
    return { ok: true };
  }

  const { error } = await supabaseAdmin.from('program_kelas_libur').insert({
    program_kelas_id: programKelasId,
    tanggal_mulai: mulai,
    tanggal_selesai: selesai,
    keterangan: 'Libur (ditandai ketua/wakil dari presensi)',
    created_by_id: null,
  });
  if (error) return { error: `Gagal menandai libur: ${error.message}` };

  revalidatePath('/2in1/ketua-kelas/presensi');
  revalidatePath('/2in1/koordinator/kehadiran');
  return { ok: true };
}
