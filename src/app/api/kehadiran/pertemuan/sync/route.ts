import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api-public/env';
import { hariIniWib, periodePertemuanOptions } from '@/lib/rekap-pertemuan';
import { sinkronPeriode, sinkronTerjadwal } from '@/lib/rekap-pertemuan-snapshot';

// Sinkron snapshot rekap pertemuan pengajar dari Dashboard Edu (hilmihs).
// Dipanggil timer systemd 4x sehari (azure-pipelines.yml). Tanpa `periode`:
// periode berjalan (+ periode lalu s/d 3 hari setelah tanggal 15), dilewati
// bila baru saja disinkron. Dengan `?periode=YYYY-MM`: paksa satu periode.
// Respons hanya angka ringkas — tak ada nama/nomor pengajar.

export const runtime = 'nodejs';
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = apiEnv('CRON_SECRET');
  if (!secret || secret.length < 16) return false;
  const h = Buffer.from(req.headers.get('authorization') ?? '');
  const harap = Buffer.from(`Bearer ${secret}`);
  return h.length === harap.length && timingSafeEqual(h, harap);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const periode = req.nextUrl.searchParams.get('periode');
  if (periode !== null && !periodePertemuanOptions(hariIniWib()).some((o) => o.value === periode)) {
    return NextResponse.json({ error: 'Periode tidak valid' }, { status: 400 });
  }
  try {
    const hasil = periode !== null
      ? [await sinkronPeriode(periode, { paksa: true })]
      : await sinkronTerjadwal();
    // Dilewati (segar/beku/backoff/sedang-berjalan) bukan kegagalan.
    const ok = hasil.every((h) => h.ok || !!h.dilewati);
    // 502 bila ada periode yang gagal, supaya `curl -f` di timer ikut gagal dan
    // tercatat di journal systemd.
    return NextResponse.json({ ok, hasil }, { status: ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
