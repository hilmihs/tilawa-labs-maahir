-- =====================================================================
-- Koreksi data: TAL + latihan_diberikan = true  ->  PTML
-- =====================================================================
-- Form ketua kelas dulu menampilkan radio TAL ("Tidak Ada Latihan") di
-- bawah toggle "Latihan mandiri diberikan? Ya" — kombinasi yang secara
-- makna mustahil. Banyak ketua kelas memilih TAL padahal maksudnya PTML
-- (tugas sudah diberikan, pesertanya yang belum mengerjakan).
--
-- Dampaknya: pertemuan itu dihitung GAGAL di skor Tanggung Jawab &
-- Keadilan pengajar, padahal bukan kelalaian pengajar.
--
-- Perbaikan menyeluruh:
--   * matrix-compute.ts / hits-rekap.ts: PTML tidak dinilai (keluar dari
--     penyebut), bukan dihitung gagal.
--   * HitsKetuaForm.tsx: radio TAL dihapus (tersisa SML & PTML).
--   * hits/ketua/actions.ts: guard server menormalkan TAL -> PTML bila
--     latihan_diberikan = true.
--   * migration ini: bereskan 560 baris historis (Jan-Jul 2026).
--
-- Baris TAL + latihan_diberikan = false TIDAK disentuh — itu konsisten
-- (pengajar memang tidak memberi latihan) dan tetap dihitung gagal.
-- semua_selesai sudah false di seluruh baris terdampak, jadi tak perlu
-- ikut diubah.
-- =====================================================================

update hits_keterangan_harian
   set status_latihan = 'PTML'
 where status_latihan = 'TAL'
   and latihan_diberikan is true;
