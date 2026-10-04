-- Penilaian bacaan + hafalan per peserta per bulan
-- Input oleh koordinator 2in1 atau syaikh
-- Kontribusi ke hard skill di Matrix Skill Guru

CREATE TABLE penilaian_peserta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peserta_id     uuid NOT NULL REFERENCES peserta(id) ON DELETE CASCADE,
  year_month     text NOT NULL,              -- format 'YYYY-MM', mis '2026-06'
  skor_bacaan    smallint CHECK (skor_bacaan BETWEEN 0 AND 4),
  ket_bacaan     text,
  skor_hafalan   smallint CHECK (skor_hafalan BETWEEN 0 AND 4),
  ket_hafalan    text,
  assessor_role  text NOT NULL CHECK (assessor_role IN ('koordinator', 'syaikh')),
  assessor_id    uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (peserta_id, year_month)
);

CREATE INDEX penilaian_peserta_year_month_idx ON penilaian_peserta (year_month);
CREATE INDEX penilaian_peserta_peserta_id_idx ON penilaian_peserta (peserta_id);

-- RLS: hanya koordinator/syaikh bisa select/insert/update via service role
-- (app pakai supabaseAdmin, RLS tidak diaktifkan di sini)
