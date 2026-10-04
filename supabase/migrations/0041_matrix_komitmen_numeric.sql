-- Bug: skor_komitmen_jadwal = avg(Stabilitas Jadwal, Anti-Mangkir) bisa pecahan
-- (mis. 3.5), tapi kolomnya smallint → upsert matrix_rekap GAGAL total dengan
-- "invalid input syntax for type smallint: 3.5". Akibatnya computeMatrixForMonth
-- lempar error SETELAH menull-kan ranking (langkah 11) tapi SEBELUM upsert
-- (langkah 12) → kolom ranking bulan live (Jun/Jul 2026+) jadi kosong permanen.
-- Selaraskan tipe dengan rata_rata_* (numeric(3,2)) agar skor pecahan tersimpan.
alter table matrix_rekap
  drop constraint if exists matrix_rekap_skor_komitmen_jadwal_check;

alter table matrix_rekap
  alter column skor_komitmen_jadwal type numeric(3,2);

alter table matrix_rekap
  add constraint matrix_rekap_skor_komitmen_jadwal_check
  check (skor_komitmen_jadwal between 0 and 4);
