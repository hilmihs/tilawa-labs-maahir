import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMaahirRekap } from '@/lib/maahir-rekap';
import { monthRange } from '@/lib/laporan-maahir';
import { buildKehadiranMatrixWorkbook } from '@/lib/kehadiran-matrix-xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Export seluruh data kehadiran peserta Maahir (matriks peserta × tanggal per
 * kelas) untuk periode laporan bulanan yang sedang dibuka — bukan bulan
 * kalender — supaya angkanya sebanding dengan halaman laporan.
 */
export async function GET(req: NextRequest) {
  const s = await getSession();
  // Cek SEMUA akses (bukan hanya role aktif), sama seperti export laporan.
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

  const range = monthRange(bulan);
  const rekap = await getMaahirRekap(bulan, { range });
  const buffer = await buildKehadiranMatrixWorkbook(rekap, bulan, range);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="kehadiran-maahir-${bulan}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
