-- 0065_ketersediaan_alokasi.sql
-- Ketersediaan Mengajar HITS — prioritas, usulan halaqah, dan konfirmasi pengajar.

begin;

-- ── Sumber urutan prioritas ────────────────────────────────────────────────
-- Dua bentuk, dipilih saat menjalankan alokasi:
--   matrix → ranking Matrix Skill Guru pada bulan tertentu (dihitung, tidak disimpan)
--   manual → urutan yang disusun koordinator dan disimpan untuk dipakai ulang
-- periode_id sengaja boleh null: preset manual bisa dipakai lintas periode.
create table if not exists ks_prioritas_preset (
  id           uuid primary key default gen_random_uuid(),
  periode_id   uuid references ks_periode(id) on delete cascade,
  nama         text not null check (length(trim(nama)) between 1 and 120),
  gender       gender not null,
  tipe         text not null check (tipe in ('matrix', 'manual')),
  matrix_bulan text check (matrix_bulan ~ '^\d{4}-\d{2}$'),
  dibuat_oleh  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  check (tipe <> 'matrix' or matrix_bulan is not null)
);
create index if not exists idx_ks_preset_gender on ks_prioritas_preset(gender, tipe);

create table if not exists ks_prioritas_urutan (
  id          uuid primary key default gen_random_uuid(),
  preset_id   uuid not null references ks_prioritas_preset(id) on delete cascade,
  pengajar_id uuid not null references pengajar(id) on delete cascade,
  urutan      integer not null check (urutan > 0),
  created_at  timestamptz not null default now(),

  unique (preset_id, pengajar_id)
);
create index if not exists idx_ks_urutan_preset on ks_prioritas_urutan(preset_id, urutan);

-- ── Usulan halaqah ─────────────────────────────────────────────────────────
-- Dilahirkan mesin bergulir saat satu slot mengumpulkan cukup murid DAN ada
-- pengajar tersedia. Tidak langsung jadi: koordinator menyetujui dulu.
--
-- `putaran` merekam putaran alokasi berputar yang melahirkannya. Kaidahnya:
-- tidak seorang pun mendapat halaqah kedua sebelum semua yang bersedia mendapat
-- yang pertama — jadi seluruh usulan putaran 1 lahir sebelum putaran 2 dimulai.
--
-- akses_token = pola magic-link yang sudah dipakai /tabayyun/[token] dan
-- /hits/pindah-halaqah/[token]. WAJIB masuk FORBIDDEN_COLUMNS di
-- src/lib/api-public/registry.ts — pemegangnya bertindak atas nama pengajar.
create table if not exists ks_usulan (
  id                 uuid primary key default gen_random_uuid(),
  periode_id         uuid not null references ks_periode(id) on delete cascade,
  slot_id            uuid not null references ks_slot(id) on delete restrict,
  pengajar_id        uuid references pengajar(id) on delete set null,

  nama_halaqah       text,
  level              text not null,          -- 'HITS Dasar' | 'HITS Lanjutan'
  pita_umur          text check (pita_umur in ('<=17', '18-25', '26-35', '36-45', '46+')),
  pita_digabung      boolean not null default false,  -- true bila dibentuk karena antrean tua
  putaran            integer not null default 1 check (putaran > 0),
  urutan_prioritas   integer,

  status             text not null default 'usulan'
                       check (status in ('usulan', 'disetujui', 'menunggu', 'dikonfirmasi',
                                         'ditolak', 'kedaluwarsa', 'dikirim', 'gagal', 'batal')),
  tanggal_mulai      date,
  akses_token        text unique,
  token_kedaluwarsa  timestamptz,
  dikonfirmasi_pada  timestamptz,
  alasan_tolak       text,

  grup_wa_link       text,
  grup_sumber        text check (grup_sumber in ('pengajar', 'kolam')),

  tilawah_halaqah_id integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_ks_usulan_periode on ks_usulan(periode_id, status);
create index if not exists idx_ks_usulan_slot on ks_usulan(slot_id, status);
create index if not exists idx_ks_usulan_pengajar on ks_usulan(pengajar_id, status);
-- Papan tenggat: usulan menunggu konfirmasi yang harus digeser bila lewat waktu.
create index if not exists idx_ks_usulan_tenggat
  on ks_usulan(token_kedaluwarsa) where status = 'menunggu';

-- ── Peserta di dalam usulan ────────────────────────────────────────────────
-- undangan_token menopang halaman /undangan/<token>, supaya tautan grup WA tidak
-- disebar mentah dan pembukaannya bisa dicatat tanpa API WhatsApp apa pun.
create table if not exists ks_usulan_peserta (
  id                 uuid primary key default gen_random_uuid(),
  usulan_id          uuid not null references ks_usulan(id) on delete cascade,
  pendaftar_id       uuid not null references ks_pendaftar(id) on delete restrict,
  status             text not null default 'diusulkan'
                       check (status in ('diusulkan', 'terenroll', 'gagal', 'dikeluarkan')),
  tilawah_user_id    integer,
  undangan_token     text unique,
  undangan_dibuka_pada timestamptz,
  catatan            text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (usulan_id, pendaftar_id)
);
create index if not exists idx_ks_usulan_peserta_usulan on ks_usulan_peserta(usulan_id, status);
-- Satu pendaftar hanya boleh hidup di satu usulan. Yang dikeluarkan tidak dihitung,
-- sehingga pemindahan antar-halaqah tetap mungkin tanpa menghapus jejaknya.
create unique index if not exists uq_ks_peserta_satu_usulan
  on ks_usulan_peserta(pendaftar_id) where status <> 'dikeluarkan';

commit;
