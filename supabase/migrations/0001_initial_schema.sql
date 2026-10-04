-- =====================================================================
-- Setoran Hafalan — Initial Schema
-- Target: Supabase (PostgreSQL)
-- =====================================================================
-- Tables: musyrif, koordinator, kelas, peserta, setoran, rekaman
-- Notes:
--   * UUID primary keys via gen_random_uuid() (Supabase has pgcrypto on)
--   * All timestamps timestamptz, default now()
--   * Soft constraints (gender match) enforced via triggers
--   * RLS policies deliberately omitted — will be added after auth strategy decided
-- =====================================================================

-- ---------- Enum types ----------

create type gender as enum ('ikhwan', 'akhwat');

create type status_setoran as enum (
  'draft',      -- peserta sudah mulai tapi belum semua 3 rekaman ter-upload
  'submitted',  -- 3 rekaman lengkap, menunggu musyrif cek (resubmit masih boleh di state ini)
  'checked'     -- musyrif sudah memberi nilai + masukan, locked
);

create type jenis_rekaman as enum (
  'tuhfatul_athfal',
  'jazariyyah',
  'syawahid'
);

create type nilai_rekaman as enum ('hijau', 'kuning', 'merah');

-- ---------- Tables ----------

create table musyrif (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender gender not null,
  whatsapp_number text not null,
  password_hash text not null,             -- bcrypt hash; di-set admin saat seed
  last_login_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table koordinator (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_number text not null,
  password_hash text not null,             -- bcrypt hash; di-set admin saat seed
  last_login_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table kelas (
  id uuid primary key default gen_random_uuid(),
  name text not null,                      -- 'A', 'B', 'C', 'D', 'E'
  gender gender not null,
  musyrif_id uuid not null references musyrif(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (name, gender)                    -- kelas A ikhwan & A akhwat = entitas berbeda
);

create table peserta (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender gender not null,
  kelas_id uuid not null references kelas(id) on delete restrict,
  whatsapp_number text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table setoran (
  id uuid primary key default gen_random_uuid(),
  peserta_id uuid not null references peserta(id) on delete cascade,
  week_start date not null,                -- Senin tiap pekannya (lihat fn week_start_of)
  status status_setoran not null default 'draft',
  submitted_at timestamptz,                -- diset ketika status → submitted
  checked_at timestamptz,                  -- diset ketika status → checked
  checked_by_musyrif_id uuid references musyrif(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (peserta_id, week_start)          -- 1 setoran per peserta per pekan
);

create table rekaman (
  id uuid primary key default gen_random_uuid(),
  setoran_id uuid not null references setoran(id) on delete cascade,
  jenis jenis_rekaman not null,
  audio_url text,                          -- path di Supabase storage, null sebelum di-upload
  duration_seconds integer,                -- untuk audit + monitoring storage
  recorded_at timestamptz,                 -- waktu rekaman terakhir di-upload
  nilai nilai_rekaman,                     -- diisi musyrif
  masukan text,                            -- diisi musyrif
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (setoran_id, jenis)               -- 1 jenis hanya 1 rekaman per setoran
);

-- ---------- Indexes ----------

create index idx_kelas_gender on kelas(gender);
create index idx_kelas_musyrif on kelas(musyrif_id);
create index idx_peserta_kelas on peserta(kelas_id);
create index idx_peserta_gender on peserta(gender);
create index idx_peserta_active on peserta(active) where active = true;
create index idx_setoran_peserta on setoran(peserta_id);
create index idx_setoran_week on setoran(week_start desc);
create index idx_setoran_status on setoran(status);
create index idx_setoran_pending_check on setoran(status, week_start) where status = 'submitted';
create index idx_rekaman_setoran on rekaman(setoran_id);
create index idx_rekaman_checked_at on rekaman(checked_at) where checked_at is not null;

-- ---------- Triggers ----------

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_setoran_updated_at
  before update on setoran
  for each row execute function set_updated_at();

create trigger trg_rekaman_updated_at
  before update on rekaman
  for each row execute function set_updated_at();

-- Enforce: peserta.gender must match kelas.gender
create or replace function check_peserta_kelas_gender()
returns trigger as $$
declare
  kelas_gender gender;
begin
  select gender into kelas_gender from kelas where id = new.kelas_id;
  if kelas_gender is null then
    raise exception 'Kelas % tidak ditemukan', new.kelas_id;
  end if;
  if kelas_gender != new.gender then
    raise exception 'Gender peserta (%) tidak cocok dengan gender kelas (%)',
      new.gender, kelas_gender;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_peserta_gender_check
  before insert or update on peserta
  for each row execute function check_peserta_kelas_gender();

-- Enforce: musyrif.gender must match kelas.gender
create or replace function check_kelas_musyrif_gender()
returns trigger as $$
declare
  musyrif_gender gender;
begin
  select gender into musyrif_gender from musyrif where id = new.musyrif_id;
  if musyrif_gender is null then
    raise exception 'Musyrif % tidak ditemukan', new.musyrif_id;
  end if;
  if musyrif_gender != new.gender then
    raise exception 'Gender musyrif (%) tidak cocok dengan gender kelas (%)',
      musyrif_gender, new.gender;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_kelas_musyrif_gender_check
  before insert or update on kelas
  for each row execute function check_kelas_musyrif_gender();

-- Auto-set submitted_at when status → submitted
create or replace function set_submitted_at()
returns trigger as $$
begin
  if new.status = 'submitted' and (old.status is null or old.status != 'submitted') then
    new.submitted_at = now();
  end if;
  if new.status = 'checked' and (old.status is null or old.status != 'checked') then
    new.checked_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_setoran_status_timestamps
  before insert or update of status on setoran
  for each row execute function set_submitted_at();

-- ---------- Helper functions ----------

-- Hitung Senin dari tanggal manapun (ISO week, Senin = 1)
create or replace function week_start_of(d date)
returns date as $$
begin
  return d - extract(isodow from d)::int + 1;
end;
$$ language plpgsql immutable;

-- Pekan berjalan saat ini (Senin pekan ini)
create or replace function current_week_start()
returns date as $$
begin
  return week_start_of(current_date);
end;
$$ language plpgsql stable;

-- ---------- Comments ----------

comment on table musyrif is 'Pengajar yang memeriksa setoran peserta';
comment on table kelas is 'Kelompok peserta; setiap kelas dipegang 1 musyrif, dipisah per gender';
comment on table peserta is 'Santri yang menyetorkan hafalan';
comment on table setoran is 'Satu setoran per peserta per pekan (Senin–Minggu)';
comment on table rekaman is 'Tiga rekaman per setoran: tuhfatul_athfal, jazariyyah, syawahid';
comment on column setoran.week_start is 'Senin pekan tersebut (gunakan week_start_of() untuk hitung)';
comment on column rekaman.audio_url is 'Path di Supabase storage bucket. Akan dihapus 12 pekan setelah checked_at';
