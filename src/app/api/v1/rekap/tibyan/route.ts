import { NextRequest } from 'next/server';
import { fail, handle } from '@/lib/api-public/respond';
import { rekapTibyan } from '@/lib/api-public/rekap';
import { rekapPreamble, serveCached, MONTH_RE, validGender } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const pre = await rekapPreamble(req, 'maahir');
    if (!('scopeKey' in pre)) return pre;

    const sp = req.nextUrl.searchParams;
    const bulan = sp.get('bulan');
    if (!bulan || !MONTH_RE.test(bulan)) return fail('bad_param', 'bulan wajib YYYY-MM.', 400);
    const gender = sp.get('gender');
    if (!validGender(gender)) return fail('bad_param', "gender harus 'ikhwan' atau 'akhwat'.", 400);

    const key = `rekap/tibyan?bulan=${bulan}&gender=${gender ?? ''}|${pre.scopeKey}`;
    return serveCached(key, pre.ifNoneMatch, () =>
      rekapTibyan(bulan, { gender: (gender ?? undefined) as 'ikhwan' | 'akhwat' | undefined }),
    );
  });
}
