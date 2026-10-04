-- Setoran hafalan (jumlah halaman) per pertemuan untuk kelas presensi-mandiri
-- (Maahir Takhassus Ikhwan). Diisi bersama status kehadiran; nullable karena
-- hanya relevan untuk sesi Kelas Maahir di kelas self_attendance.

alter table kehadiran_peserta
  add column setoran_halaman integer check (setoran_halaman is null or setoran_halaman >= 0);

comment on column kehadiran_peserta.setoran_halaman is
  'Jumlah halaman setoran hafalan pada pertemuan ini (kelas presensi-mandiri/takhassus).';
