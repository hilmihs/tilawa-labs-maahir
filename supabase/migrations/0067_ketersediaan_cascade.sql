-- 0067_ketersediaan_cascade.sql
-- Perbaikan: hapus berjenjang dari ks_periode tidak pernah berhasil.
--
-- ks_usulan.slot_id dan ks_usulan_peserta.pendaftar_id semula ON DELETE RESTRICT.
-- Niatnya melindungi slot dan pendaftar dari penghapusan tak sengaja. Efek
-- sebenarnya: menghapus satu periode SELALU gagal, karena cascade periode →
-- ks_slot / ks_pendaftar langsung tertahan oleh dua rujukan itu.
--
-- Terungkap saat uji ujung-ke-ujung: skrip melaporkan "data percobaan
-- dibersihkan" padahal 27 slot, 41 pendaftar, dan 4 usulan tetap tertinggal —
-- penghapusannya gagal tanpa suara.
--
-- Perlindungan yang hilang tidak berharga di sini: slot memang tidak pernah
-- dihapus (aturan dokumen konsep, dan antarmuka hanya menyediakan
-- nonaktifkan — tidak ada aksi hapus sama sekali), dan pendaftar hanya dibuang
-- bersama periodenya. Jadi CASCADE adalah perilaku yang benar-benar diinginkan.

begin;

alter table ks_usulan
  drop constraint if exists ks_usulan_slot_id_fkey;
alter table ks_usulan
  add constraint ks_usulan_slot_id_fkey
  foreign key (slot_id) references ks_slot(id) on delete cascade;

alter table ks_usulan_peserta
  drop constraint if exists ks_usulan_peserta_pendaftar_id_fkey;
alter table ks_usulan_peserta
  add constraint ks_usulan_peserta_pendaftar_id_fkey
  foreign key (pendaftar_id) references ks_pendaftar(id) on delete cascade;

commit;
