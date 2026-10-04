-- Presensi mandiri per peserta (bukan oleh ketua/wakil) untuk kelas tertentu,
-- mis. Maahir Takhassus Ikhwan. Bila true, presensi diisi tiap peserta via link
-- kelas tanpa login (pilih nama → tandai status sendiri).
alter table program_kelas add column if not exists self_attendance boolean not null default false;
comment on column program_kelas.self_attendance is
  'Bila true, presensi diisi tiap peserta sendiri (link kelas tanpa login), bukan oleh ketua/wakil.';

-- Maahir Takhassus Ikhwan → presensi mandiri.
update program_kelas set self_attendance = true where name = 'Maahir Takhassus Ikhwan';

-- Muallim Najih: dihapus total beserta seluruh data terkait.
delete from kehadiran_peserta where pertemuan_id in (select id from pertemuan_program where program = 'muallim_najih');
delete from pertemuan_program where program = 'muallim_najih';
delete from pengajuan_alasan pa using program_kehadiran pk where pa.program_id = pk.id and pk.name = 'Program Muallim Najih';
delete from checkin_pengajar c using program_kehadiran pk where c.program_id = pk.id and pk.name = 'Program Muallim Najih';
delete from libur_program l using program_kehadiran pk where l.program_id = pk.id and pk.name = 'Program Muallim Najih';
delete from program_kehadiran where name = 'Program Muallim Najih';
