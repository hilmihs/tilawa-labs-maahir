-- 0079 — Ketersediaan: batasan integritas dan indeks untuk pola kueri nyata.
--
-- Hasil review 16 Sep 2026. Semua batasan ini menjaga dari klik ganda dan dua
-- koordinator yang menjalankan hal yang sama bersamaan — kode sudah memeriksa,
-- tetapi pemeriksaan "baca lalu tulis" tetap bisa kecolongan tanpa batasan di
-- basis data. Diperiksa di produksi sebelum ditulis: belum ada baris ganda
-- (ks_usulan dan ks_outbox masih kosong, sumber CSV tidak kembar).

begin;

-- Satu pengajar hanya satu halaqah hidup per jam per periode.
create unique index if not exists uq_ks_usulan_hidup
  on ks_usulan(periode_id, slot_id, pengajar_id)
  where status in ('usulan', 'disetujui', 'menunggu', 'dikonfirmasi', 'dikirim');

-- Antrean pengiriman tidak boleh berlipat: satu langkah per urutan per usulan.
-- CMS tilawah tidak bisa menghapus, jadi langkah ganda = data ganda permanen.
create unique index if not exists uq_ks_outbox_langkah
  on ks_outbox(usulan_id, urutan);

-- Link CSV yang sama tidak dipasang dua kali di satu periode.
create unique index if not exists uq_ks_pendaftar_sumber_url
  on ks_pendaftar_sumber(periode_id, csv_url);

-- Pola kueri: identitas yang sudah dialokasikan lintas periode.
create index if not exists idx_ks_pendaftar_dialokasikan
  on ks_pendaftar(wa_normal) where status = 'dialokasikan';

-- Indeks pendukung cascade & pencarian peserta per pendaftar (yang ada parsial).
create index if not exists idx_ks_usulan_peserta_pendaftar
  on ks_usulan_peserta(pendaftar_id);
create index if not exists idx_ks_outbox_peserta
  on ks_outbox(peserta_id) where peserta_id is not null;
create index if not exists idx_ks_tilawah_slot_map_slot
  on ks_tilawah_slot_map(slot_id);

-- Ketersediaan dibaca per pengisian (per periode), bukan seluruh tabel.
create index if not exists idx_ks_ketersediaan_pengisian
  on ks_ketersediaan(pengisian_id, status);

commit;
