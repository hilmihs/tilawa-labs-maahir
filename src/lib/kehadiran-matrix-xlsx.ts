// Workbook "Data Kehadiran Peserta Maahir" — matriks peserta × tanggal per kelas,
// memakai periode laporan bulanan (28–27) supaya angkanya sebanding dengan
// halaman /2in1/laporan/maahir. Dipisah dari route agar bisa diuji mandiri.

import ExcelJS from 'exceljs';
import type { RekapKelas, StatusCode } from '@/lib/maahir-rekap';

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const BULAN_ID_PENDEK = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

function bulanLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${BULAN_ID[m - 1]} ${y}`;
}
/** '2026-07-28' → '28 Jul' */
function tglPendek(tanggal: string): string {
  const [, m, d] = tanggal.split('-').map(Number);
  return `${d} ${BULAN_ID_PENDEK[m - 1]}`;
}
function periodeLabel(start: string, end: string): string {
  const f = (t: string) => {
    const [y, m, d] = t.split('-').map(Number);
    return `${d} ${BULAN_ID_PENDEK[m - 1]} ${y}`;
  };
  return `${f(start)} – ${f(end)}`;
}

const C = {
  title: 'FF0F5132', section: 'FF166534', head: 'FFDCFCE7', headInk: 'FF14532D',
  border: 'FFCBD5E1', zebra: 'FFF6FBF8', white: 'FFFFFFFF', ink: 'FF1F2937',
  muted: 'FF64748B', ok: 'FF15803D', bad: 'FFB91C1C', warn: 'FFB45309',
};
/** Warna latar tipis per kode status — biar pola bolong kelihatan sekilas. */
const CODE_FILL: Record<Exclude<StatusCode, '-'>, string> = {
  H: 'FFDCFCE7', // hijau muda
  T: 'FFFEF3C7', // kuning
  I: 'FFDBEAFE', // biru
  S: 'FFF3E8FF', // ungu
  A: 'FFFEE2E2', // merah
};
const CODE_INK: Record<Exclude<StatusCode, '-'>, string> = {
  H: 'FF166534', T: 'FF92400E', I: 'FF1E40AF', S: 'FF6B21A8', A: 'FF991B1B',
};

const PROGRAM_SHORT: Record<string, string> = {
  kelas_maahir: 'Maahir',
  at_tibyan: 'Tibyan',
  muallim_najih: 'Najih',
};

/** Kolom tetap sebelum kolom tanggal: No, Nama, lalu ringkasan di belakang. */
const COL_NO = 1;
const COL_NAMA = 2;
const FIXED_LEFT = 2;
const RINGKASAN = ['H', 'I', 'S', 'A', 'T', '%Hadir'] as const;

export async function buildKehadiranMatrixWorkbook(
  rekap: RekapKelas[],
  bulan: string,
  range: { start: string; end: string }
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir HITS';
  wb.created = new Date();

  const ws = wb.addWorksheet(`Kehadiran ${bulanLabel(bulan)}`, {
    views: [{ showGridLines: false, state: 'frozen', xSplit: FIXED_LEFT, ySplit: 0 }],
    pageSetup: {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  // Lebar kolom: cukup untuk kelas dengan pertemuan terbanyak.
  const maxPertemuan = rekap.reduce((n, k) => Math.max(n, k.pertemuan.length), 0);
  const NCOL = FIXED_LEFT + maxPertemuan + RINGKASAN.length + 1; // +1 = Keterangan
  const cols: Partial<ExcelJS.Column>[] = [{ width: 5 }, { width: 30 }];
  for (let i = 0; i < maxPertemuan; i++) cols.push({ width: 7 });
  for (let i = 0; i < RINGKASAN.length; i++) cols.push({ width: i === RINGKASAN.length - 1 ? 9 : 5 });
  cols.push({ width: 40 });
  ws.columns = cols;

  const thin = { style: 'thin' as const, color: { argb: C.border } };
  const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
  let r = 1;
  const cell = (row: number, col: number) => ws.getCell(row, col);
  const merge = (row: number, c1: number, c2: number) => {
    if (c2 > c1) ws.mergeCells(row, c1, row, c2);
  };

  // ===== Judul =====
  merge(r, 1, NCOL);
  const title = cell(r, 1);
  title.value = 'DATA KEHADIRAN PESERTA MAAHIR';
  title.font = { bold: true, size: 15, color: { argb: C.white } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.title } };
  ws.getRow(r).height = 24;
  r++;

  merge(r, 1, NCOL);
  const sub = cell(r, 1);
  sub.value = `${bulanLabel(bulan)} · Periode ${periodeLabel(range.start, range.end)}`;
  sub.font = { italic: true, size: 10, color: { argb: C.white } };
  sub.alignment = { vertical: 'middle', horizontal: 'center' };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.section } };
  ws.getRow(r).height = 16;
  r++;

  merge(r, 1, NCOL);
  const legend = cell(r, 1);
  legend.value =
    'H = Hadir · I = Izin · S = Sakit · A = Alpa · T = Terlambat · (kosong) = belum tercatat / di luar rentang keanggotaan. ' +
    '%Hadir = (H+T) / (pertemuan terisi − sakit); sakit dianggap udzur dan tidak menurunkan persen.';
  legend.font = { size: 9, italic: true, color: { argb: C.muted } };
  legend.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  ws.getRow(r).height = 24;
  r += 2;

  const kelasTerisi = rekap.filter((k) => k.anggota.length > 0);
  if (kelasTerisi.length === 0) {
    merge(r, 1, NCOL);
    const c = cell(r, 1);
    c.value = 'Belum ada data kehadiran pada periode ini.';
    c.font = { size: 11, color: { argb: C.muted } };
    return wb.xlsx.writeBuffer();
  }

  for (const k of kelasTerisi) {
    // ===== Band kelas =====
    merge(r, 1, NCOL);
    const band = cell(r, 1);
    band.value =
      `${k.kelasName.toUpperCase()} — ${k.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} · ` +
      `${k.anggota.length} anggota · ${k.pertemuan.length} pertemuan terisi` +
      (k.belumDiisi > 0 ? ` · ${k.belumDiisi} belum diisi` : '');
    band.font = { bold: true, size: 11, color: { argb: C.white } };
    band.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    band.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.section } };
    ws.getRow(r).height = 19;
    r++;

    // ===== Header tabel =====
    const headRow = r;
    const put = (col: number, text: string) => {
      const c = cell(headRow, col);
      c.value = text;
      c.font = { bold: true, size: 9, color: { argb: C.headInk } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
      c.border = allBorders;
    };
    put(COL_NO, 'No');
    put(COL_NAMA, 'Nama Peserta');
    cell(headRow, COL_NAMA).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    k.pertemuan.forEach((p, i) => {
      put(FIXED_LEFT + 1 + i, `${tglPendek(p.tanggal)}\n${PROGRAM_SHORT[p.program] ?? p.program}`);
    });
    RINGKASAN.forEach((h, i) => put(FIXED_LEFT + k.pertemuan.length + 1 + i, h));
    put(FIXED_LEFT + k.pertemuan.length + RINGKASAN.length + 1, 'Keterangan');
    cell(headRow, FIXED_LEFT + k.pertemuan.length + RINGKASAN.length + 1).alignment = {
      vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true,
    };
    ws.getRow(headRow).height = 28;
    r++;

    // ===== Baris anggota =====
    k.anggota.forEach((a, idx) => {
      const zebra = idx % 2 === 1;
      const bg = zebra ? C.zebra : undefined;

      const no = cell(r, COL_NO);
      no.value = idx + 1;
      no.font = { size: 9, color: { argb: C.muted } };
      no.alignment = { vertical: 'middle', horizontal: 'center' };

      const nama = cell(r, COL_NAMA);
      nama.value =
        a.name + (a.isKetua ? ' (Ketua)' : a.isWakil ? ' (Wakil)' : '');
      nama.font = { size: 10, bold: a.isKetua, color: { argb: C.ink } };
      nama.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

      k.pertemuan.forEach((p, i) => {
        const code = a.perPertemuan[p.id] ?? '-';
        const c = cell(r, FIXED_LEFT + 1 + i);
        c.value = code === '-' ? '' : code;
        c.alignment = { vertical: 'middle', horizontal: 'center' };
        if (code !== '-') {
          c.font = { size: 10, bold: true, color: { argb: CODE_INK[code] } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CODE_FILL[code] } };
        } else {
          c.font = { size: 10, color: { argb: C.muted } };
        }
      });

      const base = FIXED_LEFT + k.pertemuan.length;
      const ring: Array<number | string> = [
        a.totals.H, a.totals.I, a.totals.S, a.totals.A, a.totals.T,
        a.persenHadir === null ? '—' : `${a.persenHadir}%`,
      ];
      ring.forEach((v, i) => {
        const c = cell(r, base + 1 + i);
        c.value = typeof v === 'number' && v === 0 ? '' : v;
        c.alignment = { vertical: 'middle', horizontal: 'center' };
        const isPersen = i === RINGKASAN.length - 1;
        c.font = {
          size: 10,
          bold: isPersen,
          color: {
            argb: !isPersen
              ? C.ink
              : a.persenHadir === null
                ? C.muted
                : a.persenHadir >= 80
                  ? C.ok
                  : a.persenHadir >= 50
                    ? C.warn
                    : C.bad,
          },
        };
      });

      const ket = cell(r, base + RINGKASAN.length + 1);
      ket.value = a.keterangan;
      ket.font = { size: 9, color: { argb: C.muted } };
      ket.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };

      // Border + zebra untuk seluruh lebar baris kelas ini.
      const lastCol = base + RINGKASAN.length + 1;
      for (let col = 1; col <= lastCol; col++) {
        const c = cell(r, col);
        if (bg && !c.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        c.border = allBorders;
      }
      ws.getRow(r).height = 16;
      r++;
    });

    r += 2; // jarak antar kelas
  }

  return wb.xlsx.writeBuffer();
}
