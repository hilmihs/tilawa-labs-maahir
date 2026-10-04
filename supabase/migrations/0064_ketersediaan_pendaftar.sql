-- 0064_ketersediaan_pendaftar.sql
-- Ketersediaan Mengajar HITS — sisi permintaan: pendaftar murid.
--
-- Sumbernya Google Form pendaftaran yang responsnya ditarik sebagai
-- published-to-web CSV — pola yang sudah terbukti di src/lib/hits-sheets.ts,
-- jadi tanpa service account maupun OAuth.
--
-- Pendaftaran tidak pernah ditutup per slot. Slot penuh tetap menerima, dan
-- kelebihannya menjadi antrean — antrean itulah sinyal "slot ini butuh pengajar".

begin;

-- ── Sumber tarikan ─────────────────────────────────────────────────────────
-- pemetaan_kolom membuat kolom sheet TIDAK di-hardcode: koordinator menarik CSV
-- sekali, lalu menunjuk kolom mana berisi nama/WA/tanggal lahir/slot/level.
-- Bentuk Google Form boleh berubah tanpa menyentuh kode.
--   { "nama": "Nama Lengkap", "wa": "Nomor WhatsApp", "tanggal_lahir": "...",
--     "gender": "...", "level": "...", "slot": "...", "timestamp": "Timestamp" }
create table if not exists ks_pendaftar_sumber (
  id             uuid primary key default gen_random_uuid(),
  periode_id     uuid not null references ks_periode(id) on delete cascade,
  nama           text not null check (length(trim(nama)) between 1 and 120),
  csv_url        text not null,
  pemetaan_kolom jsonb not null default '{}'::jsonb,
  aktif          boolean not null default true,
  terakhir_tarik timestamptz,
  terakhir_status text check (terakhir_status in ('ok', 'gagal')),
  terakhir_pesan text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_ks_pendaftar_sumber_periode
  on ks_pendaftar_sumber(periode_id, aktif);

-- ── Baris pendaftar ────────────────────────────────────────────────────────
-- sumber_row_key = cetakan dari timestamp + WA baris sheet. Tarikan berulang
-- MEMPERBARUI baris, tidak menggandakannya — sama seperti syncBatch HITS.
--
-- Saringan mutu menahan, tidak membuang. Baris ditahan tetap tampil di layar
-- koordinator lengkap dengan alasannya, dan tidak ikut dihitung sampai dibereskan.
-- Ini kritis karena nomor WA menjadi email palsu di CMS tilawah — satu nomor
-- kotor merusak akun murid yang dibuat atas namanya.
create table if not exists ks_pendaftar (
  id             uuid primary key default gen_random_uuid(),
  periode_id     uuid not null references ks_periode(id) on delete cascade,
  sumber_id      uuid references ks_pendaftar_sumber(id) on delete set null,
  sumber_row_key text not null,

  nama           text not null default '',
  wa             text,
  wa_normal      text,                       -- hasil normalisasi, dasar cek ganda
  tanggal_lahir  date,
  umur           integer,
  pita_umur      text check (pita_umur in ('<=17', '18-25', '26-35', '36-45', '46+')),
  gender         gender,
  level_pilihan  text,                       -- isian murid, dicocokkan ke level halaqah
  slot_label_raw text,                       -- apa adanya dari sheet
  slot_id        uuid references ks_slot(id) on delete set null,
  didaftar_pada  timestamptz,                -- timestamp baris sheet, dasar usia antrean

  status         text not null default 'ditahan'
                   check (status in ('valid', 'ditahan', 'dialokasikan', 'batal')),
  alasan_ditahan text[] not null default '{}',
  catatan        text,

  ditarik_pada   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (periode_id, sumber_row_key)
);

-- Antrean per slot: dibaca mesin alokasi tiap sinkronisasi.
create index if not exists idx_ks_pendaftar_antrean
  on ks_pendaftar(periode_id, slot_id, status, didaftar_pada);
-- Deteksi nomor ganda dalam satu periode.
create index if not exists idx_ks_pendaftar_wa
  on ks_pendaftar(periode_id, wa_normal) where wa_normal is not null;
create index if not exists idx_ks_pendaftar_ditahan
  on ks_pendaftar(periode_id) where status = 'ditahan';

commit;
