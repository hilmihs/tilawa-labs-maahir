-- 0051_evaluasi_halaqah.sql
-- Fitur "Evaluasi Halaqah": penilaian bacaan peserta per-sesi via hitungan Lahn.
-- Master data (halaqah/pengajar/peserta/batch) DIMIRROR dari API sinkron user.

begin;

-- ── Mirror master data (diisi scripts/seed-evaluasi.ts, lalu API sync) ──
create table if not exists eval_batch (
  id           text primary key,
  nama         text not null,
  aktif        boolean not null default true,
  synced_at    timestamptz not null default now()
);

create table if not exists eval_pengajar (
  id           text primary key,
  nama         text not null,
  gender       gender not null,
  whatsapp     text,
  synced_at    timestamptz not null default now()
);

create table if not exists eval_halaqah (
  id           text primary key,
  nama         text not null,
  gender       gender not null,
  mustawa      smallint,
  level        text,
  pengajar_id  text references eval_pengajar(id) on delete set null,
  batch_id     text references eval_batch(id) on delete set null,
  ambang_ujian smallint not null default 65,
  synced_at    timestamptz not null default now()
);
create index if not exists idx_eval_halaqah_pengajar on eval_halaqah(pengajar_id);
create index if not exists idx_eval_halaqah_batch on eval_halaqah(batch_id);

create table if not exists eval_peserta (
  id           text primary key,
  nama         text not null,
  gender       gender not null,
  halaqah_id   text references eval_halaqah(id) on delete cascade,
  is_ketua     boolean not null default false,
  aktif        boolean not null default true,
  urutan       integer not null default 0,
  synced_at    timestamptz not null default now()
);
create index if not exists idx_eval_peserta_halaqah on eval_peserta(halaqah_id);

-- ── Konfigurasi koordinator per gender ──
create table if not exists eval_config (
  gender         gender primary key,
  nama_qn        text not null default 'Evaluasi QN',
  nama_pb        text not null default 'Evaluasi PB',
  ujian_attempts smallint not null default 2 check (ujian_attempts between 1 and 2),
  jadwal         jsonb not null default '{"qn":[],"pb":[],"ujian":[]}'::jsonb,
  updated_at     timestamptz not null default now()
);

-- ── Sesi evaluasi (satu baris per halaqah×jenis×nomor_sesi) ──
create table if not exists evaluasi_sesi (
  id           uuid primary key default gen_random_uuid(),
  halaqah_id   text not null references eval_halaqah(id) on delete cascade,
  jenis        text not null check (jenis in ('qn','pb','ujian')),
  nomor_sesi   smallint not null check (nomor_sesi between 1 and 4),
  tgl_jadwal   date,
  surat        text not null default 'Al-Baqarah',
  ayat_mulai   smallint not null default 142,
  ayat_selesai smallint not null default 157,
  ambang       smallint not null default 70,
  status       text not null default 'draft' check (status in ('draft','terkirim')),
  dibuat_oleh  text references eval_pengajar(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (halaqah_id, jenis, nomor_sesi)
);
create index if not exists idx_evaluasi_sesi_halaqah on evaluasi_sesi(halaqah_id);

-- ── Nilai per peserta per sesi ──
create table if not exists evaluasi_nilai (
  id             uuid primary key default gen_random_uuid(),
  sesi_id        uuid not null references evaluasi_sesi(id) on delete cascade,
  peserta_id     text not null references eval_peserta(id) on delete cascade,
  hadir          boolean not null default true,
  ayat_terakhir  smallint,
  jk_huruf   smallint not null default 0 check (jk_huruf   >= 0),
  jk_harakat smallint not null default 0 check (jk_harakat >= 0),
  jk_mad     smallint not null default 0 check (jk_mad     >= 0),
  jk_tasydid smallint not null default 0 check (jk_tasydid >= 0),
  kh_izhar             smallint not null default 0 check (kh_izhar             >= 0),
  kh_idgham_bighunnah  smallint not null default 0 check (kh_idgham_bighunnah  >= 0),
  kh_idgham_bilaghunnah smallint not null default 0 check (kh_idgham_bilaghunnah >= 0),
  kh_idgham_mimi       smallint not null default 0 check (kh_idgham_mimi       >= 0),
  kh_iqlab             smallint not null default 0 check (kh_iqlab             >= 0),
  kh_ikhfa_hakiki      smallint not null default 0 check (kh_ikhfa_hakiki      >= 0),
  kh_ikhfa_syafawi     smallint not null default 0 check (kh_ikhfa_syafawi     >= 0),
  skor           smallint not null default 100,
  catatan        text,
  confirmed      boolean not null default false,
  done           boolean not null default false,
  updated_at     timestamptz not null default now(),
  unique (sesi_id, peserta_id)
);
create index if not exists idx_evaluasi_nilai_sesi on evaluasi_nilai(sesi_id);
create index if not exists idx_evaluasi_nilai_peserta on evaluasi_nilai(peserta_id);

do $$ begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create function set_updated_at() returns trigger language plpgsql as $fn$
    begin new.updated_at = now(); return new; end $fn$;
  end if;
end $$;

drop trigger if exists trg_eval_config_updated on eval_config;
create trigger trg_eval_config_updated before update on eval_config
  for each row execute function set_updated_at();
drop trigger if exists trg_evaluasi_sesi_updated on evaluasi_sesi;
create trigger trg_evaluasi_sesi_updated before update on evaluasi_sesi
  for each row execute function set_updated_at();
drop trigger if exists trg_evaluasi_nilai_updated on evaluasi_nilai;
create trigger trg_evaluasi_nilai_updated before update on evaluasi_nilai
  for each row execute function set_updated_at();

commit;
