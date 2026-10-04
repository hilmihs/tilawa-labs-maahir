import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getLaporanMaahir } from '@/lib/laporan-maahir';
import { buildLaporanMaahirWorkbook } from '@/lib/laporan-maahir-xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const s = await getSession();
  // Cek SEMUA akses (bukan hanya role aktif) — user multi-role bisa punya
  // koordinator/syaikh di accesses walau session aktif role lain.
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  if (!accesses.some((a) => a.role === 'koordinator' || a.role === 'syaikh')) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  const bulan = req.nextUrl.searchParams.get('bulan');
  if (!bulan || !/^\d{4}-\d{2}$/.test(bulan)) {
    return NextResponse.json({ error: 'Parameter bulan harus YYYY-MM.' }, { status: 400 });
  }
  const mNum = parseInt(bulan.split('-')[1]);
  if (mNum < 1 || mNum > 12) {
    return NextResponse.json({ error: 'Bulan tidak valid.' }, { status: 400 });
  }

  const lap = await getLaporanMaahir(bulan);
  const buffer = await buildLaporanMaahirWorkbook(lap, bulan);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="laporan-maahir-${bulan}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
