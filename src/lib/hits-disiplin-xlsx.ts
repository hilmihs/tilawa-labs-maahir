// Workbook "Ranking Disiplin Pengajar" — cerminan halaman /hits/koordinator.
// Lima sheet: Ranking, Rincian Insiden, Cakupan Observasi, Rincian Hutang,
// Cara Baca. Dipisah dari route agar bisa diuji mandiri (pola sama dengan
// kehadiran-matrix-xlsx.ts).

import ExcelJS from 'exceljs';
import type { HitsKoordinatorRekap } from '@/lib/hits-koordinator-rekap';
import { HUTANG_RUMUS, type InsidenDetail, type HutangRincianPengajar } from '@/lib/hits-ranking';
import { HUTANG_ANCHOR, JKG_MENIT, TOLERANSI_KMT } from '@/lib/hits-hutang';

const C = {
  title: 'FF0F5132', head: 'FFDCFCE7', headInk: 'FF14532D',
  border: 'FFCBD5E1', zebra: 'FFF6FBF8', ink: 'FF1F2937', muted: 'FF64748B',
  ok: 'FF15803D', warn: 'FFB45309', bad: 'FFB91C1C',
  okFill: 'FFDCFCE7', warnFill: 'FFFEF3C7', badFill: 'FFFEE2E2',
};

const JENIS_LABEL: Record<string, string> = {
  KMT: 'Kelas Mulai Terlambat',
  KBLA: 'Kelas Berakhir Lebih Awal',
  JKG: 'Jadwal Kelas Ganti',
  BADAL: 'Pengajar digantikan (badal)',
  TIDAK_LATIHAN: 'Tidak memberikan latihan',
};

const HUTANG_STATUS_LABEL: Record<HutangRincianPengajar['status'], string> = {
  belum: 'Belum dibayar',
  sebagian: 'Dibayar sebagian',
  lunas: 'Lunas',
};

const STATUS_LABEL: Record<InsidenDetail['status'], string> = {
  belum_ditabayyun: 'Belum ditabayyun',
  nunggu_alasan: 'Nunggu alasan pengajar',
  pending: 'Nunggu putusan koordinator',
  diputus: 'Sudah diputus',
};

/** Ambang warna %KBBS — sama persis dengan pctColor di halaman. */
function pctBand(p: number): { ink: string; fill: string } {
  if (p >= 90) return { ink: C.ok, fill: C.okFill };
  if (p >= 75) return { ink: C.warn, fill: C.warnFill };
  return { ink: C.bad, fill: C.badFill };
}

function putusanText(i: InsidenDetail): string {
  if (i.status !== 'diputus' || i.isUdzurSyari === null) return STATUS_LABEL[i.status];
  return i.isUdzurSyari ? 'Udzur syar’i diterima' : 'Udzur ditolak';
}

type Sheet = ExcelJS.Worksheet;

function judul(ws: Sheet, teks: string, sub: string, lebarKolom: number) {
  ws.mergeCells(1, 1, 1, lebarKolom);
  const t = ws.getCell(1, 1);
  t.value = teks;
  t.font = { bold: true, size: 14, color: { argb: C.title } };
  t.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 22;

  ws.mergeCells(2, 1, 2, lebarKolom);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { size: 10, color: { argb: C.muted } };
  ws.getRow(2).height = 16;
}

function headerRow(ws: Sheet, baris: number, kolom: string[]) {
  const r = ws.getRow(baris);
  kolom.forEach((label, i) => {
    const c = r.getCell(i + 1);
    c.value = label;
    c.font = { bold: true, size: 10, color: { argb: C.headInk } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = {
      top: { style: 'thin', color: { argb: C.border } },
      bottom: { style: 'thin', color: { argb: C.border } },
      left: { style: 'thin', color: { argb: C.border } },
      right: { style: 'thin', color: { argb: C.border } },
    };
  });
  r.height = 26;
  ws.views = [{ state: 'frozen', ySplit: baris }];
  ws.autoFilter = {
    from: { row: baris, column: 1 },
    to: { row: baris, column: kolom.length },
  };
}

function garis(ws: Sheet, baris: number, jumlahKolom: number, genap: boolean) {
  const r = ws.getRow(baris);
  for (let i = 1; i <= jumlahKolom; i++) {
    const c = r.getCell(i);
    c.border = {
      top: { style: 'hair', color: { argb: C.border } },
      bottom: { style: 'hair', color: { argb: C.border } },
      left: { style: 'hair', color: { argb: C.border } },
      right: { style: 'hair', color: { argb: C.border } },
    };
    if (genap && !c.fill) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    }
  }
}

export async function buildHitsDisiplinWorkbook(rekap: HitsKoordinatorRekap) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir HITS';
  wb.created = new Date();

  // Cakupan halaqah (batch / online-offline) ikut disebut — tanpa itu file yang
  // sudah disaring gampang disangka daftar lengkap. `scopeLabel` sengaja null
  // saat tak ada yang dipilih (di layar artinya "tak usah tampilkan chip"), tapi
  // di berkas yang beredar lepas dari layarnya diamnya itu justru menyesatkan:
  // pembaca tak bisa membedakan "semua kelas" dari "sudah disaring". Jadi di
  // sini cakupan SELALU dieja.
  const cakupan = [
    rekap.batchName ?? 'Semua batch',
    rekap.kelas === 'offline' ? 'kelas offline saja'
      : rekap.kelas === 'online' ? 'kelas online saja'
      : 'kelas online + offline',
  ].join(' · ');
  const sub = `${rekap.mode === 'minggu' ? 'Mingguan' : 'Bulanan'} · ${rekap.periodeLabel} · ${rekap.genderLabel} · ${cakupan} · ${rekap.ranked.length} pengajar berperingkat`;

  // ── Sheet 1: Ranking ──────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('Ranking', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    // %On-Time & %Stabil dipisah (rapat Agustus 2026) — dulu satu kolom %KBBS
    // yang meleburkan telat, durasi, pindah hari, dan badal jadi satu angka.
    // Nama kolom mengeja pembilang & penyebutnya. Sebelumnya kolom 6 dan 7
    // bernama "On-time" dan "Dinilai on-time" — dua nama nyaris kembar, dan
    // pembaca tak punya cara menebak yang mana dibagi yang mana.
    const KOLOM = ['#', 'Pengajar', 'Gender', 'Halaqah', '%On-Time', 'Tepat jam', 'Dari pertemuan dinilai', '%Stabil', 'Dari pertemuan non-libur', 'KMT', 'KBLA', 'JKG', 'TL', 'Hutang (menit) kumulatif'];
    judul(
      ws,
      'Ranking Disiplin Pengajar',
      `${sub} · Hutang (menit) KUMULATIF sejak ${HUTANG_ANCHOR} — bukan periode ini; asalnya di sheet "Rincian Hutang"`,
      KOLOM.length
    );
    headerRow(ws, 4, KOLOM);
    // Keterangan menempel di header kolomnya sendiri — pembaca file tak punya
    // tooltip seperti di layar, jadi tanpa ini singkatan & rumusnya tak bisa
    // ditelusuri tanpa lompat ke sheet "Cara Baca".
    const CATATAN_KOLOM: Array<[number, string]> = [
      [5, '%On-Time = "Tepat jam" ÷ "Dari pertemuan dinilai". Pertemuan yang dipindah hari (JKG) atau dibadalkan tidak ikut dibagi — jam pengajar aslinya tak bisa dinilai di situ.'],
      [6, `Pembilang %On-Time: pertemuan tanpa KMT (>${TOLERANSI_KMT} menit) dan tanpa KBLA.`],
      [7, 'Penyebut %On-Time: pertemuan non-libur, dikurangi yang dipindah hari (JKG) atau dibadalkan (BADAL).'],
      [8, '%Stabil = pertemuan yang TIDAK dipindah hari & TIDAK dibadalkan ÷ "Dari pertemuan non-libur".'],
      [9, 'Penyebut %Stabil: semua pertemuan yang dinilai dan kondisinya bukan LIBUR.'],
      [10, `${JENIS_LABEL.KMT}. Angka = jumlah insiden, bukan jumlah pertemuan.`],
      [11, `${JENIS_LABEL.KBLA}. Angka = jumlah insiden, bukan jumlah pertemuan.`],
      [12, `${JENIS_LABEL.JKG}. Angka = jumlah insiden, bukan jumlah pertemuan.`],
      [13, `${JENIS_LABEL.TIDAK_LATIHAN}. Angka = jumlah insiden, bukan jumlah pertemuan.`],
      [14, `KUMULATIF sejak ${HUTANG_ANCHOR}, BUKAN periode laporan ini. ${HUTANG_RUMUS}`],
    ];
    for (const [kol, teks] of CATATAN_KOLOM) ws.getCell(4, kol).note = teks;

    let baris = 5;
    rekap.ranked.forEach((r, idx) => {
      const row = ws.getRow(baris);
      row.values = [
        r.rank,
        r.pengajarNama,
        r.gender ?? '—',
        r.halaqahCount,
        r.pctOnTime === null ? null : r.pctOnTime / 100,
        r.onTimeBaik,
        r.onTimeTotal,
        r.pctStabil === null ? null : r.pctStabil / 100,
        r.nonLibur,
        r.kmt,
        r.kbla,
        r.jkg,
        r.tidakLatihan,
        r.hutangSaldo,
      ];
      for (const [col, nilai] of [[5, r.pctOnTime], [8, r.pctStabil]] as const) {
        const pct = row.getCell(col);
        pct.numFmt = '0%';
        if (nilai !== null) {
          const band = pctBand(nilai);
          pct.font = { bold: true, color: { argb: band.ink } };
          pct.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: band.fill } };
        }
      }
      // Pelanggaran: 0 dibiarkan kosong supaya yang bermasalah menonjol.
      for (const col of [10, 11, 12, 13]) {
        const c = row.getCell(col);
        if (c.value === 0) c.value = null;
        else c.font = { bold: true, color: { argb: C.bad } };
      }
      if (r.hutangSaldo > 0) row.getCell(14).font = { color: { argb: C.warn } };
      garis(ws, baris, KOLOM.length, idx % 2 === 1);
      baris++;
    });

    if (rekap.noData.length > 0) {
      baris++;
      ws.mergeCells(baris, 1, baris, KOLOM.length);
      const c = ws.getCell(baris, 1);
      // "Belum ada data" tak memberi tahu pembaca apa yang harus dilakukan, dan
      // gampang dibaca sebagai tuduhan pada pengajar. Dua sebabnya dieja.
      c.value =
        `Tak ada pertemuan yang bisa dinilai pada periode ini — ${rekap.noData.length} pengajar. ` +
        `Sebabnya salah satu dari: ketua kelas belum mengisi keterangan harian, atau halaqahnya memang belum berjalan pada periode ini.`;
      c.font = { bold: true, size: 11, color: { argb: C.warn } };
      baris++;
      rekap.noData.forEach((r, idx) => {
        const row = ws.getRow(baris);
        row.values = ['—', r.pengajarNama, r.gender ?? '—', r.halaqahCount];
        garis(ws, baris, KOLOM.length, idx % 2 === 1);
        baris++;
      });
    }

    ws.columns.forEach((col, i) => {
      // i=6 & i=8 = kolom penyebut, judulnya panjang → beri ruang lebih.
      col.width = i === 1 ? 30 : i === 0 ? 5 : i === 6 || i === 8 ? 18 : i === 13 ? 16 : 12;
      col.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' };
    });
  }

  // ── Sheet 2: Rincian insiden ──────────────────────────────────────
  {
    const ws = wb.addWorksheet('Rincian Insiden', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const KOLOM = ['Pengajar', 'Tanggal', 'Pertemuan', 'Halaqah', 'Pelanggaran', 'Keterangan ketua', 'Alasan pengajar (tabayyun)', 'Putusan'];
    judul(ws, 'Rincian Insiden & Tabayyun', sub, KOLOM.length);
    headerRow(ws, 4, KOLOM);

    let baris = 5;
    let idx = 0;
    for (const r of [...rekap.ranked, ...rekap.noData]) {
      const daftar = rekap.insidenByPengajar.get(r.pengajarId) ?? [];
      for (const i of daftar) {
        const row = ws.getRow(baris);
        row.values = [
          r.pengajarNama,
          i.tanggal,
          i.pertemuanNo,
          i.halaqahName,
          i.pelanggaran
            .map((p) => `${JENIS_LABEL[p.jenis] ?? p.jenis}${p.detail ? ` (${p.detail})` : ''}`)
            .join('; '),
          i.catatanKetua ?? '',
          i.alasanPengajar ?? '',
          putusanText(i),
        ];
        row.getCell(5).alignment = { wrapText: true, vertical: 'top' };
        row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
        row.getCell(7).alignment = { wrapText: true, vertical: 'top' };
        if (i.status !== 'diputus') row.getCell(8).font = { color: { argb: C.warn } };
        else if (i.isUdzurSyari === false) row.getCell(8).font = { color: { argb: C.bad } };
        garis(ws, baris, KOLOM.length, idx % 2 === 1);
        baris++;
        idx++;
      }
    }
    if (idx === 0) {
      ws.getCell(5, 1).value = 'Tak ada insiden pada periode ini.';
      ws.getCell(5, 1).font = { color: { argb: C.muted } };
    }

    ws.columns.forEach((col, i) => {
      col.width = [26, 12, 11, 24, 34, 34, 34, 22][i] ?? 16;
      col.alignment = { vertical: 'top', horizontal: i === 1 || i === 2 ? 'center' : 'left' };
    });
  }

  // ── Sheet 3: Cakupan observasi ketua kelas ────────────────────────
  {
    const ws = wb.addWorksheet('Cakupan Observasi', {
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const KOLOM = ['Pengajar', 'Sudah', 'Belum', 'Total', '% Terisi', 'Pertemuan belum terisi'];
    judul(ws, 'Cakupan Observasi Ketua Kelas', sub, KOLOM.length);
    headerRow(ws, 4, KOLOM);

    let baris = 5;
    let idx = 0;
    for (const r of [...rekap.ranked, ...rekap.noData]) {
      const c = rekap.cakupanByPengajar.get(r.pengajarId);
      if (!c) continue;
      const row = ws.getRow(baris);
      row.values = [
        r.pengajarNama,
        c.sudah,
        c.belum,
        c.total,
        c.persen === null ? null : c.persen / 100,
        // 'belum' & 'pragenerate' sama-sama tunggakan ketua kelas — baris
        // pragenerate ada di DB tapi bukan hasil observasi siapa pun.
        c.pertemuan
          .filter((p) => p.status !== 'sudah')
          .map((p) => `${p.tanggal} ${p.halaqahName}`)
          .join('; '),
      ];
      const pct = row.getCell(5);
      pct.numFmt = '0%';
      if (c.persen !== null) {
        const band = pctBand(c.persen);
        pct.font = { bold: true, color: { argb: band.ink } };
        pct.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: band.fill } };
      }
      row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
      garis(ws, baris, KOLOM.length, idx % 2 === 1);
      baris++;
      idx++;
    }
    if (idx === 0) {
      ws.getCell(5, 1).value = 'Tak ada data observasi pada periode ini.';
      ws.getCell(5, 1).font = { color: { argb: C.muted } };
    }

    ws.columns.forEach((col, i) => {
      col.width = [28, 9, 9, 9, 11, 60][i] ?? 16;
      col.alignment = { vertical: 'top', horizontal: i === 0 || i === 5 ? 'left' : 'center' };
    });
  }

  // ── Sheet 4: Rincian hutang menit ─────────────────────────────────
  // Asal-usul kolom "Hutang (menit)" di sheet Ranking: pertemuan mana yang
  // menimbulkan debit, berapa sudah dibayar, dan sisanya. Cakupannya KUMULATIF
  // (sejak HUTANG_ANCHOR), beda dengan sheet lain yang di-scope periode.
  {
    const ws = wb.addWorksheet('Rincian Hutang', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const KOLOM = ['Pengajar', 'Tanggal', 'Halaqah', 'Jenis', 'Debit (mnt)', 'Dibayar (mnt)', 'Sisa (mnt)', 'Status'];
    judul(
      ws,
      'Rincian Hutang Menit',
      `Kumulatif sejak ${HUTANG_ANCHOR} (BUKAN ${rekap.periodeLabel}) · ${rekap.genderLabel} · ${HUTANG_RUMUS}`,
      KOLOM.length
    );
    headerRow(ws, 4, KOLOM);

    let baris = 5;
    let idx = 0;
    for (const r of [...rekap.ranked, ...rekap.noData]) {
      const daftar = rekap.hutangByPengajar.get(r.pengajarId) ?? [];
      for (const h of daftar) {
        const row = ws.getRow(baris);
        row.values = [
          r.pengajarNama,
          h.tanggal,
          h.halaqahName,
          JENIS_LABEL[h.jenis] ?? h.jenis,
          h.debit,
          h.terbayar,
          h.sisa,
          HUTANG_STATUS_LABEL[h.status],
        ];
        if (h.sisa > 0) row.getCell(7).font = { bold: true, color: { argb: C.bad } };
        row.getCell(8).font = {
          color: { argb: h.status === 'lunas' ? C.ok : h.status === 'sebagian' ? C.warn : C.bad },
        };
        garis(ws, baris, KOLOM.length, idx % 2 === 1);
        baris++;
        idx++;
      }
      if (daftar.length > 1) {
        // Subtotal per pengajar — tanpa ini pembaca harus menjumlah manual untuk
        // mencocokkan dengan kolom Hutang (menit) di sheet Ranking.
        const row = ws.getRow(baris);
        row.values = [
          `Total ${r.pengajarNama}`, '', '', '',
          daftar.reduce((s, h) => s + h.debit, 0),
          daftar.reduce((s, h) => s + h.terbayar, 0),
          daftar.reduce((s, h) => s + h.sisa, 0),
          `saldo = ${r.hutangSaldo} mnt`,
        ];
        for (let c = 1; c <= KOLOM.length; c++) row.getCell(c).font = { bold: true, color: { argb: C.ink } };
        garis(ws, baris, KOLOM.length, false);
        baris++;
        idx = 0;
      }
    }
    if (baris === 5) {
      ws.getCell(5, 1).value = `Tak ada hutang menit tercatat (sejak ${HUTANG_ANCHOR}).`;
      ws.getCell(5, 1).font = { color: { argb: C.muted } };
    }

    ws.columns.forEach((col, i) => {
      col.width = [28, 12, 24, 26, 12, 13, 11, 17][i] ?? 14;
      col.alignment = { vertical: 'middle', horizontal: i === 0 || i === 2 || i === 3 ? 'left' : 'center' };
    });
  }

  // ── Sheet 5: Cara baca ────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('Cara Baca');
    const KOLOM = ['Kolom / istilah', 'Sumber & rumus'];
    judul(ws, 'Cara Baca Angka', sub, KOLOM.length);
    headerRow(ws, 4, KOLOM);

    const ISI: Array<[string, string]> = [
      ['Cakupan periode', `Semua kolom di sheet Ranking di-scope ${rekap.periodeLabel} (${rekap.start} s.d. sebelum ${rekap.end}) KECUALI Hutang (menit).`],
      ['Cakupan halaqah', `Laporan ini: ${cakupan}. Halaqah yang TIDAK ikut dihitung: yang berstatus tidak aktif, dan yang belum punya pengajar. Keduanya hilang tanpa baris penanda, jadi pengajar bisa absen dari laporan bukan karena ia tak punya pelanggaran.`],
      ['Kelas online / offline', 'Tidak ada kolom online/offline di sistem. Penentunya kata "Offline" di kolom jadwal pada sheet HITS (mis. "Offline PEJATEN Senin & Rabu ..."). Halaqah yang kolom jadwalnya KOSONG atau hanya berisi nama hari dianggap ONLINE — jadi laporan "kelas offline" bisa melewatkan kelas yang sebenarnya tatap muka tapi jadwalnya belum ditulis lengkap di sheet.'],
      ['Sesi dinilai', 'Baris keterangan harian yang tanggalnya SUDAH lewat, dan bukan baris pra-generate yang belum pernah diisi ketua kelas. Baris pra-generate sengaja tak dihitung agar nilai bawaannya tak tampil sebagai pelanggaran TL padahal kelasnya belum berlangsung.'],
      ['%On-Time', `Persen pertemuan tepat jam — tanpa KMT (>${TOLERANSI_KMT} menit) / KBLA. Pertemuan yang dipindah hari (JKG) atau dibadalkan TIDAK masuk penyebut. Pembilang & penyebutnya tercetak sebagai kolom "Tepat jam" dan "Dari pertemuan dinilai".`],
      ['%Stabil', 'Persen pertemuan yang berjalan sesuai jadwal — tanpa JKG (pindah hari) / BADAL (dialihkan ke pengganti), atas semua pertemuan non-libur. Penyebutnya tercetak sebagai kolom "Dari pertemuan non-libur".'],
      ['Non-libur', 'Sesi dinilai yang kondisinya bukan LIBUR.'],
      ['KMT / KBLA / JKG / TL', `Jumlah INSIDEN pada periode ini (satu pertemuan bisa >1 insiden, jadi angka ini bisa lebih besar dari jumlah pertemuan). Kepanjangannya: KMT = ${JENIS_LABEL.KMT}; KBLA = ${JENIS_LABEL.KBLA}; JKG = ${JENIS_LABEL.JKG}; TL = ${JENIS_LABEL.TIDAK_LATIHAN}. Sumber: input ketua kelas di /hits/ketua → tabel hits_pelanggaran.`],
      ['Baris tanpa peringkat', 'Blok di bawah tabel: pengajar yang halaqahnya ikut cakupan tapi tak punya satu pun sesi dinilai pada periode ini. Bukan berarti ia tanpa pelanggaran — datanya memang belum ada.'],
      ['Hutang (menit)', HUTANG_RUMUS],
      ['— debit KMT', `max(0, menit terlambat − ${TOLERANSI_KMT}). Toleransi ${TOLERANSI_KMT} menit tidak berhutang.`],
      ['— debit KBLA', 'Menit penuh kelas berakhir lebih awal, tanpa toleransi.'],
      ['— debit JKG', `${JKG_MENIT} menit per pertemuan yang dipindah (1 pertemuan = ${JKG_MENIT} menit). JKG hasil impor lama (tanpa opsi ganti/cicil) tidak berhutang.`],
      ['— debit BADAL & TL', 'Nol. Keduanya menurunkan %Stabil / dihitung sebagai insiden, tapi tidak menambah hutang menit.'],
      ['— pembayaran', 'Diinput ketua kelas bersama keterangan pertemuan, di-cap ke saldo (tak bisa lebih bayar), dialokasikan FIFO ke pertemuan terlama.'],
      ['— anchor', `Hanya pertemuan pada/sesudah ${HUTANG_ANCHOR} yang berhutang. Pelanggaran sebelum tanggal itu tidak dihitung.`],
      ['— cakupan halaqah', `Dijumlah dari halaqah pengajar ybs yang masuk cakupan laporan ini (${cakupan}) — bukan hanya halaqah yang punya insiden pada periode ini. Kalau laporan disaring per batch atau per jenis kelas, saldo di sini ikut tersaring dan bisa lebih kecil dari hutang orang itu seutuhnya.`],
      ['Rincian Hutang (sheet)', 'Baris pembentuk saldo di atas: tanggal, halaqah, jenis, debit, dibayar, sisa. Jumlah kolom Sisa per pengajar = angka Hutang (menit) di sheet Ranking.'],
      ['Cakupan Observasi (sheet)', 'Berapa pertemuan periode ini yang sudah diisi ketua kelas. Pelanggaran hanya terhitung dari pertemuan yang sudah diobservasi dan tanggalnya sudah lewat.'],
    ];
    let baris = 5;
    ISI.forEach(([k, v], i) => {
      const row = ws.getRow(baris);
      row.values = [k, v];
      row.getCell(1).font = { bold: !k.startsWith('—'), color: { argb: C.ink } };
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(1).alignment = { wrapText: true, vertical: 'top', indent: k.startsWith('—') ? 1 : 0 };
      garis(ws, baris, KOLOM.length, i % 2 === 1);
      baris++;
    });

    ws.columns.forEach((col, i) => {
      col.width = i === 0 ? 26 : 110;
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
