import 'server-only';

/**
 * Pengambil CSV "Publish to web" Google Sheets yang aman dipanggil dengan URL
 * masukan koordinator.
 *
 * Tanpa pembatasan, server akan mengambil URL apa pun — alamat internal VPS,
 * port lokal, metadata cloud — lalu memantulkan status dan isinya ke layar
 * (SSRF). Karena itu hanya host Google yang dilayani, pengalihan diikuti manual
 * dan diperiksa per langkah, ada batas waktu, dan ukuran jawaban dibatasi.
 */

const HOST_AWAL = new Set(['docs.google.com']);
const HOST_ALIH = /^([a-z0-9-]+\.)*(google\.com|googleusercontent\.com)$/i;
const BATAS_BYTE = 25 * 1024 * 1024;
const BATAS_ALIH = 5;
const BATAS_MS = 30_000;

export function urlCsvSah(mentah: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(mentah.trim());
  } catch {
    return { ok: false, error: 'URL tidak sah.' };
  }
  if (url.protocol !== 'https:' || !HOST_AWAL.has(url.hostname.toLowerCase())) {
    return {
      ok: false,
      error: 'Gunakan tautan Google Sheets "Publikasikan ke web" format CSV (https://docs.google.com/spreadsheets/…).',
    };
  }
  if (!url.pathname.startsWith('/spreadsheets/')) {
    return { ok: false, error: 'Tautan harus menunjuk ke Google Sheets (…/spreadsheets/…).' };
  }
  return { ok: true, url };
}

export async function ambilCsvTerbit(mentah: string): Promise<string> {
  const sah = urlCsvSah(mentah);
  if (!sah.ok) throw new Error(sah.error);

  let url = sah.url;
  for (let langkah = 0; ; langkah++) {
    const res = await fetch(url, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(BATAS_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const ke = res.headers.get('location');
      if (!ke || langkah >= BATAS_ALIH) throw new Error('Sheet mengalihkan terlalu banyak kali.');
      const berikut = new URL(ke, url);
      if (berikut.protocol !== 'https:' || !HOST_ALIH.test(berikut.hostname)) {
        throw new Error('Sheet mengalihkan ke alamat di luar Google — tautan ditolak.');
      }
      url = berikut;
      continue;
    }
    if (!res.ok) throw new Error(`Gagal membuka CSV (HTTP ${res.status}). Pastikan sheet "Publikasikan ke web".`);

    const panjang = Number(res.headers.get('content-length') ?? '0');
    if (panjang > BATAS_BYTE) throw new Error('CSV terlalu besar.');
    const teks = await bacaTerbatas(res);
    if (/^\s*<!doctype html|<html/i.test(teks.slice(0, 2000))) {
      throw new Error('Sheet mengembalikan halaman HTML — aktifkan "Publikasikan ke web" dengan format CSV.');
    }
    return teks;
  }
}

async function bacaTerbatas(res: Response): Promise<string> {
  if (!res.body) return res.text();
  const pembaca = res.body.getReader();
  const potongan: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await pembaca.read();
    if (done) break;
    total += value.byteLength;
    if (total > BATAS_BYTE) {
      await pembaca.cancel();
      throw new Error('CSV terlalu besar.');
    }
    potongan.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(potongan));
}
