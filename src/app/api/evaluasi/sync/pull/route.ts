import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api-public/env';
import { runPull } from '@/lib/hilmihs/sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = apiEnv('CRON_SECRET');
  if (!secret || secret.length < 16) return false;
  const h = req.headers.get('authorization') ?? '';
  return h === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runPull();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
