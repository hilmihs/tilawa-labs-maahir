-- 0085 — Kelayakan pengajar per periode (Ketersediaan Mengajar HITS)
--
-- Sebelum ini setiap akun ber-role `pengajar` yang aktif boleh membuka
-- /ketersediaan/pengajar (172 orang). Kenyataannya daftar pengajar satu batch
-- ditentukan koordinator lewat dropdown "Nama Lengkap Pengajar" di form Google
-- dan jauh lebih pendek. Tabel ini memindahkan daftar itu ke dalam aplikasi
-- supaya koordinator bisa menambah/mengurangi sendiri.
--
-- Semantik yang dipakai kode (lihat src/lib/ketersediaan-kelayakan.ts):
--   periode punya >= 1 baris  → mode daftar: hanya `boleh=true` yang layak
--   periode tanpa baris        → semua pengajar layak (perilaku lama)
-- Aturan kedua penting supaya periode lama — dan periode baru yang belum
-- disetel koordinator — tidak mendadak terkunci total.

begin;

create table if not exists ks_kelayakan (
  id          uuid primary key default gen_random_uuid(),
  periode_id  uuid not null references ks_periode(id) on delete cascade,
  pengajar_id uuid not null references pengajar(id) on delete cascade,
  boleh       boolean not null default true,
  alasan      text,
  -- WA koordinator yang terakhir mengubah; jejak lengkapnya di ks_log.
  diubah_oleh text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (periode_id, pengajar_id)
);

create index if not exists idx_ks_kelayakan_periode on ks_kelayakan(periode_id, boleh);

commit;
