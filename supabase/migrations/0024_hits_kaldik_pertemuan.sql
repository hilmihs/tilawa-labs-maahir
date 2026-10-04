-- =====================================================================
-- HITS: override pertemuan_no <-> tanggal per halaqah
-- =====================================================================
-- Auto-derivation (hits-pertemuan.ts deriveHalaqahPertemuan) memetakan
-- pertemuan_no ke tanggal dari kaldik + jadwal halaqah. Tabel ini menyimpan
-- override manual oleh koordinator ketua kelas bila derivasi salah/anomali
-- (libur dadakan, ganti hari, sesi tambahan). is_skipped meniadakan satu
-- pertemuan dari derivasi. Keyed (halaqah_id, pertemuan_no) — selaras dgn
-- unique key hits_keterangan_harian.
-- =====================================================================

create table hits_kaldik_pertemuan (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  pertemuan_no smallint not null,
  tanggal date not null,
  pekan smallint,
  is_skipped boolean not null default false,
  note text,
  set_by_role text not null,
  set_by_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (halaqah_id, pertemuan_no)
);

create index idx_hits_kaldik_pertemuan_halaqah on hits_kaldik_pertemuan(halaqah_id);

create trigger trg_hits_kaldik_pertemuan_updated
  before update on hits_kaldik_pertemuan
  for each row execute function set_updated_at();

alter table hits_kaldik_pertemuan enable row level security;

comment on table hits_kaldik_pertemuan is 'Override manual pemetaan pertemuan_no->tanggal per halaqah oleh koordinator ketua kelas. is_skipped meniadakan pertemuan dari derivasi otomatis.';
