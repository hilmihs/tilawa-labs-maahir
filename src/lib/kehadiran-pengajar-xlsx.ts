// Export Excel rekap check-in pengajar kelas Maahir — dua sheet: Rekap
// (satu baris per pengajar) dan Rincian (satu baris per sesi, dengan materi).

import ExcelJS from 'exceljs';
import {
  jamWib,
  LABEL_STATUS_CHECKIN,
  type RekapPengajarMaahir,
} from '@/lib/maahir-checkin-pengajar';
import { periodePengajarLabel } from '@/lib/periode-pengajar';

const C = {
  ink: 'FF1F1B16',
  muted: 'FF6B6560',
  head: 'FF1F1B16',
  white: 'FFFFFFFF',
  zebra: 'FFF6F3EE',
  bad: 'FFB42318',
  warn: 'FF9A6700',
  border: 'FFD9D4CC',
};

function tanggalId(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export async function buildKehadiranPengajarWorkbook(rekap: RekapPengajarMaahir): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir';
  wb.created = new Date();
  const thin = { style: 'thin' as const, color: { argb: C.border } };
  const borders = { top: thin, left: thin, bottom: thin, right: thin };
  const label = periodePengajarLabel(rekap.month);

  const head = (ws: ExcelJS.Worksheet, row: number, cols: string[]) => {
    cols.forEach((t, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = t;
      c.font = { bold: true, color: { argb: C.white }, size: 10 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = borders;
    });
    ws.getRow(row).height = 20;
  };
  const title = (ws: ExcelJS.Worksheet, text: string, ncol: number) => {
    ws.mergeCells(1, 1, 1, ncol);
    const t = ws.getCell(1, 1);
    t.value = text;
    t.font = { bold: true, size: 14 };
    ws.mergeCells(2, 1, 2, ncol);
    const s = ws.getCell(2, 1);
    s.value = `Periode ${label} · dihitung s/d ${tanggalId(rekap.cutoff)} · sesi terjadwal dari jadwal kelas dikurangi libur; jam = saat check-in ditekan (tanpa aturan terlambat)`;
    s.font = { size: 9, italic: true, color: { argb: C.muted } };
    s.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(2).height = 28;
  };

  // ===== Sheet 1: Rekap =====
  const ws1 = wb.addWorksheet('Rekap', { views: [{ showGridLines: false }] });
  ws1.columns = [
    { width: 28 }, { width: 26 }, { width: 11 }, { width: 8 }, { width: 8 },
    { width: 8 }, { width: 12 }, { width: 11 }, { width: 13 },
  ];
  title(ws1, 'REKAP CHECK-IN PENGAJAR KELAS MAAHIR', 9);
  head(ws1, 4, ['Pengajar', 'Kelas', 'Terjadwal', 'Hadir', 'Izin', 'Sakit', 'Belum diisi', 'Kehadiran', 'Materi kosong']);
  let r = 5;
  rekap.list.forEach((p, i) => {
    const g = p.ringkasan;
    const vals: Array<string | number> = [
      p.name, p.kelasNames.join(' · '), g.terjadwal, g.hadir, g.izin, g.sakit, g.belum,
      g.persen === null ? '—' : `${g.persen}%`, g.materiKosong,
    ];
    vals.forEach((v, j) => {
      const c = ws1.getCell(r, j + 1);
      c.value = v;
      c.font = {
        size: 10,
        bold: j === 7,
        color: {
          argb:
            j === 6 && g.belum > 0 ? C.bad
            : j === 7 && g.persen !== null && g.persen < 80 ? C.bad
            : j === 8 && g.materiKosong > 0 ? C.warn
            : C.ink,
        },
      };
      c.alignment = { vertical: 'middle', horizontal: j <= 1 ? 'left' : 'center', indent: j <= 1 ? 1 : 0 };
      c.border = borders;
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    });
    r++;
  });

  // ===== Sheet 2: Rincian =====
  const ws2 = wb.addWorksheet('Rincian', { views: [{ showGridLines: false }] });
  ws2.columns = [
    { width: 26 }, { width: 16 }, { width: 20 }, { width: 8 }, { width: 11 },
    { width: 9 }, { width: 9 }, { width: 48 }, { width: 30 },
  ];
  title(ws2, 'RINCIAN CHECK-IN & MATERI PER SESI', 9);
  head(ws2, 4, ['Pengajar', 'Kelas', 'Tanggal', 'Jam kelas', 'Status', 'Jam isi', 'Susulan', 'Materi', 'Catatan']);
  r = 5;
  let zebra = false;
  for (const p of rekap.list) {
    for (const s of p.sesi) {
      if (!s.lampau) continue;
      const c = s.checkin;
      const vals: string[] = [
        p.name,
        s.kelasName,
        tanggalId(s.tanggal),
        s.waktuMulai ? s.waktuMulai.slice(0, 5) : '',
        c ? LABEL_STATUS_CHECKIN[c.status] : 'Belum diisi',
        c ? jamWib(c.checked_in_at) : '',
        c?.susulan ? 'ya' : '',
        c?.materi ?? '',
        c?.catatan ?? '',
      ];
      vals.forEach((v, j) => {
        const cell = ws2.getCell(r, j + 1);
        cell.value = v;
        cell.font = {
          size: 10,
          color: { argb: j === 4 && !c ? C.bad : j === 7 && c?.status === 'hadir' && !c.materi ? C.warn : C.ink },
        };
        cell.alignment = { vertical: 'top', horizontal: j >= 3 && j <= 6 ? 'center' : 'left', wrapText: j >= 7, indent: j >= 7 || j <= 2 ? 1 : 0 };
        cell.border = borders;
        if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      });
      if (!c && vals[7] === '') ws2.getCell(r, 8).value = '';
      r++;
      zebra = !zebra;
    }
  }

  return (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
}
