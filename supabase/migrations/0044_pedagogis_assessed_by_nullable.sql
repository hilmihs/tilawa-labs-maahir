-- Penilaian pedagogis kini bisa diisi KOORDINATOR untuk menilai ketua kelompok
-- (yang tak dinilai di flow kelompok karena mengecualikan ketua). Koordinator
-- bukan pengajar, jadi assessed_by (FK→pengajar) dibolehkan NULL untuk penilaian
-- oleh koordinator. Baris lama (dinilai ketua kelompok) tetap terisi.
ALTER TABLE penilaian_pedagogis ALTER COLUMN assessed_by DROP NOT NULL;
