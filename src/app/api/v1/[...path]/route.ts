import { NextRequest } from 'next/server';
import { verifyBearer, recordUsage, flushUsage } from '@/lib/api-public/auth';
import { catatEndpoint } from '@/lib/api-public/pemakaian';
import { getEntity } from '@/lib/api-public/registry';
import { parseRequest, runEntity, scopeAllows, resolveKajianPresensi } from '@/lib/api-public/query';
import { sanitize } from '@/lib/api-public/sanitize';
import { ok, fail, handle } from '@/lib/api-public/respond';
import { getCached, setCached, checkRateLimit, checkBurst, acquireInflight } from '@/lib/api-public/cache';
import { publicApiOn, apiEnv } from '@/lib/api-public/env';

export const dynamic = 'force-dynamic';

const ENTITY_TTL = 60;
const MAX_INFLIGHT = Number(apiEnv('PUBLIC_API_MAX_INFLIGHT')) || 4;
const RATE_PER_MIN = Number(apiEnv('PUBLIC_API_RATE_PER_MIN')) || 120;
const BURST_PER_SEC = Number(apiEnv('PUBLIC_API_BURST_PER_SEC')) || 5;

declare global {
  // eslint-disable-next-line no-var
  var __apiUsageTimer: ReturnType<typeof setInterval> | undefined;
}
if (!globalThis.__apiUsageTimer) {
  globalThis.__apiUsageTimer = setInterval(() => { void flushUsage(); }, 60_000);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(async () => {
    if (!publicApiOn()) return fail('not_found', 'Tidak ditemukan.', 404);

    const auth = await verifyBearer(req.headers.get('authorization'));
    if (!auth.ok) return fail(auth.code, auth.message, auth.status);

    if (!checkBurst(auth.client.id, BURST_PER_SEC)) {
      const r = fail('rate_limited', `Melewati batas ${BURST_PER_SEC}/detik.`, 429);
      r.headers.set('Retry-After', '1');
      return r;
    }
    if (!checkRateLimit(auth.client.id, RATE_PER_MIN)) {
      const r = fail('rate_limited', `Melewati batas ${RATE_PER_MIN}/menit.`, 429);
      r.headers.set('Retry-After', '2');
      return r;
    }

    const { path } = await ctx.params;
    const route = path.join('/');
    const def = getEntity(route);
    // Pemakaian per endpoint dicatat juga saat ditolak: "key X mencoba entitas Y
    // tapi scope-nya kurang" adalah keterangan yang dibutuhkan saat menelusuri.
    if (!def) {
      catatEndpoint(auth.client.id, route, false);
      return fail('unknown_entity', `Entitas '${route}' tidak ada.`, 404);
    }
    if (!def.refShared && !scopeAllows(auth.client.scopes, def.scope)) {
      catatEndpoint(auth.client.id, def.route, false);
      return fail('forbidden_scope', `Key tidak punya scope '${def.scope}'.`, 403);
    }

    const params = req.nextUrl.searchParams;
    const parsed = parseRequest(params, def);
    if (!parsed.ok) {
      catatEndpoint(auth.client.id, def.route, false);
      return fail(parsed.code, parsed.message, 400);
    }

    recordUsage(auth.client.id);
    catatEndpoint(auth.client.id, def.route, true);

    const cacheKey = `${route}?${params.toString()}|${[...auth.client.scopes].sort().join(',')}`;
    const ifNoneMatch = req.headers.get('if-none-match');
    const cached = getCached(cacheKey);
    if (cached) {
      const c = cached.value as { data: unknown; total: number };
      return ok(c.data, {
        page: parsed.page, limit: parsed.limit, total: c.total,
        has_more: parsed.page * parsed.limit < c.total,
        dari_cache: true, umur_detik: cached.umurDetik,
      }, { ifNoneMatch, ttlSec: ENTITY_TTL });
    }

    const result = await acquireInflight(() => runEntity(def, parsed), MAX_INFLIGHT, 5000);
    let rows = result.rows as Array<Record<string, unknown>>;
    const total = result.total;
    if (route === 'hits/kajian-presensi') rows = await resolveKajianPresensi(rows);
    const data = sanitize(rows);
    setCached(cacheKey, { data, total }, ENTITY_TTL);

    return ok(data, {
      page: parsed.page, limit: parsed.limit, total,
      has_more: parsed.page * parsed.limit < total,
      dari_cache: false, umur_detik: 0,
    }, { ifNoneMatch, ttlSec: ENTITY_TTL });
  });
}
