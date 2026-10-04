-- Materi/tema yang dibahas pada satu pertemuan (mis. surat/juz yang disetorkan,
-- bab tajwid). Per-pertemuan (seragam untuk seluruh peserta), bukan per-peserta.
-- Diisi ketua/wakil ketua kelas bersama presensi, hanya ditampilkan untuk sesi
-- Kelas Maahir Takhassus (sejajar kolom setoran_halaman). Opsional / nullable.

alter table pertemuan_program
  add column if not exists materi text;

comment on column pertemuan_program.materi is
  'Materi/tema pembahasan pertemuan ini (per-pertemuan, diisi ketua kelas; dipakai sesi takhassus).';
