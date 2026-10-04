'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWa, findKetuaWakilKelas, isTakhassusKelas } from '@/lib/program-kelas';
import { berlakuPeriodeBerjalan, simpanTarget } from '@/lib/setoran-target';

export type TargetKetuaResult = { ok?: boolean; error?: string; anggotaId?: string };

/**
 * Ketua/wakil kelas Takhassus Akhwat menetapkan target hafalan bulanan
 * pesertanya.
 *
 * Kelas Akhwat bukan presensi-mandiri, jadi pesertanya tak punya jalur untuk
 * memasang sendiri — ketuanya yang memasang, termasuk untuk dirinya sendiri.
 * Sama seperti jalur peserta ikhwan, tanggal berlaku dikunci ke awal periode
 * berjalan supaya bulan yang sudah dilaporkan tak bisa dinilai ulang. Hanya
 * koordinator yang boleh memundurkannya.
 */
export async function simpanTargetPeserta(
  _prev: TargetKetuaResult | undefined,
  fd: FormData
): Promise<TargetKetuaResult> {
  const wa = await getSessionWa();
  if (!wa) return { error: 'Login diperlukan.' };

  const kelasSaya = (await findKetuaWakilKelas(wa)).filter((k) => isTakhassusKelas(k.name));
  const programKelasId = String(fd.get('program_kelas_id') ?? '');
  const kelas = kelasSaya.find((k) => k.id === programKelasId);
  if (!kelas) return { error: 'Anda bukan ketua/wakil kelas Takhassus itu.' };

  const anggotaId = String(fd.get('anggota_id') ?? '');
  if (!anggotaId) return { error: 'Peserta belum dipilih.' };

  const halamanPerBulan = Number(String(fd.get('halaman_per_bulan') ?? '').replace(',', '.'));
  // simpanTarget yang memastikan anggota itu benar-benar milik kelas tsb, jadi
  // ketua kelas lain tak bisa menyetel target peserta orang.
  const res = await simpanTarget({
    programKelasId,
    anggotaId,
    halamanPerBulan,
    berlakuMulai: berlakuPeriodeBerjalan(),
    catatan: null,
    dibuatOleh: `Ketua ${kelas.name}`,
  });
  if (res.error) return { error: res.error, anggotaId };

  revalidatePath('/2in1/ketua-kelas/setoran');
  revalidatePath('/2in1/koordinator/target-setoran');
  revalidatePath('/2in1/laporan/maahir');
  return { ok: true, anggotaId };
}
