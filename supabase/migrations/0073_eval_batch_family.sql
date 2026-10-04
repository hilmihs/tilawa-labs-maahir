-- 0073_eval_batch_family.sql
-- Pisahkan "program" dari "batch" di mirror eval_batch.
--
-- eval_batch selama ini menyimpan satu baris per slug hilmihs, sehingga satu
-- program yang punya banyak angkatan ("HITS Reguler") tampak sebagai beberapa
-- program berbeda. Sumbernya sendiri sudah memisahkan keduanya lewat
-- SrcProgram.batch = { family, label, order }; tiga kolom ini memirrornya.
--
-- family sengaja TANPA foreign key ke eval_batch(id): nilainya bisa menunjuk
-- slug yang belum tersinkron pada urutan pull tertentu, dan sumber
-- memperlakukannya sebagai label pengelompokan, bukan referensi baris.
--
-- Program berangkatan tunggal (DPQ, RBI, HKM Presensi, ...) mengirim
-- batch: null → family = slug-nya sendiri, batch_label/batch_order null.
--
-- URUTAN RILIS. Terapkan DDL ini SEBELUM deploy kode, dan persempit jedanya.
-- Alasan memilih urutan itu, dan bahayanya:
--   * DDL dulu → family NOT NULL sudah berlaku sementara mapBatch lama masih
--     mengirim {id, nama, aktif} saja. Program BARU dari upstream karena itu
--     gagal disisipkan (NOT NULL violation) selama jeda. apply.ts menangkap
--     errornya, baris stage tetap belum diterapkan dan bisa diulang setelah
--     deploy — gagal dengan aman, dan program lama tak tersentuh karena
--     ON CONFLICT DO UPDATE hanya menyentuh kolom yang dikirim.
--   * Deploy dulu → dashboard menanyakan kolom yang belum ada, jadi 500 untuk
--     semua koordinator sampai DDL jalan. Jauh lebih buruk.
--
-- Statement di bawah BERURUTAN: backfill (23) harus mendahului SET NOT NULL
-- (25). Ke produksi berkas ini dipecah per-statement lewat /api/admin/db
-- (begin/commit dibuang, endpoint membungkus transaksinya sendiri), jadi
-- keduanya mendarat di transaksi terpisah — jangan dibalik atau dilewat.

begin;

alter table eval_batch add column if not exists family      text;
alter table eval_batch add column if not exists batch_label text;
alter table eval_batch add column if not exists batch_order smallint;

-- Backfill: sebelum sync pertama, tiap baris jadi family beranggota tunggal.
update eval_batch set family = id where family is null;

alter table eval_batch alter column family set not null;

-- Indeks ini bukan tindakan performa: eval_batch cuma berisi belasan baris dan
-- akan tetap di-seq-scan. Dipasang supaya niat pengelompokan terbaca dari skema.
create index if not exists idx_eval_batch_family on eval_batch(family);

comment on column eval_batch.family is
  'Slug program induk (hilmihs SrcProgram.batch.family). Program berangkatan tunggal → sama dengan id. Tanpa FK: bisa menunjuk slug yang belum tersinkron.';
comment on column eval_batch.batch_label is
  'Label angkatan, mis. "April 2026". null untuk program berangkatan tunggal.';
comment on column eval_batch.batch_order is
  'Urutan angkatan dalam family, menaik. null untuk program berangkatan tunggal.';

commit;
