import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api-public/env';
import { jalankanBerkala } from '@/lib/ketersediaan-berkala';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Pemicu berkala Ketersediaan Mengajar HITS.
 *
 * Dipanggil penjadwal dari luar (systemd timer di VPS, pola yang sama dengan
 * /api/evaluasi/sync/pull). Isinya: tarik pendaftar terbaru, geser usulan yang
 * lewat tenggat konfirmasi, dan segarkan status ketersediaan yang mulai basi.
 *
 * Tidak menjalankan alokasi. Pembentukan halaqah tetap menunggu persetujuan
 * koordinator — halaqah yang terlanjur terkirim ke CMS tilawah tidak dapat
 * ditarik kembali (akun murid bahkan tidak dapat dihapus sama sekali).
 */
function authorized(req: NextRequest): boolean {
  const secret = apiEnv('CRON_SECRET');
  if (!secret || secret.length < 16) return false;
  const h = Buffer.from(req.headers.get('authorization') ?? '');
  const harap = Buffer.from(`Bearer ${secret}`);
  // Perbandingan waktu-konstan; timingSafeEqual mensyaratkan panjang sama.
  return h.length === harap.length && timingSafeEqual(h, harap);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const hasil = await jalankanBerkala();
    return NextResponse.json({ ok: true, ...hasil });
  } catch (e) {
    // Rincian galat hanya ke log server — pesannya bisa memuat isi kueri atau data.
    console.error('[ks berkala] gagal', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
