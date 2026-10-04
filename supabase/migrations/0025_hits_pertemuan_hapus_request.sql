-- Pengajuan hapus pertemuan (kelebihan/salah) oleh ketua kelas HITS.
-- Ketua mengajukan; koordinator ketua kelas (gender-matched) menyetujui/menolak
-- via magic-link. Approve → tulis override is_skipped di hits_kaldik_pertemuan.

create table hits_pertemuan_hapus_request (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  level text not null check (level in ('qoidah_nuroniyyah', 'perbaikan_bacaan')),
  pertemuan_no smallint not null,
  tanggal date,
  alasan text,
  gender text not null check (gender in ('ikhwan', 'akhwat')),
  requested_by_ketua_id uuid references ketua_kelas(id) on delete set null,
  requested_by_name text not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_role text,
  decided_by_id uuid,
  decided_at timestamptz,
  catatan_koordinator text,
  created_at timestamptz not null default now()
);

create index idx_hits_hapus_req_halaqah on hits_pertemuan_hapus_request (halaqah_id);
create index idx_hits_hapus_req_status on hits_pertemuan_hapus_request (status);

-- Cegah duplikat pengajuan pending utk pertemuan yang sama.
create unique index idx_hits_hapus_req_pending
  on hits_pertemuan_hapus_request (halaqah_id, level, pertemuan_no)
  where status = 'pending';

alter table hits_pertemuan_hapus_request enable row level security;

comment on table hits_pertemuan_hapus_request is
  'Pengajuan ketua kelas untuk menghapus pertemuan kelebihan/salah; disetujui koordinator ketua kelas via magic-link.';
