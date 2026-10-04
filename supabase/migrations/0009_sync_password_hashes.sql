-- One-time migration: sync password_hash across all role tables for multi-role users
-- Problem: tables were seeded separately with different default passwords,
-- so multi-role users can only login to the role whose hash matches.
-- Solution: pick the "correct" hash (from most recent login) and sync to all tables.

DO $$
DECLARE
  _wa TEXT;
  _hash TEXT;
BEGIN
  -- Create temp table with the correct hash per WA number
  CREATE TEMP TABLE _final_hash (whatsapp_number TEXT PRIMARY KEY, password_hash TEXT NOT NULL);

  -- Step 1: For users who have logged in, use hash from the table with the most recent last_login_at
  INSERT INTO _final_hash (whatsapp_number, password_hash)
  SELECT DISTINCT ON (whatsapp_number) whatsapp_number, password_hash
  FROM (
    SELECT whatsapp_number, password_hash, last_login_at FROM musyrif WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM koordinator WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM syaikh WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM pengajar WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM koordinator_hits WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM ketua_kelas WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
    UNION ALL
    SELECT whatsapp_number, password_hash, last_login_at FROM koordinator_ketua_kelas WHERE active=true AND password_hash IS NOT NULL AND last_login_at IS NOT NULL
  ) t
  ORDER BY whatsapp_number, last_login_at DESC;

  -- Step 2: Fallback for users who never logged in — use pengajar hash (primary HITS role)
  INSERT INTO _final_hash (whatsapp_number, password_hash)
  SELECT whatsapp_number, password_hash
  FROM pengajar
  WHERE active=true AND password_hash IS NOT NULL
  AND whatsapp_number NOT IN (SELECT whatsapp_number FROM _final_hash)
  ON CONFLICT DO NOTHING;

  -- Step 3: Update all 8 tables
  UPDATE peserta SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE peserta.whatsapp_number = f.whatsapp_number
  AND peserta.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE musyrif SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE musyrif.whatsapp_number = f.whatsapp_number
  AND musyrif.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE koordinator SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE koordinator.whatsapp_number = f.whatsapp_number
  AND koordinator.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE syaikh SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE syaikh.whatsapp_number = f.whatsapp_number
  AND syaikh.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE pengajar SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE pengajar.whatsapp_number = f.whatsapp_number
  AND pengajar.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE koordinator_hits SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE koordinator_hits.whatsapp_number = f.whatsapp_number
  AND koordinator_hits.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE ketua_kelas SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE ketua_kelas.whatsapp_number = f.whatsapp_number
  AND ketua_kelas.password_hash IS DISTINCT FROM f.password_hash;

  UPDATE koordinator_ketua_kelas SET password_hash = f.password_hash
  FROM _final_hash f
  WHERE koordinator_ketua_kelas.whatsapp_number = f.whatsapp_number
  AND koordinator_ketua_kelas.password_hash IS DISTINCT FROM f.password_hash;

  DROP TABLE _final_hash;
END $$;
