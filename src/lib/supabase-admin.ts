// Server-only "supabaseAdmin" — kini didukung PostgreSQL langsung (bukan
// Supabase/PostgREST). API query-builder tetap sama (shim di pg-shim.ts), jadi
// seluruh call-site aplikasi TIDAK berubah:
//   supabaseAdmin.from('tabel').select().eq()...       → SQL via node-postgres
//   supabaseAdmin.storage.from(bucket).upload()...      → filesystem lokal
//
// JANGAN import dari komponen client. Hanya untuk API routes / server actions /
// scripts CLI. ENV: DATABASE_URL, STORAGE_DIR, SESSION_SECRET.
import { createPgClient } from './pg-shim';
import { poolExec } from './pg-core';
import { createFsStorage } from './pg-storage';

const client = createPgClient(poolExec);

export const supabaseAdmin = Object.assign(client, {
  storage: createFsStorage(),
});

export const AUDIO_BUCKET = process.env.SUPABASE_AUDIO_BUCKET ?? 'setoran-audio';
