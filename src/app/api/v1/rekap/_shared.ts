// _shared.ts — preamble bersama 6 route rekap: master-switch → auth → scope →
// rate-limit, plus pembungkus baca/tulis cache. Validasi param tetap per-route.
import { NextRequest, NextResponse } from 'next/server';
import { verifyBearer, recordUsage, flushUsage } from '@/lib/api-public/auth';
import { catatEndpoint } from '@/lib/api-public/pemakaian';
import { scopeAllows } from '@/lib/api-public/query';
import { ok, fail } from '@/lib/api-public/respond';
import { getCached, setCached, checkRateLimit, acquireInflight } from '@/lib/api-public/cache';
import { publicApiOn, apiEnv } from '@/lib/api-public/env';
import type { ScopeName } from '@/lib/api-public/types';

export const REKAP_TTL = 300;
export const REKAP_PER_MIN = 120;
export const MAX_INFLIGHT = Number(apiEnv('PUBLIC_API_MAX_INFLIGHT')) || 4;
export const MONTH_RE = /^\d{4}-\d{2}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Timer flush pemakaian: didaftarkan di sini juga supaya proses yang hanya melayani
// route rekap (tak pernah memuat modul catch-all) tetap menulis last_used_at/request_count.
declare global {
  // eslint-disable-next-line no-var
  var __apiUsageTimer: ReturnType<typeof setInterval> | undefined;
}
if (!globalThis.__apiUsageTimer) {
  globalThis.__apiUsageTimer = setInterval(() => { void flushUsage(); }, 60_000);
}

const GENDERS = new Set(['ikhwan', 'akhwat']);
/** gender valid = tak diisi, atau tepat 'ikhwan' | 'akhwat'. */
export function validGender(v: string | null): boolean {
  return v === null || GENDERS.has(v);
}

export interface Preamble {
  scopeKey: string;
  ifNoneMatch: string | null;
}

/**
 * master-switch → auth → scope → rate-limit. Kembalikan NextResponse (error) untuk
 * dikembalikan langsung, atau Preamble untuk lanjut ke validasi param + builder.
 */
export async function rekapPreamble(
  req: NextRequest,
  scope: ScopeName,
): Promise<NextResponse | Preamble> {
  if (!publicApiOn()) return fail('not_found', 'Tidak ditemukan.', 404);
  const auth = await verifyBearer(req.headers.get('authorization'));
  if (!auth.ok) return fail(auth.code, auth.message, auth.status);
  // Nama endpoint dari path: "/api/v1/rekap/matrix-guru" → "rekap/matrix-guru".
  const endpoint = req.nextUrl.pathname.replace(/^\/api\/v1\//, '').replace(/\/+$/, '');
  if (!scopeAllows(auth.client.scopes, scope)) {
    catatEndpoint(auth.client.id, endpoint, false);
    return fail('forbidden_scope', `Key tidak punya scope '${scope}'.`, 403);
  }
  if (!checkRateLimit(auth.client.id, REKAP_PER_MIN)) {
    const r = fail('rate_limited', `Batas ${REKAP_PER_MIN}/menit.`, 429);
    r.headers.set('Retry-After', '2');
    return r;
  }
  recordUsage(auth.client.id);
  catatEndpoint(auth.client.id, endpoint, true);
  return {
    scopeKey: [...auth.client.scopes].sort().join(','),
    ifNoneMatch: req.headers.get('if-none-match'),
  };
}

/** Baca cache → bila miss, panggil builder di bawah batas inflight, simpan, balas. */
export async function serveCached(
  key: string,
  ifNoneMatch: string | null,
  build: () => Promise<{ data: unknown; meta: Record<string, unknown> }>,
): Promise<NextResponse> {
  const cached = getCached(key);
  if (cached) {
    const c = cached.value as { data: unknown; meta: Record<string, unknown> };
    return ok(c.data, { ...c.meta, dari_cache: true, umur_detik: cached.umurDetik }, {
      ifNoneMatch,
      ttlSec: REKAP_TTL,
    });
  }
  const built = await acquireInflight(build, MAX_INFLIGHT, 5000);
  setCached(key, built, REKAP_TTL);
  return ok(built.data, { ...built.meta, dari_cache: false, umur_detik: 0 }, {
    ifNoneMatch,
    ttlSec: REKAP_TTL,
  });
}
