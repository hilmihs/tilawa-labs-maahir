-- Pengajuan peran ganda ketua kelas: satu orang (nomor WA) jadi ketua di >1
-- halaqah berbeda. Saat pengajar menunjuk ketua yang WA-nya sudah ketua aktif
-- di halaqah lain, dibuat pengajuan ini yang harus disetujui:
--   - approver_kind 'pengajar'        : pengajar halaqah existing (jika tepat 1 & ber-WA)
--   - approver_kind 'koordinator_kk'  : koordinator ketua kelas (jika >1 atau pengajar tanpa WA)
-- Approve → baru baris ketua_kelas halaqah baru diaktifkan (password disalin
-- dari akun ketua existing → 1 password lintas halaqah).

create table if not exists ketua_dualrole_request (
  id                       uuid primary key default gen_random_uuid(),
  ketua_wa                 text not null,        -- normalized 62xxx
  ketua_name               text not null,
  gender                   text not null check (gender in ('ikhwan', 'akhwat')),
  new_halaqah_id           uuid not null references hits_halaqah(id) on delete cascade,
  new_peserta_id           uuid references hits_halaqah_peserta(id) on delete set null,
  requested_by_pengajar_id uuid references pengajar(id) on delete set null,
  requested_by_name        text not null,
  requested_by_wa          text,
  approver_kind            text not null check (approver_kind in ('pengajar', 'koordinator_kk')),
  target_pengajar_id       uuid references pengajar(id) on delete set null,
  target_wa                text,
  target_name              text,
  token                    text not null unique,
  status                   text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_role          text,
  decided_by_id            uuid,
  decided_at               timestamptz,
  catatan                  text,
  created_at               timestamptz not null default now()
);

create index if not exists idx_ketua_dualrole_status on ketua_dualrole_request (status);
create index if not exists idx_ketua_dualrole_target on ketua_dualrole_request (target_pengajar_id);
create index if not exists idx_ketua_dualrole_wa on ketua_dualrole_request (ketua_wa);

-- Cegah duplikat pengajuan pending untuk (ketua, halaqah baru) yang sama.
create unique index if not exists idx_ketua_dualrole_pending
  on ketua_dualrole_request (ketua_wa, new_halaqah_id)
  where status = 'pending';

alter table ketua_dualrole_request enable row level security;
