import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { INDIKATOR } from '@/lib/matrix-indicators';
import { getBlokMatrix } from '@/lib/matrix-blok-data';
import { labelBlok, urutanBlok } from '@/lib/matrix-blok';
import type { Gender } from '@/types/db';

const KAT_SHORT: Record<string, string> = { hard: 'Hard Skill', inspeksi: 'Inspeksi', soft: 'Soft Skill' };
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const s = await getSession();
  // Halaman /matrix/koordinator dibuka koordinator DAN syaikh
  // (requireOneOfRoles di sana). Unduhannya harus mengikuti — dulu route ini
  // hanya menerima koordinator, jadi tombol unduh selalu 403 bagi syaikh.
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const acc = accesses.find((a) => a.role === 'koordinator' || a.role === 'syaikh') ?? null;
  if (!acc) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const bulan = searchParams.get('bulan');
  const kelompokId = searchParams.get('kelompok') ?? '';
  if (!bulan || !/^\d{4}-\d{2}$/.test(bulan)) {
    return NextResponse.json({ error: 'Parameter bulan harus YYYY-MM.' }, { status: 400 });
  }

  // 'all' = kedua gender, dipakai dashboard matrix yang memang menampilkan
  // keduanya sekaligus. Tanpa opsi ini unduhan diam-diam terpotong ke gender
  // koordinatornya sendiri, tak cocok dengan yang terlihat di layar.
  const genderParam = searchParams.get('gender');
  const gender: 'ikhwan' | 'akhwat' | 'all' =
    genderParam === 'ikhwan' || genderParam === 'akhwat'
      ? genderParam
      : genderParam === 'all'
        ? 'all'
        : (acc.gender as 'ikhwan' | 'akhwat');
  const genderLabelFull = gender === 'all' ? 'Ikhwan & Akhwat' : gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat';

  let kq = supabaseAdmin.from('kelompok_pengajar').select('id, name');
  if (gender !== 'all') kq = kq.eq('gender', gender);
  const { data: kelompokList } = await kq;
  const kelompokMap = new Map((kelompokList ?? []).map((k) => [k.id, k.name]));

  let pq = supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, whatsapp_number, kelompok_id, active')
    .neq('matrix_exclude', true); // guru observasi-saja (mis. DPQ) tak masuk matrix
  if (gender !== 'all') pq = pq.eq('gender', gender);
  if (kelompokId) pq = pq.eq('kelompok_id', kelompokId);
  const { data: pengajarList } = await pq.order('name');

  const pengajarIds = (pengajarList ?? []).map((p) => p.id);
  const { data: matrixData } = pengajarIds.length
    ? await supabaseAdmin
        .from('matrix_rekap')
        .select('*')
        .eq('year_month', bulan)
        .in('pengajar_id', pengajarIds)
    : { data: [] };

  const matrixByPengajar = new Map((matrixData ?? []).map((m) => [m.pengajar_id, m]));

  // Blok ranking — sama persis dgn tampilan blok di /matrix/koordinator:
  // ikhwan diturunkan dari kelas, akhwat dibaca dari `pengajar.matrix_blok`.
  const blokMap = await getBlokMatrix(
    (pengajarList ?? []).map((p) => ({
      id: p.id as string,
      gender: p.gender as Gender,
      whatsapp_number: (p.whatsapp_number as string | null) ?? null,
    })),
    bulan
  );
  // Urutan blok beda per gender, jadi indeksnya dihitung di dalam taksonomi
  // gender orangnya sendiri. Yang belum diblok jatuh paling bawah.
  const posisiBlok = new Map(
    (['ikhwan', 'akhwat'] as Gender[]).flatMap((g) =>
      urutanBlok(g).map((b, i) => [`${g}:${b}`, i] as const)
    )
  );
  const genderDari = new Map(
    (pengajarList ?? []).map((p) => [p.id as string, p.gender as Gender])
  );
  const blokIndex = (id: string) => {
    const b = blokMap.get(id);
    if (!b) return 99;
    return posisiBlok.get(`${genderDari.get(id) ?? 'ikhwan'}:${b}`) ?? 99;
  };

  // ── Mode "belum lengkap" (?incomplete=1): hanya pengajar dgn ≥1 indikator kosong,
  //    + kolom rincian bagian yang belum terisi (dikelompokkan per kategori) + halaqah.
  if (req.nextUrl.searchParams.get('incomplete') === '1') {
    const { data: halaqahData } = pengajarIds.length
      ? await supabaseAdmin
          .from('hits_halaqah')
          .select('pengajar_id, name')
          .in('pengajar_id', pengajarIds)
          .eq('active', true)
      : { data: [] };
    const halaqahByPengajar = new Map<string, string[]>();
    for (const h of halaqahData ?? []) {
      if (!h.pengajar_id) continue;
      const arr = halaqahByPengajar.get(h.pengajar_id) ?? [];
      arr.push(h.name);
      halaqahByPengajar.set(h.pengajar_id, arr);
    }

    // Rakit baris dulu (biar bisa sort: prioritas tinggi = kurang selain SOP dulu).
    type Item = {
      prioritas: 'Tinggi' | 'SOP saja';
      nama: string; kelompok: string; active: boolean; halaqah: string;
      terisiN: number; detail: string;
    };
    const items: Item[] = [];
    for (const p of pengajarList ?? []) {
      const m = matrixByPengajar.get(p.id) as Record<string, unknown> | undefined;
      const kosong = INDIKATOR.filter((i) => !m || m[i.key] == null);
      if (kosong.length === 0) continue;
      const adaSelainSop = kosong.some((i) => i.key !== 'skor_kepatuhan_sop');
      const byKat: Record<string, string[]> = {};
      for (const ind of kosong) (byKat[ind.kategori] ??= []).push(ind.label);
      const detail = (['hard', 'inspeksi', 'soft'] as const)
        .filter((k) => byKat[k]?.length)
        .map((k) => `${KAT_SHORT[k]}: ${byKat[k].join(', ')}`)
        .join('   •   ');
      const hal = halaqahByPengajar.get(p.id);
      items.push({
        prioritas: adaSelainSop ? 'Tinggi' : 'SOP saja',
        nama: p.name,
        kelompok: kelompokMap.get(p.kelompok_id ?? '') ?? '',
        active: p.active,
        halaqah: hal && hal.length ? hal.join(', ') : '(tak ada halaqah aktif)',
        terisiN: INDIKATOR.length - kosong.length,
        detail,
      });
    }
    // Tinggi dulu, lalu nama.
    items.sort((a, b) =>
      a.prioritas !== b.prioritas ? (a.prioritas === 'Tinggi' ? -1 : 1) : a.nama.localeCompare(b.nama)
    );
    const tinggiN = items.filter((i) => i.prioritas === 'Tinggi').length;

    // ── Styling ────────────────────────────────────────────────────────────
    const INK = 'FF1F3A2E';       // hijau gelap header
    const HEAD_TXT = 'FFFFFFFF';
    const ZEBRA = 'FFF4F7F5';     // baris genap
    const RED_BG = 'FFFCE8E6';    // prioritas tinggi
    const RED_TX = 'FFB4231A';
    const YEL_BG = 'FFFEF7E0';    // SOP saja
    const YEL_TX = 'FF9A6B00';
    const thin = { style: 'thin' as const, color: { argb: 'FFE0E0E0' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };

    const wbI = new ExcelJS.Workbook();
    wbI.creator = 'Maahir';
    wbI.created = new Date();
    const sh = wbI.addWorksheet('Belum Lengkap', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });
    const cols = [
      { key: 'prioritas', w: 12 },
      { key: 'nama', w: 30 },
      { key: 'kelompok', w: 20 },
      { key: 'active', w: 8 },
      { key: 'halaqah', w: 46 },
      { key: 'terisi', w: 9 },
      { key: 'kosong', w: 90 },
    ];
    cols.forEach((c, i) => (sh.getColumn(i + 1).width = c.w));
    const NC = cols.length;
    const genderLabel = genderLabelFull;

    // Baris 1: judul
    sh.mergeCells(1, 1, 1, NC);
    const t = sh.getCell(1, 1);
    t.value = `Matrix Skill Guru — BELUM LENGKAP · ${bulan} · ${genderLabel}`;
    t.font = { bold: true, size: 14, color: { argb: INK } };
    t.alignment = { vertical: 'middle' };
    sh.getRow(1).height = 24;
    // Baris 2: ringkasan
    sh.mergeCells(2, 1, 2, NC);
    const sub = sh.getCell(2, 1);
    sub.value = `${items.length} pengajar belum lengkap  (🔴 Tinggi = kurang selain SOP: ${tinggiN}  ·  🟡 SOP saja: ${items.length - tinggiN}).  Terisi = jumlah dari ${INDIKATOR.length} indikator.`;
    sub.font = { size: 10, color: { argb: 'FF6B6B6B' } };
    sh.getRow(3).height = 4;

    // Baris 4: header
    const HEAD = ['Prioritas', 'Nama', 'Kelompok', 'Aktif', 'Halaqah', 'Terisi', 'Bagian Belum Terisi'];
    const hr = sh.getRow(4);
    HEAD.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: HEAD_TXT } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
      c.alignment = { vertical: 'middle', horizontal: i >= 3 && i <= 5 ? 'center' : 'left' };
      c.border = border;
    });
    hr.height = 20;
    sh.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: NC } };

    // Data
    items.forEach((it, idx) => {
      const r = sh.getRow(5 + idx);
      const hi = it.prioritas === 'Tinggi';
      const rowBg = hi ? RED_BG : idx % 2 ? ZEBRA : 'FFFFFFFF';
      const vals = [
        it.prioritas,
        it.nama,
        it.kelompok,
        it.active ? 'Ya' : 'Tidak',
        it.halaqah,
        `${it.terisiN}/${INDIKATOR.length}`,
        it.detail,
      ];
      vals.forEach((v, i) => {
        const c = r.getCell(i + 1);
        c.value = v;
        c.border = border;
        c.alignment = { vertical: 'top', wrapText: i === 4 || i === 6, horizontal: i >= 3 && i <= 5 ? 'center' : 'left' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      });
      // prioritas cell warna
      const pc = r.getCell(1);
      pc.font = { bold: true, color: { argb: hi ? RED_TX : YEL_TX } };
      if (!hi) pc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YEL_BG } };
      // terisi rendah → merah
      if (it.terisiN < 7) r.getCell(6).font = { bold: true, color: { argb: RED_TX } };
    });
    if (items.length === 0) {
      sh.mergeCells(5, 1, 5, NC);
      sh.getCell(5, 1).value = '✓ Semua pengajar sudah lengkap.';
    }

    const buf = await wbI.xlsx.writeBuffer();
    const fn = `matrix-belum-lengkap-${bulan}-${gender}${kelompokId ? `-${kelompokId.slice(0, 8)}` : ''}.xlsx`;
    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${fn}"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Matrix Skill');
  sheet.columns = [
    // 'No' = nomor urut baca, berjalan lintas blok (Takhassus dulu, lalu
    // Tahfizh, dst) persis seperti di layar. 'Peringkat Skor' = peringkat
    // global per gender dari matrix_rekap — dua hal berbeda, jadi dua kolom.
    { header: 'No', key: 'no', width: 6 },
    { header: 'Peringkat Skor', key: 'rank', width: 14 },
    { header: 'Nama', key: 'nama', width: 28 },
    // Kolom gender selalu ada: saat unduhan mencakup kedua gender (mode 'all'),
    // tanpa ini baris ikhwan dan akhwat tak bisa dibedakan.
    { header: 'Gender', key: 'gender', width: 10 },
    // Blok ranking. Kosong utk yang belum masuk blok mana pun.
    { header: 'Blok', key: 'blok', width: 26 },
    { header: 'Kelompok', key: 'kelompok', width: 18 },
    { header: 'Aktif', key: 'active', width: 8 },
    { header: 'Bacaan', key: 'bacaan', width: 8 },
    { header: 'Tajwid', key: 'tajwid', width: 8 },
    { header: 'Kehadiran Maahir', key: 'kehadiran_maahir', width: 16 },
    { header: 'Kehadiran At-Tibyan', key: 'kehadiran_tibyan', width: 18 },
    { header: 'Rata² Hard', key: 'hard', width: 10 },
    { header: 'Kepatuhan Silabus', key: 'silabus', width: 18 },
    { header: 'Manajemen Halaqah', key: 'manajemen', width: 18 },
    { header: 'Kepatuhan SOP', key: 'sop', width: 14 },
    { header: 'Rata² Inspeksi', key: 'pedagogis', width: 14 },
    { header: 'Disiplin Waktu', key: 'disiplin', width: 14 },
    { header: 'Komitmen Jadwal', key: 'komitmen', width: 16 },
    { header: 'Tanggung Jawab', key: 'tanggungjawab', width: 16 },
    { header: 'Evaluasi Penguasaan', key: 'evaluasi', width: 18 },
    { header: 'Rata² Soft', key: 'soft', width: 10 },
    { header: 'Rata² Keseluruhan', key: 'keseluruhan', width: 18 },
    { header: 'Teguran Bulan', key: 'teguran_bulan', width: 14 },
    { header: 'Teguran Kumulatif', key: 'teguran_kum', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  sheet.getRow(1).font = { bold: true };
  // Header tetap terlihat saat men-scroll 100+ baris pengajar, dan bisa disaring
  // langsung di Excel tanpa menyalin ulang.
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

  // Urut blok dulu, baru peringkat — mengikuti tampilan layar. Kolom 'No'
  // diisi belakangan mengikuti urutan hasil sort ini, jadi nomornya rapat
  // 1..N dan berjalan lintas blok.
  // Pengajar yang matrix-nya belum ada (ranking null) ditaruh paling bawah tiap
  // blok, diurutkan menurut nama, supaya yang belum dinilai tak menyusup ke atas.
  const urut = [...(pengajarList ?? [])].sort((a, b) => {
    const bi = blokIndex(a.id) - blokIndex(b.id);
    if (bi !== 0) return bi;
    const ra = (matrixByPengajar.get(a.id)?.ranking as number | null | undefined) ?? null;
    const rb = (matrixByPengajar.get(b.id)?.ranking as number | null | undefined) ?? null;
    if (ra === null && rb === null) return a.name.localeCompare(b.name);
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb || a.name.localeCompare(b.name);
  });

  let nomorUrut = 0;
  for (const p of urut) {
    const m = matrixByPengajar.get(p.id);
    sheet.addRow({
      no: m?.ranking != null ? ++nomorUrut : '',
      rank: m?.ranking ?? '',
      nama: p.name,
      gender: p.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat',
      blok: (() => {
        const b = blokMap.get(p.id);
        return b ? labelBlok(b, p.gender as Gender) : '';
      })(),
      kelompok: kelompokMap.get(p.kelompok_id ?? '') ?? '',
      active: p.active ? 'Ya' : 'Tidak',
      bacaan: m?.skor_bacaan ?? '',
      tajwid: m?.skor_tajwid ?? '',
      kehadiran_maahir: m?.skor_kehadiran_maahir ?? '',
      kehadiran_tibyan: m?.skor_kehadiran_tibyan ?? '',
      hard: m?.rata_rata_hard_skill ?? '',
      silabus: m?.skor_kepatuhan_silabus ?? '',
      manajemen: m?.skor_manajemen_halaqah ?? '',
      evaluasi: m?.skor_evaluasi_penguasaan ?? '',
      pedagogis: m?.rata_rata_pedagogis ?? '',
      disiplin: m?.skor_kedisiplinan_waktu ?? '',
      komitmen: m?.skor_komitmen_jadwal ?? '',
      tanggungjawab: m?.skor_tanggung_jawab ?? '',
      sop: m?.skor_kepatuhan_sop ?? '',
      soft: m?.rata_rata_soft_skill ?? '',
      keseluruhan: m?.rata_rata_keseluruhan ?? '',
      teguran_bulan: m?.total_teguran_bulan ?? 0,
      teguran_kum: m?.total_teguran_kumulatif ?? 0,
      status: m?.finalized_at ? 'Final' : m ? 'Draft' : 'Belum',
    });
  }

  // Standar header row (legenda di bawah)
  sheet.addRow({});
  const legendRow = sheet.addRow({
    nama: 'Standar per indikator',
    bacaan: '≥3',
    tajwid: '≥2',
    kehadiran_maahir: '≥4',
    kehadiran_tibyan: '≥4',
    silabus: '≥4',
    manajemen: '≥4',
    evaluasi: '≥4',
    disiplin: '≥4',
    komitmen: '≥4',
    tanggungjawab: '≥4',
    sop: '≥4',
  });
  legendRow.font = { italic: true, color: { argb: 'FF7A766F' } };

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `matrix-${bulan}-${gender}${kelompokId ? `-${kelompokId.slice(0, 8)}` : ''}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
