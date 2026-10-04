-- 0086_cycle_bulanan.sql
-- Barnamij 2in1 jadi sebulan sekali, 28 → 27, mulai 28 September 2026.
--
-- Aturan lama TIDAK dibuang: tanggal sebelum 2026-09-28 tetap dihitung cycle
-- 2-pekan dari anchor 2026-06-01. Kalau diganti total, `week_start` seluruh
-- riwayat ikut berubah maknanya dan rekap bulanan lama bergeser angkanya.
--
-- Akibat yang disengaja: cycle 14-hari terakhir (2026-09-21) terpotong jadi
-- 21–27 September. Setoran di rentang itu sudah dipindah ke modul ujian, jadi
-- tidak ada baris yang tertinggal.
--
-- Harus sejalan dengan `src/lib/week.ts` (MONTHLY_SWITCH) — dua-duanya diuji
-- oleh `npm run test-week-cycle`.

begin;

create or replace function cycle_start_of(d date)
returns date
language sql
immutable
as $function$
  select case
    -- Era 2-pekan: anchor 2026-06-01, selalu jatuh di hari Senin.
    when d < date '2026-09-28' then
      date '2026-06-01' + (floor((d - date '2026-06-01')::numeric / 14)::int * 14)
    -- Era bulanan: tanggal 28 bulan ini bila sudah lewat tanggal 28,
    when extract(day from d) >= 28 then
      date_trunc('month', d)::date + 27
    -- selain itu tanggal 28 bulan sebelumnya.
    else
      (date_trunc('month', d) - interval '1 month')::date + 27
  end;
$function$;

comment on function cycle_start_of(date) is
  'Awal cycle barnamij 2in1. Dua era: 2-pekan (anchor 2026-06-01) sampai 27 Sep 2026, lalu bulanan 28 → 27.';

commit;
