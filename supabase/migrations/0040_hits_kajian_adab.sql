-- HITS F4: Presensi Kajian Adab ketua kelas (Minggu 16.00).
-- Entitas terpisah dari presensi guru; tidak feed Matrix Skill Guru.

create table hits_kajian_presensi (
  id uuid primary key default gen_random_uuid(),
  ketua_wa text not null,
  tanggal date not null,
  status text check (status in ('Hadir','Terlambat','Izin','Sakit','Alpa')),
  checkin_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index idx_kajian_presensi_wa_tgl on hits_kajian_presensi(ketua_wa, tanggal);
create index idx_kajian_presensi_tgl on hits_kajian_presensi(tanggal);

comment on table hits_kajian_presensi is 'Presensi Kajian Adab ketua kelas (mingguan, Minggu 16.00). status null = sudah direminder Koor KK, belum check-in susulan.';
comment on column hits_kajian_presensi.ketua_wa is 'whatsapp_number ketua (dedup identitas; 1 orang walau banyak halaqah).';
comment on column hits_kajian_presensi.reminder_sent_at is 'Kapan Koor KK kirim reminder; countdown 3 hari menuju Alpa.';

create table hits_kajian_libur (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null unique,
  keterangan text,
  created_at timestamptz not null default now()
);
comment on table hits_kajian_libur is 'Tanggal Minggu Kajian Adab libur (dikecualikan dari total sesi & panel tindak).';
