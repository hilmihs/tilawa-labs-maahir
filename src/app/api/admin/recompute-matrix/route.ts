import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { computeMatrixForMonth, isLiveMatrixMonth } from '@/lib/matrix-compute';

// Recompute matrix_rekap dari server (padanan `npm run recompute-matrix`, yang
// butuh DATABASE_URL langsung). Dipakai setelah perubahan rumus/pengelompokan
// indikator supaya rata-rata bulan berjalan ikut diperbarui tanpa SSH.
// Auth & master-switch identik dengan /api/admin/db.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function enabled(): boolean {
  return process.env.ADMIN_DB_API === 'on' && !!process.env.ADMIN_API_TOKEN;
}

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.ADMIN_API_TOKEN ?? '';
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  const a = Buffer.from(m?.[1] ?? '');
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!tokenOk(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const months = (body as { months?: unknown })?.months;
  if (!Array.isArray(months) || months.length === 0) {
    return NextResponse.json({ error: 'months wajib diisi (array YYYY-MM)' }, { status: 400 });
  }
  if (months.length > 12) {
    return NextResponse.json({ error: 'Maksimal 12 bulan per permintaan.' }, { status: 400 });
  }

  const hasil: Array<{ month: string; status: string; pengajar?: number; softTerisi?: number }> = [];
  for (const raw of months) {
    const ym = String(raw);
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      hasil.push({ month: ym, status: 'skip: format harus YYYY-MM' });
      continue;
    }
    // Bulan < anchor adalah seed historis — jangan ditimpa hasil live yang kosong.
    if (!isLiveMatrixMonth(ym)) {
      hasil.push({ month: ym, status: 'skip: bulan historis (< anchor)' });
      continue;
    }
    try {
      const rows = await computeMatrixForMonth(ym);
      hasil.push({
        month: ym,
        status: 'ok',
        pengajar: rows.length,
        softTerisi: rows.filter((r) => r.skor_kedisiplinan_waktu !== null).length,
      });
    } catch (e) {
      hasil.push({ month: ym, status: `error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return NextResponse.json({ ok: true, hasil });
}
