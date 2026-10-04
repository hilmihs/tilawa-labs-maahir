-- 0090 — Evaluasi Halaqah: batalkan 0088, kembali ke skor maksimum 100 dan
-- ambang lulus 70 (1 Oktober 2026).
--
--   * Tanpa kesalahan skornya 100, turun 6 per Lahn Jaliy dan 2 per Lahn Khafiy
--     (`SKOR_MAKS` di src/lib/evaluasi.ts) — berkala maupun ujian.
--   * Ambang standar & lulus 65 → 70. Lantai cetak 55 (`NILAI_MINIMUM`) tetap.
--
-- Rapot yang TERBIT 25 Sep – 1 Okt 2026 (payload.skorMaks = 95, ambang 65) tidak
-- disentuh: angka dan vonisnya beku di payload, dan skor tersimpan sesi yang
-- tercetak di rapot aktif seperti itu tetap berbasis 95 supaya rekap koordinator
-- sama dengan lembar rapotnya. Terbitkan ulang rapotnya bila ingin basis 100.
--
-- Semua sesi lain dihitung ulang ke basis 100 — termasuk yang 0088 turunkan ke
-- 95, dan tidak mengubah apa pun pada sesi yang memang sudah berbasis 100.
--
-- Track sebuah sesi: berkala = jenis-nya (qn/pb); ujian nomor 1 = qn, 2 = pb.

begin;

-- 1) Ambang per halaqah & per sesi.
alter table eval_halaqah alter column ambang_ujian set default 70;
update eval_halaqah set ambang_ujian = 70 where ambang_ujian = 65;

alter table evaluasi_sesi alter column ambang set default 70;
update evaluasi_sesi set ambang = 70 where ambang = 65;

alter table evaluasi_rapot alter column ambang set default 70;

-- 2) Skor tersimpan, kecuali sesi yang tercetak di rapot aktif berbasis 95.
update evaluasi_nilai n
   set skor = greatest(0,
         100
         - 6 * (n.jk_huruf + n.jk_harakat + n.jk_mad + n.jk_tasydid)
         - 2 * (n.kh_izhar + n.kh_idgham_bighunnah + n.kh_idgham_bilaghunnah
                + n.kh_idgham_mimi + n.kh_iqlab + n.kh_ikhfa_hakiki + n.kh_ikhfa_syafawi))
  from evaluasi_sesi s
 where s.id = n.sesi_id
   and not exists (
     select 1 from evaluasi_rapot r
      where r.peserta_id = n.peserta_id
        and r.status = 'aktif'
        and r.payload->>'skorMaks' = '95'
        and r.jenis_rapot = case
              when s.jenis in ('qn', 'pb') then s.jenis
              when s.jenis = 'ujian' and s.nomor_sesi = 1 then 'qn'
              when s.jenis = 'ujian' and s.nomor_sesi = 2 then 'pb'
            end
   );

commit;
