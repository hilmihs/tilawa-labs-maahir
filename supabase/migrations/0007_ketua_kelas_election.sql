-- =====================================================================
-- Pemilihan Ketua Kelas via Check-in Pengajar (pekan 1-2 batch)
-- =====================================================================

-- 1. Ketua kelas bisa login tanpa password (magic-link only)
alter table ketua_kelas alter column password_hash drop not null;

-- 2. Tabel konfigurasi batch
create table batch_config (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  created_at timestamptz not null default now()
);

comment on table batch_config is 'Konfigurasi batch/angkatan HITS. start_date digunakan untuk menghitung pekan.';

-- Seed batch awal
insert into batch_config (name, start_date) values ('Batch 4', '2026-06-01');

-- 3. Relasi batch ke ketua_kelas
alter table ketua_kelas add column batch_id uuid references batch_config(id);

-- 4. Unique constraint: satu ketua aktif per kelas per batch
create unique index idx_ketua_kelas_active_batch
  on ketua_kelas(kelas_hits_id, batch_id) where active = true;

-- 5. Link grup WA di koordinator_ketua_kelas
alter table koordinator_ketua_kelas add column link_grup_wa text;

comment on column koordinator_ketua_kelas.link_grup_wa is 'Link grup WhatsApp yang dikirim ke ketua kelas baru.';

-- 6. RLS
alter table batch_config enable row level security;
