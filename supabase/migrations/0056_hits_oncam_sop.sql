-- Kepatuhan SOP Teknis kini bersumber dari status on-cam pengajar saat KBM,
-- direkam ketua kelas per pertemuan di hits_keterangan_harian (bukan lagi
-- input manual penilaian_pedagogis.skor_kepatuhan_sop yang tak pernah terisi).
--
-- null  = tak berlaku (LIBUR, atau pertemuan JKG/BADAL — pengajar asli tak KBM),
--         atau belum diobservasi. Baris null tidak masuk penyebut skor.
-- true  = pengajar on-cam saat KBM.
-- false = pengajar off-cam saat KBM.

begin;

alter table hits_keterangan_harian
  add column if not exists pengajar_on_cam boolean;

comment on column hits_keterangan_harian.pengajar_on_cam is
  'Status on-cam pengajar saat KBM (Kepatuhan SOP Teknis matrix). null = tak berlaku/belum diisi (libur, JKG/BADAL, atau belum diobservasi).';

commit;
