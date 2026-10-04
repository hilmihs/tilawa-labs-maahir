-- 0076_maahir_checkin_pengajar.sql
-- Check-in kehadiran PENGAJAR Kelas Maahir (6A–6D) + materi pertemuan.
--
-- Berbeda dari `checkin_pengajar` (0004) yang menempel ke kelas_hits/
-- program_kehadiran untuk skor Matrix pengajar HITS: di sini yang dicatat
-- adalah pengajar yang MENGAJAR kelas `program_kelas` Maahir, tanpa aturan
-- terlambat (jam check-in dicatat apa adanya), dan tiap sesi membawa materi.
--
-- Akses diturunkan dari nomor WA (seperti ketua kelas Maahir lewat
-- program_kelas.ketua_wa), bukan role sesi baru: `maahir_pengajar` tak punya
-- password — orangnya login lewat akun mana pun yang sudah ia miliki.
-- Pemantau rekap = superadmin atau koordinator ber-flag `rekap_pengajar_maahir`.
--
-- Periode rekap: 16 bulan lalu s/d 15 bulan ini (src/lib/periode-pengajar.ts).

begin;

create table if not exists maahir_pengajar (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  gender           text not null check (gender in ('ikhwan', 'akhwat')),
  whatsapp_number  text not null unique,          -- normalized 62xxx
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table maahir_pengajar is
  'Pengajar kelas Maahir (program_kelas). Identitas = nomor WA; login lewat akun role lain.';

create table if not exists maahir_pengajar_kelas (
  id                uuid primary key default gen_random_uuid(),
  pengajar_id       uuid not null references maahir_pengajar(id) on delete cascade,
  program_kelas_id  uuid not null references program_kelas(id) on delete cascade,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (pengajar_id, program_kelas_id)
);

create index if not exists idx_maahir_pengajar_kelas_kelas on maahir_pengajar_kelas(program_kelas_id);

create table if not exists maahir_checkin_pengajar (
  id                uuid primary key default gen_random_uuid(),
  pengajar_id       uuid not null references maahir_pengajar(id) on delete cascade,
  program_kelas_id  uuid not null references program_kelas(id) on delete cascade,
  tanggal           date not null,
  status            text not null check (status in ('hadir', 'izin', 'sakit')),
  -- Jam isi apa adanya (tanpa aturan terlambat); untuk izin/sakit = jam lapor.
  checked_in_at     timestamptz not null default now(),
  -- true = diisi bukan di hari-H (susulan untuk sesi lampau dalam periode).
  susulan           boolean not null default false,
  materi            text,
  catatan           text,                         -- alasan izin/sakit dsb.
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (pengajar_id, program_kelas_id, tanggal)
);

create index if not exists idx_maahir_checkin_pengajar_tanggal on maahir_checkin_pengajar(tanggal desc);

comment on table maahir_checkin_pengajar is
  'Check-in pengajar per sesi kelas Maahir + materi. Unik per pengajar/kelas/tanggal.';

-- Siapa boleh melihat rekap semua pengajar (di luar superadmin).
alter table koordinator add column if not exists rekap_pengajar_maahir boolean not null default false;

comment on column koordinator.rekap_pengajar_maahir is
  'true = boleh membuka rekap kehadiran pengajar kelas Maahir (/2in1/koordinator/kehadiran/pengajar).';

-- Konvensi repo (0005): RLS aktif di semua tabel, otorisasi tetap di kode aplikasi.
alter table maahir_pengajar enable row level security;
alter table maahir_pengajar_kelas enable row level security;
alter table maahir_checkin_pengajar enable row level security;

commit;
