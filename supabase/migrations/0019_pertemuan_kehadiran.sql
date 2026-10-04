-- Pertemuan program (Kelas Maahir / Muallim Najih / At-Tibyan)
-- Ketua kelas 2in1 membuat pertemuan dan mengisi kehadiran

CREATE TABLE pertemuan_program (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kelas_id        uuid NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
  program         text NOT NULL DEFAULT 'kelas_maahir',
  -- 'kelas_maahir' | 'muallim_najih' | 'at_tibyan'
  tanggal         date NOT NULL,
  nama_kegiatan   text NOT NULL,
  waktu_mulai     time,
  waktu_selesai   time,
  keterangan      text,
  created_by      uuid REFERENCES peserta(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kelas_id, program, tanggal)
);

CREATE INDEX pertemuan_program_kelas_tanggal_idx ON pertemuan_program (kelas_id, tanggal);
CREATE INDEX pertemuan_program_tanggal_idx ON pertemuan_program (tanggal);

-- Kehadiran per peserta per pertemuan
CREATE TABLE kehadiran_peserta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pertemuan_id    uuid NOT NULL REFERENCES pertemuan_program(id) ON DELETE CASCADE,
  peserta_id      uuid NOT NULL REFERENCES peserta(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'tidak_ada_keterangan',
  -- 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan'
  catatan         text,
  diisi_oleh      uuid REFERENCES peserta(id) ON DELETE SET NULL,
  diisi_at        timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pertemuan_id, peserta_id)
);

CREATE INDEX kehadiran_peserta_pertemuan_idx ON kehadiran_peserta (pertemuan_id);
CREATE INDEX kehadiran_peserta_peserta_idx ON kehadiran_peserta (peserta_id);
