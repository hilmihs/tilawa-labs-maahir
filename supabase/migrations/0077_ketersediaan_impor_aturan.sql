-- 0077 — Ketersediaan: impor xlsx pengajar & aturan sinkronisasi 21 September 2026.
-- Rancangan: docs/superpowers/specs/2026-09-16-ketersediaan-impor-dashboard-design.md
--
-- Aman dijalankan di produksi karena seluruh tabel ks_* masih kosong (diperiksa
-- 16 Sep 2026): mengganti CHECK pita umur tidak menabrak baris lama.
-- Nama constraint diperiksa di produksi lewat pg_constraint.

begin;

-- Prioritas xlsx berlaku per jam, bukan per pengajar.
alter table ks_ketersediaan
  add column if not exists prioritas integer check (prioritas is null or prioritas > 0);

-- Impor ulang hanya boleh menimpa isian yang dulu datang dari impor.
alter table ks_pengisian
  add column if not exists sumber text not null default 'form'
  check (sumber in ('form', 'impor'));

-- Pita umur dua kelompok: sampai 45 tahun, dan 46 ke atas.
alter table ks_pendaftar drop constraint if exists ks_pendaftar_pita_umur_check;
alter table ks_pendaftar add constraint ks_pendaftar_pita_umur_check
  check (pita_umur in ('<=45', '46+'));
alter table ks_usulan drop constraint if exists ks_usulan_pita_umur_check;
alter table ks_usulan add constraint ks_usulan_pita_umur_check
  check (pita_umur in ('<=45', '46+'));

-- Kiriman formulir yang sudah digantikan kiriman lebih baru dari orang yang sama.
alter table ks_pendaftar drop constraint if exists ks_pendaftar_status_check;
alter table ks_pendaftar add constraint ks_pendaftar_status_check
  check (status in ('valid', 'ditahan', 'dialokasikan', 'batal', 'diganti'));

-- Jumlah pertemuan berbeda per jenjang. Kolom lama jumlah_pertemuan dibiarkan
-- dan tidak dibaca lagi; dihapus di migrasi berikutnya setelah rilis.
alter table ks_periode
  add column if not exists jumlah_pertemuan_dasar integer not null default 50
    check (jumlah_pertemuan_dasar between 0 and 200),
  add column if not exists jumlah_pertemuan_lanjutan integer not null default 26
    check (jumlah_pertemuan_lanjutan between 0 and 200);

commit;
