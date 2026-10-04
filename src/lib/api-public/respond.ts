// respond.ts — envelope sukses/error, ETag, 304, penangkap error.
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { recordErrorDiag } from '@/lib/error-diag';
import type { ApiMeta } from './types';

export function etagOf(body: unknown): string {
  return '"' + createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32) + '"';
}

export function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function ok(
  data: unknown,
  meta: ApiMeta,
  opts: { ifNoneMatch?: string | null; ttlSec: number },
): NextResponse {
  const body = { data, meta };
  const etag = etagOf(body);
  if (opts.ifNoneMatch && opts.ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  const res = NextResponse.json(body);
  res.headers.set('ETag', etag);
  res.headers.set('Cache-Control', `private, max-age=${opts.ttlSec}`);
  return res;
}

/** Bungkus handler: apa pun yang dilempar → 500 internal, detail hanya ke log. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    const e = err as { code?: string; message?: string; name?: string };
    if (e.code === 'rate_limited') {
      const res = fail('rate_limited', 'Server sibuk, coba lagi.', 429);
      res.headers.set('Retry-After', '2');
      return res;
    }
    console.error('[api/v1] internal', e);
    recordErrorDiag({ name: e.name, message: e.message });
    return fail('internal', 'Kesalahan tak terduga.', 500);
  }
}
