-- Override manual id eval_pengajar untuk pengajar maahir.
--
-- Modul Evaluasi mencocokkan pengajar maahir ke halaqah eval-nya lewat nomor
-- WhatsApp (`wa:<nomor ternormalisasi>` = id mirror hilmihs). Sebagian pengajar
-- punya nomor berbeda antara maahir dan hilmihs — atau nomor placeholder di
-- maahir — sehingga pencocokan otomatisnya gagal dan halaqahnya tak muncul.
--
-- Menyamakan whatsapp_number bukan jalan keluar: nomor itu unit identitas login,
-- mengubahnya memindahkan akun beliau ke nomor lain. Kolom ini memberi jalur
-- terpisah: isi dengan id eval_pengajar yang benar, biarkan null untuk pengajar
-- yang pencocokan WA-nya sudah tepat.
--
-- Diisi manual (bukan hasil sync) — pull hilmihs tak pernah menyentuh tabel
-- pengajar, jadi nilainya aman dari reconciliation.

begin;

alter table pengajar
  add column if not exists eval_pengajar_id text;

comment on column pengajar.eval_pengajar_id is
  'Override id eval_pengajar (mirror hilmihs, format wa:<nomor>). null = cocokkan otomatis lewat whatsapp_number.';

commit;
