-- =====================================================================
-- Maahir v2 — 4-role hierarchy + 2-pekan cycle + monthly report support
-- =====================================================================
-- Highlights:
--   1. Tabel `syaikh` (gender-aware: ikhwan=Syaikh, akhwat=Ustadzah)
--   2. `koordinator.gender` (ikhwan/akhwat) — scope dashboard
--   3. `setoran_musyrif` + `rekaman_musyrif` — setoran musyrif → syaikh
--   4. `cycle_start_of()` + `current_cycle_start()` — siklus 2 pekan,
--      anchor 2026-06-01 (Senin). Kolom `week_start` di setoran tetap
--      namanya, tapi sekarang berisi Senin awal cycle 2-pekan.
-- =====================================================================

-- ---------- Tabel syaikh ----------

create table syaikh (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender gender not null,
  whatsapp_number text not null,
  password_hash text not null,
  last_login_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_syaikh_wa on syaikh(whatsapp_number);

-- Hanya boleh 1 syaikh aktif per gender (Syaikh untuk ikhwan, Ustadzah
-- untuk akhwat). Jika di masa depan butuh >1, hapus index ini.
create unique index idx_syaikh_one_active_per_gender
  on syaikh(gender) where active = true;

comment on table syaikh is 'Pengajar tingkat tertinggi yang menilai setoran musyrif. ikhwan=Syaikh, akhwat=Ustadzah.';

-- ---------- Koordinator gender ----------

alter table koordinator add column gender gender;
update koordinator set gender = 'ikhwan' where gender is null;
alter table koordinator alter column gender set not null;

create index idx_koordinator_gender on koordinator(gender);

comment on column koordinator.gender is 'Scope koordinator: ikhwan vs akhwat. Dashboard di-filter sesuai gender.';

-- ---------- Tabel setoran_musyrif ----------

create table setoran_musyrif (
  id uuid primary key default gen_random_uuid(),
  musyrif_id uuid not null references musyrif(id) on delete cascade,
  week_start date not null,                -- Senin awal cycle 2-pekan
  status status_setoran not null default 'draft',
  submitted_at timestamptz,
  checked_at timestamptz,
  checked_by_syaikh_id uuid references syaikh(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (musyrif_id, week_start)
);

create index idx_setoran_musyrif_musyrif on setoran_musyrif(musyrif_id);
create index idx_setoran_musyrif_week on setoran_musyrif(week_start desc);
create index idx_setoran_musyrif_status on setoran_musyrif(status);
create index idx_setoran_musyrif_pending_check on setoran_musyrif(status, week_start)
  where status = 'submitted';

comment on table setoran_musyrif is 'Setoran hafalan musyrif kepada syaikh (1 per cycle 2-pekan).';
comment on column setoran_musyrif.week_start is 'Senin awal cycle 2-pekan (gunakan cycle_start_of()).';

-- ---------- Tabel rekaman_musyrif ----------

create table rekaman_musyrif (
  id uuid primary key default gen_random_uuid(),
  setoran_musyrif_id uuid not null references setoran_musyrif(id) on delete cascade,
  jenis jenis_rekaman not null,
  audio_url text,
  duration_seconds integer,
  recorded_at timestamptz,
  nilai nilai_rekaman,
  masukan text,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (setoran_musyrif_id, jenis)
);

create index idx_rekaman_musyrif_setoran on rekaman_musyrif(setoran_musyrif_id);
create index idx_rekaman_musyrif_checked_at on rekaman_musyrif(checked_at)
  where checked_at is not null;

comment on table rekaman_musyrif is 'Tiga rekaman per setoran musyrif: tuhfatul_athfal, jazariyyah, syawahid.';

-- ---------- Triggers (reuse fungsi existing) ----------

create trigger trg_setoran_musyrif_updated_at
  before update on setoran_musyrif
  for each row execute function set_updated_at();

create trigger trg_rekaman_musyrif_updated_at
  before update on rekaman_musyrif
  for each row execute function set_updated_at();

create trigger trg_setoran_musyrif_status_timestamps
  before insert or update of status on setoran_musyrif
  for each row execute function set_submitted_at();

-- ---------- Cycle helpers (2-pekan) ----------
-- Anchor: 2026-06-01 (Senin). Setiap cycle = 14 hari.

create or replace function cycle_start_of(d date)
returns date as $$
  select date '2026-06-01' + (floor((d - date '2026-06-01')::numeric / 14)::int * 14);
$$ language sql immutable;

create or replace function current_cycle_start()
returns date as $$
  select cycle_start_of(current_date);
$$ language sql stable;

comment on function cycle_start_of(date) is 'Senin awal cycle 2-pekan dari tanggal manapun. Anchor 2026-06-01.';
comment on function current_cycle_start() is 'Awal cycle 2-pekan yang sedang berjalan.';

-- ---------- Sanity check ----------
-- cycle_start_of('2026-06-01') = 2026-06-01
-- cycle_start_of('2026-06-14') = 2026-06-01
-- cycle_start_of('2026-06-15') = 2026-06-15
-- cycle_start_of('2026-05-25') = 2026-05-18
