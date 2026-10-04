-- 0066_ketersediaan_hilir.sql
-- Ketersediaan Mengajar HITS — hilir: grup WA, pemetaan CMS tilawah, antrean
-- pengiriman, log perubahan, dan riwayat slot.

begin;

-- ── Kolam grup WA cadangan ─────────────────────────────────────────────────
-- WhatsApp Cloud API resmi TIDAK punya endpoint grup sama sekali: tidak bisa
-- membuat grup, menambah anggota, atau mengambil invite link. Pustaka tidak resmi
-- mengemudikan nomor pribadi dan melanggar ToS. Karena itu grup dibuat manusia.
--
-- Jalur utama: pengajar membuat grupnya sendiri saat konfirmasi lalu menempel
-- invite link. Tabel ini jalur cadangan untuk pengajar yang tak sanggup —
-- koordinator menyiapkan grup kosong di muka, sistem mencabut satu saat dibutuhkan.
create table if not exists ks_grup_pool (
  id          uuid primary key default gen_random_uuid(),
  periode_id  uuid not null references ks_periode(id) on delete cascade,
  gender      gender not null,
  invite_link text not null,
  status      text not null default 'kosong'
                check (status in ('kosong', 'terpakai', 'rusak')),
  usulan_id   uuid references ks_usulan(id) on delete set null,
  catatan     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_ks_grup_pool_siap
  on ks_grup_pool(periode_id, gender) where status = 'kosong';

-- ── Pemetaan ke master CMS tilawah ─────────────────────────────────────────
-- CMS tilawah tidak menerima teks jadwal — hanya nomor baris tabel masternya
-- (day_id, session_id, level_id). Nomor itu tidak boleh ditebak buta:
--   · daftar days/sessions di-scope per program, jadi nomor benar di satu program
--     bisa salah di program lain;
--   · ada baris yang dipakai halaqah tapi tidak muncul di daftar master
--     (halaqah Nurul Iman memakai day_id 12 + session_id 14);
--   · sebagian baris days punya int_days pincang — probe staging 30 Agu 2026
--     menemukan id 3 "Selasa, Jum'at" berisi [1] saja dan id 4 "Sabtu, Ahad"
--     berisi [5] saja, sehingga pencocokan otomatis bisa memilih baris salah
--     yang namanya justru terlihat benar.
-- Sistem boleh MENGUSULKAN pasangan (lewat int_days & jam), koordinator yang
-- mengesahkan. Slot tanpa baris di sini → halaqahnya ditahan, tidak dikirim.
create table if not exists ks_tilawah_slot_map (
  id               uuid primary key default gen_random_uuid(),
  periode_id       uuid not null references ks_periode(id) on delete cascade,
  tilawah_batch_id integer not null,
  slot_id          uuid not null references ks_slot(id) on delete cascade,
  day_id           integer not null,
  session_id       integer not null,
  usulan_otomatis  boolean not null default false,  -- true bila diisi tebakan mesin
  disahkan_oleh    text,
  disahkan_pada    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (tilawah_batch_id, slot_id)
);

create table if not exists ks_tilawah_level_map (
  id               uuid primary key default gen_random_uuid(),
  periode_id       uuid not null references ks_periode(id) on delete cascade,
  tilawah_batch_id integer not null,
  level_nama       text not null,
  level_id         integer not null,
  disahkan_oleh    text,
  disahkan_pada    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (tilawah_batch_id, level_nama)
);

-- ── Antrean pengiriman ke tilawah ──────────────────────────────────────────
-- Per langkah, bukan satu transaksi besar: sesi Laravel bisa kedaluwarsa kapan
-- saja (?reason=expired), dan tidak ada endpoint DELETE untuk membatalkan yang
-- terlanjur. Tiap langkah idempoten — halaqah yang sudah terbuat tidak dibuat
-- ulang, enrolment aman diulang.
--
-- Jebakan CMS tilawah yang ditangani di lib/tilawah/push.ts:
--   · halaqah & users MENOLAK PUT (405) → POST /{id} + _method:"PUT"
--   · halaqah_id pada CREATE user TIDAK meng-enrol → panggilan kedua, move_reason wajib
create table if not exists ks_outbox (
  id            uuid primary key default gen_random_uuid(),
  usulan_id     uuid not null references ks_usulan(id) on delete cascade,
  peserta_id    uuid references ks_usulan_peserta(id) on delete cascade,
  aksi          text not null
                  check (aksi in ('buat_halaqah', 'cari_user', 'buat_user', 'enrol')),
  urutan        integer not null default 0,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'antre'
                  check (status in ('antre', 'terkirim', 'gagal', 'dilewati')),
  percobaan     integer not null default 0,
  respons       jsonb,
  error_terakhir text,
  terkirim_pada timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_ks_outbox_antre on ks_outbox(status, urutan, created_at);
create index if not exists idx_ks_outbox_usulan on ks_outbox(usulan_id, urutan);

-- ── Log perubahan ──────────────────────────────────────────────────────────
-- Sheet LOG_PERUBAHAN di template lama. Aturan dokumen konsep: setelah data
-- dirilis, tidak ada perubahan diam-diam.
create table if not exists ks_log (
  id         uuid primary key default gen_random_uuid(),
  periode_id uuid references ks_periode(id) on delete cascade,
  entitas    text not null,
  entitas_id uuid,
  aksi       text not null,
  sebelum    jsonb,
  sesudah    jsonb,
  alasan     text,
  aktor_wa   text,
  aktor_nama text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ks_log_periode on ks_log(periode_id, created_at desc);
create index if not exists idx_ks_log_entitas on ks_log(entitas, entitas_id);

-- ── Riwayat slot ───────────────────────────────────────────────────────────
-- Menjawab kekhawatiran nomor 2 di dokumen konsep: pengajar mengosongkan waktu
-- lalu tidak mendapat kelas. Dari sini dihitung "peluang slot benar-benar
-- terbentuk" yang dilihat pengajar saat memilih.
-- sumber='impor' untuk data periode lampau yang dimasukkan manual;
-- sumber='sistem' untuk yang dicatat sendiri tiap periode berjalan.
create table if not exists ks_slot_riwayat (
  id                uuid primary key default gen_random_uuid(),
  periode_label     text not null,
  slot_label        text not null,
  kelompok          gender not null,
  mode              text not null check (mode in ('online', 'offline')),
  halaqah_terbentuk integer not null default 0 check (halaqah_terbentuk >= 0),
  halaqah_batal     integer not null default 0 check (halaqah_batal >= 0),
  pendaftar         integer not null default 0 check (pendaftar >= 0),
  sumber            text not null check (sumber in ('impor', 'sistem')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (periode_label, slot_label, kelompok, mode)
);
create index if not exists idx_ks_slot_riwayat_lookup
  on ks_slot_riwayat(kelompok, mode, slot_label);

commit;
