-- start_date per-halaqah: derivasi membuang pertemuan ber-tanggal < start_date.
alter table hits_halaqah add column if not exists start_date date;

-- Pengajuan koreksi pertemuan oleh ketua, diputuskan koordinator KK per-item.
create table if not exists hits_pertemuan_koreksi (
  id                    uuid primary key default gen_random_uuid(),
  halaqah_id            uuid not null references hits_halaqah(id) on delete cascade,
  requested_by_ketua_id uuid references ketua_kelas(id) on delete set null,
  requested_by_name     text not null,
  requested_by_wa       text,
  token                 text not null unique,
  status                text not null default 'pending' check (status in ('pending','selesai')),
  decided_by_role       text,
  decided_by_id         uuid,
  decided_at            timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists idx_hits_koreksi_halaqah on hits_pertemuan_koreksi (halaqah_id);
create unique index if not exists idx_hits_koreksi_pending
  on hits_pertemuan_koreksi (halaqah_id) where status = 'pending';

create table if not exists hits_pertemuan_koreksi_item (
  id           uuid primary key default gen_random_uuid(),
  koreksi_id   uuid not null references hits_pertemuan_koreksi(id) on delete cascade,
  jenis        text not null check (jenis in ('set_mulai','tambah','hapus','ubah_tanggal')),
  level        text,                 -- HitsLevel; null utk set_mulai
  pertemuan_no smallint,             -- utk hapus / ubah_tanggal
  tanggal      date,                 -- utk set_mulai / tambah / ubah_tanggal
  catatan      text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_hits_koreksi_item_koreksi on hits_pertemuan_koreksi_item (koreksi_id);

alter table hits_pertemuan_koreksi enable row level security;
alter table hits_pertemuan_koreksi_item enable row level security;
