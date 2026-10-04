import { NextRequest, NextResponse } from 'next/server';
import { bolehLihatRekapPengajarMaahir } from '@/lib/maahir-checkin-pengajar-akses';
import { getRekapPengajarMaahir } from '@/lib/maahir-checkin-pengajar';
import { buildKehadiranPengajarWorkbook } from '@/lib/kehadiran-pengajar-xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await bolehLihatRekapPengajarMaahir())) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }
  const bulan = req.nextUrl.searchParams.get('bulan');
  if (!bulan || !/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) {
    return NextResponse.json({ error: 'Parameter bulan harus YYYY-MM.' }, { status: 400 });
  }
  const rekap = await getRekapPengajarMaahir(bulan);
  const buffer = await buildKehadiranPengajarWorkbook(rekap);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="kehadiran-pengajar-maahir-${bulan}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
