'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { buatBatch, batalkanBatch } from '@/lib/maahir-pemutihan-batch';

export type MassalResult = {
  ok?: boolean;
  error?: string;
  dibuat?: number;
  dilewati?: number;
};

/** Pemutihan adalah wewenang koordinator kehadiran — sama dengan action per-orang. */
async function requireKoordinator(): Promise<string | null> {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const ok = accesses.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran');
  if (!ok) throw new Error('Akses ditolak.');
  return s.session?.name ?? null;
}

/** Halaman mana saja yang angkanya ikut berubah begitu pemutihan tersimpan. */
function segarkan() {
  revalidatePath('/2in1/koordinator/kehadiran/pemutihan/massal');
  revalidatePath('/2in1/koordinator/kehadiran/pemutihan');
  revalidatePath('/2in1/koordinator/kehadiran/sp');
  revalidatePath('/2in1/koordinator/kehadiran');
  revalidatePath('/2in1/laporan/maahir');
}

export async function putihkanMassal(
  _prev: MassalResult | undefined,
  fd: FormData
): Promise<MassalResult> {
  let oleh: string | null = null;
  try {
    oleh = await requireKoordinator();
  } catch {
    return { error: 'Akses ditolak.' };
  }

  const month = String(fd.get('month') ?? '');
  const alasan = String(fd.get('alasan') ?? '').trim() || null;
  const kelasIds = String(fd.get('kelas_ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const res = await buatBatch({ month, kelasIds, alasan, oleh });
  if (res.error) return { error: res.error, dibuat: res.dibuat, dilewati: res.dilewati };
  segarkan();
  return { ok: true, dibuat: res.dibuat, dilewati: res.dilewati };
}

export async function batalkanBatchAction(
  _prev: MassalResult | undefined,
  fd: FormData
): Promise<MassalResult> {
  let oleh: string | null = null;
  try {
    oleh = await requireKoordinator();
  } catch {
    return { error: 'Akses ditolak.' };
  }
  const id = String(fd.get('batch_id') ?? '');
  if (!id) return { error: 'Batch tidak ditemukan.' };
  const res = await batalkanBatch(id, oleh);
  if (res.error) return { error: res.error };
  segarkan();
  return { ok: true };
}
