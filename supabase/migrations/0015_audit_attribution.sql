-- 0015: Audit attribution columns
-- Tambah field attribution untuk shakwa review, libur announcement, decided alasan.
-- Tujuan: peer view koordinator bisa terlihat akurat siapa melakukan apa.
-- Backward-compatible: kolom baru nullable, row lama tidak ter-attribute (OK untuk legacy).
-- Idempotent: aman di-rerun. (Originally numbered 0010 — renamed ke 0015 untuk
-- hindari collision dengan 0010_password_reset_requests.sql.)

alter table shakwa add column if not exists reviewed_by_id uuid;
alter table shakwa add column if not exists reviewed_by_role text;

alter table libur_program add column if not exists created_by_role text;

alter table pengajuan_alasan add column if not exists decided_by_role text;

create index if not exists idx_shakwa_reviewed_by on shakwa(reviewed_by_id);
create index if not exists idx_libur_created_by_role on libur_program(created_by_role, created_at desc);

comment on column shakwa.reviewed_by_id is 'UUID koordinator yang me-review (multi-role: bisa koordinator_hits atau koordinator_ketua_kelas).';
comment on column shakwa.reviewed_by_role is 'Role koordinator yang me-review. Diisi bersamaan dengan reviewed_by_id.';
comment on column libur_program.created_by_role is 'Role yang menerbitkan libur (umumnya koordinator_hits).';
comment on column pengajuan_alasan.decided_by_role is 'Role yang memutus alasan (ketua kelompok = pengajar, atau koordinator_hits).';
