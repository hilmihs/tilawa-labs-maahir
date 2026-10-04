-- Nomor WhatsApp = unit identitas login. Untuk tabel peran di bawah ini satu WA
-- harus satu baris, tapi sampai sekarang indeksnya cuma btree biasa (bukan
-- unik), jadi tak ada yang mencegah baris kembar lahir.
--
-- Dua akibat nyata yang sudah terjadi:
--
-- 1. Baris kembar membuat perannya LENYAP dari sesi. `loadAccessesForWa` dan
--    `login()` memakai `.maybeSingle()`, yang mengembalikan `data: null` + error
--    bila barisnya >1; kedua pemanggil hanya membaca `{ data }` sehingga
--    errornya hilang. Satu pengajar (dua baris `pengajar`, WA sama, salah
--    satunya `active=false`) kehilangan akses Evaluasi Halaqah tanpa jejak
--    sampai dilaporkan manual. Sisi kodenya diperbaiki di src/lib/role-lookup.ts.
--
-- 2. `provisionPengajar` (src/app/hits/koordinator/validasi/actions.ts) memanggil
--    `.upsert(..., { onConflict: 'whatsapp_number' })`. Shim menerjemahkannya jadi
--    `ON CONFLICT (whatsapp_number) DO UPDATE` sungguhan, dan Postgres menolak itu
--    tanpa indeks unik yang cocok (42P10). Jadi jalur provisioning pengajar dari
--    layar validasi HITS memang tak pernah bisa jalan. Indeks ini membuatnya sah.
--
-- Indeks sengaja PENUH, bukan parsial: Postgres hanya menyimpulkan indeks parsial
-- untuk `ON CONFLICT` bila klausanya membawa `WHERE` predikat yang sama, dan shim
-- tak mengirimkan itu — indeks parsial akan tetap meninggalkan bug #2. Nomor NULL
-- tetap aman karena NULL dianggap saling berbeda (NULLS DISTINCT, default);
-- yang ikut terkunci hanya string kosong, dan itu memang bukan nomor sah.
-- Per 2026-08-28 keenam tabel ini tak punya baris ber-WA null maupun kosong, dan
-- tak ada WA kembar tersisa, jadi indeks terbentuk tanpa pembersihan lebih dulu.
--
-- `ketua_kelas` SENGAJA tidak ikut: di sana satu WA memang boleh punya banyak
-- baris (satu orang bisa jadi ketua di beberapa halaqah, per 2026-08-28 ada 141
-- WA dengan 2-5 baris), dan pemanggilnya sudah menyaring `active=true` + `limit(1)`.

begin;

create unique index if not exists uniq_peserta_wa on peserta (whatsapp_number);
create unique index if not exists uniq_musyrif_wa on musyrif (whatsapp_number);
create unique index if not exists uniq_koordinator_wa on koordinator (whatsapp_number);
create unique index if not exists uniq_syaikh_wa on syaikh (whatsapp_number);
create unique index if not exists uniq_pengajar_wa on pengajar (whatsapp_number);
create unique index if not exists uniq_koordinator_kk_wa on koordinator_ketua_kelas (whatsapp_number);

commit;
