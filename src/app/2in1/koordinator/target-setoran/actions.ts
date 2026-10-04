'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { simpanTarget, hapusTarget } from '@/lib/setoran-target';

export type TargetResult = { ok?: boolean; error?: string };

/**
 * Target setoran menilai peserta sekaligus mengukur kerajinan ketua kelas, jadi
 * yang dinilai tak boleh memasang sendiri ambangnya — hanya koordinator.
 */
async function requireKoordinator(): Promise<string | null> {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const ok = accesses.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran');
  if (!ok) throw new Error('Akses ditolak.');
  return s.session?.name ?? null;
}

function segarkan() {
  revalidatePath('/2in1/koordinator/target-setoran');
  revalidatePath('/2in1/laporan/maahir');
}

export async function simpanTargetAction(
  _prev: TargetResult | undefined,
  fd: FormData
): Promise<TargetResult> {
  let oleh: string | null = null;
  try {
    oleh = await requireKoordinator();
  } catch {
    return { error: 'Akses ditolak.' };
  }

  const programKelasId = String(fd.get('program_kelas_id') ?? '');
  const anggotaRaw = String(fd.get('anggota_id') ?? '').trim();
  const anggotaId = anggotaRaw || null;
  const berlakuMulai = String(fd.get('berlaku_mulai') ?? '');
  const catatan = String(fd.get('catatan') ?? '').trim() || null;
  // Koma dipakai sebagai pemisah desimal di Indonesia — terima keduanya
  // daripada menolak "37,5" yang mengetiknya paling wajar.
  const halamanPerBulan = Number(String(fd.get('halaman_per_bulan') ?? '').replace(',', '.'));

  if (!programKelasId) return { error: 'Kelas belum dipilih.' };

  const res = await simpanTarget({
    programKelasId,
    anggotaId,
    halamanPerBulan,
    berlakuMulai,
    catatan,
    dibuatOleh: oleh,
  });
  if (res.error) return { error: res.error };
  segarkan();
  return { ok: true };
}

export async function hapusTargetAction(
  _prev: TargetResult | undefined,
  fd: FormData
): Promise<TargetResult> {
  try {
    await requireKoordinator();
  } catch {
    return { error: 'Akses ditolak.' };
  }
  const res = await hapusTarget(String(fd.get('id') ?? ''));
  if (res.error) return { error: res.error };
  segarkan();
  return { ok: true };
}
