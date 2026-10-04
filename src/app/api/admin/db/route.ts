import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { runAdminSql } from '@/lib/admin-db';

// Endpoint SQL admin — jalur cepat untuk automasi (Claude/script).
// Auth: header `Authorization: Bearer <ADMIN_API_TOKEN>`.
// Master-switch: hanya hidup bila ADMIN_DB_API=on DAN ADMIN_API_TOKEN di-set.
// Guarded writes ditangani di runAdminSql (preview + confirm).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function enabled(): boolean {
  return process.env.ADMIN_DB_API === 'on' && !!process.env.ADMIN_API_TOKEN;
}

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.ADMIN_API_TOKEN ?? '';
  const header = req.headers.get('authorization') ?? '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  const given = m?.[1] ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual butuh panjang sama → cek panjang dulu (bukan kebocoran signifikan).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  // Fitur mati → 404 (jangan bocorkan keberadaan endpoint).
  if (!enabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!tokenOk(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const sql = typeof body?.sql === 'string' ? body.sql : '';
  if (!sql.trim()) {
    return NextResponse.json({ error: 'sql_required' }, { status: 400 });
  }
  const confirm = body?.confirm === true;
  const allowNonTx = body?.allowNonTx === true;

  try {
    const result = await runAdminSql(sql, { confirm, allowNonTx, source: 'api', actor: null });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
