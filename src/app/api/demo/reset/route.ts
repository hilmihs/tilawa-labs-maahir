import { NextResponse } from 'next/server';
import { seedDemo } from '../../../../../scripts/seed-demo';

/**
 * Wipes the demo back to its seeded state.
 *
 * Visitors can edit, grade and submit — that is the point — so by the end of a
 * day the data is full of noise. This runs nightly from vercel.json.
 *
 * Two independent guards, because this endpoint deletes rows:
 *  - NEXT_PUBLIC_DEMO must be "1", so on any other deployment the route 404s
 *    even if the file ships by mistake.
 *  - The caller must present DEMO_RESET_TOKEN as a bearer token, which is what
 *    Vercel Cron sends from CRON_SECRET.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  return jalankan(req);
}

export async function POST(req: Request) {
  return jalankan(req);
}

async function jalankan(req: Request) {
  if (process.env.NEXT_PUBLIC_DEMO !== '1') {
    return new NextResponse('Not found', { status: 404 });
  }
  const harapan = process.env.DEMO_RESET_TOKEN;
  if (!harapan) {
    return NextResponse.json({ error: 'DEMO_RESET_TOKEN is not set' }, { status: 500 });
  }
  if (req.headers.get('authorization')?.replace(/^Bearer /, '') !== harapan) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  await seedDemo();
  return NextResponse.json({ ok: true });
}
