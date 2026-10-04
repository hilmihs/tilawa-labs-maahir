-- Multi-pelanggaran per pertemuan observasi HITS (menggantikan model kondisi
-- tunggal). Satu pertemuan bisa punya beberapa pelanggaran sekaligus (mis.
-- KMT + KBLA + TIDAK_LATIHAN). Tiap pelanggaran bawa datanya sendiri:
--   - KMT/KBLA: menit (mentah, sebelum toleransi) -> dasar hutang menit (F2).
--   - JKG: opsi tindak lanjut (ganti hari / cicil ke beberapa pertemuan).
--   - BADAL: nama pengganti + waktu mulai; utk guru asli dihitung sebagai JKG
--     (menambah beban anti-mangkir di matrix).
-- KBBS = pertemuan TANPA pelanggaran sama sekali. LIBUR tetap di kondisi.
-- Kolom hits_keterangan_harian.kondisi DIPERTAHANKAN (kompatibel & LIBUR);
-- untuk pertemuan bermasalah, kondisi = pelanggaran "utama" (paling berat).

create table hits_pelanggaran (
  id uuid primary key default gen_random_uuid(),
  keterangan_id uuid not null references hits_keterangan_harian(id) on delete cascade,
  jenis text not null check (jenis in ('KMT', 'KBLA', 'JKG', 'BADAL', 'TIDAK_LATIHAN')),
  menit integer check (menit is null or menit >= 0),          -- KMT: telat; KBLA: tutup cepat
  jkg_opsi text check (jkg_opsi is null or jkg_opsi in ('ganti_hari', 'cicil')),
  cicil_n smallint check (cicil_n is null or cicil_n in (2, 3)),
  badal_nama text,
  badal_mulai text check (badal_mulai is null or badal_mulai in ('sesuai', 'lebih_awal')),
  created_at timestamptz not null default now(),
  unique (keterangan_id, jenis)
);

create index idx_hits_pelanggaran_ket on hits_pelanggaran (keterangan_id);
create index idx_hits_pelanggaran_jenis on hits_pelanggaran (jenis);

alter table hits_pelanggaran enable row level security;

comment on table hits_pelanggaran is
  'Pelanggaran per pertemuan observasi HITS (multi per keterangan). KBBS = tak ada baris di sini.';

-- Backfill dari observasi lama (idempoten).
insert into hits_pelanggaran (keterangan_id, jenis)
select id, kondisi from hits_keterangan_harian
where kondisi in ('KMT', 'KBLA', 'JKG')
on conflict (keterangan_id, jenis) do nothing;

insert into hits_pelanggaran (keterangan_id, jenis)
select id, 'TIDAK_LATIHAN' from hits_keterangan_harian
where kondisi <> 'LIBUR' and latihan_diberikan is false
on conflict (keterangan_id, jenis) do nothing;
