-- 0072_ketersediaan_pertemuan.sql
-- Ketersediaan Mengajar HITS — pembuatan pertemuan di CMS tilawah.
--
-- Halaqah yang dikirim tanpa pertemuan tidak dapat dipakai: presensi di CMS
-- tergantung pada baris pertemuan. Pembacaan produksi 1 Sep 2026 menunjukkan
-- tiap halaqah HITS Reguler punya 22 pertemuan bernama P1..P22, berjadwal pada
-- hari slotnya selama 11 pekan, dengan jam yang sama seperti sesi halaqah.
--
-- Polanya sepenuhnya dapat diturunkan dari tanggal mulai + hari slot + jumlah,
-- jadi tidak dibutuhkan sumber kalender akademik terpisah. Jumlahnya disetel
-- per periode karena bisa berbeda antar program.

begin;

alter table ks_periode
  add column if not exists jumlah_pertemuan integer not null default 22
    check (jumlah_pertemuan between 0 and 200);

comment on column ks_periode.jumlah_pertemuan is
  'Banyak pertemuan yang dibuat di CMS tilawah per halaqah. 0 = tidak membuat pertemuan.';

-- Langkah baru di outbox. Diletakkan setelah pembuatan halaqah dan sebelum
-- enrolmen, supaya kelasnya sudah utuh sebelum murid mendarat di dalamnya.
alter table ks_outbox drop constraint if exists ks_outbox_aksi_check;
alter table ks_outbox add constraint ks_outbox_aksi_check
  check (aksi in ('buat_halaqah', 'buat_pertemuan', 'cari_user', 'buat_user', 'enrol'));

commit;
