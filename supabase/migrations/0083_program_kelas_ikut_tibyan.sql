-- Kelas yang tidak ditagih sesi At-Tibyan Sabtu.
--
-- expectedDaysForKelas (src/lib/maahir-presensi.ts) menyisipkan satu sesi
-- at_tibyan tiap Sabtu untuk semua kelas ber-presensi_sifat 'harian'. Sejak
-- halaqah akhwat dipecah per hari (10 kelas, satu orang bisa di 5 kelas),
-- satu Sabtu tertagih 5x dan satu alpa terhitung 5x di SP. Kelas-kelas itu
-- diberi ikut_tibyan=false; At-Tibyan mereka dicatat lewat satu kelas gabungan
-- tanpa jadwal_hari. Default true = kelas lama tak berubah.
begin;

alter table program_kelas
  add column if not exists ikut_tibyan boolean not null default true;

comment on column program_kelas.ikut_tibyan is
  'Bila false, kelas ini tidak ditagih sesi At-Tibyan Sabtu (At-Tibyan-nya dicatat lewat kelas lain).';

commit;
