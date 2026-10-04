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
  pekan smallint check (pekan between 1 and 13),  -- carry-forward dari kolom Pekan
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
