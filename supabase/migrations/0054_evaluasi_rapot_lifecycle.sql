-- 0054_evaluasi_rapot_lifecycle.sql
-- Lifecycle rapot: supersede ("terbitkan ulang" → yang lama digantikan) + revoke
-- ("cabut"). Sebelumnya tiap terbit meng-INSERT baris+token baru tanpa penanda,
-- sehingga rapot lama yang salah tetap terverifikasi "asli" selamanya (H4).
--
-- status:
--   'aktif'      — rapot resmi berlaku (maks 1 per peserta+halaqah+jenis)
--   'digantikan' — sudah diterbitkan ulang; token lama tetap bisa dipindai tapi
--                   halaman cek menandai "diperbarui" + tautan ke versi terbaru
--   'dicabut'    — dibatalkan pengajar; halaman cek menandai "dicabut"

begin;

alter table evaluasi_rapot
  add column if not exists status text not null default 'aktif'
    check (status in ('aktif', 'digantikan', 'dicabut')),
  add column if not exists superseded_by uuid references evaluasi_rapot(id) on delete set null,
  add column if not exists dicabut_at timestamptz,
  add column if not exists dicabut_oleh text references eval_pengajar(id) on delete set null;

-- Rapikan duplikat lama (bug lama): sisakan hanya baris terbaru per
-- (peserta, halaqah, jenis) sebagai 'aktif', sisanya 'digantikan'. Tiebreak id.
update evaluasi_rapot r
set status = 'digantikan'
where r.status = 'aktif'
  and exists (
    select 1 from evaluasi_rapot n
    where n.peserta_id = r.peserta_id
      and n.halaqah_id = r.halaqah_id
      and n.jenis_rapot = r.jenis_rapot
      and (n.diterbitkan_at > r.diterbitkan_at
           or (n.diterbitkan_at = r.diterbitkan_at and n.id > r.id))
  );

-- Invariant: maksimum satu rapot 'aktif' per (peserta, halaqah, jenis).
create unique index if not exists uq_evaluasi_rapot_aktif
  on evaluasi_rapot (peserta_id, halaqah_id, jenis_rapot)
  where status = 'aktif';

commit;
