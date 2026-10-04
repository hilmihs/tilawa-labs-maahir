-- Fix: partial unique index tidak bisa di-match oleh ON CONFLICT.
-- Ganti dengan full unique index (NULLS DISTINCT default = aman).

drop index if exists idx_checkin_pengajar_program;
drop index if exists idx_checkin_pengajar_kelas;

create unique index idx_checkin_pengajar_program
  on checkin_pengajar(pengajar_id, program_id, tanggal);

create unique index idx_checkin_pengajar_kelas
  on checkin_pengajar(pengajar_id, kelas_hits_id, tanggal);
