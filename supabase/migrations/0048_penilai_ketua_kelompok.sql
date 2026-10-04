-- Penilai ketua kelompok: pengajar tertentu (mis. ketua kelompok senior)
-- ditugaskan MENILAI ketua kelompok lain — pekerjaan yang sebelumnya hanya
-- bisa dilakukan koordinator lewat /2in1/koordinator/penilaian-ketua.
--
-- Penugasan disimpan per KELOMPOK, bukan per orang: kalau ketua kelompok
-- berganti, penilainya ikut ke ketua yang baru tanpa perlu diubah.
create table if not exists penilai_ketua_kelompok (
  id uuid primary key default gen_random_uuid(),
  pengajar_id uuid not null references pengajar(id) on delete cascade,
  kelompok_id uuid not null references kelompok_pengajar(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pengajar_id, kelompok_id)
);

create index if not exists penilai_ketua_kelompok_penilai_idx
  on penilai_ketua_kelompok (pengajar_id);

comment on table penilai_ketua_kelompok is
  'pengajar_id = penilai; kelompok_id = kelompok yang KETUAnya dia nilai.';
