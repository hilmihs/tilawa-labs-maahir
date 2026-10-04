// Bangun workbook XLSX bergaya untuk Laporan Bulanan Maahir (dibaca pemangku
// keputusan). Dipisah dari route agar bisa diuji/di-generate mandiri.

import ExcelJS from 'exceljs';
import { labelRiwayatSP, labelSesiTakHadir, type LaporanMaahir, type StudentAtt } from '@/lib/laporan-maahir';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
// Nama bulan pendek gaya id-ID — di-hardcode (bukan toLocaleDateString) supaya
// hasilnya identik dgn halaman walau ICU runtime berbeda.
const BULAN_ID_PENDEK = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];
export function bulanLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${BULAN_ID[m - 1]} ${y}`;
}
/** Periode Maahir: 28 bulan lalu s/d 27 bulan ini (sama dgn monthRange di laporan-maahir). */
function periodeLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 2, 28));
  const end = new Date(Date.UTC(y, m - 1, 27));
  const f = (d: Date) =>
    `${d.getUTCDate()} ${BULAN_ID_PENDEK[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${f(start)} – ${f(end)}`;
}
function pct(v: number | null): string {
  return v === null ? '—' : `${v}%`;
}

const C = {
  title: 'FF0F5132', section: 'FF166534', sub: 'FFD1FAE5', subInk: 'FF065F46',
  head: 'FFDCFCE7', headInk: 'FF14532D', danger: 'FFFEE2E2', dangerInk: 'FF991B1B',
  border: 'FFCBD5E1', zebra: 'FFF6FBF8', ok: 'FF15803D', bad: 'FFB91C1C',
  muted: 'FF64748B', white: 'FFFFFFFF', ink: 'FF1F2937',
};
const NCOL = 13;

export async function buildLaporanMaahirWorkbook(lap: LaporanMaahir, bulan: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir HITS';
  wb.created = new Date();
  const ws = wb.addWorksheet(bulanLabel(bulan), {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });
  // 12 kolom: cukup untuk tabel "peserta di bawah target" berformat seragam
  // (Peserta · Kelas · Kehadiran · Pertemuan · Tidak hadir · I/S/A · Tanpa ket · Keterangan).
  ws.columns = [
    { width: 6 }, { width: 26 }, { width: 12 }, { width: 12 },
    { width: 11 }, { width: 11 }, { width: 10 }, { width: 7 },
    { width: 7 }, { width: 7 }, { width: 9 }, { width: 8 },
    { width: 46 },
  ];

  const thin = { style: 'thin' as const, color: { argb: C.border } };
  const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
  let r = 1;
  const merge = (row: number, c1: number, c2: number) => ws.mergeCells(row, c1, row, c2);
  const cell = (row: number, col: number) => ws.getCell(row, col);

  merge(r, 1, NCOL);
  const title = cell(r, 1);
  title.value = 'LAPORAN BULANAN MAAHIR';
  title.font = { bold: true, size: 16, color: { argb: C.white }, name: 'Calibri' };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.title } };
  ws.getRow(r).height = 26;
  r++;
  merge(r, 1, NCOL);
  const subt = cell(r, 1);
  subt.value = `Program Halaqah Tahsin & Tahfizh — ${bulanLabel(bulan)}`;
  subt.font = { italic: true, size: 10, color: { argb: C.white } };
  subt.alignment = { vertical: 'middle', horizontal: 'center' };
  subt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.section } };
  ws.getRow(r).height = 16;
  r++;
  // Periode laporan (28 bln lalu – 27 bln ini), sama dgn yang tampil di halaman.
  merge(r, 1, NCOL);
  const per = cell(r, 1);
  per.value = `Periode ${periodeLabel(bulan)}`;
  per.font = { size: 9, color: { argb: C.white } };
  per.alignment = { vertical: 'middle', horizontal: 'center' };
  per.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.section } };
  ws.getRow(r).height = 14;
  r += 2;

  function band(text: string, fill = C.section, ink = C.white) {
    merge(r, 1, NCOL);
    const c = cell(r, 1);
    c.value = text;
    c.font = { bold: true, size: 12, color: { argb: ink } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    ws.getRow(r).height = 20;
    r++;
  }
  function subBand(text: string) {
    merge(r, 1, NCOL);
    const c = cell(r, 1);
    c.value = text;
    c.font = { bold: true, size: 10, color: { argb: C.subInk } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.sub } };
    ws.getRow(r).height = 16;
    r++;
  }
  function tableHead(cells: Array<{ text: string; from: number; to: number; align?: 'left' | 'center' }>) {
    for (const cd of cells) {
      if (cd.to > cd.from) merge(r, cd.from, cd.to);
      const c = cell(r, cd.from);
      c.value = cd.text;
      c.font = { bold: true, size: 10, color: { argb: C.headInk } };
      c.alignment = { vertical: 'middle', horizontal: cd.align ?? 'center', wrapText: true, indent: cd.align === 'left' ? 1 : 0 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
    }
    for (let col = 1; col <= NCOL; col++) cell(r, col).border = allBorders;
    ws.getRow(r).height = 20;
    r++;
  }
  type CellDef = { text: string | number; from: number; to: number; align?: 'left' | 'center'; ink?: string; bold?: boolean; fill?: string };
  function dataRow(cells: CellDef[], zebra = false) {
    for (const cd of cells) {
      if (cd.to > cd.from) merge(r, cd.from, cd.to);
      const c = cell(r, cd.from);
      c.value = cd.text;
      c.font = { size: 10, bold: cd.bold, color: { argb: cd.ink ?? C.ink } };
      c.alignment = { vertical: 'middle', horizontal: cd.align ?? 'center', wrapText: cd.align === 'left', indent: cd.align === 'left' ? 1 : 0 };
      if (cd.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cd.fill } };
    }
    if (zebra) {
      for (let col = 1; col <= NCOL; col++) {
        const c = cell(r, col);
        if (!c.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      }
    }
    for (let col = 1; col <= NCOL; col++) cell(r, col).border = allBorders;
    // Sel riwayat (multi-baris) butuh baris yang lebih tinggi; sel lain
    // tetap 17 supaya tabel biasa tak melar.
    const baris = Math.max(
      1,
      ...cells.map((cd) => (typeof cd.text === 'string' ? cd.text.split('\n').length : 1))
    );
    ws.getRow(r).height = baris > 1 ? baris * 13 + 4 : 17;
    r++;
  }
  const spacer = () => { r++; };
  const inkForPct = (aktual: number | null, benchmark: number) =>
    aktual === null ? C.muted : aktual >= benchmark ? C.ok : C.bad;

  function obsHead() {
    tableHead([
      { text: 'No', from: 1, to: 1 },
      { text: 'Hal yang diobservasi', from: 2, to: 4, align: 'left' },
      { text: 'Aktual', from: 5, to: 5 },
      { text: 'Benchmark', from: 6, to: 6 },
      { text: 'Notes', from: 7, to: NCOL, align: 'left' },
    ]);
  }
  function obsRow(no: number, hal: string, aktual: string, benchmark: string, opts?: { ink?: string; notes?: string }, zebra = false) {
    dataRow([
      { text: no, from: 1, to: 1, ink: C.muted },
      { text: hal, from: 2, to: 4, align: 'left' },
      { text: aktual, from: 5, to: 5, bold: true, ink: opts?.ink },
      { text: benchmark, from: 6, to: 6, ink: C.muted },
      { text: opts?.notes ?? '', from: 7, to: NCOL, align: 'left', ink: C.muted },
    ], zebra);
  }

  /**
   * Tabel "peserta di bawah target" — format SERAGAM untuk Takhassus, Maahir,
   * dan At-Tibyan: jumlah pertemuan + rincian alasan tidak hadir + keterangan.
   */
  function bawahTargetTable(list: StudentAtt[]) {
    tableHead([
      { text: 'Peserta', from: 1, to: 2, align: 'left' },
      { text: 'Kelas', from: 3, to: 4, align: 'left' },
      { text: 'Kehadiran', from: 5, to: 5 },
      { text: 'Pertemuan', from: 6, to: 6 },
      { text: 'Tidak Hadir', from: 7, to: 7 },
      { text: 'Izin', from: 8, to: 8 },
      { text: 'Sakit', from: 9, to: 9 },
      { text: 'Alpa', from: 10, to: 10 },
      { text: 'Tanpa Ket.', from: 11, to: 11 },
      { text: 'Online', from: 12, to: 12 },
      { text: 'Keterangan', from: 13, to: NCOL, align: 'left' },
    ]);
    if (list.length === 0) {
      dataRow([{ text: 'Tidak ada peserta di bawah target.', from: 1, to: NCOL, align: 'left', ink: C.muted }]);
      return;
    }
    list.forEach((st, i) => {
      const hadir = st.counts.H + st.counts.T;
      // Sakit sudah keluar dari penyebut → tak ikut dikurangkan di sini.
      const tanpaKet = Math.max(0, st.tidakHadir - (st.counts.I + st.counts.A));
      const nama = st.mulaiTanggal
        ? `${st.name} (gabung ${st.mulaiTanggal.slice(8, 10)}/${st.mulaiTanggal.slice(5, 7)})`
        : st.name;
      dataRow([
        { text: nama, from: 1, to: 2, align: 'left' },
        { text: st.kelasName, from: 3, to: 4, align: 'left', ink: C.muted },
        { text: pct(st.persen), from: 5, to: 5, bold: true, ink: C.bad },
        { text: `${hadir}/${st.filled}`, from: 6, to: 6, ink: C.muted },
        { text: `${st.tidakHadir}x`, from: 7, to: 7, bold: true, ink: C.bad },
        { text: st.counts.I, from: 8, to: 8 },
        { text: st.counts.S, from: 9, to: 9 },
        { text: st.counts.A, from: 10, to: 10 },
        { text: tanpaKet, from: 11, to: 11 },
        { text: st.online > 0 ? `${st.online}x` : '', from: 12, to: 12, ink: C.muted },
        {
          text: [
            ...st.riwayat.map(labelSesiTakHadir),
            ...(st.diputihkan !== null ? [`diputihkan${st.diputihkan ? `: ${st.diputihkan}` : ''}`] : []),
          ].join('\n'),
          from: 13, to: NCOL, align: 'left', ink: C.muted,
        },
      ], i % 2 === 1);
    });
  }

  // ===== CATATAN =====
  // Urutan blok mengikuti halaman /2in1/laporan/maahir: catatan lebih dulu,
  // baru Takhassus → Maahir → At-Tibyan → SP.
  const t = lap.takhassus;
  band('CATATAN / POIN MENARIK', C.sub, C.subInk);
  if (lap.notes.length === 0 && !t.catatan) {
    dataRow([{ text: 'Belum ada catatan.', from: 1, to: NCOL, align: 'left', ink: C.muted }]);
  } else {
    if (t.catatan) {
      dataRow([{ text: t.catatan, from: 1, to: NCOL, align: 'left', ink: C.muted }]);
    }
    lap.notes.forEach((n, i) => {
      dataRow([{ text: `• ${n.teks}`, from: 1, to: NCOL, align: 'left', ink: C.ink }], i % 2 === 1);
    });
  }
  // Baris kosong untuk catatan tulis-tangan saat laporan dicetak.
  for (let i = 0; i < 3; i++) {
    dataRow([{ text: '', from: 1, to: NCOL, align: 'left' }]);
  }
  spacer();

  // ===== TAKHASSUS =====
  band('MAAHIR TAKHASSUS (IKHWAN & AKHWAT)');
  obsHead();
  obsRow(
    1,
    "Setoran Al-Qur'an per bulan (halaman)",
    t.setoran.aktual === null ? '—' : String(t.setoran.aktual),
    t.setoran.benchmark === null ? '—' : String(t.setoran.benchmark),
    { notes: 'Rata-rata halaman per peserta yang mengisi setoran' }
  );
  obsRow(
    2,
    'Pencapaian target setoran hafalan',
    pct(t.setoran.persen),
    t.setoran.adaTarget ? '100%' : '',
    {
      ink: inkForPct(t.setoran.persen, 100),
      notes: t.setoran.adaTarget
        ? 'Total halaman ÷ total target bulanan koordinator (tanpa prorata sakit/libur); peserta tanpa setoran dihitung 0'
        : 'Target bulanan belum diatur koordinator',
    },
    true
  );
  obsRow(3, 'Kehadiran peserta per bulan', pct(t.kehadiran.aktual), `${t.kehadiran.benchmark}%`, { ink: inkForPct(t.kehadiran.aktual, t.kehadiran.benchmark) }, true);
  obsRow(4, 'Jumlah peserta dengan absensi di bawah target', `${t.dibawahTarget.jumlah} orang`, '');
  obsRow(5, 'Kehadiran pengajar per bulan', `${t.kehadiranPengajar}%`, '80%', { ink: C.ok }, true);
  obsRow(6, 'Jumlah pengajar dengan absensi di bawah target', `${t.pengajarDibawahTarget} orang`, '');
  spacer();

  subBand(`Rincian Setoran — Peserta Takhassus (${t.setoran.peserta.length}) — halaman per pertemuan`);
  // Kolom baru Target & % ditaruh di dalam rentang 4–7 supaya NCOL dan lebar
  // ws.columns tak berubah — keduanya dipakai bersama tabel "peserta di bawah
  // target" di bawah, yang akan ikut bergeser kalau tata letaknya diubah.
  tableHead([
    { text: 'Peserta', from: 1, to: 2, align: 'left' },
    { text: 'Gender', from: 3, to: 3 },
    { text: 'Setoran (hal)', from: 4, to: 4 },
    { text: 'Target (hal)', from: 5, to: 5 },
    { text: '%', from: 6, to: 6 },
    { text: 'Pertemuan', from: 7, to: 7 },
    { text: 'Rincian per Pertemuan', from: 8, to: NCOL, align: 'left' },
  ]);
  t.setoran.peserta.forEach((p, i) => {
    dataRow([
      { text: p.name, from: 1, to: 2, align: 'left' },
      { text: p.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat', from: 3, to: 3, ink: C.muted },
      { text: p.halaman ?? '—', from: 4, to: 4, bold: p.halaman !== null },
      { text: p.target === null ? '—' : p.target, from: 5, to: 5, ink: C.muted },
      {
        text: p.persen === null ? '—' : `${p.persen}%`,
        from: 6, to: 6,
        bold: p.persen !== null,
        ink: inkForPct(p.persen, 100),
      },
      { text: p.pertemuanSetor > 0 ? `${p.pertemuanSetor}x` : '—', from: 7, to: 7, ink: C.muted },
      { text: p.rincian || '—', from: 8, to: NCOL, align: 'left', ink: C.muted },
    ], i % 2 === 1);
  });
  spacer();

  subBand('Kehadiran Peserta per Gender');
  tableHead([
    { text: 'Ikhwan', from: 1, to: 3 },
    { text: 'Akhwat', from: 4, to: 5 },
    { text: 'Rata-rata', from: 6, to: NCOL },
  ]);
  dataRow([
    { text: pct(t.kehadiran.avgIkhwan), from: 1, to: 3, bold: true },
    { text: pct(t.kehadiran.avgAkhwat), from: 4, to: 5, bold: true },
    { text: pct(t.kehadiran.aktual), from: 6, to: NCOL, bold: true, ink: inkForPct(t.kehadiran.aktual, t.kehadiran.benchmark) },
  ]);
  spacer();

  band('Peserta di Bawah Target (< 80%)', C.danger, C.dangerInk);
  bawahTargetTable(t.dibawahTarget.list);
  spacer(); spacer();

  // ===== MAAHIR =====
  const m = lap.maahir;
  band('MAAHIR (SELAIN TAKHASSUS)');
  obsHead();
  obsRow(1, 'Ujian teori mustawa (3 bulan)', '—', '70');
  obsRow(2, 'Ujian praktek mustawa (3 bulan)', '—', '70', undefined, true);
  obsRow(3, 'Kehadiran peserta per bulan', pct(m.kehadiran.aktual), `${m.kehadiran.benchmark}%`, { ink: inkForPct(m.kehadiran.aktual, m.kehadiran.benchmark) });
  obsRow(4, 'Rata-rata keseluruhan Ujian (teori + praktek)', '—', '70', undefined, true);
  obsRow(5, 'Jumlah peserta dengan nilai akhir program di bawah target', '—', '');
  obsRow(6, 'Hafalan matan per mustawa (3 bulan)', '—', '60', undefined, true);
  obsRow(7, 'Jumlah peserta dengan hafalan matan di bawah target', '—', '');
  obsRow(8, 'Jumlah peserta dengan absensi di bawah target', `${m.dibawahTarget.jumlah} orang`, '', undefined, true);
  obsRow(9, 'Kehadiran pengajar per bulan', `${m.kehadiranPengajar}%`, '85%', { ink: C.ok });
  obsRow(10, 'Jumlah pengajar dengan absensi di bawah target', `${m.pengajarDibawahTarget} orang`, '', undefined, true);
  spacer();

  subBand('Kehadiran Peserta per Gender');
  tableHead([
    { text: 'Ikhwan', from: 1, to: 3 },
    { text: 'Akhwat', from: 4, to: 5 },
    { text: 'Rata-rata', from: 6, to: NCOL },
  ]);
  dataRow([
    { text: pct(m.kehadiran.avgIkhwan), from: 1, to: 3, bold: true },
    { text: pct(m.kehadiran.avgAkhwat), from: 4, to: 5, bold: true },
    { text: pct(m.kehadiran.aktual), from: 6, to: NCOL, bold: true, ink: inkForPct(m.kehadiran.aktual, m.kehadiran.benchmark) },
  ]);
  spacer();

  band('Peserta di Bawah Target (< 80%)', C.danger, C.dangerInk);
  bawahTargetTable(m.dibawahTarget.list);
  spacer(); spacer();

  // ===== AT-TIBYAN =====
  const a = lap.atTibyan;
  band('AT-TIBYAN');
  obsHead();
  obsRow(1, 'Kehadiran peserta per bulan', pct(a.kehadiran.aktual), `${a.kehadiran.benchmark}%`, { ink: inkForPct(a.kehadiran.aktual, a.kehadiran.benchmark) });
  obsRow(2, 'Jumlah peserta dengan absensi di bawah target', `${a.dibawahTarget.total} orang`, '', { notes: `Ikhwan ${a.dibawahTarget.ikhwan} · Akhwat ${a.dibawahTarget.akhwat}` }, true);
  spacer();

  subBand('Kehadiran Peserta per Gender');
  tableHead([
    { text: 'Ikhwan', from: 1, to: 3 },
    { text: 'Akhwat', from: 4, to: 5 },
    { text: 'Rata-rata', from: 6, to: NCOL },
  ]);
  dataRow([
    { text: pct(a.kehadiran.avgIkhwan), from: 1, to: 3, bold: true },
    { text: pct(a.kehadiran.avgAkhwat), from: 4, to: 5, bold: true },
    { text: pct(a.kehadiran.aktual), from: 6, to: NCOL, bold: true, ink: inkForPct(a.kehadiran.aktual, a.kehadiran.benchmark) },
  ]);
  spacer();

  band('Peserta di Bawah Target (< 100%)', C.danger, C.dangerInk);
  bawahTargetTable(a.dibawahTarget.list);
  spacer(); spacer();

  // ===== PENDATAAN SP =====
  const sp = lap.sp;
  band('PENDATAAN SP (SURAT PERINGATAN)');
  dataRow([
    {
      text:
        `Periode ${sp.mulai} s/d ${sp.cutoff} (bulan ini saja) · Total ${sp.summary.total} peserta — ` +
        `SP1 ${sp.summary.sp1} · SP2 ${sp.summary.sp2} · SP3 ${sp.summary.sp3}. ` +
        `Alpa 1x/2x/>=3x → SP1/SP2/SP3 · Izin 2x/3x/>=4x → SP1/SP2/SP3.`,
      from: 1, to: NCOL, align: 'left', ink: C.muted,
    },
  ]);
  tableHead([
    { text: 'Peserta', from: 1, to: 2, align: 'left' },
    { text: 'Kelas', from: 3, to: 4, align: 'left' },
    { text: 'SP', from: 5, to: 5 },
    { text: 'Alpa', from: 6, to: 6 },
    { text: 'Izin', from: 7, to: 7 },
    { text: 'Sakit', from: 8, to: 8 },
    { text: 'Hadir', from: 9, to: 9 },
    { text: 'Penetapan', from: 10, to: 12 },
    { text: 'Riwayat (tanggal · sesi · alasan)', from: 13, to: NCOL, align: 'left' },
  ]);
  if (sp.list.length === 0) {
    dataRow([{ text: 'Tidak ada peserta terkena SP.', from: 1, to: NCOL, align: 'left', ink: C.muted }]);
  } else {
    sp.list.forEach((p, i) => {
      dataRow([
        { text: p.name, from: 1, to: 2, align: 'left' },
        { text: p.kelasName, from: 3, to: 4, align: 'left', ink: C.muted },
        { text: `SP${p.sp}`, from: 5, to: 5, bold: true, ink: p.sp >= 2 ? C.bad : C.ink },
        { text: p.alpa, from: 6, to: 6 },
        { text: p.izin, from: 7, to: 7 },
        { text: p.sakit, from: 8, to: 8 },
        { text: p.hadir + p.terlambat, from: 9, to: 9 },
        {
          text: p.penetapan.map((x) => `SP${x.level} ${x.tanggal.slice(8, 10)}/${x.tanggal.slice(5, 7)}`).join(' · '),
          from: 10, to: 12, ink: C.muted,
        },
        { text: p.riwayat.map(labelRiwayatSP).join('\n'), from: 13, to: NCOL, align: 'left', ink: C.muted },
      ], i % 2 === 1);
    });
  }

  // Catatan kaki — teks sama dgn yang tampil di bawah halaman laporan.
  spacer();
  merge(r, 1, NCOL);
  const foot = cell(r, 1);
  foot.value =
    `Presensi mulai dilacak ${bulanLabel(PRESENSI_ANCHOR.slice(0, 7))}. Bulan sebelumnya kosong. ` +
    'Kehadiran peserta Takhassus & Maahir dihitung dari sesi Kelas Maahir; At-Tibyan ' +
    'dilaporkan terpisah. Kehadiran pengajar sementara default 100%.\n' +
    'Sakit dianggap udzur — sesinya dikeluarkan dari penyebut, jadi tidak menurunkan persen. ' +
    'Izin dan alpa tetap menurunkan. Kolom Pertemuan = (hadir+terlambat) dibagi pertemuan ' +
    'terisi setelah sakit dikeluarkan.\n' +
    'Angka di sini bisa berbeda dengan halaman Rekap Kehadiran: rekap memakai bulan kalender ' +
    '(1–31) dan menggabung sesi Maahir + At-Tibyan jadi satu persen, sedangkan laporan ini ' +
    'memakai periode 28–27 dan memisahkan keduanya.';
  foot.font = { size: 9, italic: true, color: { argb: C.muted } };
  foot.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
  ws.getRow(r).height = 58;
  r++;

  return wb.xlsx.writeBuffer();
}
