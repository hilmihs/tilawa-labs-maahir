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
