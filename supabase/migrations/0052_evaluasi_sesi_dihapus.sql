-- 0052_evaluasi_sesi_dihapus.sql
-- Soft-delete sesi ujian akhir: pengajar boleh hapus salah satu sesi ujian
-- (mis. halaqah level lanjutan hanya perlu 1 ujian). Reversible; nilai lama
-- tetap tersimpan, cuma disembunyikan dari picker & progres.

begin;

alter table evaluasi_sesi
  add column if not exists dihapus boolean not null default false;

commit;
