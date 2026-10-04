import { NextRequest } from 'next/server';
import { fail, handle } from '@/lib/api-public/respond';
import { rekapHitsDisiplin } from '@/lib/api-public/rekap';
import { rekapPreamble, serveCached, MONTH_RE, DATE_RE, validGender } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const pre = await rekapPreamble(req, 'hits');
    if (!('scopeKey' in pre)) return pre;

    const sp = req.nextUrl.searchParams;
    const mode = sp.get('mode');
    if (mode !== 'bulan' && mode !== 'minggu') {
      return fail('bad_param', "mode wajib 'bulan' atau 'minggu'.", 400);
    }
    const gender = sp.get('gender');
    if (!validGender(gender)) return fail('bad_param', "gender harus 'ikhwan' atau 'akhwat'.", 400);

    let bulan: string | null = null;
    let minggu: string | null = null;
    if (mode === 'bulan') {
      bulan = sp.get('bulan');
      if (!bulan || !MONTH_RE.test(bulan)) return fail('bad_param', 'bulan wajib YYYY-MM.', 400);
    } else {
      minggu = sp.get('minggu');
      if (!minggu || !DATE_RE.test(minggu)) return fail('bad_param', 'minggu wajib YYYY-MM-DD.', 400);
      // Harus hari Senin — jangan dikoreksi diam-diam.
      if (new Date(minggu + 'T00:00:00Z').getUTCDay() !== 1) {
        return fail('bad_param', 'minggu harus hari Senin.', 400);
      }
    }

    const key = `rekap/hits-disiplin?mode=${mode}&bulan=${bulan ?? ''}&minggu=${minggu ?? ''}&gender=${gender ?? ''}|${pre.scopeKey}`;
    return serveCached(key, pre.ifNoneMatch, () =>
      rekapHitsDisiplin({
        mode,
        month: bulan ?? '',
        week: minggu ?? '',
        gender: (gender ?? undefined) as 'ikhwan' | 'akhwat' | undefined,
      }),
    );
  });
}
