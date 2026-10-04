-- 0059_haqibah.sql
-- Haqibatul Mu'allim — pustaka berkas pembantu pengajar HITS.
-- Metadata berkas disimpan di sini; berkas fisiknya di ${STORAGE_DIR}/haqibah/<uuid>.<ext>
-- dan disajikan lewat /api/audio dengan URL bertanda tangan (SESSION_SECRET).
-- Nama di disk memakai UUID, jadi ubah nama tampil tak menyentuh disk dan URL lama tetap sah.

begin;

-- ── Folder (bertingkat, maksimum 3 tingkat — dipaksa di lapisan aplikasi) ──
create table if not exists haqibah_folder (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references haqibah_folder(id) on delete restrict,
  nama       text not null check (length(trim(nama)) between 1 and 120),
  urutan     integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NULL tak tertangkap unique biasa → dua indeks parsial.
create unique index if not exists uq_haqibah_folder_akar
  on haqibah_folder(lower(nama)) where parent_id is null;
create unique index if not exists uq_haqibah_folder_anak
  on haqibah_folder(parent_id, lower(nama)) where parent_id is not null;

-- ── Berkas ──
create table if not exists haqibah_file (
  id            uuid primary key default gen_random_uuid(),
  folder_id     uuid references haqibah_folder(id) on delete restrict, -- null = akar
  nama          text not null check (length(trim(nama)) between 1 and 200), -- nama tampil, TANPA ekstensi
  storage_path  text not null unique,   -- relatif bucket: '<uuid>.<ext>'
  ext           text not null,
  mime          text not null,
  ukuran        bigint not null check (ukuran > 0),
  urutan        integer not null default 0,
  diunggah_oleh text,                   -- nama/WA aktor, untuk jejak
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_haqibah_file_folder on haqibah_file(folder_id);

comment on table haqibah_folder is 'Folder pustaka Haqibatul Mu''allim; dikelola koordinator ketua kelas/superadmin, dibaca pengajar.';
comment on column haqibah_folder.parent_id is 'null = folder akar. on delete restrict: folder hanya boleh dihapus bila kosong.';
comment on table haqibah_file is 'Metadata berkas pustaka; berkas fisik di bucket "haqibah" (STORAGE_DIR).';
comment on column haqibah_file.storage_path is 'Path relatif di bucket haqibah, mis. "3f1c....pdf" — bukan URL. Signed URL dibuat saat dibaca.';
comment on column haqibah_file.nama is 'Nama tampil tanpa ekstensi; ubah nama tidak menyentuh berkas di disk.';

-- ── Trigger updated_at (fungsi set_updated_at sudah ada sejak 0051) ──
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create function set_updated_at() returns trigger language plpgsql as $fn$
    begin new.updated_at = now(); return new; end $fn$;
  end if;
end $$;

drop trigger if exists trg_haqibah_folder_updated on haqibah_folder;
create trigger trg_haqibah_folder_updated before update on haqibah_folder
  for each row execute function set_updated_at();
drop trigger if exists trg_haqibah_file_updated on haqibah_file;
create trigger trg_haqibah_file_updated before update on haqibah_file
  for each row execute function set_updated_at();

commit;
