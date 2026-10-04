-- 0016: Password reset plaintext recovery
-- Tujuan: admin (Hilmi) bisa re-show password sementara dalam 24 jam kalau
-- lupa kirim WA atau tutup tab terlalu cepat. Sebelumnya plaintext cuma di
-- in-memory React state — kalau revalidate jalan, state hilang & password
-- tidak bisa di-recover.
-- Idempotent: aman di-rerun.

alter table password_reset_requests
  add column if not exists new_password_plaintext text,
  add column if not exists plaintext_expires_at timestamptz;

create index if not exists idx_prr_plaintext_expiry
  on password_reset_requests(plaintext_expires_at)
  where new_password_plaintext is not null;

comment on column password_reset_requests.new_password_plaintext is
  'Plaintext password sementara. TTL 24 jam supaya admin bisa re-show. Wajib di-clear lewat tombol "Tandai sudah dikirim" atau natural expiry.';
comment on column password_reset_requests.plaintext_expires_at is
  'Kapan plaintext password tidak boleh ditampilkan lagi (default now + 24 jam saat accept).';
