-- Fix data: keterangan halaqah program 'lanjutan' harus level='perbaikan_bacaan'.
--
-- 115 baris legacy tersimpan 'qoidah_nuroniyyah' (44 dobel dgn baris perbaikan,
-- 71 qoidah-only). Halaman ketua mencocokkan pertemuan by (level, pertemuan_no)
-- → "Belum diisi" padahal terisi + baris dobel. Kode aktif sudah benar (simpan
-- pakai level derived = perbaikan_bacaan untuk lanjutan) → ini pembersihan data.
--
-- Aturan: per (halaqah, pertemuan_no), simpan baris updated_at TERBARU (keeper),
-- pindahkan hits_pelanggaran/hits_tabayyun dari baris lain ke keeper (hanya bila
-- belum ada — hormati unique), hapus baris lain, lalu set keeper ke perbaikan.
-- Hanya menyentuh grup yang punya baris qoidah (perbaikan-only tak tersentuh).
--
-- Idempoten: dijalankan ulang → temp kosong (tak ada qoidah lagi) → no-op.

create temp table _fix_ket on commit drop as
select k.id, k.halaqah_id, k.pertemuan_no, k.level, k.updated_at,
  row_number() over (partition by k.halaqah_id, k.pertemuan_no
                     order by k.updated_at desc, k.id desc) as rn
from hits_keterangan_harian k
join hits_halaqah h on h.id = k.halaqah_id
where h.program = 'lanjutan'
  and k.level in ('qoidah_nuroniyyah','perbaikan_bacaan')
  and exists (
    select 1 from hits_keterangan_harian kq
    where kq.halaqah_id = k.halaqah_id and kq.pertemuan_no = k.pertemuan_no
      and kq.level = 'qoidah_nuroniyyah'
  );

-- pindahkan pelanggaran dari non-keeper → keeper (jenis yg belum ada)
update hits_pelanggaran p set keterangan_id = kp.id
from _fix_ket lo
join _fix_ket kp on kp.halaqah_id = lo.halaqah_id and kp.pertemuan_no = lo.pertemuan_no and kp.rn = 1
where lo.rn > 1 and p.keterangan_id = lo.id
  and not exists (select 1 from hits_pelanggaran p2 where p2.keterangan_id = kp.id and p2.jenis = p.jenis);

-- pindahkan tabayyun dari non-keeper → keeper (bila keeper belum punya)
update hits_tabayyun t set keterangan_id = kp.id
from _fix_ket lo
join _fix_ket kp on kp.halaqah_id = lo.halaqah_id and kp.pertemuan_no = lo.pertemuan_no and kp.rn = 1
where lo.rn > 1 and t.keterangan_id = lo.id
  and not exists (select 1 from hits_tabayyun t2 where t2.keterangan_id = kp.id);

-- hapus non-keeper (cascade buang sisa pelanggaran/tabayyun dup)
delete from hits_keterangan_harian where id in (select id from _fix_ket where rn > 1);

-- keeper yg masih qoidah → perbaikan (kini tanpa kembar, aman thd unique)
update hits_keterangan_harian set level = 'perbaikan_bacaan', updated_at = now()
where id in (select id from _fix_ket where rn = 1 and level = 'qoidah_nuroniyyah');
