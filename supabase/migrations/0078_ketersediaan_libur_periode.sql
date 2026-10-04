-- 0078 — Ketersediaan: tanggal libur per periode.
--
-- Tanggal pertemuan yang dikirim ke CMS tilawah dihitung berturut-turut dari
-- tanggal mulai. Tanpa daftar libur, halaqah yang mulai Oktober mendapat
-- pertemuan di tanggal merah dan sepanjang Ramadhan, lalu koordinator harus
-- menggesernya satu per satu di CMS.
--
-- Bentuk: [{ "mulai": "2027-02-08", "selesai": "2027-03-23", "keterangan": "Ramadhan + 2 pekan" }]
-- Satu hari libur = mulai dan selesai sama.

begin;

alter table ks_periode
  add column if not exists libur jsonb not null default '[]'::jsonb;

commit;
