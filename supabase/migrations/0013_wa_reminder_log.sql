-- 0013: WhatsApp reminder log
-- Tujuan: jejak siapa kirim reminder ke siapa supaya peserta tidak di-spam
-- dan koordinator bisa lihat rate-limit visual.
-- Idempotent: aman di-rerun.

create table if not exists wa_reminder_log (
  id uuid primary key default gen_random_uuid(),
  sender_role text not null,
  sender_id uuid not null,
  recipient_table text not null,
  recipient_id uuid,
  recipient_wa text not null,
  template_kind text not null,
  target_table text,
  target_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_wa_reminder_recipient on wa_reminder_log(recipient_id, created_at desc);
create index if not exists idx_wa_reminder_sender on wa_reminder_log(sender_role, sender_id, created_at desc);

comment on table wa_reminder_log is 'Log reminder WA. Record dibuat saat URL wa.me di-prepare server-side (tidak ada delivery confirmation).';
