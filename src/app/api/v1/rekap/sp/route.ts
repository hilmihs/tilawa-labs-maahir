import { NextRequest } from 'next/server';
import { fail, handle } from '@/lib/api-public/respond';
import { rekapSP } from '@/lib/api-public/rekap';
import { rekapPreamble, serveCached, MONTH_RE, validGender } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const pre = await rekapPreamble(req, 'maahir');
    if (!('scopeKey' in pre)) return pre;

    const sp = req.nextUrl.searchParams;
    const gender = sp.get('gender');
    if (!validGender(gender)) return fail('bad_param', "gender harus 'ikhwan' atau 'akhwat'.", 400);
    const sampaiBulan = sp.get('sampai_bulan');
    if (sampaiBulan && !MONTH_RE.test(sampaiBulan)) {
      return fail('bad_param', 'sampai_bulan wajib YYYY-MM.', 400);
    }

    const key = `rekap/sp?gender=${gender ?? ''}&sampai_bulan=${sampaiBulan ?? ''}|${pre.scopeKey}`;
    return serveCached(key, pre.ifNoneMatch, () =>
      rekapSP({
        gender: (gender ?? undefined) as 'ikhwan' | 'akhwat' | undefined,
        sampaiBulan: sampaiBulan ?? undefined,
      }),
    );
  });
}
