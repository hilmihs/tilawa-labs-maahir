-- Pengajuan pemindahan halaqah (transfer pengajar) oleh pengajar HITS.
-- Pengaju (pengajar mana pun) memilih halaqah + pengajar tujuan; tujuan
-- menyetujui via link yang DIGATE login (hanya pengajar tujuan yang bisa
-- approve). Approve → set hits_halaqah.pengajar_id/pengajar_wa/pengajar_nama_sheet
-- ke pengajar tujuan.

create table hits_halaqah_pindah_request (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  batch_id uuid references hits_batch(id) on delete set null,
  requested_by_pengajar_id uuid references pengajar(id) on delete set null,
  requested_by_name text not null,
  requested_by_wa text,
  target_pengajar_id uuid references pengajar(id) on delete set null, -- null bila manual
  target_name text not null,
  target_wa text,                       -- normalized; null bila tujuan tak punya WA
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_role text,
  decided_by_id uuid,
  decided_at timestamptz,
  catatan text,
  created_at timestamptz not null default now()
);

create index idx_hits_pindah_req_halaqah on hits_halaqah_pindah_request (halaqah_id);
create index idx_hits_pindah_req_status on hits_halaqah_pindah_request (status);
create index idx_hits_pindah_req_target on hits_halaqah_pindah_request (target_pengajar_id);

-- Cegah duplikat pengajuan pending untuk satu halaqah.
create unique index idx_hits_pindah_req_pending
  on hits_halaqah_pindah_request (halaqah_id)
  where status = 'pending';

alter table hits_halaqah_pindah_request enable row level security;

comment on table hits_halaqah_pindah_request is
  'Pengajuan pemindahan halaqah antar pengajar HITS; disetujui pengajar tujuan via link yang digate login.';
