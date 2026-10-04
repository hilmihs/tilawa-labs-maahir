import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSession } from '@/lib/session';
import { generateMonthlyReport, bulanLabel } from '@/lib/laporan';
import { JENIS_REKAMAN_LABEL, type Gender } from '@/types/db';
import { musyrifTitle } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const s = await getSession();
  // Cek SEMUA akses (bukan hanya role aktif) — halaman /2in1/laporan memakai
  // requireOneOfRoles yang juga melihat accesses, jadi user multi-role bisa
  // membuka halamannya tapi tertolak di sini dan mengunduh JSON error.
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const akses = accesses.find((a) => a.role === 'koordinator' || a.role === 'syaikh');
  if (!akses) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const bulanParam = searchParams.get('bulan'); // YYYY-MM
  const genderParam = (searchParams.get('gender') ?? '') as Gender | '';

  if (!bulanParam || !/^\d{4}-\d{2}$/.test(bulanParam)) {
    return NextResponse.json({ error: 'Parameter bulan harus YYYY-MM.' }, { status: 400 });
  }
  const [yStr, mStr] = bulanParam.split('-');
  const year = parseInt(yStr);
  const month = parseInt(mStr);
  if (month < 1 || month > 12) {
    return NextResponse.json({ error: 'Bulan tidak valid.' }, { status: 400 });
  }

  // Default gender = gender role-nya kalau tidak di-spesifikasikan
  let gender: Gender;
  if (genderParam === 'ikhwan' || genderParam === 'akhwat') {
    gender = genderParam;
  } else {
    gender = akses.gender;
  }

  const report = await generateMonthlyReport(year, month, gender);

  // ============ Build XLSX ============
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir';
  wb.created = new Date();

  // ----- Sheet 1: Rekap -----
  const sheet1 = wb.addWorksheet('Rekap');
  sheet1.columns = [
    { header: 'Metrik', key: 'metrik', width: 36 },
    { header: 'Nilai', key: 'nilai', width: 20 },
  ];

  sheet1.addRow({ metrik: `Laporan Bulanan — ${bulanLabel(year, month)} (${gender})`, nilai: '' });
  sheet1.addRow({ metrik: `Cycle yang masuk (cycle_end di bulan ini)`, nilai: report.cycles.join(', ') });
  sheet1.addRow({});
  sheet1.addRow({ metrik: 'Total peserta', nilai: report.totalPeserta });
  sheet1.addRow({ metrik: 'Setor (≥1 cycle)', nilai: `${report.jumlahPesertaSetor} (${report.persentaseSetor}%)` });
  sheet1.addRow({ metrik: 'Tidak setor sama sekali', nilai: `${report.jumlahPesertaTidakSetor} (${report.persentaseTidakSetor}%)` });

  // Breakdown nilai per jenis
  sheet1.addRow({});
  sheet1.addRow({ metrik: '— Distribusi nilai per jenis —', nilai: '' });
  for (const j of Object.keys(report.nilaiPerJenis) as Array<keyof typeof report.nilaiPerJenis>) {
    const stat = report.nilaiPerJenis[j];
    const label = JENIS_REKAMAN_LABEL[j];
    sheet1.addRow({ metrik: `${label} — Hijau`, nilai: `${stat.hijau} (${stat.persenHijau}%)` });
    sheet1.addRow({ metrik: `${label} — Kuning`, nilai: `${stat.kuning} (${stat.persenKuning}%)` });
    sheet1.addRow({ metrik: `${label} — Merah`, nilai: `${stat.merah} (${stat.persenMerah}%)` });
    sheet1.addRow({ metrik: `${label} — Total bernilai`, nilai: stat.total });
  }

  // Header bold
  sheet1.getRow(1).font = { bold: true };

  // Peserta tidak setor (lengkap dgn jumlah cycle dilewatkan)
  sheet1.addRow({});
  sheet1.addRow({ metrik: '— Peserta yang melewatkan cycle —', nilai: '' });
  sheet1.addRow({ metrik: 'Nama', nilai: 'Cycle dilewatkan (dari total cycle bulan ini)' });
  for (const p of report.pesertaTidakSetor) {
    sheet1.addRow({
      metrik: `${p.name} (kelas ${p.kelas})`,
      nilai: `${p.jumlahDilewatkan} dari ${report.cycles.length}`,
    });
  }

  // Keaktifan musyrif
  const titelMusyrif = musyrifTitle(gender);
  sheet1.addRow({});
  sheet1.addRow({ metrik: `— Keaktifan ${titelMusyrif.toLowerCase()} (cek rekaman peserta) —`, nilai: '' });
  sheet1.addRow({ metrik: titelMusyrif, nilai: 'Rekaman dicek / total (% dicek)' });
  for (const m of report.keaktifanMusyrif) {
    sheet1.addRow({
      metrik: m.name,
      nilai: `${m.dicek} / ${m.totalRekamanPeserta} (${m.persentaseDicek}%)`,
    });
  }

  // ----- Sheet 2: Matrix Skill Tajwid -----
  const sheet2 = wb.addWorksheet('Matrix Skill Tajwid');
  sheet2.columns = [
    { header: 'Nama Peserta', key: 'nama', width: 32 },
    { header: 'Kelas', key: 'kelas', width: 14 },
    { header: 'Cycle Setor', key: 'setor', width: 14 },
    { header: 'Cycle Bulan Ini', key: 'total', width: 16 },
    { header: 'Avg (1 desimal)', key: 'avg', width: 16 },
    { header: 'Nilai Tajwid (0-4)', key: 'bucket', width: 18 },
  ];
  sheet2.getRow(1).font = { bold: true };
  sheet2.getRow(1).alignment = { horizontal: 'center' };

  for (const row of report.matrixSkill) {
    sheet2.addRow({
      nama: row.name,
      kelas: row.kelas,
      setor: row.cycleSetor,
      total: row.cycleTotal,
      avg: row.avg,
      bucket: row.bucket,
    });
  }

  // Note di bawah matrix tentang skema scoring
  sheet2.addRow({});
  sheet2.addRow({ nama: 'Skema scoring:' });
  sheet2.addRow({ nama: 'per rekaman: hijau=4, kuning=2.5, merah=1' });
  sheet2.addRow({ nama: 'avg = rata-rata semua rekaman bernilai bulan ini (3 jenis × N cycle)' });
  sheet2.addRow({ nama: 'bucket: 0=tidak ada nilai, 1<1.75, 2<2.5, 3<3.25, 4≥3.25' });

  // Generate buffer
  const buffer = await wb.xlsx.writeBuffer();

  const filename = `laporan-${gender}-${bulanParam}.xlsx`;
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
