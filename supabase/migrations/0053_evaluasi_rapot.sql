-- 0053_evaluasi_rapot.sql
-- Rapot resmi (snapshot beku) untuk keaslian via QR. Saat pengajar "menerbitkan"
-- rapot, nilai dibekukan ke baris ini + token acak untuk URL verifikasi publik.
-- Data live boleh berubah tanpa mengubah rapot yang sudah terbit.

begin;

create table if not exists evaluasi_rapot (
  id               uuid primary key default gen_random_uuid(),
  token            text not null unique,
  halaqah_id       text not null references eval_halaqah(id) on delete cascade,
  peserta_id       text not null references eval_peserta(id) on delete cascade,
  jenis_rapot      text not null check (jenis_rapot in ('berkala','ujian')),
  nilai_akhir      smallint,
  berkala_avg      smallint,
  ujian_pb_skor    smallint,
  lulus            boolean,
  ambang           smallint not null default 70,
  payload          jsonb not null,
  diterbitkan_oleh text references eval_pengajar(id) on delete set null,
  diterbitkan_at   timestamptz not null default now()
);
create index if not exists idx_evaluasi_rapot_peserta on evaluasi_rapot(peserta_id);
create index if not exists idx_evaluasi_rapot_halaqah on evaluasi_rapot(halaqah_id);

commit;
