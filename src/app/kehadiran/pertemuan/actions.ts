'use server';

import { revalidatePath } from 'next/cache';
import { getIdentitasPertemuan } from '@/lib/rekap-pertemuan-akses';
import { mintaSinkronManual } from '@/lib/rekap-pertemuan-snapshot';
import { hariIniWib, periodeValid } from '@/lib/rekap-pertemuan';

/**
 * Tombol "Perbarui" di Rekap Pertemuan — tarik ulang data Dashboard Edu untuk
 * satu periode. Server action = endpoint POST publik, jadi hak akses dicek
 * ulang di sini (penjaga halaman saja tak cukup). Tidak me-redirect: cukup
 * kembalikan pesan untuk ditampilkan tombol.
 *
 * Jeda global & batas per orang diurus `mintaSinkronManual`.
 */
export async function perbaruiPertemuan(month: string): Promise<{ ok: boolean; pesan: string }> {
  const id = await getIdentitasPertemuan();
  if (!id?.bolehLihat) return { ok: false, pesan: 'Tidak berhak.' };

  // Pelaku hanya kunci pembatas laju di memori — tak pernah ditampilkan/dicatat.
  const pelaku = id.pengajarId ? `pj:${id.pengajarId}` : `wa:${id.wa ?? ''}`;
  try {
    const hasil = await mintaSinkronManual(periodeValid(month, hariIniWib()), pelaku);
    revalidatePath('/kehadiran/pertemuan');
    return { ok: hasil.ok, pesan: hasil.pesan };
  } catch (e) {
    console.error('[rekap-pertemuan] perbarui gagal:', e instanceof Error ? e.message : 'galat');
    return { ok: false, pesan: 'Gagal memperbarui. Coba lagi beberapa saat lagi.' };
  }
}
