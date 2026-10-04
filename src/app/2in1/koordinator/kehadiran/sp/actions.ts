'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { batalkanPemutihan, putihkanTanggal } from '@/lib/maahir-pemutihan';

export type SPActionResult = { ok?: boolean; error?: string };

/** Pemutihan adalah wewenang koordinator kehadiran — sama dgn halaman Pemutihan. */
async function requireKoordinator(): Promise<string | null> {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const ok = accesses.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran');
  if (!ok) throw new Error('Akses ditolak.');
  return s.session?.name ?? null;
}

function segarkan(anggotaId: string) {
  revalidatePath(`/2in1/koordinator/kehadiran/sp/${anggotaId}`);
  revalidatePath('/2in1/koordinator/kehadiran/sp');
  revalidatePath('/2in1/koordinator/kehadiran/pemutihan');
  revalidatePath('/2in1/laporan/maahir');
}

/**
 * Putihkan sesi-sesi terpilih. Tiap centang dikirim sebagai `sesi` bernilai
 * "<anggotaId>|<tanggal>" — anggotaId ikut karena satu orang bisa punya baris
 * keanggotaan di beberapa kelas dan pemutihan menempel pada barisnya.
 */
export async function putihkanSesi(
  _prev: SPActionResult | undefined,
  fd: FormData
): Promise<SPActionResult> {
  let oleh: string | null = null;
  try {
    oleh = await requireKoordinator();
  } catch {
    return { error: 'Akses ditolak.' };
  }

  const kembaliKe = String(fd.get('kembali_ke') ?? '');
  const alasan = String(fd.get('alasan') ?? '').trim() || null;
  const dipilih = fd.getAll('sesi').map(String).filter(Boolean);
  if (dipilih.length === 0) return { error: 'Belum ada tanggal yang dicentang.' };

  // Kelompokkan per baris keanggotaan supaya satu orang lintas-kelas tetap benar.
  const perAnggota = new Map<string, string[]>();
  for (const nilai of dipilih) {
    const [anggotaId, tanggal] = nilai.split('|');
    if (!anggotaId || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal ?? '')) {
      return { error: 'Data tanggal tidak sah.' };
    }
    const arr = perAnggota.get(anggotaId) ?? [];
    arr.push(tanggal);
    perAnggota.set(anggotaId, arr);
  }

  for (const [anggotaId, tanggalList] of perAnggota) {
    const res = await putihkanTanggal(anggotaId, tanggalList, alasan, oleh);
    if (res.error) return { error: res.error };
  }

  if (kembaliKe) segarkan(kembaliKe);
  return { ok: true };
}

/** Batalkan satu pemutihan — barisnya tetap tersimpan sebagai jejak. */
export async function batalkanSatu(
  _prev: SPActionResult | undefined,
  fd: FormData
): Promise<SPActionResult> {
  let oleh: string | null = null;
  try {
    oleh = await requireKoordinator();
  } catch {
    return { error: 'Akses ditolak.' };
  }
  const id = String(fd.get('id') ?? '');
  const kembaliKe = String(fd.get('kembali_ke') ?? '');
  if (!id) return { error: 'Data tidak ditemukan.' };
  const res = await batalkanPemutihan(id, oleh);
  if (res.error) return { error: res.error };
  if (kembaliKe) segarkan(kembaliKe);
  return { ok: true };
}
