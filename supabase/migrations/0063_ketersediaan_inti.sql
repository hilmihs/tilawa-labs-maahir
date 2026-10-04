-- 0063_ketersediaan_inti.sql
-- Ketersediaan Mengajar HITS — kerangka periode, master slot, dan isian pengajar.
-- Rancangan: docs/superpowers/specs/2026-08-30-ketersediaan-mengajar-hits-design.md
--
-- Model kerja bergulir, bukan bergelombang: form ketersediaan boleh selalu terbuka
-- (form_tutup null) dan halaqah dibentuk saat murid cukup + pengajar tersedia.
-- Semua tabel ks_* berakar pada ks_periode dengan hapus berjenjang, supaya satu
-- periode percobaan bisa dibuang utuh tanpa menyisakan yatim.

begin;

-- ── Periode penarikan ──────────────────────────────────────────────────────
-- Lepas dari batch HITS: satu periode boleh melahirkan halaqah di beberapa batch.
-- Seluruh angka aturan (kapasitas, ambang, tenggat) disetel di sini, bukan di kode,
-- karena dokumen konsep menyatakannya sebagai kesepakatan yang bisa berubah.
create table if not exists ks_periode (
  id                        uuid primary key default gen_random_uuid(),
  nama                      text not null check (length(trim(nama)) between 1 and 120),
  mulai                     date not null,
  selesai                   date not null,
  form_buka                 timestamptz,          -- null = sudah terbuka
  form_tutup                timestamptz,          -- null = tidak pernah ditutup (bergulir)

  kapasitas_halaqah         integer not null default 12  check (kapasitas_halaqah between 1 and 100),
  minimal_slot              integer not null default 3   check (minimal_slot between 0 and 50),
  ambang_bentuk             integer not null default 12  check (ambang_bentuk between 1 and 100),
  ambang_bawah              integer not null default 8   check (ambang_bawah between 1 and 100),
  usia_antrean_maks_hari    integer not null default 21  check (usia_antrean_maks_hari between 1 and 365),
  jeda_mulai_hari           integer not null default 7   check (jeda_mulai_hari between 0 and 90),
  tenggat_konfirmasi_jam    integer not null default 48  check (tenggat_konfirmasi_jam between 1 and 720),
  penyegaran_hari           integer not null default 45  check (penyegaran_hari between 1 and 365),
  pengingat_penyegaran_hari integer not null default 3   check (pengingat_penyegaran_hari between 0 and 60),

  -- Gerbang pengiriman ke CMS tilawah. Default mati: outbox hanya mencatat payload
  -- tanpa memanggil apa pun. Dibuka superadmin per periode setelah satu halaqah uji.
  kirim_nyata               boolean not null default false,
  tilawah_program_id        integer,
  tilawah_batch_id          integer,

  aktif                     boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  check (selesai >= mulai),
  check (ambang_bawah <= ambang_bentuk),
  check (form_tutup is null or form_buka is null or form_tutup > form_buka)
);
create index if not exists idx_ks_periode_aktif on ks_periode(aktif, mulai desc);

-- ── Master slot ────────────────────────────────────────────────────────────
-- Sumber tunggal daftar slot resmi (sheet MASTER_SLOT di template lama).
-- Slot dinonaktifkan, TIDAK dihapus — aturan eksplisit di dokumen konsep.
--
-- Disimpan terurai, bukan hanya sebagai teks: perbandingan teks tidak dapat
-- diandalkan karena file Jadwal KBM Juni 2026 sudah memuat "16.00 - 17.30" (titik)
-- bersanding dengan "16:00 - 17:30" (titik dua), dan "Jum'at" bersanding "Jumat".
--   hari      → tampilan apa adanya
--   hari_idx  → kanonik untuk mesin. 0=Senin, 1=Selasa … 6=Ahad.
--               Sengaja sejajar dengan `int_days` milik /api/days CMS tilawah,
--               sehingga usulan pemetaan day_id bisa dihitung, bukan ditebak teks.
create table if not exists ks_slot (
  id            uuid primary key default gen_random_uuid(),
  periode_id    uuid not null references ks_periode(id) on delete cascade,
  kelompok      gender not null,
  mode          text not null check (mode in ('online', 'offline')),
  label         text not null check (length(trim(label)) between 1 and 120),
  hari          text[] not null check (cardinality(hari) between 1 and 7),
  hari_idx      smallint[] not null check (cardinality(hari_idx) between 1 and 7),
  waktu_mulai   time not null,
  waktu_selesai time not null,
  lokasi        text,                       -- hanya bermakna untuk mode offline
  aktif         boolean not null default true,
  urutan        integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  check (waktu_selesai > waktu_mulai),
  check (cardinality(hari) = cardinality(hari_idx)),
  check (mode = 'online' or lokasi is not null)
);
create index if not exists idx_ks_slot_periode on ks_slot(periode_id, kelompok, mode, urutan);

-- ── Isian pengajar: kepala ─────────────────────────────────────────────────
-- Dipisah dari detail slot supaya alasan & pernyataan komitmen tidak berulang
-- di setiap baris slot (di template lama satu pengajar × 3 slot = 3 baris kembar).
create table if not exists ks_pengisian (
  id                        uuid primary key default gen_random_uuid(),
  periode_id                uuid not null references ks_periode(id) on delete cascade,
  pengajar_id               uuid not null references pengajar(id) on delete cascade,
  mode                      text not null default 'online'
                              check (mode in ('online', 'offline', 'keduanya')),
  lokasi                    text,
  alasan_kurang_slot        text,           -- wajib diisi bila slot < periode.minimal_slot
  komitmen                  boolean not null default false,
  catatan_koordinator       text,

  submitted_at              timestamptz,
  disegarkan_pada           timestamptz,
  pengingat_penyegaran_pada timestamptz,

  -- basi   = lewat penyegaran_hari, masih dipakai tapi turun prioritas
  -- nonaktif = sudah diingatkan dan tetap diam → berhenti ikut alokasi
  status                    text not null default 'aktif'
                              check (status in ('aktif', 'basi', 'nonaktif')),
  -- Dikunci setelah periode ditutup/dirilis: perubahan hanya lewat koordinator
  -- dan wajib tercatat di ks_log.
  terkunci                  boolean not null default false,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  unique (periode_id, pengajar_id)
);
create index if not exists idx_ks_pengisian_status on ks_pengisian(periode_id, status);

-- ── Isian pengajar: detail per slot ────────────────────────────────────────
-- `cek` menyimpan hasil enam butir verifikasi dokumen konsep apa adanya
-- (nama terdaftar, WA sah, tidak bentrok Maahir, tidak bentrok HITS berjalan,
-- jumlah slot cukup, slot aktif di master) supaya jejaknya terlihat — bukan
-- hanya status akhirnya.
--
-- Slot yang bertabrakan dengan jadwal mengajar berjalan tampil TERKUNCI di form.
-- `bentrok_alasan` + `sanggahan_status` adalah jalan keluarnya: hits_halaqah bisa
-- basi (sheet disync manual, dan `active` bisa hidup lagi sendiri setelah sync),
-- jadi harus ada cara pengajar menyatakan "kelas itu sudah selesai".
create table if not exists ks_ketersediaan (
  id               uuid primary key default gen_random_uuid(),
  pengisian_id     uuid not null references ks_pengisian(id) on delete cascade,
  slot_id          uuid not null references ks_slot(id) on delete cascade,
  status           text not null default 'diajukan'
                     check (status in ('diajukan', 'terverifikasi', 'perlu_konfirmasi', 'ditolak')),
  cek              jsonb not null default '{}'::jsonb,
  bentrok_alasan   text,
  sanggahan_status text check (sanggahan_status in ('menunggu', 'diterima', 'ditolak')),
  sanggahan_catatan text,
  catatan          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (pengisian_id, slot_id)
);
create index if not exists idx_ks_ketersediaan_slot on ks_ketersediaan(slot_id, status);
create index if not exists idx_ks_ketersediaan_sanggahan
  on ks_ketersediaan(sanggahan_status) where sanggahan_status = 'menunggu';

commit;
