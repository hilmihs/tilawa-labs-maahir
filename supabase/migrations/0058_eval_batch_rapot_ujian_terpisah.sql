-- 0058_eval_batch_rapot_ujian_terpisah.sql
-- Batch tertentu (HITS Januari 2026) memakai skema penilaian berbeda:
--   * nilai akhir MURNI dari skor ujian akhir — evaluasi berkala tidak dihitung
--   * Ujian QN dan Ujian PB berdiri sendiri: rapot QN tidak menyebut PB, dan
--     sebaliknya. Jadi satu peserta bisa punya DUA rapot ujian yang sama-sama
--     aktif, bukan satu rapot gabungan.
--
-- Lever-nya kolom kurasi di `eval_batch`. Aman terhadap sinkron hilmihs: apply
-- sync meng-upsert hanya kolom yang dikirim API (id/nama/aktif), dan
-- `ON CONFLICT DO UPDATE SET` di pg-shim hanya menyentuh kolom itu — kolom ini
-- tidak ikut ditimpa.

begin;

alter table eval_batch
  add column if not exists rapot_ujian_terpisah boolean not null default false;

comment on column eval_batch.rapot_ujian_terpisah is
  'true = nilai akhir murni skor ujian (tanpa bobot berkala) dan rapot Ujian QN/PB diterbitkan terpisah.';

update eval_batch
   set rapot_ujian_terpisah = true
 where id in ('hits-regular-jan', 'hits-safar-jan');

-- Dua jenis rapot ujian baru. Indeks unik 0054 (peserta, halaqah, jenis_rapot)
-- where status='aktif' otomatis memperlakukan keduanya sebagai dokumen berbeda,
-- jadi menerbitkan rapot PB tidak menggantikan rapot QN.
alter table evaluasi_rapot
  drop constraint if exists evaluasi_rapot_jenis_rapot_check;

alter table evaluasi_rapot
  add constraint evaluasi_rapot_jenis_rapot_check
  check (jenis_rapot in ('berkala', 'ujian', 'ujian_qn', 'ujian_pb'));

commit;
