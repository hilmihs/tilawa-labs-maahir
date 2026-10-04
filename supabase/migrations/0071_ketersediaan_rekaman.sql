-- 0071_ketersediaan_rekaman.sql
-- Form pendaftaran murid memuat kolom rekaman bacaan (tautan Google Drive) yang
-- dipakai memverifikasi pendaftar HITS Lanjutan sebelum ia boleh dialokasikan.
-- Pada data nyata 1 September 2026: 561 dari 1341 baris mengisinya.
--
-- Tautannya disimpan agar koordinator tidak perlu membuka sheet terpisah saat
-- memverifikasi. Mekanisme verifikasinya sendiri belum ditetapkan pemilik proses.

begin;

alter table ks_pendaftar
  add column if not exists rekaman_url text;

commit;
