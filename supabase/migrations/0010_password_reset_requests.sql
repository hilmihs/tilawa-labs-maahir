-- Tabel permintaan reset password
-- Flow: user lupa password → submit /lupa-password → kirim wa.me ke TS dengan link proses
-- TS buka link → guard cek WA = ADMIN_WA → Accept (generate password baru) / Decline

CREATE TABLE password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number text NOT NULL,
  requester_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  decided_by_wa text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prr_status ON password_reset_requests(status, created_at DESC);
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
-- Tidak ada policy public. App pakai service_role.
