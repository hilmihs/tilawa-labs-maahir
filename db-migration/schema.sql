-- AUTO-GENERATED: concatenation of supabase/migrations/*.sql in order.
-- Run 00_roles.sql FIRST (creates anon/authenticated/service_role), then this file.

-- ========== 0001_initial_schema.sql ==========
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

-- ========== 0002_peserta_password.sql ==========
-- =====================================================================
-- Add password authentication to peserta
-- =====================================================================
-- Peserta sekarang punya akun sendiri (sebelumnya: dropdown tanpa login).
-- Password di-backfill via script `npm run seed-peserta-password`
-- yang akan hash 'maahir123' dengan bcryptjs (cost 12).

alter table peserta add column password_hash text;

-- Index untuk login lookup yang cepat
create index if not exists idx_peserta_whatsapp on peserta(whatsapp_number);
create index if not exists idx_musyrif_whatsapp on musyrif(whatsapp_number);
create index if not exists idx_koordinator_whatsapp on koordinator(whatsapp_number);

comment on column peserta.password_hash is 'bcrypt hash. Default semua peserta: "maahir123" — peserta diharapkan ganti via /akun.';

-- ========== 0003_v2_hierarchy_and_cycle.sql ==========
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

-- ========== 0004_matrix_skill_guru.sql ==========
-- =====================================================================
-- Matrix Skill Guru HITS — New role tables, attendance, assessment,
-- observation, tabayyun, teguran, and matrix rekap
-- =====================================================================
-- Adds 5 new roles: pengajar, koordinator_hits, ketua_kelas,
-- koordinator_ketua_kelas (+ ketua kelompok = pengajar.is_ketua).
-- Supports multi-role login via WA number.
-- =====================================================================

-- ---------- Enum types ----------

create type kondisi_kelas as enum ('KBBS', 'KMT', 'JKG', 'KBLA', 'LIBUR');
create type status_latihan as enum ('TAL', 'PTML', 'SML');
create type status_checkin as enum ('hadir', 'izin', 'sakit');
create type jenis_alasan as enum ('terlambat', 'alpa');
create type status_pengajuan as enum ('pending', 'accepted', 'rejected');
create type status_tabayyun as enum ('pending', 'awaiting_reason', 'decided');

-- ---------- Role tables ----------

create table kelompok_pengajar (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender gender not null,
  created_at timestamptz not null default now()
);

create table pengajar (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender gender not null,
  whatsapp_number text not null,
  password_hash text not null,
  kelompok_id uuid not null references kelompok_pengajar(id),
  is_ketua boolean not null default false,
  musyrif_id uuid references musyrif(id),
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_pengajar_wa on pengajar(whatsapp_number);
create index idx_pengajar_kelompok on pengajar(kelompok_id);
create index idx_pengajar_gender on pengajar(gender);

comment on table pengajar is 'Guru HITS yang dinilai. is_ketua=true → ketua kelompok pengajar.';
comment on column pengajar.musyrif_id is 'Link ke musyrif di 2in1 jika orang yang sama (untuk feed skor tajwid).';

create table koordinator_hits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender gender not null,
  whatsapp_number text not null,
  password_hash text not null,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_koordinator_hits_wa on koordinator_hits(whatsapp_number);

comment on table koordinator_hits is 'Koordinator pengajar HITS. Ikhwan: Abdul Muhsin, Aisyah Shofia Safitri. Akhwat: Salma, Wildatun, Radiatam.';

create table kelas_hits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender gender not null,
  pengajar_id uuid not null references pengajar(id),
  jadwal_hari text,
  jadwal_waktu_mulai time,
  jadwal_waktu_selesai time,
  created_at timestamptz not null default now()
);

create index idx_kelas_hits_pengajar on kelas_hits(pengajar_id);

comment on table kelas_hits is 'Kelas HITS dengan jadwal per-kelas (bervariasi). Satu pengajar bisa pegang >1 kelas.';

create table ketua_kelas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender gender not null,
  whatsapp_number text not null,
  password_hash text not null,
  kelas_hits_id uuid not null references kelas_hits(id),
  magic_token text,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_ketua_kelas_wa on ketua_kelas(whatsapp_number);
create unique index idx_ketua_kelas_magic on ketua_kelas(magic_token) where magic_token is not null;

comment on table ketua_kelas is 'Ketua kelas peserta HITS yang mengobservasi kondisi pengajar.';
comment on column ketua_kelas.magic_token is 'Token untuk magic-link login tanpa password (dikirim via wa.me).';

create table koordinator_ketua_kelas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender gender not null,
  whatsapp_number text not null,
  password_hash text not null,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_koor_kk_wa on koordinator_ketua_kelas(whatsapp_number);

comment on table koordinator_ketua_kelas is 'Koordinator ketua kelas. 1 ikhwan, 1 akhwat.';

-- ---------- Attendance tables ----------

create table program_kehadiran (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hari text[] not null,
  waktu_mulai time not null,
  waktu_selesai time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table program_kehadiran is 'Program pengembangan guru: Kajian At-Tibyan (Sabtu), Muallim Najih (Jumat). Kelas Maahir pakai jadwal per kelas_hits.';

create table checkin_pengajar (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references pengajar(id),
  program_id uuid references program_kehadiran(id),
  kelas_hits_id uuid references kelas_hits(id),
  tanggal date not null,
  status status_checkin not null,
  checked_in_at timestamptz not null default now(),
  is_terlambat boolean not null default false,
  invalidated_by uuid references pengajar(id),
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_checkin_source check (
    (program_id is not null and kelas_hits_id is null) or
    (program_id is null and kelas_hits_id is not null)
  )
);

create unique index idx_checkin_pengajar_program
  on checkin_pengajar(pengajar_id, program_id, tanggal)
  where program_id is not null;
create unique index idx_checkin_pengajar_kelas
  on checkin_pengajar(pengajar_id, kelas_hits_id, tanggal)
  where kelas_hits_id is not null;
create index idx_checkin_tanggal on checkin_pengajar(tanggal desc);

comment on table checkin_pengajar is 'Check-in kehadiran pengajar. program_id untuk At-Tibyan/Muallim Najih, kelas_hits_id untuk Kelas Maahir.';

create table pengajuan_alasan (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references pengajar(id),
  program_id uuid references program_kehadiran(id),
  kelas_hits_id uuid references kelas_hits(id),
  tanggal date not null,
  jenis jenis_alasan not null,
  alasan text not null,
  status status_pengajuan not null default 'pending',
  decided_by uuid references pengajar(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_pengajuan_pending on pengajuan_alasan(status) where status = 'pending';
create index idx_pengajuan_pengajar on pengajuan_alasan(pengajar_id);

comment on table pengajuan_alasan is 'Pengajuan alasan terlambat/alpa ke ketua kelompok pengajar.';

create table libur_program (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references program_kehadiran(id),
  kelas_hits_id uuid references kelas_hits(id),
  tanggal date not null,
  gender gender,
  keterangan text,
  created_by_id uuid,
  created_at timestamptz not null default now()
);

create unique index idx_libur_program_unique
  on libur_program(coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
                   coalesce(kelas_hits_id, '00000000-0000-0000-0000-000000000000'::uuid),
                   tanggal, coalesce(gender, 'ikhwan'));

comment on table libur_program is 'Pengumuman libur program. program_id untuk At-Tibyan/Muallim Najih, kelas_hits_id untuk Kelas Maahir tertentu.';

-- ---------- Assessment tables ----------

create table penilaian_masyaikh (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references pengajar(id),
  year_month text not null,
  skor_bacaan smallint check (skor_bacaan between 0 and 4),
  keterangan_bacaan text,
  skor_hafalan smallint check (skor_hafalan between 0 and 4),
  keterangan_hafalan text,
  assessor_role text not null check (assessor_role in ('syaikh', 'koordinator_hits')),
  assessor_id uuid not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (pengajar_id, year_month)
);

create index idx_penilaian_masyaikh_month on penilaian_masyaikh(year_month);

create trigger trg_penilaian_masyaikh_updated_at
  before update on penilaian_masyaikh
  for each row execute function set_updated_at();

comment on table penilaian_masyaikh is 'Penilaian Kualitas Bacaan dan Hafalan oleh Syaikh/Koordinator HITS. Bulanan, carry-forward jika tidak diupdate.';

create table penilaian_pedagogis (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references pengajar(id),
  year_month text not null,
  skor_metode_pengajaran smallint check (skor_metode_pengajaran between 0 and 4),
  keterangan_metode text,
  skor_kepatuhan_silabus smallint check (skor_kepatuhan_silabus between 0 and 4),
  keterangan_silabus text,
  skor_manajemen_halaqah smallint check (skor_manajemen_halaqah between 0 and 4),
  keterangan_halaqah text,
  skor_evaluasi_penguasaan smallint check (skor_evaluasi_penguasaan between 0 and 4),
  keterangan_evaluasi text,
  assessed_by uuid not null references pengajar(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (pengajar_id, year_month)
);

create index idx_penilaian_pedagogis_month on penilaian_pedagogis(year_month);

create trigger trg_penilaian_pedagogis_updated_at
  before update on penilaian_pedagogis
  for each row execute function set_updated_at();

comment on table penilaian_pedagogis is 'Penilaian pedagogis oleh ketua kelompok pengajar. 4 indikator, bulanan.';

-- ---------- Observation tables ----------

create table observasi_kelas (
  id uuid primary key default gen_random_uuid(),
  kelas_hits_id uuid not null references kelas_hits(id),
  ketua_kelas_id uuid not null references ketua_kelas(id),
  tanggal date not null,
  kondisi kondisi_kelas not null,
  pengajar_on_cam boolean,
  latihan_mandiri_diberikan boolean,
  status_latihan_val status_latihan,
  semua_siswa_selesai_latihan boolean,
  catatan text,
  created_at timestamptz not null default now(),
  unique (kelas_hits_id, tanggal)
);

create index idx_observasi_tanggal on observasi_kelas(tanggal desc);
create index idx_observasi_kondisi on observasi_kelas(kondisi) where kondisi != 'KBBS';

comment on table observasi_kelas is 'Observasi kondisi kelas oleh ketua kelas. 1 per kelas per hari.';

create table tabayyun (
  id uuid primary key default gen_random_uuid(),
  observasi_id uuid not null references observasi_kelas(id),
  pengajar_id uuid not null references pengajar(id),
  koordinator_kk_id uuid not null references koordinator_ketua_kelas(id),
  alasan_pengajar text,
  alasan_submitted_at timestamptz,
  is_udzur_syari boolean,
  keputusan_catatan text,
  decided_at timestamptz,
  status status_tabayyun not null default 'pending',
  deadline_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now()
);

create index idx_tabayyun_status on tabayyun(status) where status != 'decided';
create index idx_tabayyun_pengajar on tabayyun(pengajar_id);
create index idx_tabayyun_deadline on tabayyun(deadline_at) where status = 'pending';

comment on table tabayyun is 'Alur klarifikasi ketika kondisi kelas bukan KBBS. Timeout 48 jam.';

create table teguran (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references pengajar(id),
  year_month text not null,
  category text not null,
  nomor_teguran smallint not null,
  source_ref_type text,
  source_ref_id uuid,
  keterangan text,
  issued_by_role text not null,
  issued_by_id uuid not null,
  created_at timestamptz not null default now()
);

create index idx_teguran_pengajar on teguran(pengajar_id);
create index idx_teguran_month on teguran(year_month);
create index idx_teguran_category on teguran(pengajar_id, category);

comment on table teguran is 'Teguran ke pengajar. Per-kategori untuk skala indikator, GLOBAL (count semua) untuk nonaktifasi (4 teguran).';
comment on column teguran.category is 'kedisiplinan_waktu, komitmen_jadwal, tanggung_jawab, kepatuhan_sop, dll';

create table jadwal_pindah (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references pengajar(id),
  kelas_hits_id uuid not null references kelas_hits(id),
  tanggal_asal date not null,
  tanggal_pengganti date,
  waktu_pengganti_mulai time,
  waktu_pengganti_selesai time,
  alasan text,
  reported_at_checkin boolean not null default false,
  semua_siswa_hadir_pengganti boolean,
  follow_up_selesai boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_jadwal_pindah_pengajar on jadwal_pindah(pengajar_id);

comment on table jadwal_pindah is 'Record pindah jadwal kelas. Cross-reference dengan observasi JKG.';

-- ---------- Matrix rekap ----------

create table matrix_rekap (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references pengajar(id),
  year_month text not null,
  -- A. Hard Skill (standar bervariasi!)
  skor_bacaan smallint check (skor_bacaan between 0 and 4),
  skor_hafalan smallint check (skor_hafalan between 0 and 4),
  skor_tajwid smallint check (skor_tajwid between 0 and 4),
  skor_kehadiran_maahir smallint check (skor_kehadiran_maahir between 0 and 4),
  skor_kehadiran_tibyan smallint check (skor_kehadiran_tibyan between 0 and 4),
  skor_kehadiran_muallim smallint check (skor_kehadiran_muallim between 0 and 4),
  rata_rata_hard_skill numeric(3,2),
  -- B. Pedagogis (standar: 4)
  skor_metode_pengajaran smallint check (skor_metode_pengajaran between 0 and 4),
  skor_kepatuhan_silabus smallint check (skor_kepatuhan_silabus between 0 and 4),
  skor_manajemen_halaqah smallint check (skor_manajemen_halaqah between 0 and 4),
  skor_evaluasi_penguasaan smallint check (skor_evaluasi_penguasaan between 0 and 4),
  rata_rata_pedagogis numeric(3,2),
  -- C. Soft Skill (standar: 4)
  skor_kedisiplinan_waktu smallint check (skor_kedisiplinan_waktu between 0 and 4),
  skor_komitmen_jadwal smallint check (skor_komitmen_jadwal between 0 and 4),
  skor_tanggung_jawab smallint check (skor_tanggung_jawab between 0 and 4),
  skor_kepatuhan_sop smallint check (skor_kepatuhan_sop between 0 and 4),
  rata_rata_soft_skill numeric(3,2),
  -- Agregat
  rata_rata_keseluruhan numeric(3,2),
  ranking smallint,
  total_teguran_bulan smallint not null default 0,
  total_teguran_kumulatif smallint not null default 0,
  finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (pengajar_id, year_month)
);

create index idx_matrix_rekap_month on matrix_rekap(year_month);
create index idx_matrix_rekap_ranking on matrix_rekap(year_month, ranking);

create trigger trg_matrix_rekap_updated_at
  before update on matrix_rekap
  for each row execute function set_updated_at();

comment on table matrix_rekap is 'Snapshot bulanan matrix skill guru. Idempotent, aman di-generate ulang.';
comment on column matrix_rekap.skor_bacaan is 'Standar: 3';
comment on column matrix_rekap.skor_hafalan is 'Standar: 1';
comment on column matrix_rekap.skor_tajwid is 'Standar: 2';

-- ---------- Reference: standar per indikator ----------

create table indikator_standar (
  kode text primary key,
  nama text not null,
  kategori text not null,
  standar smallint not null check (standar between 0 and 4)
);

insert into indikator_standar (kode, nama, kategori, standar) values
  ('bacaan',            'Kualitas Bacaan',              'hard_skill', 3),
  ('hafalan',           'Hafalan (Tahfidz)',            'hard_skill', 1),
  ('tajwid',            'Tajwid',                       'hard_skill', 2),
  ('kehadiran_maahir',  'Kehadiran Kelas Maahir',       'hard_skill', 4),
  ('kehadiran_tibyan',  'Kehadiran Kajian At-Tibyan',   'hard_skill', 4),
  ('kehadiran_muallim', 'Kehadiran Program Muallim Najih', 'hard_skill', 4),
  ('metode_pengajaran', 'Metode Pengajaran Modul',      'pedagogis', 4),
  ('kepatuhan_silabus', 'Kepatuhan Silabus',            'pedagogis', 4),
  ('manajemen_halaqah', 'Manajemen Halaqah',            'pedagogis', 4),
  ('evaluasi_penguasaan','Evaluasi & Penguasaan',       'pedagogis', 4),
  ('kedisiplinan_waktu','Kedisiplinan Waktu',           'soft_skill', 4),
  ('komitmen_jadwal',   'Komitmen Jadwal & Kehadiran',  'soft_skill', 4),
  ('tanggung_jawab',    'Tanggung Jawab & Keadilan',    'soft_skill', 4),
  ('kepatuhan_sop',     'Kepatuhan SOP Teknis',         'soft_skill', 4);

comment on table indikator_standar is 'Standar skala per indikator. Bacaan=3, Hafalan=1, Tajwid=2, sisanya=4.';

-- ---------- Audit log ----------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_role text not null,
  actor_id uuid not null,
  action text not null,
  target_table text,
  target_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_log_created on audit_log(created_at desc);
create index idx_audit_log_target on audit_log(target_table, target_id);

comment on table audit_log is 'Audit trail untuk keputusan tabayyun, teguran, dan perubahan penilaian.';

-- ========== 0005_enable_rls_all_tables.sql ==========
-- Enable Row Level Security on all public tables.
-- All app queries use service_role (bypasses RLS).
-- This blocks unauthorized access via the public anon key.

-- Existing tables (migrations 0001-0003)
ALTER TABLE public.musyrif ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.koordinator ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peserta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setoran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rekaman ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syaikh ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setoran_musyrif ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rekaman_musyrif ENABLE ROW LEVEL SECURITY;

-- HITS Matrix tables (migration 0004)
ALTER TABLE public.kelompok_pengajar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengajar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.koordinator_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kelas_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ketua_kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.koordinator_ketua_kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_kehadiran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_pengajar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengajuan_alasan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.libur_program ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penilaian_masyaikh ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penilaian_pedagogis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observasi_kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabayyun ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teguran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jadwal_pindah ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matrix_rekap ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indikator_standar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ========== 0006_fix_checkin_upsert.sql ==========
-- Fix: partial unique index tidak bisa di-match oleh ON CONFLICT.
-- Ganti dengan full unique index (NULLS DISTINCT default = aman).

drop index if exists idx_checkin_pengajar_program;
drop index if exists idx_checkin_pengajar_kelas;

create unique index idx_checkin_pengajar_program
  on checkin_pengajar(pengajar_id, program_id, tanggal);

create unique index idx_checkin_pengajar_kelas
  on checkin_pengajar(pengajar_id, kelas_hits_id, tanggal);

-- ========== 0007_ketua_kelas_election.sql ==========
-- =====================================================================
-- Pemilihan Ketua Kelas via Check-in Pengajar (pekan 1-2 batch)
-- =====================================================================

-- 1. Ketua kelas bisa login tanpa password (magic-link only)
alter table ketua_kelas alter column password_hash drop not null;

-- 2. Tabel konfigurasi batch
create table batch_config (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  created_at timestamptz not null default now()
);

comment on table batch_config is 'Konfigurasi batch/angkatan HITS. start_date digunakan untuk menghitung pekan.';

-- Seed batch awal
insert into batch_config (name, start_date) values ('Batch 4', '2026-06-01');

-- 3. Relasi batch ke ketua_kelas
alter table ketua_kelas add column batch_id uuid references batch_config(id);

-- 4. Unique constraint: satu ketua aktif per kelas per batch
create unique index idx_ketua_kelas_active_batch
  on ketua_kelas(kelas_hits_id, batch_id) where active = true;

-- 5. Link grup WA di koordinator_ketua_kelas
alter table koordinator_ketua_kelas add column link_grup_wa text;

comment on column koordinator_ketua_kelas.link_grup_wa is 'Link grup WhatsApp yang dikirim ke ketua kelas baru.';

-- 6. RLS
alter table batch_config enable row level security;

-- ========== 0008_shakwa.sql ==========
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

-- ========== 0009_sync_password_hashes.sql ==========
-- One-time migration: sync password_hash across all role tables for multi-role users
-- Problem: tables were seeded separately with different default passwords,
-- so multi-role users can only login to the role whose hash matches.
-- Solution: pick the "correct" hash (from most recent login) and sync to all tables.

DO $$
DECLARE
  _wa TEXT;
  _hash TEXT;
BEGIN
  -- Create temp table with the correct hash per WA number
  CREATE TEMP TABLE _final_hash (whatsapp_number TEXT PRIMARY KEY, password_hash TEXT NOT NULL);

  -- Step 1: For users who have logged in, use hash from the table with the most recent last_login_at
  INSERT INTO _final_hash (whatsapp_number, password_hash)
  SELECT DISTINCT ON (whatsapp_number) whatsapp_number, password_hash
  FROM (
    SELECT whatsapp_number, password_hash, last_login_at FROM musyrif WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM koordinator WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM syaikh WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM pengajar WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM koordinator_hits WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM ketua_kelas WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM koordinator_ketua_kelas WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
  ) t
  ORDER BY whatsapp_number, last_login_at DESC;

  -- Step 2: Fallback for users who never logged in — use pengajar hash (primary HITS role)
  INSERT INTO _final_hash (whatsapp_number, password_hash)
  SELECT whatsapp_number, password_hash
  FROM pengajar
  WHERE active=true AND password_hash IS NOT NULL
  AND whatsapp_number NOT IN (SELECT whatsapp_number FROM _final_hash)
  ON CONFLICT DO NOTHING;

  -- Step 3: Update all 8 tables
  UPDATE peserta SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE peserta.whatsapp_number = f.whatsapp_number
  AND peserta.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE musyrif SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE musyrif.whatsapp_number = f.whatsapp_number
  AND musyrif.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE koordinator SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE koordinator.whatsapp_number = f.whatsapp_number
  AND koordinator.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE syaikh SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE syaikh.whatsapp_number = f.whatsapp_number
  AND syaikh.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE pengajar SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE pengajar.whatsapp_number = f.whatsapp_number
  AND pengajar.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE koordinator_hits SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE koordinator_hits.whatsapp_number = f.whatsapp_number
  AND koordinator_hits.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE ketua_kelas SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE ketua_kelas.whatsapp_number = f.whatsapp_number
  AND ketua_kelas.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE koordinator_ketua_kelas SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE koordinator_ketua_kelas.whatsapp_number = f.whatsapp_number
  AND koordinator_ketua_kelas.password_hash IS DISTINCT FROM f.password_hash;

  DROP TABLE _final_hash;
END $$;

-- ========== 0010_password_reset_requests.sql ==========
-- Tabel permintaan reset password
-- Flow: user lupa password → submit /lupa-password → kirim wa.me ke TS dengan link proses
-- TS buka link → guard cek WA = ADMIN_WA → Accept (generate password baru) / Decline

CREATE TABLE password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number text NOT NULL,
  requester_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  decided_by_wa text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prr_status ON password_reset_requests(status, created_at DESC);
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
-- Tidak ada policy public. App pakai service_role.

-- ========== 0011_session_log.sql ==========
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

-- ========== 0012_checkout_at.sql ==========
-- 0012: Checkout pengajar tracking
-- Tujuan: hitung durasi mengajar (checkout_at - checked_in_at) per hari.
-- Saat ini hanya checked_in_at yang tercatat — tidak ada ujung sesi.

alter table checkin_pengajar add column if not exists checkout_at timestamptz;

comment on column checkin_pengajar.checkout_at is 'Waktu pengajar menyelesaikan sesi (tombol Selesai mengajar). Nullable.';

-- ========== 0013_wa_reminder_log.sql ==========
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

-- ========== 0014_koordinator_notes.sql ==========
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

-- ========== 0015_audit_attribution.sql ==========
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

-- ========== 0016_password_reset_plaintext.sql ==========
-- 0016: Password reset plaintext recovery
-- Tujuan: admin (Hilmi) bisa re-show password sementara dalam 24 jam kalau
-- lupa kirim WA atau tutup tab terlalu cepat. Sebelumnya plaintext cuma di
-- in-memory React state — kalau revalidate jalan, state hilang & password
-- tidak bisa di-recover.
-- Idempotent: aman di-rerun.

alter table password_reset_requests
  add column if not exists new_password_plaintext text,
  add column if not exists plaintext_expires_at timestamptz;

create index if not exists idx_prr_plaintext_expiry
  on password_reset_requests(plaintext_expires_at)
  where new_password_plaintext is not null;

comment on column password_reset_requests.new_password_plaintext is
  'Plaintext password sementara. TTL 24 jam supaya admin bisa re-show. Wajib di-clear lewat tombol "Tandai sudah dikirim" atau natural expiry.';
comment on column password_reset_requests.plaintext_expires_at is
  'Kapan plaintext password tidak boleh ditampilkan lagi (default now + 24 jam saat accept).';

-- ========== 0017_penilaian_peserta.sql ==========
-- Penilaian bacaan + hafalan per peserta per bulan
-- Input oleh koordinator 2in1 atau syaikh
-- Kontribusi ke hard skill di Matrix Skill Guru

CREATE TABLE penilaian_peserta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peserta_id     uuid NOT NULL REFERENCES peserta(id) ON DELETE CASCADE,
  year_month     text NOT NULL,              -- format 'YYYY-MM', mis '2026-06'
  skor_bacaan    smallint CHECK (skor_bacaan BETWEEN 0 AND 4),
  ket_bacaan     text,
  skor_hafalan   smallint CHECK (skor_hafalan BETWEEN 0 AND 4),
  ket_hafalan    text,
  assessor_role  text NOT NULL CHECK (assessor_role IN ('koordinator', 'syaikh')),
  assessor_id    uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (peserta_id, year_month)
);

CREATE INDEX penilaian_peserta_year_month_idx ON penilaian_peserta (year_month);
CREATE INDEX penilaian_peserta_peserta_id_idx ON penilaian_peserta (peserta_id);

-- RLS: hanya koordinator/syaikh bisa select/insert/update via service role
-- (app pakai supabaseAdmin, RLS tidak diaktifkan di sini)

-- ========== 0018_kelas_ketua_jadwal.sql ==========
-- Ketua kelas 2in1 + jadwal reguler per kelas

ALTER TABLE kelas
  ADD COLUMN IF NOT EXISTS ketua_peserta_id uuid REFERENCES peserta(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wakil_ketua_peserta_id uuid REFERENCES peserta(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jadwal_hari text[] DEFAULT '{}',         -- ['Senin','Kamis']
  ADD COLUMN IF NOT EXISTS jadwal_waktu_mulai time,
  ADD COLUMN IF NOT EXISTS jadwal_waktu_selesai time;

CREATE INDEX kelas_ketua_peserta_id_idx ON kelas (ketua_peserta_id) WHERE ketua_peserta_id IS NOT NULL;

-- ========== 0019_pertemuan_kehadiran.sql ==========
-- Pertemuan program (Kelas Maahir / Muallim Najih / At-Tibyan)
-- Ketua kelas 2in1 membuat pertemuan dan mengisi kehadiran

CREATE TABLE pertemuan_program (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kelas_id        uuid NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
  program         text NOT NULL DEFAULT 'kelas_maahir',
  -- 'kelas_maahir' | 'muallim_najih' | 'at_tibyan'
  tanggal         date NOT NULL,
  nama_kegiatan   text NOT NULL,
  waktu_mulai     time,
  waktu_selesai   time,
  keterangan      text,
  created_by      uuid REFERENCES peserta(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kelas_id, program, tanggal)
);

CREATE INDEX pertemuan_program_kelas_tanggal_idx ON pertemuan_program (kelas_id, tanggal);
CREATE INDEX pertemuan_program_tanggal_idx ON pertemuan_program (tanggal);

-- Kehadiran per peserta per pertemuan
CREATE TABLE kehadiran_peserta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pertemuan_id    uuid NOT NULL REFERENCES pertemuan_program(id) ON DELETE CASCADE,
  peserta_id      uuid NOT NULL REFERENCES peserta(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'tidak_ada_keterangan',
  -- 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan'
  catatan         text,
  diisi_oleh      uuid REFERENCES peserta(id) ON DELETE SET NULL,
  diisi_at        timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pertemuan_id, peserta_id)
);

CREATE INDEX kehadiran_peserta_pertemuan_idx ON kehadiran_peserta (pertemuan_id);
CREATE INDEX kehadiran_peserta_peserta_idx ON kehadiran_peserta (peserta_id);

-- ========== 0020_program_kelas.sql ==========
-- Kelas program Maahir (grouping kehadiran) — BEDA dari kelas setoran 2in1.
-- Anggota lintas kelas setoran; ketua bisa peserta/musyrif/koordinator,
-- jadi identifikasi ketua pakai nomor WA (bukan FK peserta).

CREATE TABLE program_kelas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  gender          text NOT NULL CHECK (gender IN ('ikhwan', 'akhwat')),
  jadwal_hari     text[] DEFAULT '{}',     -- ['Senin','Kamis']
  waktu_mulai     time,
  waktu_selesai   time,
  ketua_wa        text,                    -- normalized 62xxx
  wakil_wa        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE program_kelas_anggota (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_kelas_id  uuid NOT NULL REFERENCES program_kelas(id) ON DELETE CASCADE,
  peserta_id        uuid REFERENCES peserta(id) ON DELETE SET NULL,
  name              text NOT NULL,
  whatsapp_number   text,                  -- normalized 62xxx
  is_ketua          boolean NOT NULL DEFAULT false,
  is_wakil          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_kelas_id, whatsapp_number)
);

CREATE INDEX program_kelas_anggota_kelas_idx ON program_kelas_anggota (program_kelas_id);

-- Repoint pertemuan + kehadiran ke program_kelas/anggota
ALTER TABLE pertemuan_program
  ADD COLUMN program_kelas_id uuid REFERENCES program_kelas(id) ON DELETE CASCADE,
  ALTER COLUMN kelas_id DROP NOT NULL;

ALTER TABLE pertemuan_program DROP CONSTRAINT pertemuan_program_kelas_id_program_tanggal_key;
-- Non-partial supaya PostgREST onConflict bisa infer index (NULL tidak konflik)
CREATE UNIQUE INDEX pertemuan_program_pk_program_tanggal_key
  ON pertemuan_program (program_kelas_id, program, tanggal);

ALTER TABLE kehadiran_peserta
  ADD COLUMN anggota_id uuid REFERENCES program_kelas_anggota(id) ON DELETE CASCADE,
  ALTER COLUMN peserta_id DROP NOT NULL;

ALTER TABLE kehadiran_peserta DROP CONSTRAINT kehadiran_peserta_pertemuan_id_peserta_id_key;
CREATE UNIQUE INDEX kehadiran_peserta_pertemuan_anggota_key
  ON kehadiran_peserta (pertemuan_id, anggota_id);

-- ========== 0021_pedagogis_sop.sql ==========
-- Kepatuhan SOP Teknis: input manual ketua kelompok, satu form dengan
-- penilaian pedagogis (kontribusi ke soft skill di matrix).

ALTER TABLE penilaian_pedagogis
  ADD COLUMN IF NOT EXISTS skor_kepatuhan_sop smallint CHECK (skor_kepatuhan_sop BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS keterangan_sop text;

-- ========== 0022_hits_softskill.sql ==========
-- =====================================================================
-- Kontribusi Soft Skill — Matrix Skill Guru HITS (batch-native)
-- =====================================================================
-- Fresh, spreadsheet-driven HITS observation subsystem. Replaces the
-- single-cohort kelas_hits/observasi_kelas flow (those tables are kept
-- but no longer feed the matrix). New hits_* tables model the kaldik
-- (academic calendar) + presensi spreadsheets, with batches + 2 levels.
--
-- Data sources (publish-to-web CSV, no service account):
--   * Kaldik: 1 sheet, 1 tab/batch, 2 levels (QN | PB) side-by-side.
--   * Presensi: 1 sheet/batch, 1 tab/halaqah (nama halaqah, jadwal,
--     nama guru, daftar peserta). No phone numbers anywhere.
--
-- Soft-skill wiring (matrix-compute.ts):
--   * % KBBS days        -> skor_kedisiplinan_waktu
--   * % latihan-done days -> skor_tanggung_jawab (was always null)
-- Pengajar link to existing pengajar table by whatsapp_number (entered
-- by koordinator during validation).
-- =====================================================================

-- ---------- Enum types (namespaced hits_ to avoid clashing with the
--            retired kondisi_kelas/status_latihan/status_tabayyun) ----------

create type hits_level as enum ('qoidah_nuroniyyah', 'perbaikan_bacaan');
create type hits_kondisi as enum ('KBBS', 'KMT', 'JKG', 'KBLA', 'LIBUR');
create type hits_status_latihan as enum ('TAL', 'PTML', 'SML');
create type hits_source as enum ('sheet', 'manual');
create type hits_status_tabayyun as enum ('pending', 'awaiting_reason', 'decided');

-- ---------- Batch ----------

create table hits_batch (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- == kaldik tab title, e.g. "HITS Offline & Online Januari 2026"
  slug text not null unique,          -- "hits-offline-online-jan-2026"
  start_date date not null,           -- pekan-1 Monday (reference; per-level dates live in hits_kaldik_pertemuan)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table hits_batch is 'Satu batch/angkatan HITS = satu tab di spreadsheet kaldik.';

-- ---------- Kaldik: grid pekan x tanggal per (batch, level) ----------
-- Satu baris per tanggal kalender. pertemuan_no TIDAK disimpan di sini —
-- ia diturunkan per-halaqah dari jadwal (sesi ke-1 pekan = 2*pekan-1, dst).

create table hits_kaldik_hari (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references hits_batch(id) on delete cascade,
  level hits_level not null,
  tanggal date not null,
  hari text not null,                 -- 'Senin' ...
  pekan smallint check (pekan between 1 and 40),  -- carry-forward dari kolom Pekan (relax 13->40 di 0045)
  is_libur boolean not null default false,
  libur_note text,
  source hits_source not null default 'sheet',
  created_at timestamptz not null default now(),
  unique (batch_id, level, tanggal)
);

create index idx_hits_kaldik_batch_level on hits_kaldik_hari(batch_id, level, tanggal);

comment on table hits_kaldik_hari is 'Kaldik per batch+level, satu baris per tanggal. pekan di-carry-forward dari kolom Pekan (hanya terisi di baris Senin di sheet).';

-- ---------- Halaqah: one row per presensi tab ----------

create table hits_halaqah (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references hits_batch(id) on delete cascade,
  level hits_level,                   -- tagged by koordinator; null until tagged
  name text not null,                 -- "HITS 059 IKHWAN APRIL" (sheet NAMA HALAQAH)
  sheet_gid text,                     -- presensi tab gid (null if manual)
  jadwal_raw text,                    -- "Online Senin & Rabu 20:00 - 21:30 WIB"
  jadwal_hari text[] not null default '{}',
  waktu_mulai time,
  waktu_selesai time,
  gender gender,
  pengajar_nama_sheet text,           -- "Ustadz Adiba Aziz Safitri" raw
  pengajar_id uuid references pengajar(id),  -- linked via WA entered by koordinator
  pengajar_wa text,                   -- normalized 62xxx
  source hits_source not null default 'sheet',
  active boolean not null default true,   -- false = sheet-absent on last sync
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, name)
);

create index idx_hits_halaqah_batch on hits_halaqah(batch_id);
create index idx_hits_halaqah_pengajar on hits_halaqah(pengajar_id);

create trigger trg_hits_halaqah_updated
  before update on hits_halaqah
  for each row execute function set_updated_at();

comment on column hits_halaqah.pengajar_id is 'Link ke pengajar (matrix) via WA yang diinput koordinator. null bila pengajar belum terdaftar.';

-- ---------- Halaqah peserta: one row per presensi data row ----------

create table hits_halaqah_peserta (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  murid_id text,                      -- "I26040155" stable key (null for manual rows)
  nama text not null,
  jenis_kelamin text,
  status_peserta text,                -- "Aktif" / "Non-Aktif"
  is_ketua boolean not null default false,
  ketua_wa text,                      -- normalized 62xxx, set when elected
  source hits_source not null default 'sheet',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (halaqah_id, murid_id)       -- nulls distinct -> manual rows exempt
);

create index idx_hits_peserta_halaqah on hits_halaqah_peserta(halaqah_id);
create unique index idx_hits_peserta_one_ketua on hits_halaqah_peserta(halaqah_id) where is_ketua = true;

create trigger trg_hits_peserta_updated
  before update on hits_halaqah_peserta
  for each row execute function set_updated_at();

-- ---------- Keterangan harian (the daily fill) ----------

create table hits_keterangan_harian (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  pertemuan_no smallint not null,
  tanggal date not null,
  kondisi hits_kondisi not null,
  terlambat boolean not null default false,
  latihan_diberikan boolean,
  status_latihan hits_status_latihan,
  semua_selesai boolean,
  catatan text,
  diisi_by_role text not null,        -- 'ketua_kelas' | 'koordinator_ketua_kelas'
  diisi_by_id uuid not null,
  editable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (halaqah_id, pertemuan_no)
);

create index idx_hits_ket_halaqah_tanggal on hits_keterangan_harian(halaqah_id, tanggal);
create index idx_hits_ket_non_kbbs on hits_keterangan_harian(kondisi) where kondisi <> 'KBBS';

create trigger trg_hits_ket_updated
  before update on hits_keterangan_harian
  for each row execute function set_updated_at();

comment on table hits_keterangan_harian is 'Keterangan pengajar + latihan mandiri per pertemuan. Editable utk semua pertemuan lampau. tanggal = override-able mapping.';

-- ---------- Tabayyun (clarification when kondisi != KBBS) ----------

create table hits_tabayyun (
  id uuid primary key default gen_random_uuid(),
  keterangan_id uuid not null references hits_keterangan_harian(id) on delete cascade,
  halaqah_id uuid not null references hits_halaqah(id),
  pengajar_id uuid references pengajar(id),
  koordinator_kk_id uuid references koordinator_ketua_kelas(id),
  kondisi hits_kondisi not null,
  alasan_pengajar text,
  alasan_submitted_at timestamptz,
  is_udzur_syari boolean,
  keputusan_catatan text,
  decided_at timestamptz,
  status hits_status_tabayyun not null default 'pending',
  deadline_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now(),
  unique (keterangan_id)
);

create index idx_hits_tabayyun_open on hits_tabayyun(status) where status <> 'decided';
create index idx_hits_tabayyun_pengajar on hits_tabayyun(pengajar_id);

-- ---------- Teguran (warnings) ----------

create table hits_teguran (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references pengajar(id),
  year_month text not null,
  category text not null,             -- 'kedisiplinan_waktu' | 'tanggung_jawab' | ...
  nomor_teguran smallint not null,    -- running count per pengajar
  source_ref_type text,               -- 'hits_tabayyun' | 'hits_keterangan_harian'
  source_ref_id uuid,
  keterangan text,
  issued_by_role text not null,
  issued_by_id uuid not null,
  created_at timestamptz not null default now()
);

create index idx_hits_teguran_pengajar on hits_teguran(pengajar_id);
create index idx_hits_teguran_month on hits_teguran(year_month);

-- ---------- Sheet ingestion config ----------

create table hits_sheet_source (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references hits_batch(id) on delete cascade,
  kind text not null check (kind in ('kaldik', 'presensi')),
  spreadsheet_id text not null,       -- the /d/<ID>/ part
  gid text,                           -- specific tab gid (kaldik tab, or one presensi tab)
  label text,                         -- human note / halaqah name
  last_synced_at timestamptz,
  last_sync_status text,              -- 'ok' | error message
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_hits_sheet_source_batch on hits_sheet_source(batch_id);

comment on table hits_sheet_source is 'Link spreadsheet kaldik & presensi (publish-to-web). gid manual = otoritatif untuk enumerasi tab presensi.';

-- ---------- Auth: reuse ketua_kelas as login shell for HITS ketua ----------

alter table ketua_kelas add column hits_halaqah_id uuid references hits_halaqah(id);
alter table ketua_kelas add column hits_halaqah_peserta_id uuid references hits_halaqah_peserta(id);
alter table ketua_kelas alter column kelas_hits_id drop not null;

create index idx_ketua_kelas_hits_halaqah on ketua_kelas(hits_halaqah_id);

comment on column ketua_kelas.hits_halaqah_id is 'Set bila ketua kelas ini milik subsistem HITS soft-skill (batch-native). null = ketua kelas observasi lama.';

-- ---------- RLS (service-role bypass; mirror 0005) ----------

alter table hits_batch enable row level security;
alter table hits_kaldik_hari enable row level security;
alter table hits_halaqah enable row level security;
alter table hits_halaqah_peserta enable row level security;
alter table hits_keterangan_harian enable row level security;
alter table hits_tabayyun enable row level security;
alter table hits_teguran enable row level security;
alter table hits_sheet_source enable row level security;

-- ========== 0023_drop_koordinator_hits.sql ==========
-- 0023_drop_koordinator_hits.sql
-- Hapus role login koordinator_hits. Role ini vestigial: auth tidak pernah
-- membuat sesinya dan halaman-halamannya (kehadiran/koordinator, shakwa) sudah dihapus.
-- Koordinasi HITS sekarang sepenuhnya lewat koordinator_ketua_kelas.
--
-- CATATAN: string 'koordinator_hits' TETAP valid sebagai nilai
-- penilaian_masyaikh.assessor_role (lihat 0004) — itu nilai enum kolom untuk
-- domain penilaian masyaikh oleh koordinator setoran, BUKAN tabel role ini.
-- CHECK constraint penilaian_masyaikh sengaja tidak diubah.

-- cascade: ikut menghapus policy RLS (0005) dan FK yang menunjuk tabel ini
-- (mis. libur_program.created_by_id) tanpa menghapus kolomnya.
drop table if exists koordinator_hits cascade;

-- ========== 0024_hits_kaldik_pertemuan.sql ==========
-- =====================================================================
-- HITS: override pertemuan_no <-> tanggal per halaqah
-- =====================================================================
-- Auto-derivation (hits-pertemuan.ts deriveHalaqahPertemuan) memetakan
-- pertemuan_no ke tanggal dari kaldik + jadwal halaqah. Tabel ini menyimpan
-- override manual oleh koordinator ketua kelas bila derivasi salah/anomali
-- (libur dadakan, ganti hari, sesi tambahan). is_skipped meniadakan satu
-- pertemuan dari derivasi. Keyed (halaqah_id, pertemuan_no) — selaras dgn
-- unique key hits_keterangan_harian.
-- =====================================================================

create table hits_kaldik_pertemuan (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  pertemuan_no smallint not null,
  tanggal date not null,
  pekan smallint,
  is_skipped boolean not null default false,
  note text,
  set_by_role text not null,
  set_by_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (halaqah_id, pertemuan_no)
);

create index idx_hits_kaldik_pertemuan_halaqah on hits_kaldik_pertemuan(halaqah_id);

create trigger trg_hits_kaldik_pertemuan_updated
  before update on hits_kaldik_pertemuan
  for each row execute function set_updated_at();

alter table hits_kaldik_pertemuan enable row level security;

comment on table hits_kaldik_pertemuan is 'Override manual pemetaan pertemuan_no->tanggal per halaqah oleh koordinator ketua kelas. is_skipped meniadakan pertemuan dari derivasi otomatis.';

-- ========== 0025_hits_multistage.sql ==========
-- 0025: HITS multi-tahap.
-- Dasar = 2 tahap (Qoidah Nuroniyyah → Perbaikan Bacaan) pada halaqah yang sama.
-- Lanjutan = 1 tahap. Keterangan & override pertemuan kini di-scope per (halaqah, level).

-- Program halaqah.
alter table hits_halaqah add column if not exists program text not null default 'dasar';
comment on column hits_halaqah.program is 'dasar (2 tahap: qoidah_nuroniyyah lalu perbaikan_bacaan) | lanjutan (1 tahap).';
-- Halaqah yang sudah ditag perbaikan_bacaan diperlakukan sebagai program lanjutan.
update hits_halaqah set program = 'lanjutan' where level = 'perbaikan_bacaan';

-- Keterangan harian: tahap (level) yang sedang diisi.
alter table hits_keterangan_harian add column if not exists level hits_level;
update hits_keterangan_harian k set level = h.level
  from hits_halaqah h where h.id = k.halaqah_id and k.level is null and h.level is not null;
alter table hits_keterangan_harian alter column level set not null;
alter table hits_keterangan_harian drop constraint if exists hits_keterangan_harian_halaqah_id_pertemuan_no_key;
alter table hits_keterangan_harian add constraint hits_keterangan_harian_uq unique (halaqah_id, level, pertemuan_no);

-- Override pertemuan: per tahap juga.
alter table hits_kaldik_pertemuan add column if not exists level hits_level;
update hits_kaldik_pertemuan p set level = h.level
  from hits_halaqah h where h.id = p.halaqah_id and p.level is null and h.level is not null;
alter table hits_kaldik_pertemuan alter column level set not null;
alter table hits_kaldik_pertemuan drop constraint if exists hits_kaldik_pertemuan_halaqah_id_pertemuan_no_key;
alter table hits_kaldik_pertemuan add constraint hits_kaldik_pertemuan_uq unique (halaqah_id, level, pertemuan_no);

-- ========== 0025_hits_pertemuan_hapus_request.sql ==========
-- Pengajuan hapus pertemuan (kelebihan/salah) oleh ketua kelas HITS.
-- Ketua mengajukan; koordinator ketua kelas (gender-matched) menyetujui/menolak
-- via magic-link. Approve → tulis override is_skipped di hits_kaldik_pertemuan.

create table hits_pertemuan_hapus_request (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  level text not null check (level in ('qoidah_nuroniyyah', 'perbaikan_bacaan')),
  pertemuan_no smallint not null,
  tanggal date,
  alasan text,
  gender text not null check (gender in ('ikhwan', 'akhwat')),
  requested_by_ketua_id uuid references ketua_kelas(id) on delete set null,
  requested_by_name text not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_role text,
  decided_by_id uuid,
  decided_at timestamptz,
  catatan_koordinator text,
  created_at timestamptz not null default now()
);

create index idx_hits_hapus_req_halaqah on hits_pertemuan_hapus_request (halaqah_id);
create index idx_hits_hapus_req_status on hits_pertemuan_hapus_request (status);

-- Cegah duplikat pengajuan pending utk pertemuan yang sama.
create unique index idx_hits_hapus_req_pending
  on hits_pertemuan_hapus_request (halaqah_id, level, pertemuan_no)
  where status = 'pending';

alter table hits_pertemuan_hapus_request enable row level security;

comment on table hits_pertemuan_hapus_request is
  'Pengajuan ketua kelas untuk menghapus pertemuan kelebihan/salah; disetujui koordinator ketua kelas via magic-link.';

-- ========== 0026_hits_halaqah_pindah_request.sql ==========
-- Pengajuan pemindahan halaqah (transfer pengajar) oleh pengajar HITS.
-- Pengaju (pengajar mana pun) memilih halaqah + pengajar tujuan; tujuan
-- menyetujui via link yang DIGATE login (hanya pengajar tujuan yang bisa
-- approve). Approve → set hits_halaqah.pengajar_id/pengajar_wa/pengajar_nama_sheet
-- ke pengajar tujuan.

create table hits_halaqah_pindah_request (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  batch_id uuid references hits_batch(id) on delete set null,
  requested_by_pengajar_id uuid references pengajar(id) on delete set null,
  requested_by_name text not null,
  requested_by_wa text,
  target_pengajar_id uuid references pengajar(id) on delete set null, -- null bila manual
  target_name text not null,
  target_wa text,                       -- normalized; null bila tujuan tak punya WA
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_role text,
  decided_by_id uuid,
  decided_at timestamptz,
  catatan text,
  created_at timestamptz not null default now()
);

create index idx_hits_pindah_req_halaqah on hits_halaqah_pindah_request (halaqah_id);
create index idx_hits_pindah_req_status on hits_halaqah_pindah_request (status);
create index idx_hits_pindah_req_target on hits_halaqah_pindah_request (target_pengajar_id);

-- Cegah duplikat pengajuan pending untuk satu halaqah.
create unique index idx_hits_pindah_req_pending
  on hits_halaqah_pindah_request (halaqah_id)
  where status = 'pending';

alter table hits_halaqah_pindah_request enable row level security;

comment on table hits_halaqah_pindah_request is
  'Pengajuan pemindahan halaqah antar pengajar HITS; disetujui pengajar tujuan via link yang digate login.';

-- ========== 0027_program_kelas_self_attendance.sql ==========
-- Presensi mandiri per peserta (bukan oleh ketua/wakil) untuk kelas tertentu,
-- mis. Maahir Takhassus Ikhwan. Bila true, presensi diisi tiap peserta via link
-- kelas tanpa login (pilih nama → tandai status sendiri).
alter table program_kelas add column if not exists self_attendance boolean not null default false;
comment on column program_kelas.self_attendance is
  'Bila true, presensi diisi tiap peserta sendiri (link kelas tanpa login), bukan oleh ketua/wakil.';

-- Maahir Takhassus Ikhwan → presensi mandiri.
update program_kelas set self_attendance = true where name = 'Maahir Takhassus Ikhwan';

-- Muallim Najih: dihapus total beserta seluruh data terkait.
delete from kehadiran_peserta where pertemuan_id in (select id from pertemuan_program where program = 'muallim_najih');
delete from pertemuan_program where program = 'muallim_najih';
delete from pengajuan_alasan pa using program_kehadiran pk where pa.program_id = pk.id and pk.name = 'Program Muallim Najih';
delete from checkin_pengajar c using program_kehadiran pk where c.program_id = pk.id and pk.name = 'Program Muallim Najih';
delete from libur_program l using program_kehadiran pk where l.program_id = pk.id and pk.name = 'Program Muallim Najih';
delete from program_kehadiran where name = 'Program Muallim Najih';

-- ========== 0028_program_kelas_presensi_sifat.sql ==========
-- Sifat presensi per kelas program Maahir.
-- 'harian'  : wajib presensi tiap hari jadwal (default, perilaku lama).
-- 'mingguan': cukup hadir 1x per pekan (Senin–Jum'at). Mis. Maahir Alumni/Talaqqi
--             alumni yang talaqqi 1x/pekan tanpa hari tetap.
alter table program_kelas
  add column if not exists presensi_sifat text not null default 'harian'
    check (presensi_sifat in ('harian', 'mingguan'));

update program_kelas set presensi_sifat = 'mingguan'
  where name = 'Maahir Alumni/Talaqqi';

-- ========== 0029_program_kelas_libur.sql ==========
-- Libur kelas Maahir yang diatur Koordinator 2in1 untuk rentang tanggal.
-- program_kelas_id NULL = libur berlaku untuk SEMUA kelas Maahir (mis. hari raya).
-- Tanggal libur dikecualikan dari presensi yang diharapkan (unfilled & rekap).
create table if not exists program_kelas_libur (
  id               uuid primary key default gen_random_uuid(),
  program_kelas_id uuid references program_kelas(id) on delete cascade,
  tanggal_mulai    date not null,
  tanggal_selesai  date not null,
  keterangan       text,
  created_by_id    uuid,
  created_at       timestamptz not null default now(),
  check (tanggal_selesai >= tanggal_mulai)
);

create index if not exists idx_program_kelas_libur_kelas
  on program_kelas_libur (program_kelas_id);
create index if not exists idx_program_kelas_libur_rentang
  on program_kelas_libur (tanggal_mulai, tanggal_selesai);

-- Konsisten dgn tabel lain: RLS on, akses hanya via service role (supabaseAdmin).
alter table program_kelas_libur enable row level security;

-- ========== 0030_ketua_dualrole_request.sql ==========
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

-- ========== 0031_hits_pertemuan_koreksi.sql ==========
-- start_date per-halaqah: derivasi membuang pertemuan ber-tanggal < start_date.
alter table hits_halaqah add column if not exists start_date date;

-- Pengajuan koreksi pertemuan oleh ketua, diputuskan koordinator KK per-item.
create table if not exists hits_pertemuan_koreksi (
  id                    uuid primary key default gen_random_uuid(),
  halaqah_id            uuid not null references hits_halaqah(id) on delete cascade,
  requested_by_ketua_id uuid references ketua_kelas(id) on delete set null,
  requested_by_name     text not null,
  requested_by_wa       text,
  token                 text not null unique,
  status                text not null default 'pending' check (status in ('pending','selesai')),
  decided_by_role       text,
  decided_by_id         uuid,
  decided_at            timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists idx_hits_koreksi_halaqah on hits_pertemuan_koreksi (halaqah_id);
create unique index if not exists idx_hits_koreksi_pending
  on hits_pertemuan_koreksi (halaqah_id) where status = 'pending';

create table if not exists hits_pertemuan_koreksi_item (
  id           uuid primary key default gen_random_uuid(),
  koreksi_id   uuid not null references hits_pertemuan_koreksi(id) on delete cascade,
  jenis        text not null check (jenis in ('set_mulai','tambah','hapus','ubah_tanggal')),
  level        text,                 -- HitsLevel; null utk set_mulai
  pertemuan_no smallint,             -- utk hapus / ubah_tanggal
  tanggal      date,                 -- utk set_mulai / tambah / ubah_tanggal
  catatan      text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_hits_koreksi_item_koreksi on hits_pertemuan_koreksi_item (koreksi_id);

alter table hits_pertemuan_koreksi enable row level security;
alter table hits_pertemuan_koreksi_item enable row level security;

-- ========== 0032_hits_pindah_claim.sql ==========
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

-- ========== 0033_program_kelas_libur_request.sql ==========
-- Pengajuan libur pertemuan oleh ketua/wakil kelas Maahir.
-- Ketua/wakil mengajukan agar sebuah tanggal kelas diliburkan; koordinator
-- (Aisyah Shofia Safitri / Zahra Wafa Lestari, gender-matched) menyetujui via magic-link
-- (wajib login). Approve -> insert program_kelas_libur untuk (kelas, tanggal),
-- sehingga pertemuan tanggal itu teranulir dari perhitungan kehadiran.

create table program_kelas_libur_request (
  id uuid primary key default gen_random_uuid(),
  program_kelas_id uuid not null references program_kelas(id) on delete cascade,
  tanggal date not null,
  alasan text,
  gender text not null check (gender in ('ikhwan', 'akhwat')),
  requester_wa text not null,
  requester_name text not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by_role text,
  decided_by_id uuid,
  decided_at timestamptz,
  catatan_koordinator text,
  created_at timestamptz not null default now()
);

create index idx_libur_req_kelas on program_kelas_libur_request (program_kelas_id);
create index idx_libur_req_status on program_kelas_libur_request (status);

-- Cegah duplikat pengajuan pending utk (kelas, tanggal) yang sama.
create unique index idx_libur_req_pending
  on program_kelas_libur_request (program_kelas_id, tanggal)
  where status = 'pending';

alter table program_kelas_libur_request enable row level security;

comment on table program_kelas_libur_request is
  'Pengajuan ketua/wakil kelas Maahir untuk meliburkan tanggal pertemuan; disetujui koordinator via magic-link, approve menulis ke program_kelas_libur.';

-- ========== 0034_kehadiran_setoran_halaman.sql ==========
-- Setoran hafalan (jumlah halaman) per pertemuan untuk kelas presensi-mandiri
-- (Maahir Takhassus Ikhwan). Diisi bersama status kehadiran; nullable karena
-- hanya relevan untuk sesi Kelas Maahir di kelas self_attendance.

alter table kehadiran_peserta
  add column setoran_halaman integer check (setoran_halaman is null or setoran_halaman >= 0);

comment on column kehadiran_peserta.setoran_halaman is
  'Jumlah halaman setoran hafalan pada pertemuan ini (kelas presensi-mandiri/takhassus).';

-- ========== 0035_hits_pelanggaran.sql ==========
-- Multi-pelanggaran per pertemuan observasi HITS (menggantikan model kondisi
-- tunggal). Satu pertemuan bisa punya beberapa pelanggaran sekaligus (mis.
-- KMT + KBLA + TIDAK_LATIHAN). Tiap pelanggaran bawa datanya sendiri:
--   - KMT/KBLA: menit (mentah, sebelum toleransi) -> dasar hutang menit (F2).
--   - JKG: opsi tindak lanjut (ganti hari / cicil ke beberapa pertemuan).
--   - BADAL: nama pengganti + waktu mulai; utk guru asli dihitung sebagai JKG
--     (menambah beban anti-mangkir di matrix).
-- KBBS = pertemuan TANPA pelanggaran sama sekali. LIBUR tetap di kondisi.
-- Kolom hits_keterangan_harian.kondisi DIPERTAHANKAN (kompatibel & LIBUR);
-- untuk pertemuan bermasalah, kondisi = pelanggaran "utama" (paling berat).

create table hits_pelanggaran (
  id uuid primary key default gen_random_uuid(),
  keterangan_id uuid not null references hits_keterangan_harian(id) on delete cascade,
  jenis text not null check (jenis in ('KMT', 'KBLA', 'JKG', 'BADAL', 'TIDAK_LATIHAN')),
  menit integer check (menit is null or menit >= 0),          -- KMT: telat; KBLA: tutup cepat
  jkg_opsi text check (jkg_opsi is null or jkg_opsi in ('ganti_hari', 'cicil')),
  cicil_n smallint check (cicil_n is null or cicil_n in (2, 3)),
  badal_nama text,
  badal_mulai text check (badal_mulai is null or badal_mulai in ('sesuai', 'lebih_awal')),
  created_at timestamptz not null default now(),
  unique (keterangan_id, jenis)
);

create index idx_hits_pelanggaran_ket on hits_pelanggaran (keterangan_id);
create index idx_hits_pelanggaran_jenis on hits_pelanggaran (jenis);

alter table hits_pelanggaran enable row level security;

comment on table hits_pelanggaran is
  'Pelanggaran per pertemuan observasi HITS (multi per keterangan). KBBS = tak ada baris di sini.';

-- Backfill dari observasi lama (idempoten).
insert into hits_pelanggaran (keterangan_id, jenis)
select id, kondisi from hits_keterangan_harian
where kondisi in ('KMT', 'KBLA', 'JKG')
on conflict (keterangan_id, jenis) do nothing;

insert into hits_pelanggaran (keterangan_id, jenis)
select id, 'TIDAK_LATIHAN' from hits_keterangan_harian
where kondisi <> 'LIBUR' and latihan_diberikan is false
on conflict (keterangan_id, jenis) do nothing;

-- ========== 0036_tabayyun_kondisi_text.sql ==========
-- F1: tabayyun kini merujuk model multi-pelanggaran (hits_pelanggaran). Satu
-- tabayyun per keterangan me-list SEMUA pelanggaran-nya. Kolom kondisi tinggal
-- headline (pelanggaran paling berat) & harus bisa menampung nilai di luar enum
-- hits_kondisi lama — khususnya BADAL & TIDAK_LATIHAN (pemicu tabayyun baru).
-- Relax enum -> text; perbandingan string di kode tetap jalan.
alter table hits_tabayyun
  alter column kondisi type text using kondisi::text;

comment on column hits_tabayyun.kondisi is
  'Headline pelanggaran (KMT/KBLA/JKG/BADAL/TIDAK_LATIHAN). Rincian lengkap di hits_pelanggaran via keterangan_id.';

-- ========== 0037_hits_hutang_bayar.sql ==========
-- Ledger pembayaran hutang menit (F2). Credit-only: debit TIDAK disimpan di sini,
-- dihitung dari hits_pelanggaran (KMT max(0,menit-5) / KBLA menit / JKG 90).
-- Append-only; saat ketua edit sebuah pertemuan, baris untuk keterangan_id itu
-- di-replace-all (hapus lalu insert). Scope per halaqah (1 halaqah = 1 pengajar).
create table hits_hutang_bayar (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  pengajar_id uuid,                                    -- denormal utk agregasi report (F5)
  keterangan_id uuid references hits_keterangan_harian(id) on delete set null,
                                                       -- pertemuan tempat bayar dilaporkan (audit + idempoten)
  menit integer not null check (menit > 0),
  tanggal date not null,                               -- tanggal pertemuan tempat bayar dilaporkan
  dilaporkan_oleh text,                                -- ketua_kelas id / nama
  catatan text,
  created_at timestamptz not null default now()
);
create index idx_hits_hutang_bayar_halaqah on hits_hutang_bayar (halaqah_id);
create index idx_hits_hutang_bayar_pengajar on hits_hutang_bayar (pengajar_id);

alter table hits_hutang_bayar enable row level security; -- RLS on, NO policy (service-role bypass, konvensi repo)

comment on table hits_hutang_bayar is
  'Pembayaran hutang menit HITS (credit-only, per halaqah). Debit dihitung dari hits_pelanggaran.';

-- ========== 0038_hits_tabayyun_reminder_sent.sql ==========
-- F3: jam mulai countdown 72h tabayyun. Null = koordinator belum kirim reminder
-- (observasi tersimpan, jam belum jalan). deadline_at di-set = reminder_sent_at + 72h
-- oleh server action saat reminder pertama.
alter table hits_tabayyun add column if not exists reminder_sent_at timestamptz;

-- ========== 0039_hits_teguran_source_unique.sql ==========
-- F3 hardening: cegah teguran ganda untuk sumber yang sama (mis. dua koordinator
-- klik "Teguran ghosting" berbarengan → TOCTOU pada cek `if (existing) return`).
-- Menjadikan idempotensi issueTeguranForTabayyun jaminan DB, bukan best-effort.
-- Juga melindungi jalur decideTabayyun lama. Parsial: hanya baris dgn source_ref_id.
create unique index if not exists hits_teguran_source_unique
  on hits_teguran (source_ref_type, source_ref_id)
  where source_ref_id is not null;

-- ========== 0040_hits_kajian_adab.sql ==========
-- HITS F4: Presensi Kajian Adab ketua kelas (Minggu 16.00).
-- Entitas terpisah dari presensi guru; tidak feed Matrix Skill Guru.

create table hits_kajian_presensi (
  id uuid primary key default gen_random_uuid(),
  ketua_wa text not null,
  tanggal date not null,
  status text check (status in ('Hadir','Terlambat','Izin','Sakit','Alpa')),
  checkin_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index idx_kajian_presensi_wa_tgl on hits_kajian_presensi(ketua_wa, tanggal);
create index idx_kajian_presensi_tgl on hits_kajian_presensi(tanggal);

comment on table hits_kajian_presensi is 'Presensi Kajian Adab ketua kelas (mingguan, Minggu 16.00). status null = sudah direminder Koor KK, belum check-in susulan.';
comment on column hits_kajian_presensi.ketua_wa is 'whatsapp_number ketua (dedup identitas; 1 orang walau banyak halaqah).';
comment on column hits_kajian_presensi.reminder_sent_at is 'Kapan Koor KK kirim reminder; countdown 3 hari menuju Alpa.';

create table hits_kajian_libur (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null unique,
  keterangan text,
  created_at timestamptz not null default now()
);
comment on table hits_kajian_libur is 'Tanggal Minggu Kajian Adab libur (dikecualikan dari total sesi & panel tindak).';

-- ========== 0041_matrix_komitmen_numeric.sql ==========
-- Bug: skor_komitmen_jadwal = avg(Stabilitas Jadwal, Anti-Mangkir) bisa pecahan
-- (mis. 3.5), tapi kolomnya smallint → upsert matrix_rekap GAGAL total dengan
-- "invalid input syntax for type smallint: 3.5". Akibatnya computeMatrixForMonth
-- lempar error SETELAH menull-kan ranking (langkah 11) tapi SEBELUM upsert
-- (langkah 12) → kolom ranking bulan live (Jun/Jul 2026+) jadi kosong permanen.
-- Selaraskan tipe dengan rata_rata_* (numeric(3,2)) agar skor pecahan tersimpan.
alter table matrix_rekap
  drop constraint if exists matrix_rekap_skor_komitmen_jadwal_check;

alter table matrix_rekap
  alter column skor_komitmen_jadwal type numeric(3,2);

alter table matrix_rekap
  add constraint matrix_rekap_skor_komitmen_jadwal_check
  check (skor_komitmen_jadwal between 0 and 4);

-- ========== 0042_pengajar_matrix_exclude.sql ==========
-- Flag pengajar yang dinilai lewat observasi (mis. guru DPQ) TAPI tidak masuk
-- Matrix Skill Guru: sistem laporan observasi (pedagogis dll) tetap jalan,
-- hanya compute + dashboard matrix yang mengecualikan mereka.
alter table pengajar
  add column if not exists matrix_exclude boolean not null default false;

comment on column pengajar.matrix_exclude is
  'true = dikecualikan dari Matrix Skill Guru (compute & dashboard). Observasi/pedagogis tetap berjalan.';

-- ========== 0043_pedagogis_catatan_umum.sql ==========
-- Catatan umum per pengajar per bulan: satu free-text note yang diisi ketua
-- kelompok saat menilai pedagogis. Tidak memengaruhi skor/ranking matrix
-- (matrix-compute.ts hanya baca kolom skor_*). Nullable → baris historis NULL.
alter table penilaian_pedagogis
  add column if not exists catatan_umum text;

comment on column penilaian_pedagogis.catatan_umum is
  'Catatan umum bebas per pengajar/bulan dari ketua kelompok. Tak dipakai perhitungan matrix.';

