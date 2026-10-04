-- Kelompok sesi untuk kelas per hari.
--
-- Mulai 5 Okt 2026 Halaqah Tahfizh & Takhassus akhwat dipresensi per sesi
-- (Pagi / Siang). Satuan datanya tetap kelas per hari (satu jadwal_hari) supaya
-- tagihan presensi, laporan bulanan, dan SP tak berubah; kolom ini hanya
-- menyatukan tampilannya. Kelas dengan grup_sesi sama (dan gender sama) tampil
-- sebagai satu entri berlabel nilai kolom ini, mis. 'Halaqah Tahfizh Pagi'.
--
-- NULL = kelas berdiri sendiri (perilaku lama).
-- Spec: docs/superpowers/specs/2026-10-02-presensi-sesi-akhwat-design.md
begin;

alter table program_kelas
  add column if not exists grup_sesi text;

comment on column program_kelas.grup_sesi is
  'Label sesi yang menyatukan kelas per hari di tampilan ketua & koordinator (mis. Halaqah Tahfizh Pagi). NULL = kelas berdiri sendiri. Tak memengaruhi laporan/SP.';

commit;
