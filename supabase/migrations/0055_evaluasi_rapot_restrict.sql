-- 0055_evaluasi_rapot_restrict.sql
-- Lindungi rapot beku (dokumen resmi ber-QR) dari terhapus tak sengaja (M4).
-- Sebelumnya FK halaqah/peserta ON DELETE CASCADE → hard-delete / seed re-run /
-- cleanup manual bisa menghapus rapot yang sudah diterbitkan tanpa jejak. Sync
-- hilmihs pakai soft-delete (aktif=false), jadi RESTRICT tak mengganggu sync.

begin;

alter table evaluasi_rapot drop constraint if exists evaluasi_rapot_halaqah_id_fkey;
alter table evaluasi_rapot
  add constraint evaluasi_rapot_halaqah_id_fkey
  foreign key (halaqah_id) references eval_halaqah(id) on delete restrict;

alter table evaluasi_rapot drop constraint if exists evaluasi_rapot_peserta_id_fkey;
alter table evaluasi_rapot
  add constraint evaluasi_rapot_peserta_id_fkey
  foreign key (peserta_id) references eval_peserta(id) on delete restrict;

commit;
