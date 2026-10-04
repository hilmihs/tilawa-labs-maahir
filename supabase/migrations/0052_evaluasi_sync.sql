-- 0052_evaluasi_sync.sql
-- Staging sinkron master data hilmihs → mirror eval_*. Pull menulis diff ke sini;
-- apply memindahkannya ke eval_*. Tak ada FK ke eval_* (baris deactivate bisa
-- merujuk id yang masih ada; create merujuk id yang belum ada).

begin;

create table if not exists eval_sync_run (
  id                  uuid primary key default gen_random_uuid(),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  source_generated_at timestamptz,
  counts              jsonb not null default '{}'::jsonb, -- {pengajar:{create,update,deactivate},...}
  status              text not null default 'running' check (status in ('running','ok','error')),
  error               text
);

create table if not exists eval_sync_stage (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references eval_sync_run(id) on delete cascade,
  entity      text not null check (entity in ('batch','pengajar','halaqah','peserta')),
  op          text not null check (op in ('create','update','deactivate')),
  entity_id   text not null,          -- id mirror target (mis. 'hits-regular:54')
  before      jsonb,                  -- null utk create
  after       jsonb,                  -- null utk deactivate
  flags       text[] not null default '{}',
  applied_at  timestamptz,
  applied_by  text,
  rejected    boolean not null default false,
  rejected_by text,
  created_at  timestamptz not null default now()
);
-- Satu baris pending per (entity, entity_id): re-pull sebelum apply = upsert, tak dobel.
create unique index if not exists uq_eval_sync_stage_pending
  on eval_sync_stage(entity, entity_id)
  where applied_at is null and rejected = false;
create index if not exists idx_eval_sync_stage_run on eval_sync_stage(run_id);

commit;
