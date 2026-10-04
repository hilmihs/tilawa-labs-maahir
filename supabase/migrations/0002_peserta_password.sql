-- =====================================================================
-- Add password authentication to peserta
-- =====================================================================
-- Peserta sekarang punya akun sendiri (sebelumnya: dropdown tanpa login).
-- Password di-backfill via script `npm run seed-peserta-password`
-- yang akan hash 'maahir123' dengan bcryptjs (cost 12).

alter table peserta add column password_hash text;

-- Index untuk login lookup yang cepat
create index if not exists idx_peserta_whatsapp on peserta(whatsapp_number);
create index if not exists idx_musyrif_whatsapp on musyrif(whatsapp_number);
create index if not exists idx_koordinator_whatsapp on koordinator(whatsapp_number);

comment on column peserta.password_hash is 'bcrypt hash. Default semua peserta: "maahir123" — peserta diharapkan ganti via /akun.';
