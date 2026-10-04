-- Ledger pembayaran hutang menit (F2). Credit-only: debit TIDAK disimpan di sini,
-- dihitung dari hits_pelanggaran (KMT max(0,menit-5) / KBLA menit / JKG 90).
-- Append-only; saat ketua edit sebuah pertemuan, baris untuk keterangan_id itu
-- di-replace-all (hapus lalu insert). Scope per halaqah (1 halaqah = 1 pengajar).
create table hits_hutang_bayar (
  id uuid primary key default gen_random_uuid(),
  halaqah_id uuid not null references hits_halaqah(id) on delete cascade,
  pengajar_id uuid,                                    -- denormal utk agregasi report (F5)
  keterangan_id uuid references hits_keterangan_harian(id) on delete set null,
                                                       -- pertemuan tempat bayar dilaporkan (audit + idempoten)
  menit integer not null check (menit > 0),
  tanggal date not null,                               -- tanggal pertemuan tempat bayar dilaporkan
  dilaporkan_oleh text,                                -- ketua_kelas id / nama
  catatan text,
  created_at timestamptz not null default now()
);
create index idx_hits_hutang_bayar_halaqah on hits_hutang_bayar (halaqah_id);
create index idx_hits_hutang_bayar_pengajar on hits_hutang_bayar (pengajar_id);

alter table hits_hutang_bayar enable row level security; -- RLS on, NO policy (service-role bypass, konvensi repo)

comment on table hits_hutang_bayar is
  'Pembayaran hutang menit HITS (credit-only, per halaqah). Debit dihitung dari hits_pelanggaran.';
