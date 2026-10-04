-- 0025: HITS multi-tahap.
-- Dasar = 2 tahap (Qoidah Nuroniyyah → Perbaikan Bacaan) pada halaqah yang sama.
-- Lanjutan = 1 tahap. Keterangan & override pertemuan kini di-scope per (halaqah, level).

-- Program halaqah.
alter table hits_halaqah add column if not exists program text not null default 'dasar';
comment on column hits_halaqah.program is 'dasar (2 tahap: qoidah_nuroniyyah lalu perbaikan_bacaan) | lanjutan (1 tahap).';
-- Halaqah yang sudah ditag perbaikan_bacaan diperlakukan sebagai program lanjutan.
update hits_halaqah set program = 'lanjutan' where level = 'perbaikan_bacaan';

-- Keterangan harian: tahap (level) yang sedang diisi.
alter table hits_keterangan_harian add column if not exists level hits_level;
update hits_keterangan_harian k set level = h.level
  from hits_halaqah h where h.id = k.halaqah_id and k.level is null and h.level is not null;
alter table hits_keterangan_harian alter column level set not null;
alter table hits_keterangan_harian drop constraint if exists hits_keterangan_harian_halaqah_id_pertemuan_no_key;
alter table hits_keterangan_harian add constraint hits_keterangan_harian_uq unique (halaqah_id, level, pertemuan_no);

-- Override pertemuan: per tahap juga.
alter table hits_kaldik_pertemuan add column if not exists level hits_level;
update hits_kaldik_pertemuan p set level = h.level
  from hits_halaqah h where h.id = p.halaqah_id and p.level is null and h.level is not null;
alter table hits_kaldik_pertemuan alter column level set not null;
alter table hits_kaldik_pertemuan drop constraint if exists hits_kaldik_pertemuan_halaqah_id_pertemuan_no_key;
alter table hits_kaldik_pertemuan add constraint hits_kaldik_pertemuan_uq unique (halaqah_id, level, pertemuan_no);
