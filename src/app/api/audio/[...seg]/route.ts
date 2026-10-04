import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { Readable } from 'node:stream';
import { sniffAudioMime, storageDir, verifyAudio } from '@/lib/pg-storage';

// Penyaji audio lokal. Menggantikan Supabase Storage signed URL.
// URL: /api/audio/<bucket>/<path...>?exp=<unix>&sig=<hmac>
// Tanda tangan diverifikasi (HMAC SESSION_SECRET) + cek kedaluwarsa.
//
// Mendukung HTTP Range (206): Safari/iOS menolak memutar <audio> bila server
// tak melayani permintaan `Range: bytes=0-1`, dan pemutar lain butuh Range
// untuk menggeser posisi putar. Berkas dialirkan (stream), tidak dibaca utuh
// ke memori — rekaman bisa belasan MB.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  webm: 'audio/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  // Lampiran Shakwa lewat bucket lain, tapi penyaji + tanda tangannya sama.
  // Tanpa entri ini gambar terunduh sebagai octet-stream, bukan tampil di tab.
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  // Berkas Haqibatul Mu'allim: tanpa entri ini xlsx/docx terunduh sebagai
  // octet-stream dan sebagian OS bingung membukanya.
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

// Ekstensi yang isinya diperiksa (magic bytes). Rekaman selalu disimpan
// `<jenis>.webm` walau isinya MP4/Ogg/MP3 — ekstensinya tak bisa dipercaya.
// Lampiran non-audio (gambar, pdf, office) tetap memakai ekstensi.
const EKSTENSI_AUDIO = new Set(['webm', 'mp3', 'm4a', 'ogg', 'wav', 'aac', 'mp4', 'oga', 'opus']);

/**
 * Nama unduhan dari parameter `n` (di luar tanda tangan — hanya memengaruhi nama
 * berkas yang tersimpan di komputer pengguna, bukan berkas mana yang tersaji).
 * Kutip, garis miring, dan karakter kendali dibuang supaya header tak bisa
 * disisipi.
 */
function dispositionOf(nama: string | null): string | null {
  if (!nama) return null;
  // Karakter kendali, kutip, backslash, dan garis miring dibuang; spasi serta
  // tanda hubung dipertahankan supaya nama unduhan tetap terbaca.
  const aman = nama.replace(/[\u0000-\u001f"\\/]/g, '').trim().slice(0, 120);
  if (!aman) return null;
  return `inline; filename="${aman}"; filename*=UTF-8''${encodeURIComponent(aman)}`;
}

/** Baca beberapa byte pertama berkas untuk tebak tipe. */
async function bacaKepala(path: string, len = 12): Promise<Uint8Array> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(len);
    const { bytesRead } = await fh.read(buf, 0, len, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function contentTypeOf(path: string, ext: string, size: number): Promise<string> {
  const dariEkstensi = MIME[ext];
  if (size > 0 && (EKSTENSI_AUDIO.has(ext) || !dariEkstensi)) {
    try {
      const tebakan = sniffAudioMime(await bacaKepala(path));
      if (tebakan) return tebakan;
    } catch {
      /* gagal baca kepala → pakai ekstensi */
    }
  }
  return dariEkstensi ?? 'application/octet-stream';
}

type Rentang = { start: number; end: number };

/**
 * Urai header Range satu rentang: `bytes=a-b`, `bytes=a-`, `bytes=-n`.
 * - `null`          → abaikan Range, sajikan utuh (200): header tak ada, sintaks
 *                     tak dikenal, atau multi-rentang (boleh menurut RFC 9110).
 * - `'unsatisfiable'` → 416.
 */
function uraiRange(header: string | null, size: number): Rentang | 'unsatisfiable' | null {
  if (!header) return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m) return null; // termasuk multi-rentang "a-b,c-d"
  const [, a, b] = m;
  if (a === '' && b === '') return null;

  if (a === '') {
    // Sufiks: n byte terakhir.
    const n = Number(b);
    if (!Number.isSafeInteger(n)) return null;
    if (n === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }

  const start = Number(a);
  if (!Number.isSafeInteger(start)) return null;
  const akhir = b === '' ? Infinity : Number(b);
  if (b !== '' && !Number.isSafeInteger(akhir)) return null;
  if (akhir < start) return null; // sintaks tak sah → abaikan
  if (start >= size) return 'unsatisfiable';
  return { start, end: Math.min(akhir, size - 1) };
}

function aliran(path: string, start?: number, end?: number): ReadableStream {
  const node = createReadStream(path, start === undefined ? {} : { start, end });
  return Readable.toWeb(node) as unknown as ReadableStream;
}

export async function GET(req: NextRequest, ctx: { params: { seg: string[] } }) {
  const seg = (ctx.params.seg ?? []).map((s) => decodeURIComponent(s));
  const full = seg.join('/'); // bucket/path...
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig') ?? '';

  if (!verifyAudio(full, exp, sig)) {
    return NextResponse.json({ error: 'invalid or expired signature' }, { status: 403 });
  }

  // Cegah path traversal: normalisasi & pastikan tetap di dalam storageDir.
  const baseDir = storageDir();
  const target = normalize(join(baseDir, full));
  if (!target.startsWith(normalize(baseDir))) {
    return NextResponse.json({ error: 'bad path' }, { status: 400 });
  }

  try {
    const s = await stat(target);
    // Direktori dll. → 404 (dulu readFile yang gagal; kini stream baru gagal
    // setelah respons terkirim, jadi harus dicek di depan).
    if (!s.isFile()) throw new Error('bukan berkas');
    const size = s.size;
    const ext = full.split('.').pop()?.toLowerCase() ?? '';
    const contentType = await contentTypeOf(target, ext, size);
    const disposition = dispositionOf(url.searchParams.get('n'));
    const umum: Record<string, string> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      ...(disposition ? { 'Content-Disposition': disposition } : {}),
    };

    const rentang = uraiRange(req.headers.get('range'), size);

    if (rentang === 'unsatisfiable') {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    if (rentang) {
      const { start, end } = rentang;
      return new NextResponse(aliran(target, start, end), {
        status: 206,
        headers: {
          ...umum,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end - start + 1),
        },
      });
    }

    return new NextResponse(size > 0 ? aliran(target) : null, {
      status: 200,
      headers: { ...umum, 'Content-Length': String(size) },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
