// WA Technical Support. Dipakai untuk:
// - tujuan tombol "Lapor Error" (ReportErrorButton)
// - tujuan pesan request reset password
export const ADMIN_WA = '6289900000099';

// Daftar WA superadmin (akses /admin/*: user management, log aktivitas,
// reset password). ADMIN_WA selalu termasuk. Tambah nomor untuk memberi
// hak superadmin.
export const SUPERADMIN_WAS: string[] = [
  ADMIN_WA,
  // The production list names real people. On the demo build the superadmin is
  // the seeded coordinator and nobody else.
  '6289900000001',
];
