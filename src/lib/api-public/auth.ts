// auth.ts — verifikasi Bearer key, cache 30s, akrual pemakaian flush 60s.
import { createHash, randomBytes } from 'node:crypto';
import { flushEndpoint } from '@/lib/api-public/pemakaian';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { apiEnv } from './env';
import type { AuthResult, ScopeName } from './types';

const AUTH_TTL_MS = (Number(apiEnv('PUBLIC_API_AUTH_TTL')) || 30) * 1000;

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateKey(): { raw: string; tokenHash: string; tokenPrefix: string } {
  const raw = 'k_live_' + randomBytes(32).toString('base64url');
  return { raw, tokenHash: hashKey(raw), tokenPrefix: raw.slice(0, 12) };
}

export interface ClientRow {
  id: string;
  nama: string;
  scopes: string[];
  active: boolean;
  expires_at: string | null;
}

/** Pure: apakah baris ini sah untuk `today` (YYYY-MM-DD). expires_at inklusif. */
export function __verifyRow(row: ClientRow, today: string): AuthResult {
  if (!row.active) return { ok: false, status: 401, code: 'unauthorized', message: 'Key tidak aktif.' };
  if (row.expires_at && row.expires_at < today)
    return { ok: false, status: 401, code: 'unauthorized', message: 'Key kedaluwarsa.' };
  return { ok: true, client: { id: row.id, nama: row.nama, scopes: row.scopes as ScopeName[] } };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- cache verifikasi 30s ---
const cache = new Map<string, { at: number; result: AuthResult }>();
const usage = new Map<string, number>();
export function __resetAuthCache(): void { cache.clear(); usage.clear(); }

export async function verifyBearer(header: string | null): Promise<AuthResult> {
  if (!header || !header.startsWith('Bearer '))
    return { ok: false, status: 401, code: 'unauthorized', message: 'Header Authorization Bearer hilang.' };
  const raw = header.slice(7).trim();
  if (!raw) return { ok: false, status: 401, code: 'unauthorized', message: 'Key kosong.' };
  const h = hashKey(raw);

  const hit = cache.get(h);
  if (hit && Date.now() - hit.at < AUTH_TTL_MS) return hit.result;

  const { data } = await supabaseAdmin
    .from('api_client')
    .select('id, nama, scopes, active, expires_at')
    .eq('token_hash', h)
    .maybeSingle();

  let result: AuthResult;
  if (!data) result = { ok: false, status: 401, code: 'unauthorized', message: 'Key tidak dikenal.' };
  else result = __verifyRow(data as ClientRow, todayISO());

  cache.set(h, { at: Date.now(), result });
  return result;
}

// --- akrual pemakaian, flush 60s ---
export function recordUsage(clientId: string): void {
  usage.set(clientId, (usage.get(clientId) ?? 0) + 1);
}
export function __drainUsage(): { id: string; count: number }[] {
  const out = [...usage.entries()].map(([id, count]) => ({ id, count }));
  usage.clear();
  return out;
}
export async function flushUsage(): Promise<void> {
  await flushEndpoint();
  const drained = __drainUsage();
  for (const { id, count } of drained) {
    const { data } = await supabaseAdmin.from('api_client').select('request_count').eq('id', id).maybeSingle();
    const current = Number((data as { request_count?: number } | null)?.request_count ?? 0);
    await supabaseAdmin
      .from('api_client')
      .update({ last_used_at: new Date().toISOString(), request_count: current + count })
      .eq('id', id);
  }
}
