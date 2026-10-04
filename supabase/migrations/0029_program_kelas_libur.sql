-- Libur kelas Maahir yang diatur Koordinator 2in1 untuk rentang tanggal.
-- program_kelas_id NULL = libur berlaku untuk SEMUA kelas Maahir (mis. hari raya).
-- Tanggal libur dikecualikan dari presensi yang diharapkan (unfilled & rekap).
create table if not exists program_kelas_libur (
  id               uuid primary key default gen_random_uuid(),
  program_kelas_id uuid references program_kelas(id) on delete cascade,
  tanggal_mulai    date not null,
  tanggal_selesai  date not null,
  keterangan       text,
  created_by_id    uuid,
  created_at       timestamptz not null default now(),
  check (tanggal_selesai >= tanggal_mulai)
);

create index if not exists idx_program_kelas_libur_kelas
  on program_kelas_libur (program_kelas_id);
create index if not exists idx_program_kelas_libur_rentang
  on program_kelas_libur (tanggal_mulai, tanggal_selesai);

-- Konsisten dgn tabel lain: RLS on, akses hanya via service role (supabaseAdmin).
alter table program_kelas_libur enable row level security;
