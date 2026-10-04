-- Pengajuan libur pertemuan oleh ketua/wakil kelas Maahir.
-- Ketua/wakil mengajukan agar sebuah tanggal kelas diliburkan; koordinator
-- (Aisyah Shofia Safitri / Zahra Wafa Lestari, gender-matched) menyetujui via magic-link
-- (wajib login). Approve -> insert program_kelas_libur untuk (kelas, tanggal),
-- sehingga pertemuan tanggal itu teranulir dari perhitungan kehadiran.

create table program_kelas_libur_request (
  id uuid primary key default gen_random_uuid(),
  program_kelas_id uuid not null references program_kelas(id) on delete cascade,
  tanggal date not null,
  alasan text,
  gender text not null check (gender in ('ikhwan', 'akhwat')),
  requester_wa text not null,
  requester_name text not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_role text,
  decided_by_id uuid,
  decided_at timestamptz,
  catatan_koordinator text,
  created_at timestamptz not null default now()
);

create index idx_libur_req_kelas on program_kelas_libur_request (program_kelas_id);
create index idx_libur_req_status on program_kelas_libur_request (status);

-- Cegah duplikat pengajuan pending utk (kelas, tanggal) yang sama.
create unique index idx_libur_req_pending
  on program_kelas_libur_request (program_kelas_id, tanggal)
  where status = 'pending';

alter table program_kelas_libur_request enable row level security;

comment on table program_kelas_libur_request is
  'Pengajuan ketua/wakil kelas Maahir untuk meliburkan tanggal pertemuan; disetujui koordinator via magic-link, approve menulis ke program_kelas_libur.';
