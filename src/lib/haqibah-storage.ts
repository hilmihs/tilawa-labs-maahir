// Berkas fisik Haqibatul Mu'allim: unggah/hapus di bucket 'haqibah'.
// Pola sama dengan src/lib/shakwa-storage.ts — yang tersimpan di DB hanya
// path objeknya; URL bertanda tangan dibuat saat dibuka (lihat urlFile()
// di src/lib/haqibah.ts). Nama di disk sengaja UUID: mengubah nama tampil
// tak menyentuh disk dan tautan lama tetap sah.
//
// Server-only: supabaseAdmin tak boleh diimpor dari komponen klien.

import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';
import { HAQIBAH_BUCKET } from './haqibah';

export const EXT_DIIZINKAN = [
  'pdf',
  'xlsx',
  'xls',
  'docx',
  'doc',
  'pptx',
  'ppt',
  'txt',
  'csv',
  'jpg',
  'jpeg',
  'png',
  'webp',
];

/** 50 MB. Batas body server action di next.config.js 60 MB, jadi masih muat. */
export const MAKS_UKURAN = 50 * 1024 * 1024;

/** Nama tampil maksimal 200 karakter (check constraint haqibah_file.nama). */
const MAKS_PANJANG_NAMA = 200;

const MIME_PER_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface BerkasTersimpan {
  storage_path: string;
  ext: string;
  mime: string;
  ukuran: number;
  namaAsli: string;
}

/**
 * Apakah entri FormData ini sebuah berkas?
 *
 * JANGAN pakai `v instanceof File` — global `File` tidak ada di runtime Node
 * yang dipakai produksi, sehingga ekspresi itu melempar
 * `ReferenceError: File is not defined` (di route handler) atau diam-diam
 * membuang semua berkas (di Server Action). Cukup periksa bentuknya: entri
 * berkas selalu punya `arrayBuffer()`, `name`, dan `size`, sedangkan entri teks
 * biasa berupa string.
 */
export function adalahBerkas(v: unknown): v is File {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as { arrayBuffer?: unknown; name?: unknown; size?: unknown };
  return typeof c.arrayBuffer === 'function' && typeof c.name === 'string' && typeof c.size === 'number';
}

/** Buang jalur folder yang kadang ikut terbawa dari input berkas di browser. */
function namaDasar(nama: string): string {
  return nama.split(/[\\/]/).pop() ?? nama;
}

function pecahNama(namaFile: string): { dasar: string; ext: string } {
  const dasar = namaDasar(namaFile).trim();
  const titik = dasar.lastIndexOf('.');
  if (titik <= 0) return { dasar, ext: '' };
  return {
    dasar: dasar.slice(0, titik).trim(),
    ext: dasar.slice(titik + 1).toLowerCase().replace(/[^a-z0-9]/g, ''),
  };
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

/**
 * Validasi ekstensi + ukuran, lalu tulis ke bucket dengan nama disk UUID.
 * Lempar Error berbahasa Indonesia (menyebut batasannya) bila ditolak —
 * pemanggil menampilkannya apa adanya ke koordinator.
 */
export async function simpanBerkas(file: File): Promise<BerkasTersimpan> {
  const namaMasuk = file.name || 'tanpa nama';
  const { dasar, ext } = pecahNama(namaMasuk);

  if (!ext) {
    throw new Error(
      `Berkas "${namaDasar(namaMasuk)}" tidak punya ekstensi. ` +
        `Yang diizinkan: ${EXT_DIIZINKAN.join(', ')}.`
    );
  }
  if (!EXT_DIIZINKAN.includes(ext)) {
    throw new Error(
      `Ekstensi ".${ext}" tidak didukung. Yang diizinkan: ${EXT_DIIZINKAN.join(', ')}.`
    );
  }
  if (file.size <= 0) {
    throw new Error(`Berkas "${namaDasar(namaMasuk)}" kosong (0 byte), tidak bisa diunggah.`);
  }
  if (file.size > MAKS_UKURAN) {
    throw new Error(
      `Ukuran ${mb(file.size)} MB melebihi batas ${mb(MAKS_UKURAN)} MB untuk satu berkas.`
    );
  }

  const namaAsli = (dasar || 'Tanpa nama').slice(0, MAKS_PANJANG_NAMA);
  const mime = MIME_PER_EXT[ext] || file.type || 'application/octet-stream';
  const storagePath = `${randomUUID()}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage
    .from(HAQIBAH_BUCKET)
    .upload(storagePath, buf, { upsert: false, contentType: mime });
  if (error) throw new Error(`Gagal menyimpan berkas "${namaAsli}": ${error.message}`);

  return { storage_path: storagePath, ext, mime, ukuran: file.size, namaAsli };
}

/**
 * Hapus berkas fisik. Best-effort: metadata di DB tetap dihapus walau berkas
 * sudah tak ada di disk, jadi kegagalan di sini tidak dilempar.
 */
export async function hapusBerkas(storagePath: string): Promise<void> {
  try {
    await supabaseAdmin.storage.from(HAQIBAH_BUCKET).remove([storagePath]);
  } catch {
    /* berkas hilang / disk bermasalah → abaikan, jangan gagalkan penghapusan metadata */
  }
}
