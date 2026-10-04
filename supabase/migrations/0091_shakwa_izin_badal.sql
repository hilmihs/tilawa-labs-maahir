-- 0091 — Izin Shakwa: jenis BADAL (kelas tetap jalan, diajar pengajar lain).
--
-- Penggantinya disimpan sebagai FK ke pengajar, bukan teks bebas seperti
-- hits_pelanggaran.badal_nama: gender badal harus sama dengan pengajar yang
-- izin, dan nomor WA-nya dipakai untuk link kabar wa.me. Kecocokan gender
-- dijaga server action (src/lib/shakwa-badal.ts → cekBadal), bukan trigger.
--
-- Nama constraint jenis adalah hasil generate Postgres dari CHECK inline di
-- 0049; cek dulu di prod: select conname from pg_constraint
-- where conrelid = 'shakwa_izin'::regclass and contype = 'c';

begin;

alter table shakwa_izin drop constraint shakwa_izin_jenis_check;
alter table shakwa_izin add constraint shakwa_izin_jenis_check
  check (jenis in ('KMT', 'KBLA', 'JKG', 'TIDAK_HADIR', 'BADAL'));

alter table shakwa_izin add column badal_pengajar_id uuid references pengajar(id);

-- Badal wajib untuk jenis BADAL, dan hanya untuk jenis itu.
alter table shakwa_izin add constraint shakwa_izin_badal_check
  check ((jenis = 'BADAL') = (badal_pengajar_id is not null));

comment on column shakwa_izin.jenis is 'KMT/KBLA/JKG/BADAL mengikuti istilah observasi; TIDAK_HADIR = tak mengajar sama sekali.';
comment on column shakwa_izin.badal_pengajar_id is 'Pengajar pengganti untuk izin BADAL; wajib segender dengan pengajar_id (dijaga aplikasi).';

commit;
