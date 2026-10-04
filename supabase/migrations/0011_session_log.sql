-- 0011: Session login/logout tracking
-- Tujuan: visibility frekuensi & durasi login per koordinator/pengajar untuk
-- meta-monitoring kinerja. last_login_at (yg sudah ada) cuma snapshot terakhir.
-- Idempotent: aman di-rerun.

create table if not exists session_log (
  id uuid primary key default gen_random_uuid(),
  actor_role text not null,
  actor_id uuid not null,
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  ip_address text,
  user_agent text
);

create index if not exists idx_session_log_actor on session_log(actor_role, actor_id, login_at desc);
create index if not exists idx_session_log_login_at on session_log(login_at desc);

comment on table session_log is 'Riwayat login & logout per role. Untuk meta-monitoring frekuensi aktivitas.';
