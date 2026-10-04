-- Perluas hits_halaqah_pindah_request untuk mendukung dua jenis pengajuan:
--   transfer_out : owner ajukan pindah halaqah ke pengajar tujuan (approve oleh target — existing)
--   claim_in     : pengajar ingin MENGAMBIL halaqah; approve oleh approver
--                  (owner halaqah bila ada pengajar, atau koordinator ketua kelas bila kosong)
alter table hits_halaqah_pindah_request
  add column if not exists request_type text not null default 'transfer_out',
  add column if not exists approver_kind text,          -- 'pengajar' | 'koordinator_kk'
  add column if not exists approver_wa text,
  add column if not exists approver_pengajar_id uuid;

comment on column hits_halaqah_pindah_request.request_type is
  'transfer_out (owner→target) | claim_in (requester mengambil, approve oleh approver_*)';
