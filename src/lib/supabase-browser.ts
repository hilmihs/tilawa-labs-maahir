// Stub — aplikasi tidak lagi memakai Supabase di browser.
//
// Dulu client ini dipakai untuk mengunduh audio via signed URL Supabase. Kini
// audio diserve oleh route Next `/api/audio/...` (signed URL dibuat server-side
// di lib/storage.ts), sehingga browser cukup memakai URL biasa — tak perlu
// client DB apa pun. Fungsi dipertahankan agar import lama tak putus, tapi tak
// boleh dipanggil (tak ada konsumen tersisa).
export function createSupabaseBrowser(): never {
  throw new Error(
    'createSupabaseBrowser sudah tidak dipakai (migrasi ke PostgreSQL lokal). Audio via /api/audio.'
  );
}
