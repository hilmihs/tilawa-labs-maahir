-- Ketua kelas 2in1 + jadwal reguler per kelas

ALTER TABLE kelas
  ADD COLUMN IF NOT EXISTS ketua_peserta_id uuid REFERENCES peserta(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wakil_ketua_peserta_id uuid REFERENCES peserta(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jadwal_hari text[] DEFAULT '{}',         -- ['Senin','Kamis']
  ADD COLUMN IF NOT EXISTS jadwal_waktu_mulai time,
  ADD COLUMN IF NOT EXISTS jadwal_waktu_selesai time;

CREATE INDEX kelas_ketua_peserta_id_idx ON kelas (ketua_peserta_id) WHERE ketua_peserta_id IS NOT NULL;
