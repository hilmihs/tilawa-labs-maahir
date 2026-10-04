-- Kepatuhan SOP Teknis: input manual ketua kelompok, satu form dengan
-- penilaian pedagogis (kontribusi ke soft skill di matrix).

ALTER TABLE penilaian_pedagogis
  ADD COLUMN IF NOT EXISTS skor_kepatuhan_sop smallint CHECK (skor_kepatuhan_sop BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS keterangan_sop text;
