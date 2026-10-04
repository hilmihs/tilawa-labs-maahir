-- 0080_ujian_2in1.sql
-- Ujian hafalan 2in1 (tiap ±3 bulan).
--
-- Alurnya cermin setoran: peserta merekam 3 matan (Tuhfatul Athfal,
-- Al-Jazariyyah, Syawahid) di dalam rentang ujian, musyrif/ah mendengar lalu
-- memberi predikat per matan. Bedanya:
--   * terikat `ujian_periode` (rentang tanggal yang diatur koordinator), bukan
--     cycle 2-pekan;
--   * predikat 4 tingkat — mumtaz (hijau), jayyid (kuning), maqbul & dhaif
--     (sama-sama merah, tetap dibedakan tercatat);
--   * musyrif bisa mencatat alasan peserta belum ujian (`alasan_belum`), jadi
--     baris `ujian` boleh ada tanpa rekaman sama sekali (status 'draft').
--
-- Periode pertama: 21–27 September 2026.

begin;

create table if not exists ujian_periode (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null,
  mulai       date not null,
  selesai     date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (selesai >= mulai),
  unique (mulai)
);

comment on table ujian_periode is
  'Rentang ujian hafalan 2in1 (±3 bulan sekali). Peserta hanya bisa kirim rekaman di dalam rentang.';

create table if not exists ujian (
  id                     uuid primary key default gen_random_uuid(),
  periode_id             uuid not null references ujian_periode(id) on delete restrict,
  peserta_id             uuid not null references peserta(id) on delete cascade,
  status                 status_setoran not null default 'draft',
  submitted_at           timestamptz,
  checked_at             timestamptz,
  checked_by_musyrif_id  uuid references musyrif(id) on delete set null,
  alasan_belum           text,
  alasan_updated_at      timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (periode_id, peserta_id)
);

create index if not exists idx_ujian_peserta on ujian(peserta_id);

comment on column ujian.alasan_belum is
  'Keterangan dari musyrif/ah mengapa peserta belum ujian. Tidak dihapus saat peserta akhirnya ujian.';

create table if not exists rekaman_ujian (
  id                uuid primary key default gen_random_uuid(),
  ujian_id          uuid not null references ujian(id) on delete cascade,
  jenis             jenis_rekaman not null,
  audio_url         text,
  duration_seconds  integer,
  recorded_at       timestamptz,
  predikat          text check (predikat in ('mumtaz', 'jayyid', 'maqbul', 'dhaif')),
  masukan           text,
  checked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (ujian_id, jenis)
);

create index if not exists idx_rekaman_ujian_ujian on rekaman_ujian(ujian_id);

insert into ujian_periode (nama, mulai, selesai)
values ('Ujian September 2026', '2026-09-21', '2026-09-27')
on conflict (mulai) do nothing;

commit;
