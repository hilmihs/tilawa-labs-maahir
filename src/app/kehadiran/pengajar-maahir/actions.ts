'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getPengajarMaahirSesi } from '@/lib/maahir-checkin-pengajar-akses';
import { simpanCheckinPengajar } from '@/lib/maahir-checkin-pengajar';
import type { StatusCheckinMaahir } from '@/types/db';

export type CheckinMaahirResult = { ok?: boolean; error?: string; key?: string } | undefined;

/**
 * Check-in / sunting satu sesi kelas Maahir milik pengajar yang sedang login.
 * Identitas pengajar diturunkan dari WA sesi (bukan dari form) — form hanya
 * mengirim kelas, tanggal, status, materi, catatan.
 */
export async function submitCheckinMaahir(
  _prev: CheckinMaahirResult,
  formData: FormData
): Promise<CheckinMaahirResult> {
  const akses = await getPengajarMaahirSesi();
  if (!akses) return { error: 'Anda tidak terdaftar sebagai pengajar kelas Maahir.' };
  const s = await getSession();
  const actor = s.session ?? s.accesses?.[0];
  if (!actor) return { error: 'Sesi tidak ditemukan — silakan login ulang.' };

  const kelasId = String(formData.get('kelas_id') ?? '');
  const tanggal = String(formData.get('tanggal') ?? '');
  const status = String(formData.get('status') ?? '') as StatusCheckinMaahir;
  const materi = String(formData.get('materi') ?? '');
  const catatan = String(formData.get('catatan') ?? '');
  const key = `${kelasId}|${tanggal}`;

  const hasil = await simpanCheckinPengajar(akses, { kelasId, tanggal, status, materi, catatan }, actor);
  if (!hasil.ok) return { error: hasil.error, key };

  revalidatePath('/kehadiran/pengajar-maahir');
  revalidatePath('/kehadiran/pengajar-maahir/rekap');
  revalidatePath('/2in1/koordinator/kehadiran/pengajar');
  return { ok: true, key };
}
