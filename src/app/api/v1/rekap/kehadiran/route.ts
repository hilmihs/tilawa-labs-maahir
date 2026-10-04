import { NextRequest } from 'next/server';
import { fail, handle } from '@/lib/api-public/respond';
import { rekapKehadiran } from '@/lib/api-public/rekap';
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
    const program = sp.get('program');
    const kelasIds = sp.getAll('kelas_id');

    const kelasKey = [...kelasIds].sort().join(',');
    const key = `rekap/kehadiran?bulan=${bulan}&gender=${gender ?? ''}&program=${program ?? ''}&kelas_id=${kelasKey}|${pre.scopeKey}`;
    return serveCached(key, pre.ifNoneMatch, () =>
      rekapKehadiran(bulan, {
        gender: (gender ?? undefined) as 'ikhwan' | 'akhwat' | undefined,
        program: (program ?? undefined) as 'kelas_maahir' | 'at_tibyan' | undefined,
        kelasIds: kelasIds.length > 0 ? kelasIds : undefined,
      }),
    );
  });
}
