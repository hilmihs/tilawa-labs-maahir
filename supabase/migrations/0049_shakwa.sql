-- Shakwa dihidupkan kembali sebagai fitur di aplikasi (pengganti Google Form).
--
-- Tabel `shakwa` sudah ada sejak 0008 (+ kolom reviewer di 0015) tapi dorman —
-- halamannya pernah dihapus bersama koordinator_hits (lihat 0023). Migrasi ini
-- MEMAKAI ULANG tabel itu, bukan membuat yang baru: statusnya, kolom reviewer,
-- dan baris lama (bila ada) tetap berlaku. Yang ditambahkan hanya yang memang
-- belum ada.

alter table shakwa add column if not exists nomor_tiket text;
alter table shakwa add column if not exists pelapor_wa text;
alter table shakwa add column if not exists jawaban jsonb not null default '{}'::jsonb;
alter table shakwa add column if not exists lampiran text[] not null default '{}';

-- Baris lama (bila ada) belum punya nomor tiket; beri nomor dari tanggal masuknya
-- supaya kolomnya bisa unik tanpa membuang data.
-- row_number() tak boleh langsung di UPDATE, jadi nomornya dihitung dulu di CTE.
with bernomor as (
  select
    id,
    'SKW-'
      || to_char(created_at at time zone 'Asia/Jakarta', 'YYYYMMDD')
      || '-'
      || lpad(
           (row_number() over (
             partition by (created_at at time zone 'Asia/Jakarta')::date
             order by created_at
           ))::text,
           3, '0'
         ) as tiket
  from shakwa
  where nomor_tiket is null
)
update shakwa s
set nomor_tiket = b.tiket
from bernomor b
where b.id = s.id;

create unique index if not exists idx_shakwa_nomor_tiket on shakwa(nomor_tiket);
create index if not exists idx_shakwa_kategori on shakwa(kategori, created_at desc);

comment on column shakwa.nomor_tiket is 'SKW-YYYYMMDD-NNN — dipakai koordinator saat membalas lewat WhatsApp.';
comment on column shakwa.pelapor_wa is 'Nomor WA pelapor. JANGAN diekspor lewat API publik (lihat sanitize.ts).';
comment on column shakwa.jawaban is 'Jawaban field tambahan per kategori, mis. sudah_info_koordinator / sudah_presensi.';
comment on column shakwa.lampiran is 'Path objek di bucket storage "shakwa" (bukan URL — signed URL dibuat saat dibaca).';
comment on column shakwa.kategori is 'evaluasi | pengajar | peserta | cerita_menarik | modul_kurikulum | ketidaksesuaian_aplikasi | izin | tali_kasih (divalidasi di src/lib/shakwa.ts).';

-- Rincian izin: sumber alasan yang otomatis menempel ke tabayyun HITS supaya
-- pengajar tak diminta klarifikasi dua kali untuk kejadian yang sama.
create table shakwa_izin (
  id uuid primary key default gen_random_uuid(),
  shakwa_id uuid not null references shakwa(id) on delete cascade,
  pengajar_id uuid not null references pengajar(id),
  halaqah_id uuid references hits_halaqah(id),
  tanggal date not null,
  jenis text not null check (jenis in ('KMT', 'KBLA', 'JKG', 'TIDAK_HADIR')),
  menit int,
  jadwal_ganti date,
  alasan text not null,
  dipakai_tabayyun_id uuid references hits_tabayyun(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_shakwa_izin_lookup on shakwa_izin(pengajar_id, tanggal);
create index idx_shakwa_izin_shakwa on shakwa_izin(shakwa_id);

comment on table shakwa_izin is 'Rincian izin pra-kelas dari formulir Shakwa; dicocokkan ke pelanggaran observasi ketua kelas.';
comment on column shakwa_izin.jenis is 'KMT/KBLA/JKG mengikuti istilah observasi; TIDAK_HADIR = tak mengajar sama sekali.';
comment on column shakwa_izin.dipakai_tabayyun_id is 'Terisi saat alasannya sudah dipakai sebagai alasan_pengajar pada satu tabayyun.';

alter table shakwa_izin enable row level security;
