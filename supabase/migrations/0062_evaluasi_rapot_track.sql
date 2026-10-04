-- 0062_evaluasi_rapot_track.sql
-- Rotasi sumbu rapot: dari tahapan (berkala | ujian) menjadi track (qn | pb).
--
-- Sebelum : Rapot Berkala (4 sesi QN + 4 sesi PB digabung) + Rapot Ujian Akhir
--           (Ujian QN & PB berdampingan, hanya Ujian PB yang masuk nilai akhir).
-- Sesudah : Rapot QN (4 sesi QN + Ujian QN) dan Rapot PB (4 sesi PB + Ujian PB),
--           masing-masing 30% rata sesi + 70% ujian track-nya, ambang lulus 70.
--
-- Kelulusan level resmi mengikuti Rapot PB; Rapot QN prasyarat yang wajib tuntas
-- tapi nilainya tidak menggugurkan.
--
-- RAPOT LAMA TETAP BERLAKU. Empat nilai `jenis_rapot` lama (0053 + 0058) tidak
-- dicabut dan barisnya tidak pernah dihitung ulang — dokumen ber-QR yang sudah
-- beredar harus tetap terverifikasi apa adanya.

begin;

-- 1) Lebarkan check jenis_rapot jadi 6 nilai: 4 legacy + 2 track baru.
alter table evaluasi_rapot
  drop constraint if exists evaluasi_rapot_jenis_rapot_check;

alter table evaluasi_rapot
  add constraint evaluasi_rapot_jenis_rapot_check
  check (jenis_rapot in ('berkala', 'ujian', 'ujian_qn', 'ujian_pb', 'qn', 'pb'));

-- Indeks unik 0054 (peserta_id, halaqah_id, jenis_rapot) where status='aktif'
-- TIDAK diubah: 'qn' dan 'pb' otomatis menempati slot kunci masing-masing, jadi
-- menerbitkan Rapot PB tidak menggantikan Rapot QN. Satu peserta bisa punya
-- beberapa baris aktif lintas era — itu memang konsekuensi "rapot lama berlaku".

-- 2) Kolom skor ujian yang netral-track. `ujian_pb_skor` sengaja TIDAK dipakai
--    ulang: menulis skor Ujian QN ke kolom bernama _pb akan menyesatkan query
--    mana pun yang membacanya.
alter table evaluasi_rapot add column if not exists ujian_skor smallint;

update evaluasi_rapot
   set ujian_skor = ujian_pb_skor
 where ujian_skor is null
   and ujian_pb_skor is not null;

comment on column evaluasi_rapot.ujian_skor is
  'Skor ujian yang dipakai nilai_akhir baris ini. Baris qn=Ujian QN, pb/ujian_pb/ujian=Ujian PB.';

comment on column evaluasi_rapot.ujian_pb_skor is
  'LEGACY. Baris qn selalu null — pakai ujian_skor.';

comment on column evaluasi_rapot.berkala_avg is
  'SEMANTIK BEDA PER ERA: baris berkala/ujian = rata gabungan QN+PB; baris qn/pb = rata sesi track itu saja; baris ujian_qn/ujian_pb = null. Query yang membacanya WAJIB memfilter jenis_rapot.';

-- 3) Ambang lulus per-sesi ujian disamakan ke 70 (sebelumnya default DB 65 vs
--    default TS 70). Ujian QN kini menyumbang 70% Rapot QN, jadi badge lulus per
--    ujian tidak boleh lagi memakai ambang yang berbeda dari nilai akhir.
alter table eval_halaqah alter column ambang_ujian set default 70;
update eval_halaqah set ambang_ujian = 70 where ambang_ujian = 65;

-- 4) Redaksi lever batch Januari 2026 disesuaikan ke sumbu baru. Kolomnya sendiri
--    (0058) tidak berubah dan tetap berlaku untuk KEDUA track.
comment on column eval_batch.rapot_ujian_terpisah is
  'true = nilai akhir tiap rapot murni skor ujian track itu (Rapot QN = Ujian QN, Rapot PB = Ujian PB), tanpa bobot maupun syarat sesi berkala. Kolom CURATED — tidak ditimpa sinkron hilmihs.';

commit;
