import 'server-only';
import ExcelJS from 'exceljs';
import type { Gender, KsMode } from '@/types/db';
import { uraikanSlot, type SlotTerurai } from '@/lib/ketersediaan-slot';
import { normalWa } from '@/lib/ketersediaan-pendaftar';

/**
 * Pembaca berkas "KETERSEDIAAN PENGAJAR HITS" — sumber kebenaran ketersediaan
 * pengajar selama pengajar belum mengisi sendiri di aplikasi.
 *
 * Susunan berkas nyata (16 Sep 2026) dibaca lewat PENANDA, bukan nomor baris:
 *  · sheet online menumpuk beberapa batch — baris "Batch September 2026 …"
 *    membuka bagian, baris sesudahnya kepala kolom (No, Nama, WA, …);
 *  · sheet offline satu batch yang disebut di judul "(Batch September 2026)",
 *    tanpa kolom WA;
 *  · sheet Matraman menumpuk ikhwan lalu akhwat — baris "Ikhwan"/"Akhwat"
 *    mengganti gender.
 * Kolom dikenali dari judulnya supaya urutannya boleh berubah.
 */

export type MasalahBaris = 'jam_tak_terbaca' | 'wa_tak_sah';

export interface BarisImpor {
  /** Stabil selama berkasnya sama: kunci pilihan manual koordinator. */
  kunci: string;
  sheet: string;
  nomorBaris: number;
  /** Kunci bagian, mis. "online|Oktober 2026". */
  bagian: string;
  gender: Gender;
  mode: KsMode;
  lokasi: string | null;
  nama: string;
  /** Nomor ternormalisasi (tanpa 62/0); null bila sheet tidak punya kolom WA. */
  wa: string | null;
  waktu: string;
  slot: SlotTerurai | null;
  prioritas: number | null;
  masalah: MasalahBaris[];
}

export interface BagianImpor {
  kunci: string;
  judul: string;
  mode: KsMode;
  /** "September 2026" */
  batch: string;
  baris: BarisImpor[];
}

export interface HasilBacaXlsx {
  bagian: BagianImpor[];
  /** Baris data yang tak dapat ditempatkan (gender atau batch tak diketahui) — dilaporkan, tidak ditebak. */
  terlewat: { sheet: string; nomorBaris: number; alasan: string }[];
}

function teks(v: ExcelJS.CellValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('result' in v && v.result !== undefined && v.result !== null) return String(v.result).trim();
    return '';
  }
  return String(v).trim();
}

function batchDari(s: string): string | null {
  const m = s.match(/batch\s+([a-z]+\s+\d{4})/i);
  return m ? m[1].replace(/\s+/g, ' ') : null;
}

function lokasiDari(judul: string, namaSheet: string): string | null {
  // "… — Lokasi Pejaten AKHWAT (Batch …)" · "… — Lokasi Masjid Al-Kautsar Matraman (Batch …)"
  const m = judul.match(/lokasi\s+(.+?)\s*(?:\b(?:ikhwan|akhwat)\b\s*)?\(/i);
  if (m) return m[1].trim();
  const dariSheet = namaSheet
    .replace(/^offline\s*-\s*/i, '')
    .replace(/\b(ikhwan|akhwat)\b/gi, '')
    .trim();
  return dariSheet || null;
}

export async function bacaKetersediaanXlsx(data: ArrayBuffer): Promise<HasilBacaXlsx> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);

  const bagian = new Map<string, BagianImpor>();
  const terlewat: HasilBacaXlsx['terlewat'] = [];

  wb.eachSheet((ws) => {
    const judul = teks(ws.getRow(1).getCell(1).value);
    const modeSheet: KsMode = /offline/i.test(`${ws.name} ${judul}`) ? 'offline' : 'online';
    let gender: Gender | null = /akhwat/i.test(ws.name) ? 'akhwat' : /ikhwan/i.test(ws.name) ? 'ikhwan' : null;
    let batch = batchDari(judul);
    const lokasi = modeSheet === 'offline' ? lokasiDari(judul, ws.name) : null;
    let kolom: Map<string, number> | null = null;

    ws.eachRow({ includeEmpty: false }, (row, nomorBaris) => {
      const sel = (i: number) => teks(row.getCell(i).value);
      const pertama = sel(1);
      if (!pertama) return;

      const batchBaris = /^batch\s/i.test(pertama) ? batchDari(pertama) : null;
      if (batchBaris) {
        batch = batchBaris;
        kolom = null;
        return;
      }
      if (/^(ikhwan|akhwat)$/i.test(pertama)) {
        gender = pertama.toLowerCase() as Gender;
        kolom = null;
        return;
      }
      if (/^no\.?$/i.test(pertama)) {
        const peta = new Map<string, number>();
        row.eachCell((cell, i) => peta.set(teks(cell.value).toLowerCase(), i));
        kolom = peta;
        return;
      }

      const petaKolom: Map<string, number> | null = kolom;
      if (!petaKolom || !/^\d+$/.test(pertama)) return;
      const ambil = (nama: string) => {
        const i = petaKolom.get(nama);
        return i ? sel(i) : '';
      };

      const nama = ambil('nama');
      const waktu = ambil('waktu');
      if (!nama || !waktu) return;
      const g: Gender | null = gender;
      const b: string | null = batch;
      if (!g || !b) {
        terlewat.push({ sheet: ws.name, nomorBaris, alasan: !g ? 'gender tidak diketahui' : 'batch tidak diketahui' });
        return;
      }

      const modeTeks = ambil('online/offline');
      const mode: KsMode = /offline/i.test(modeTeks) ? 'offline' : /online/i.test(modeTeks) ? 'online' : modeSheet;
      const waMentah = petaKolom.has('wa') ? ambil('wa') : '';
      const wa = waMentah ? normalWa(waMentah) : null;
      const prioritasTeks = ambil('prioritas');
      const prioritas = /^\d+$/.test(prioritasTeks) && Number(prioritasTeks) > 0 ? Number(prioritasTeks) : null;

      const masalah: MasalahBaris[] = [];
      // Kelas dua waktu ("Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30") kini
      // terurai menjadi satu jam dengan waktu per hari.
      const slot = uraikanSlot(waktu);
      if (!slot) masalah.push('jam_tak_terbaca');
      if (waMentah && !wa) masalah.push('wa_tak_sah');

      const kunciBagian = `${mode}|${b}`;
      if (!bagian.has(kunciBagian)) {
        bagian.set(kunciBagian, {
          kunci: kunciBagian,
          judul: `${mode === 'online' ? 'Online' : 'Offline'} · Batch ${b}`,
          mode,
          batch: b,
          baris: [],
        });
      }
      bagian.get(kunciBagian)!.baris.push({
        kunci: `${ws.name}#${nomorBaris}`,
        sheet: ws.name,
        nomorBaris,
        bagian: kunciBagian,
        gender: g,
        mode,
        lokasi: mode === 'offline' ? lokasi : null,
        nama,
        wa,
        waktu,
        slot,
        prioritas,
        masalah,
      });
    });
  });

  return { bagian: [...bagian.values()], terlewat };
}
