-- 0014: Catatan kolaboratif antar koordinator
-- Tujuan: koordinator A bisa pin observasi ttg pengajar/peserta X yang bisa
-- dibaca koordinator B sama role. Collaborative monitoring.
-- Idempotent: aman di-rerun.

create table if not exists koordinator_notes (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,        -- 'pengajar' | 'peserta'
  target_id uuid not null,
  author_role text not null,
  author_id uuid not null,
  body text not null,
  visibility text not null default 'peer',  -- 'peer' | 'private'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notes_target on koordinator_notes(target_type, target_id, created_at desc);
create index if not exists idx_notes_author on koordinator_notes(author_role, author_id, created_at desc);

-- CREATE TRIGGER doesn't support IF NOT EXISTS pre-PG 14; pakai DO block.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_koordinator_notes_updated_at'
  ) then
    create trigger trg_koordinator_notes_updated_at
      before update on koordinator_notes
      for each row execute function set_updated_at();
  end if;
end$$;

comment on table koordinator_notes is 'Catatan kolaboratif antar koordinator. visibility=peer (sama role) vs private (cuma author).';
