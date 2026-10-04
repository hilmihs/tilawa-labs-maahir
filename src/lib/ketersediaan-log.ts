import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Sheet LOG_PERUBAHAN dari template lama, dipindahkan ke basis data.
 *
 * Aturan dokumen konsep: setelah data dirilis, tidak ada perubahan diam-diam —
 * setiap perubahan melewati satu kanal dan tercatat. Karena itu pencatatan di
 * sini sengaja TIDAK melempar galat: kegagalan menulis jejak tidak boleh
 * membatalkan perbuatan yang sudah sah, tetapi juga tidak boleh menghentikan
 * alur pemakai. Yang gagal dicatat muncul di log server.
 */
export async function catatKs(entri: {
  periode_id?: string | null;
  entitas: string;
  entitas_id?: string | null;
  aksi: string;
  sebelum?: unknown;
  sesudah?: unknown;
  alasan?: string | null;
  aktor_wa?: string | null;
  aktor_nama?: string | null;
}): Promise<void> {
  try {
    // Shim mengembalikan `{ error }`, bukan melempar — galat seperti itu dulu
    // tertelan tanpa jejak sama sekali.
    const { error } = await supabaseAdmin.from('ks_log').insert({
      periode_id: entri.periode_id ?? null,
      entitas: entri.entitas,
      entitas_id: entri.entitas_id ?? null,
      aksi: entri.aksi,
      sebelum: entri.sebelum ?? null,
      sesudah: entri.sesudah ?? null,
      alasan: entri.alasan ?? null,
      aktor_wa: entri.aktor_wa ?? null,
      aktor_nama: entri.aktor_nama ?? null,
    });
    if (error) console.error('[ks_log] gagal mencatat', entri.entitas, entri.aksi, error.message ?? error);
  } catch (e) {
    console.error('[ks_log] gagal mencatat', entri.entitas, entri.aksi, e);
  }
}
