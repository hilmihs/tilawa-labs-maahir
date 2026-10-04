-- 0012: Checkout pengajar tracking
-- Tujuan: hitung durasi mengajar (checkout_at - checked_in_at) per hari.
-- Saat ini hanya checked_in_at yang tercatat — tidak ada ujung sesi.

alter table checkin_pengajar add column if not exists checkout_at timestamptz;

comment on column checkin_pengajar.checkout_at is 'Waktu pengajar menyelesaikan sesi (tombol Selesai mengajar). Nullable.';
