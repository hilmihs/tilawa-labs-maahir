-- 0074_eval_kurasi_lokal.sql
-- Kolom terkurasi lokal pada mirror hilmihs.
--
-- eval_halaqah & eval_peserta adalah MIRROR: tiap pull membandingkan kolom di
-- COMPARE (src/lib/hilmihs/sync.ts) dan menstage 'update' bila berbeda. Begitu
-- pengajar boleh membetulkan nama/level sendiri, ubahan itu selalu kalah pada
-- sync berikutnya — dan lebih buruk, apply mengupsert seluruh baris `after`
-- sehingga kolom yang tak ikut berubah pun tertimpa.
--
-- `kurasi` mencatat nama kolom yang sudah disunting lokal untuk baris itu.
-- Kolom yang terdaftar: (1) tidak lagi memicu diff 'update', dan (2) dibuang
-- dari payload upsert saat apply. Sumber hulu tetap jalan untuk kolom lain.
--
-- 'aktif' pada eval_peserta juga dipakai: menghapus peserta dari data pusat
-- adalah soft-delete (aktif=false), dan tanpa penanda ini upsert apply
-- menghidupkannya lagi (mapPeserta selalu mengirim aktif=true).

begin;

alter table eval_halaqah add column if not exists kurasi text[] not null default '{}';
alter table eval_peserta add column if not exists kurasi text[] not null default '{}';

commit;
