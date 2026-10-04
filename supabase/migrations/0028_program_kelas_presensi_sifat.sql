-- Sifat presensi per kelas program Maahir.
-- 'harian'  : wajib presensi tiap hari jadwal (default, perilaku lama).
-- 'mingguan': cukup hadir 1x per pekan (Senin–Jum'at). Mis. Maahir Alumni/Talaqqi
--             alumni yang talaqqi 1x/pekan tanpa hari tetap.
alter table program_kelas
  add column if not exists presensi_sifat text not null default 'harian'
    check (presensi_sifat in ('harian', 'mingguan'));

update program_kelas set presensi_sifat = 'mingguan'
  where name = 'Maahir Alumni/Talaqqi';
