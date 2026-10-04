-- Kelas program Maahir (grouping kehadiran) — BEDA dari kelas setoran 2in1.
-- Anggota lintas kelas setoran; ketua bisa peserta/musyrif/koordinator,
-- jadi identifikasi ketua pakai nomor WA (bukan FK peserta).

CREATE TABLE program_kelas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  gender          text NOT NULL CHECK (gender IN ('ikhwan', 'akhwat')),
  jadwal_hari     text[] DEFAULT '{}',     -- ['Senin','Kamis']
  waktu_mulai     time,
  waktu_selesai   time,
  ketua_wa        text,                    -- normalized 62xxx
  wakil_wa        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE program_kelas_anggota (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_kelas_id  uuid NOT NULL REFERENCES program_kelas(id) ON DELETE CASCADE,
  peserta_id        uuid REFERENCES peserta(id) ON DELETE SET NULL,
  name              text NOT NULL,
  whatsapp_number   text,                  -- normalized 62xxx
  is_ketua          boolean NOT NULL DEFAULT false,
  is_wakil          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_kelas_id, whatsapp_number)
);

CREATE INDEX program_kelas_anggota_kelas_idx ON program_kelas_anggota (program_kelas_id);

-- Repoint pertemuan + kehadiran ke program_kelas/anggota
ALTER TABLE pertemuan_program
  ADD COLUMN program_kelas_id uuid REFERENCES program_kelas(id) ON DELETE CASCADE,
  ALTER COLUMN kelas_id DROP NOT NULL;

ALTER TABLE pertemuan_program DROP CONSTRAINT pertemuan_program_kelas_id_program_tanggal_key;
-- Non-partial supaya PostgREST onConflict bisa infer index (NULL tidak konflik)
CREATE UNIQUE INDEX pertemuan_program_pk_program_tanggal_key
  ON pertemuan_program (program_kelas_id, program, tanggal);

ALTER TABLE kehadiran_peserta
  ADD COLUMN anggota_id uuid REFERENCES program_kelas_anggota(id) ON DELETE CASCADE,
  ALTER COLUMN peserta_id DROP NOT NULL;

ALTER TABLE kehadiran_peserta DROP CONSTRAINT kehadiran_peserta_pertemuan_id_peserta_id_key;
CREATE UNIQUE INDEX kehadiran_peserta_pertemuan_anggota_key
  ON kehadiran_peserta (pertemuan_id, anggota_id);
