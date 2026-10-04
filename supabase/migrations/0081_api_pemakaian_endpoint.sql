-- 0081 — API publik: pemakaian per endpoint.
--
-- Sebelumnya hanya ada `api_client.request_count` dan `last_used_at`, sehingga
-- pertanyaan "apakah konsumen sudah menarik matrix pengajar?" tidak terjawab.
--
-- Bentuknya rekap per (key, endpoint, hari), bukan satu baris per permintaan:
-- cukup untuk menjawab endpoint mana yang dipakai dan seberapa sering, tanpa
-- menumbuhkan tabel sebesar lalu lintas. Tidak menyimpan parameter kueri —
-- parameter bisa memuat id orang.

begin;

create table if not exists api_pemakaian_endpoint (
  client_id    uuid not null references api_client(id) on delete cascade,
  endpoint     text not null check (length(endpoint) between 1 and 120),
  tanggal      date not null,
  jumlah       integer not null default 0 check (jumlah >= 0),
  jumlah_gagal integer not null default 0 check (jumlah_gagal >= 0),
  terakhir     timestamptz not null default now(),
  primary key (client_id, endpoint, tanggal)
);

create index if not exists idx_api_pemakaian_endpoint_tanggal
  on api_pemakaian_endpoint(tanggal desc);
create index if not exists idx_api_pemakaian_endpoint_endpoint
  on api_pemakaian_endpoint(endpoint, tanggal desc);

commit;
