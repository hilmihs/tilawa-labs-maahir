-- Rentang keanggotaan kelas program + saklar aktif.
--
-- Kolom-kolom ini SUDAH ADA di produksi sejak lama — dipasang lewat DDL langsung
-- (/api/admin/db) tanpa berkas migrasi, jadi tak pernah sampai ke DB lokal
-- siapa pun. Akibatnya `getBlokPengajar` (matrix-blok-data.ts, .eq('active',
-- true)) dan seluruh `anggota-periode.ts` mati di lokal padahal jalan di prod.
-- Berkas ini menutup celah itu; sengaja idempoten supaya aman dijalankan ulang
-- di produksi (di sana jadi no-op).
--
-- Semantik lihat src/lib/anggota-periode.ts:
--   active=false   memotong seseorang dari SEMUA periode sekaligus (kasar).
--   mulai/selesai  batas waktu — pertemuan sebelum ia masuk dan sesudah ia
--                  keluar tak dihitung, bulan-bulan sebelumnya tetap utuh.

begin;

ALTER TABLE program_kelas_anggota
  ADD COLUMN IF NOT EXISTS mulai_tanggal   date,
  ADD COLUMN IF NOT EXISTS selesai_tanggal date,
  ADD COLUMN IF NOT EXISTS active          boolean NOT NULL DEFAULT true;

commit;
