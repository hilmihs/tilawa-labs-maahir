-- Catatan umum per pengajar per bulan: satu free-text note yang diisi ketua
-- kelompok saat menilai pedagogis. Tidak memengaruhi skor/ranking matrix
-- (matrix-compute.ts hanya baca kolom skor_*). Nullable → baris historis NULL.
alter table penilaian_pedagogis
  add column if not exists catatan_umum text;

comment on column penilaian_pedagogis.catatan_umum is
  'Catatan umum bebas per pengajar/bulan dari ketua kelompok. Tak dipakai perhitungan matrix.';
