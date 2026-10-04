-- Kelas yang presensinya dialihkan ke kelas halaqah anggotanya.
--
-- Mulai 28 Sep 2026 peserta Maahir Takhassus Akhwat tidak lagi dipresensi oleh
-- ketua kelas Takhassus. Mereka dipresensi (kehadiran + setoran harian) oleh
-- ketua kelas halaqah Pagi/Siang tempat mereka hadir hari itu; baris mereka
-- dicocokkan lewat WA. Kelas Takhassus tetap ada sebagai sumber daftar peserta,
-- target setoran, dan blok Takhassus di laporan. Sesinya tetap terjadwal untuk
-- check-in pengajar — yang berhenti hanya tagihan presensinya.
--
-- NULL = perilaku lama. Spec: docs/superpowers/specs/2026-09-23-takhassus-akhwat-via-halaqah-design.md
begin;

alter table program_kelas
  add column if not exists presensi_via_halaqah_mulai date;

comment on column program_kelas.presensi_via_halaqah_mulai is
  'Mulai tanggal ini sesi kelas_maahir kelas ini tak dipresensi sendiri; anggotanya dipresensi di kelas halaqah mereka (dicocokkan lewat WA).';

commit;
