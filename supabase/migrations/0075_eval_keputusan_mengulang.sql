-- 0075_eval_keputusan_mengulang.sql
-- Keputusan koordinator: peserta yang tidak lulus mengulang di KELAS mana.
--
-- Kelulusan level ditentukan Rapot PB saja — Rapot QN prasyarat, nilainya tidak
-- menggugurkan. Jadi yang jadi kandidat keputusan adalah peserta ber-nilai akhir
-- PB di bawah ambang. Yang belum bisa dijawab data mana pun: peserta itu
-- ditempatkan ulang di Kelas QN (akar masalahnya bacaan dasar) atau Kelas PB
-- (cukup mengulang tahap penentu). Itu penilaian manusia, dan tabel ini tempat
-- menyimpannya. Yang diulang KELASNYA, bukan evaluasinya.
--
-- Tabel ini TIDAK menyentuh evaluasi_rapot. Rapot yang sudah terbit ber-QR
-- beredar di tangan wali santri; angkanya harus tetap sama dibaca kapan pun.
-- Keputusan ini muncul di lembar rapot sebagai keterangan tambahan yang dibaca
-- hidup saat rapot dibuka — dan hanya bila keputusannya ada. Tanpa keputusan,
-- rapot tidak menampilkan apa pun soal ini.
--
-- Satu baris per peserta (primary key), bukan riwayat: peserta mirror hilmihs
-- berumur satu angkatan (id `<slug-batch>:<angka>`), jadi "keputusan untuk
-- peserta ini" sudah otomatis berarti "keputusan untuk angkatan ini". Mengubah
-- keputusan menimpa barisnya; membatalkan menghapusnya.
--
-- on delete cascade mengikuti evaluasi_nilai (0051) dan evaluasi_rapot (0053):
-- sync hilmihs tidak pernah menghapus peserta — hanya menonaktifkan (aktif=false)
-- — jadi cascade hanya menyala saat barisnya memang benar-benar dibuang.

begin;

create table if not exists eval_keputusan_mengulang (
  peserta_id      text primary key references eval_peserta(id) on delete cascade,
  -- 'qn' = Kelas QN, 'pb' = Kelas PB — kelas tempat peserta mengulang.
  keputusan       text not null check (keputusan in ('qn', 'pb')),
  -- koordinator.id penetap. ON DELETE SET NULL: koordinator berhenti tidak boleh
  -- menghapus keputusan yang sudah dipakai menyusun angkatan berikutnya.
  ditetapkan_oleh uuid references koordinator(id) on delete set null,
  ditetapkan_at   timestamptz not null default now()
);

commit;
