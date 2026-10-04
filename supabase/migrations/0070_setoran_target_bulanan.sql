-- Target setoran hafalan Takhassus: satuan pindah dari halaman/HARI ke halaman/BULAN.
--
-- Alasannya kebijakan, bukan teknis. Koordinator menetapkan target sebagai angka
-- bulanan bulat (80 dan 32 halaman), dan Laporan Bulanan harus menampilkan angka
-- itu apa adanya. Satuan harian tak pernah bisa: 80 dibagi jumlah sesi menghasilkan
-- pecahan, dan penyebutnya ikut bergoyang 76–84 mengikuti berapa sesi yang jatuh di
-- periode itu.
--
-- Kolomnya DIGANTI NAMA, bukan ditambah, karena tak ada baris tersisa yang bersatuan
-- hari — tiga baris yang ada (dipasang pesertanya sendiri, Juli 2026) dihapus di
-- migrasi ini atas keputusan koordinator: target koordinator jadi satu-satunya
-- sumber sejak 1 Juni 2026, dan baris lama itu akan menang atas target baru sejak
-- 28 Juli kalau dibiarkan. Menyimpan kolom lama demi nol baris hanya memaksa
-- seluruh kode menanggung dua satuan selamanya.
--
-- `create table if not exists` di bawah adalah backfill: tabel ini lahir lewat
-- /api/admin/db dan tak pernah punya file migrasi, jadi DB lokal yang baru tak
-- memilikinya sama sekali (gotcha yang sama dengan 0069).

begin;

create table if not exists maahir_setoran_target (
  id uuid primary key default gen_random_uuid(),
  program_kelas_id uuid not null references program_kelas(id) on delete cascade,
  anggota_id uuid references program_kelas_anggota(id) on delete cascade,
  halaman_per_hari numeric not null check (halaman_per_hari > 0),
  berlaku_mulai date not null,
  catatan text,
  dibuat_oleh text,
  created_at timestamptz not null default now()
);

create unique index if not exists maahir_setoran_target_versi_uniq
  on maahir_setoran_target (program_kelas_id, anggota_id, berlaku_mulai) nulls not distinct;
create index if not exists maahir_setoran_target_kelas_idx
  on maahir_setoran_target (program_kelas_id, berlaku_mulai);

-- Baris bersatuan hari — tak ada yang bisa dikonversi jujur ke bulanan (jumlah
-- sesi tiap periode berbeda), jadi dibuang dan disetel ulang oleh koordinator.
delete from maahir_setoran_target where halaman_per_hari is not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'maahir_setoran_target' and column_name = 'halaman_per_hari'
  ) then
    alter table maahir_setoran_target rename column halaman_per_hari to halaman_per_bulan;
    alter table maahir_setoran_target
      rename constraint maahir_setoran_target_halaman_per_hari_check
      to maahir_setoran_target_halaman_per_bulan_check;
  end if;
end $$;

commit;
