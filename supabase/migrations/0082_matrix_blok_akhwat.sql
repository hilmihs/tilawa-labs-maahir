-- Blok ranking Matrix Skill Guru yang disimpan per pengajar.
--
-- Ikhwan tak memakai kolom ini: bloknya diturunkan otomatis dari keanggotaan
-- `program_kelas_anggota` (nama kelas ikhwan sudah memisahkan Takhassus /
-- Tahfizh / sisanya). Akhwat TAK bisa: semua kelasnya bercampur antara
-- "Halaqah Pagi/Siang" dan "Talaqqi", dan dua kategori yang dipakai koordinator
-- akhwat — Takhashush & Koordinator — tak punya padanan kelas sama sekali.
-- Karena itu blok akhwat disimpan mengikuti list koordinator.
--
-- NULL = belum dikelompokkan (tampil di blok terakhir "Belum dikelompokkan").

begin;

alter table pengajar add column if not exists matrix_blok text;

alter table pengajar drop constraint if exists pengajar_matrix_blok_check;
alter table pengajar add constraint pengajar_matrix_blok_check
  check (matrix_blok is null or matrix_blok in
    ('takhassus', 'koordinator', 'tahfizh', 'talaqqi', 'maahir6'));

comment on column pengajar.matrix_blok is
  'Blok ranking Matrix Skill Guru (dipakai akhwat). NULL = belum dikelompokkan.';

commit;
