import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  getHitsKoordinatorRekap,
  parseRekapFilter,
  filterAktif,
  type HitsMode,
} from '@/lib/hits-koordinator-rekap';
import { parseBatchId, parseKelasMode } from '@/lib/hits-halaqah-scope';
import { buildHitsDisiplinWorkbook } from '@/lib/hits-disiplin-xlsx';
import { weekStartMonday } from '@/lib/week';
import type { Gender } from '@/types/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Export Ranking Disiplin Pengajar (XLSX) untuk periode yang sedang dibuka di
 * /hits/koordinator. Parameternya sengaja sama persis dengan querystring
 * halaman supaya tombol unduh cukup meneruskan filter yang aktif.
 */
export async function GET(req: NextRequest) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  // Sama dengan pintu halamannya (koordinator_ketua_kelas), ditambah koordinator
  // & syaikh yang memang berhak atas seluruh laporan.
  const boleh = accesses.some(
    (a) =>
      a.role === 'koordinator_ketua_kelas' || a.role === 'koordinator' || a.role === 'syaikh'
  );
  if (!boleh) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });

  const q = req.nextUrl.searchParams;
  const mode: HitsMode = q.get('mode') === 'minggu' ? 'minggu' : 'bulan';

  const monthRaw = q.get('month') ?? '';
  const month = /^\d{4}-\d{2}$/.test(monthRaw)
    ? monthRaw
    : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const bulanNo = Number(month.split('-')[1]);
  if (bulanNo < 1 || bulanNo > 12) {
    return NextResponse.json({ error: 'Bulan tidak valid.' }, { status: 400 });
  }

  const weekRaw = q.get('week') ?? '';
  const week = /^\d{4}-\d{2}-\d{2}$/.test(weekRaw) ? weekRaw : weekStartMonday();

  const genderRaw = q.get('gender');
  const gender: Gender | undefined =
    genderRaw === 'ikhwan' || genderRaw === 'akhwat' ? genderRaw : undefined;

  // Filter mengikuti chip yang aktif di halaman — tombol unduh meneruskan
  // querystring apa adanya, jadi isi file = apa yang koordinator lihat.
  const filter = parseRekapFilter({ masalah: q.get('masalah'), obs: q.get('obs') });
  const batchId = parseBatchId(q.get('batch'));
  const kelas = parseKelasMode(q.get('kelas'));

  const rekap = await getHitsKoordinatorRekap({ mode, month, week, gender, batchId, kelas, filter });
  const buffer = await buildHitsDisiplinWorkbook(rekap);

  const periode = mode === 'minggu' ? week : month;
  const sufiksFilter = filterAktif(filter)
    ? `-${[filter.masalah ? 'bermasalah' : null, filter.obs !== 'semua' ? `obs${filter.obs}` : null]
        .filter(Boolean)
        .join('-')}`
    : '';
  const namaFile = `ranking-disiplin-${periode}${gender ? `-${gender}` : ''}${kelas ? `-${kelas}` : ''}${sufiksFilter}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${namaFile}"`,
      'Cache-Control': 'no-store',
    },
  });
}
