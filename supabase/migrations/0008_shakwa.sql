-- =====================================================================
-- SHAKWA — Ticketing/laporan dari pengajar & peserta HITS
-- =====================================================================

create table shakwa (
  id uuid primary key default gen_random_uuid(),
  pelapor_type text not null check (pelapor_type in ('peserta', 'pengajar')),
  pengajar_id uuid references pengajar(id),
  nama text not null,
  gender gender not null,
  kategori text not null,
  halaqoh text,
  isi text not null,
  saran_kritik text,
  status text not null default 'submitted'
    check (status in ('submitted', 'in_review', 'resolved', 'closed')),
  catatan_reviewer text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_shakwa_status on shakwa(status);
create index idx_shakwa_pelapor on shakwa(pelapor_type);
create index idx_shakwa_pengajar on shakwa(pengajar_id) where pengajar_id is not null;
create index idx_shakwa_created on shakwa(created_at desc);

alter table shakwa enable row level security;

comment on table shakwa is 'Form aduan/laporan HITS dari pengajar (login) dan peserta (public). Menggantikan Google Form SHAKWA.';
