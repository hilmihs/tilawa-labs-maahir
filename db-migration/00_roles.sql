-- 00_roles.sql — bootstrap peran Supabase di Postgres polos.
--
-- Migrasi aplikasi memakai kebijakan RLS yang meng-GRANT ke peran anon,
-- authenticated, dan service_role. Di Supabase peran ini sudah ada bawaan;
-- di Postgres biasa (atau self-hosted Supabase yg belum init) peran ini perlu
-- dibuat DULU sebelum schema.sql dijalankan, kalau tidak migrasi RLS gagal.
--
-- Peran dibuat NOLOGIN (tidak dipakai untuk koneksi langsung) — hanya sebagai
-- target GRANT. Aman dijalankan berulang (idempotent).
--
-- Jalankan:  psql "$DATABASE_URL" -f db-migration/00_roles.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  -- Peran 'authenticator' (dipakai PostgREST utk switch role) — opsional,
  -- hanya relevan bila mem-front dgn PostgREST/self-hosted Supabase.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'postgres';
  END IF;
  GRANT anon, authenticated, service_role TO authenticator;
END
$$;
