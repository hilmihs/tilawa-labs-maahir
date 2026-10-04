-- Klaim penunaian hutang menit oleh pengajar saat tabayyun (spec 2026-08-28).
-- Klaim TIDAK langsung jadi kredit: koordinator menyetujui saat memutus, baru
-- baris hits_hutang_bayar ditulis.

-- Kolom dan indeksnya sengaja DIPISAH. `add column ... unique` membangun indeks
-- di dalam ALTER yang sama sambil memegang ACCESS EXCLUSIVE; saat diterapkan ke
-- prod 2026-08-28 satu ALTER gabungan mati kena 502 dan seluruh transaksi
-- rollback. Dipecah begini, tiap statement kecil dan kegagalan mudah dilacak.
alter table hits_tabayyun
  add column if not exists akses_token text,
  add column if not exists bayar_menit_klaim integer check (bayar_menit_klaim >= 0),
  add column if not exists bayar_catatan text,
  add column if not exists bayar_menit_disetujui integer check (bayar_menit_disetujui >= 0),
  add column if not exists izin_selisih_menit integer check (izin_selisih_menit >= 0);

create unique index if not exists idx_hits_tabayyun_akses_token
  on hits_tabayyun (akses_token);

comment on column hits_tabayyun.izin_selisih_menit is
  'Menit observasi ketua kelas dikurangi menit yang dilaporkan pengajar lewat izin pra-kelas. > 0 berarti izin tidak menutupi seluruhnya; 0/NULL berarti tidak ada selisih atau tidak ada izin.';
comment on column hits_tabayyun.akses_token is
  'Token acak 32 byte base64url untuk /tabayyun/<token> (tanpa login). Digenerate saat reminder pertama; berlaku selama status <> decided.';
comment on column hits_tabayyun.bayar_menit_klaim is
  'Klaim pengajar: menit hutang yang sudah ditunaikan di pertemuan ini. 0 = belum menunaikan. NULL = belum menjawab.';
comment on column hits_tabayyun.bayar_menit_disetujui is
  'Menit yang disetujui koordinator; inilah yang ditulis ke hits_hutang_bayar (sumber=tabayyun).';

-- Pagar: hits/ketua melakukan replace-all per keterangan_id (delete lalu insert).
-- Tanpa kolom ini, kredit hasil tabayyun terhapus diam-diam saat ketua mengedit
-- pertemuan yang sama.
alter table hits_hutang_bayar
  add column if not exists sumber text not null default 'ketua'
    check (sumber in ('ketua', 'tabayyun'));

comment on column hits_hutang_bayar.sumber is
  'Asal kredit: ketua (laporan ketua kelas, replace-all per keterangan) | tabayyun (disetujui koordinator saat memutus).';
