import { NextRequest } from 'next/server';
import { fail, handle } from '@/lib/api-public/respond';
import { rekapShakwa } from '@/lib/api-public/rekap';
import { rekapPreamble, serveCached, DATE_RE, validGender } from '../_shared';
import { KATEGORI_BY_VALUE, type ShakwaKategori, type ShakwaStatus } from '@/lib/shakwa';

export const dynamic = 'force-dynamic';

// Kosakata status = kolom tabel (lihat 0008); label Indonesianya di shakwa.ts.
const STATUS = new Set(['submitted', 'in_review', 'resolved', 'closed']);

/**
 * Rekap laporan Shakwa untuk hermes agent. Tanpa parameter → hari ini (WIB).
 * `tanggal` untuk satu hari, atau `dari`+`sampai` untuk rentang.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const pre = await rekapPreamble(req, 'shakwa');
    if (!('scopeKey' in pre)) return pre;

    const sp = req.nextUrl.searchParams;
    const tanggal = sp.get('tanggal');
    const dari = sp.get('dari');
    const sampai = sp.get('sampai');
    for (const [nama, nilai] of [['tanggal', tanggal], ['dari', dari], ['sampai', sampai]] as const) {
      if (nilai !== null && !DATE_RE.test(nilai)) {
        return fail('bad_param', `${nama} wajib YYYY-MM-DD.`, 400);
      }
    }
    if ((dari && !sampai) || (sampai && !dari)) {
      return fail('bad_param', 'dari dan sampai harus diisi berpasangan.', 400);
    }

    const gender = sp.get('gender');
    if (!validGender(gender)) return fail('bad_param', "gender harus 'ikhwan' atau 'akhwat'.", 400);

    const kategori = sp.get('kategori');
    if (kategori !== null && !(kategori in KATEGORI_BY_VALUE)) {
      return fail('bad_param', `kategori tak dikenal: '${kategori}'.`, 400);
    }

    const status = sp.get('status');
    if (status !== null && !STATUS.has(status)) {
      return fail('bad_param', "status harus 'submitted', 'in_review', 'resolved', atau 'closed'.", 400);
    }

    const key = `rekap/shakwa?t=${tanggal ?? ''}&d=${dari ?? ''}&s=${sampai ?? ''}&k=${kategori ?? ''}&st=${status ?? ''}&g=${gender ?? ''}|${pre.scopeKey}`;
    return serveCached(key, pre.ifNoneMatch, () =>
      rekapShakwa({
        tanggal: tanggal ?? undefined,
        dari: dari ?? undefined,
        sampai: sampai ?? undefined,
        kategori: (kategori ?? undefined) as ShakwaKategori | undefined,
        status: (status ?? undefined) as ShakwaStatus | undefined,
        gender: (gender ?? undefined) as 'ikhwan' | 'akhwat' | undefined,
      })
    );
  });
}
