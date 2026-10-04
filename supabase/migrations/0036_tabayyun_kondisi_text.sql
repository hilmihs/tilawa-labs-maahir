-- F1: tabayyun kini merujuk model multi-pelanggaran (hits_pelanggaran). Satu
-- tabayyun per keterangan me-list SEMUA pelanggaran-nya. Kolom kondisi tinggal
-- headline (pelanggaran paling berat) & harus bisa menampung nilai di luar enum
-- hits_kondisi lama — khususnya BADAL & TIDAK_LATIHAN (pemicu tabayyun baru).
-- Relax enum -> text; perbandingan string di kode tetap jalan.
alter table hits_tabayyun
  alter column kondisi type text using kondisi::text;

comment on column hits_tabayyun.kondisi is
  'Headline pelanggaran (KMT/KBLA/JKG/BADAL/TIDAK_LATIHAN). Rincian lengkap di hits_pelanggaran via keterangan_id.';
