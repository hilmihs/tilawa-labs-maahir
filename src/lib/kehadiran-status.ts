// Status kehadiran peserta + aturan "wajib beralasan" — SATU sumber kebenaran.
//
// Sengaja berkas mandiri tanpa dependensi (tak menyentuh supabase/next), supaya
// bisa diimpor server action, route handler, MAUPUN komponen klien. Jangan
// menaruh konstanta ini di berkas 'use server': modul Server Actions hanya boleh
// mengekspor async function, dan satu ekspor terlarang menggugurkan SELURUH
// modul saat dipanggil ("A 'use server' file can only export async functions").

export const VALID_STATUS = ['hadir', 'izin', 'terlambat', 'sakit', 'tidak_ada_keterangan'] as const;

export type StatusKehadiran = (typeof VALID_STATUS)[number];

/** Status tidak-hadir yang wajib disertai alasan (kolom Keterangan). */
export const BUTUH_ALASAN = ['izin', 'sakit', 'tidak_ada_keterangan'] as const;

/** True bila status ini tak boleh disimpan tanpa alasan. */
export function butuhAlasan(status: string): boolean {
  return (BUTUH_ALASAN as readonly string[]).includes(status);
}

/** True bila status dikenal sistem. Status asing → perlakukan sebagai alpa. */
export function isStatusValid(status: string): status is StatusKehadiran {
  return (VALID_STATUS as readonly string[]).includes(status);
}
