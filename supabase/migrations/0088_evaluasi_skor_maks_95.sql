-- 0088 — Evaluasi Halaqah: skor maksimum 95, ambang lulus 65
-- Kebijakan Majelis Pendidikan, 25 September 2026.
--
--   * Tidak ada nilai 100: tanpa kesalahan skornya 95, lalu turun 6 per Lahn
--     Jaliy dan 2 per Lahn Khafiy (`SKOR_MAKS` di src/lib/evaluasi.ts). Berlaku
--     untuk SEMUA sesi, berkala maupun ujian.
--   * Ambang standar & lulus 70 → 65. Lantai cetak 55 (`NILAI_MINIMUM`) tetap.
--
-- HANYA BERLAKU KE DEPAN. Rapot yang sudah terbit tidak disentuh: angka, ambang
-- (`evaluasi_rapot.ambang`, `payload.ambang`) dan vonisnya beku di payload.
-- Karena itu skor tersimpan di evaluasi_nilai hanya dihitung ulang untuk sesi
-- yang BELUM masuk rapot aktif mana pun — skor sesi yang sudah tercetak tetap
-- berbasis 100 supaya rekap koordinator tetap sama dengan lembar rapotnya.
--
-- Track sebuah sesi: berkala = jenis-nya (qn/pb); ujian nomor 1 = qn, 2 = pb.
-- Rapot era lama (berkala/ujian/ujian_qn/ujian_pb) melindungi semua sesi peserta.

begin;

-- 1) Ambang per halaqah & per sesi (badge lulus ujian, garis standar).
alter table eval_halaqah alter column ambang_ujian set default 65;
update eval_halaqah set ambang_ujian = 65 where ambang_ujian = 70;

alter table evaluasi_sesi alter column ambang set default 65;
update evaluasi_sesi set ambang = 65 where ambang = 70;

-- Rapot selalu menulis ambang eksplisit; default ini sekadar serasi.
alter table evaluasi_rapot alter column ambang set default 65;

-- 2) Skor tersimpan untuk sesi yang belum tercetak di rapot aktif.
update evaluasi_nilai n
   set skor = greatest(0,
         95
         - 6 * (n.jk_huruf + n.jk_harakat + n.jk_mad + n.jk_tasydid)
         - 2 * (n.kh_izhar + n.kh_idgham_bighunnah + n.kh_idgham_bilaghunnah
                + n.kh_idgham_mimi + n.kh_iqlab + n.kh_ikhfa_hakiki + n.kh_ikhfa_syafawi))
  from evaluasi_sesi s
 where s.id = n.sesi_id
   and not exists (
     select 1 from evaluasi_rapot r
      where r.peserta_id = n.peserta_id
        and r.status = 'aktif'
        and (
          r.jenis_rapot in ('berkala', 'ujian', 'ujian_qn', 'ujian_pb')
          or r.jenis_rapot = case
               when s.jenis in ('qn', 'pb') then s.jenis
               when s.jenis = 'ujian' and s.nomor_sesi = 1 then 'qn'
               when s.jenis = 'ujian' and s.nomor_sesi = 2 then 'pb'
             end
        )
   );

commit;
