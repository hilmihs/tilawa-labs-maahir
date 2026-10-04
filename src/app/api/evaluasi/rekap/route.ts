import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { AMBANG, JENIS, SKOR_MAKS, columnsToCounts, type Jenis } from '@/lib/evaluasi';
import {
  KOLOM_JALIY, KOLOM_KHAFIY, labelPendek, labelSesi, susunRekapSesi,
  type RekapNilaiInput,
} from '@/lib/evaluasi-rekap-sesi';

export const runtime = 'nodejs';
export const maxDuration = 60;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const URUT_JENIS: Record<Jenis, number> = { qn: 0, pb: 1, ujian: 2 };

/**
 * Unduhan XLSX rekap nilai per sesi untuk pengajar halaqah itu sendiri.
 *
 *   GET /api/evaluasi/rekap?halaqah=<id>&jenis=qn&nomor=2   → satu lembar
 *   GET /api/evaluasi/rekap?halaqah=<id>&semua=1            → satu lembar per sesi
 *
 * Membaca nilai yang SUDAH tersimpan (`evaluasi_nilai`); suntingan yang belum
 * sempat terkirim dari layar tidak ikut. Hanya pengajar pemilik halaqah —
 * aturan kepemilikan sama dengan /api/evaluasi/kirim.
 */
export async function GET(req: NextRequest) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const pengajar = accesses.find((a) => a.role === 'pengajar') as
    | { role: 'pengajar'; pengajar_id: string }
    | undefined;
  if (!pengajar) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const halaqahId = (sp.get('halaqah') ?? '').trim();
  if (!halaqahId) return NextResponse.json({ error: 'Parameter halaqah wajib.' }, { status: 400 });
  const semua = sp.get('semua') === '1';
  const jenisParam = sp.get('jenis');
  const nomorParam = Number(sp.get('nomor'));
  if (!semua && (!JENIS.includes(jenisParam as Jenis) || !Number.isInteger(nomorParam) || nomorParam < 1)) {
    return NextResponse.json({ error: 'Parameter jenis/nomor tidak valid.' }, { status: 400 });
  }

  const { data: halaqah } = await supabaseAdmin
    .from('eval_halaqah')
    .select('id, nama, gender, level, ambang_ujian, pengajar_id, batch_id')
    .eq('id', halaqahId)
    .maybeSingle();
  if (!halaqah) return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
  const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
  if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
    return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
  }

  const [{ data: pesertaRows }, { data: sesiRows }, { data: cfg }, { data: batch }, { data: pengajarRow }] =
    await Promise.all([
      supabaseAdmin
        .from('eval_peserta')
        .select('id, nama, urutan')
        .eq('halaqah_id', halaqahId)
        .eq('aktif', true)
        .order('urutan'),
      supabaseAdmin
        .from('evaluasi_sesi')
        .select('id, jenis, nomor_sesi, tgl_jadwal, status, dihapus')
        .eq('halaqah_id', halaqahId)
        .eq('dihapus', false),
      supabaseAdmin
        .from('eval_config')
        .select('nama_qn, nama_pb')
        .eq('gender', halaqah.gender as string)
        .maybeSingle(),
      halaqah.batch_id
        ? supabaseAdmin.from('eval_batch').select('nama').eq('id', halaqah.batch_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin.from('eval_pengajar').select('nama').eq('id', evalPengajarId).maybeSingle(),
    ]);

  const namaTrack = (t: 'qn' | 'pb'): string =>
    (t === 'qn' ? (cfg?.nama_qn as string | undefined) : (cfg?.nama_pb as string | undefined)) ||
    (t === 'qn' ? 'Evaluasi QN' : 'Evaluasi PB');

  const peserta = (pesertaRows ?? []).map((p) => ({
    id: p.id as string,
    nama: p.nama as string,
  }));

  type SesiRow = { id: string; jenis: Jenis; nomor_sesi: number; tgl_jadwal: string | null; status: string };
  let sesiList = ((sesiRows ?? []) as SesiRow[]).sort((a, b) =>
    a.jenis === b.jenis ? a.nomor_sesi - b.nomor_sesi : URUT_JENIS[a.jenis] - URUT_JENIS[b.jenis]
  );
  if (!semua) {
    sesiList = sesiList.filter((x) => x.jenis === jenisParam && x.nomor_sesi === nomorParam);
    if (!sesiList.length) return NextResponse.json({ error: 'Sesi belum dibuat.' }, { status: 404 });
  }
  if (!sesiList.length) return NextResponse.json({ error: 'Belum ada sesi.' }, { status: 404 });

  const sesiIds = sesiList.map((x) => x.id);
  const { data: nilaiRows } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select(
      'sesi_id, peserta_id, hadir, done, catatan, ' +
        'jk_huruf, jk_harakat, jk_mad, jk_tasydid, kh_izhar, kh_idgham_bighunnah, kh_idgham_bilaghunnah, kh_idgham_mimi, kh_iqlab, kh_ikhfa_hakiki, kh_ikhfa_syafawi'
    )
    .in('sesi_id', sesiIds);
  const nilaiPerSesi = new Map<string, Map<string, RekapNilaiInput>>();
  for (const n of nilaiRows ?? []) {
    const m = nilaiPerSesi.get(n.sesi_id as string) ?? new Map<string, RekapNilaiInput>();
    m.set(n.peserta_id as string, {
      counts: columnsToCounts(n as Record<string, unknown>),
      hadir: n.hadir !== false,
      done: !!n.done,
      catatan: (n.catatan as string | null) ?? '',
    });
    nilaiPerSesi.set(n.sesi_id as string, m);
  }

  const namaHalaqah = halaqah.nama as string;
  const level = (halaqah.level as string | null) ?? '';
  const genderLabel = halaqah.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir';
  wb.created = new Date();
  const dipakai = new Set<string>();

  for (const sesi of sesiList) {
    const label = labelSesi(sesi.jenis, sesi.nomor_sesi, namaTrack);
    const ambang = sesi.jenis === 'ujian' ? ((halaqah.ambang_ujian as number) ?? AMBANG) : AMBANG;
    const rekap = susunRekapSesi(peserta, nilaiPerSesi.get(sesi.id) ?? new Map(), ambang);

    // Nama lembar: maks 31 karakter, tanpa []:*?/\ — dan unik.
    let sheetName = label.replace(/[\[\]:*?/\\]/g, '-').slice(0, 31);
    let k = 2;
    while (dipakai.has(sheetName)) sheetName = `${label.slice(0, 28)} ${k++}`;
    dipakai.add(sheetName);
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', xSplit: 2, ySplit: 6 }] });

    ws.addRow([`Rekap ${label}`]).font = { bold: true, size: 14 };
    ws.addRow([`${namaHalaqah} · ${genderLabel}${level ? ` · ${level}` : ''}${batch?.nama ? ` · ${batch.nama}` : ''}`]);
    ws.addRow([
      `Pengajar: ${(pengajarRow?.nama as string | undefined) ?? '—'}` +
        (sesi.tgl_jadwal ? ` · Jadwal: ${sesi.tgl_jadwal}` : '') +
        ` · Status: ${sesi.status === 'terkirim' ? 'terkirim' : 'draf'}`,
    ]);
    ws.addRow([
      `Ambang ${ambang} · Skor = ${SKOR_MAKS} − 6×jaliy − 2×khafiy · Dinilai ${rekap.dinilai}/${peserta.length}` +
        ` · Tidak hadir ${rekap.absen} · Belum dinilai ${rekap.belum}` +
        ` · Rata-rata ${rekap.rata ?? '—'} · ≥${ambang}: ${rekap.standar} · <${ambang}: ${rekap.bawah}`,
    ]);
    ws.addRow([]);

    const header = [
      'No', 'Nama peserta', 'Status',
      ...KOLOM_JALIY.map((d) => labelPendek(d.label)),
      ...KOLOM_KHAFIY.map((d) => labelPendek(d.label)),
      'Σ Jaliy', 'Σ Khafiy', 'Skor', 'Predikat', 'Catatan',
    ];
    const hr = ws.addRow(header);
    hr.font = { bold: true };
    hr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hr.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFECE5' } };
      c.border = { bottom: { style: 'thin' } };
    });

    rekap.baris.forEach((b, i) => {
      const dinilai = b.status === 'hadir';
      const row = ws.addRow([
        i + 1,
        b.nama,
        b.status === 'hadir' ? 'Hadir' : b.status === 'absen' ? 'Tidak hadir' : 'Belum dinilai',
        ...KOLOM_JALIY.map((d) => (dinilai ? b.counts[d.key] || 0 : null)),
        ...KOLOM_KHAFIY.map((d) => (dinilai ? b.counts[d.key] || 0 : null)),
        dinilai ? b.jaliy : null,
        dinilai ? b.khafiy : null,
        b.skor,
        b.tier ?? '',
        b.catatan,
      ]);
      if (b.skor != null) {
        row.getCell(header.length - 2).font = {
          bold: true,
          color: { argb: b.skor >= ambang ? 'FF2E6B3F' : 'FFA23A2E' },
        };
      }
    });

    const tot = ws.addRow([
      '', 'Total kesalahan (peserta dinilai)', '',
      ...KOLOM_JALIY.map((d) => rekap.totalCounts[d.key] || 0),
      ...KOLOM_KHAFIY.map((d) => rekap.totalCounts[d.key] || 0),
      KOLOM_JALIY.reduce((a, d) => a + (rekap.totalCounts[d.key] || 0), 0),
      KOLOM_KHAFIY.reduce((a, d) => a + (rekap.totalCounts[d.key] || 0), 0),
      rekap.rata,
      'rata-rata',
      '',
    ]);
    tot.font = { bold: true };

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 32;
    ws.getColumn(3).width = 14;
    for (let c = 4; c < header.length; c++) ws.getColumn(c).width = 11;
    ws.getColumn(header.length).width = 40;
    ws.getColumn(header.length - 1).width = 24;
  }

  const buf = await wb.xlsx.writeBuffer();
  const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fname = semua
    ? `rekap-${slug(namaHalaqah)}-semua-sesi.xlsx`
    : `rekap-${slug(namaHalaqah)}-${slug(labelSesi(sesiList[0].jenis, sesiList[0].nomor_sesi, namaTrack))}.xlsx`;
  return new NextResponse(buf as unknown as ArrayBuffer, {
    headers: {
      'content-type': XLSX_MIME,
      'content-disposition': `attachment; filename="${fname}"`,
      'cache-control': 'no-store',
    },
  });
}
