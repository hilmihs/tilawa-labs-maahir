import { NextRequest } from 'next/server';
import { fail, handle } from '@/lib/api-public/respond';
import { rekapLaporanMaahir } from '@/lib/api-public/rekap';
import { rekapPreamble, serveCached, MONTH_RE } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const pre = await rekapPreamble(req, 'maahir');
    if (!('scopeKey' in pre)) return pre;

    const bulan = req.nextUrl.searchParams.get('bulan');
    if (!bulan || !MONTH_RE.test(bulan)) return fail('bad_param', 'bulan wajib YYYY-MM.', 400);

    const key = `rekap/laporan-maahir?bulan=${bulan}|${pre.scopeKey}`;
    return serveCached(key, pre.ifNoneMatch, () => rekapLaporanMaahir(bulan));
  });
}
