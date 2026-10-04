-- Longgarkan batas pekan kaldik dari 13 -> 40.
--
-- Alasan: batch dengan jadwal 1x/pekan yang berjalan panjang tidak muat batas lama.
-- Contoh Juli 2026: HITS Nurul Iman (Sabtu saja, ~26 pekan), HITS ABK / Nuroniyyah
-- (Jumat saja, ~28 pekan). Batas 13 (asumsi 2 sesi/pekan x 13 pekan = 26 pertemuan)
-- menolak pekan 14+ sehingga kaldik gagal di-seed dan pertemuan tidak ke-derive.
--
-- Derivasi (src/lib/hits-pertemuan.ts) sudah digeneralisasi:
--   pertemuan_no = sesiPerPekan*(pekan-1) + slot,  sesiPerPekan = jumlah hari jadwal.
-- Untuk 2 sesi/pekan hasilnya IDENTIK rumus lama (2*pekan-1 / 2*pekan), jadi numbering
-- batch existing tidak berubah. 40 = batas sanity (>= 28 pekan + buffer).

alter table hits_kaldik_hari drop constraint if exists hits_kaldik_hari_pekan_check;
alter table hits_kaldik_hari
  add constraint hits_kaldik_hari_pekan_check check (pekan between 1 and 40);
