/**
 * Helper origin & absolute URL untuk app.
 *
 * Mengandalkan NEXT_PUBLIC_APP_URL. Kalau env miss-config, fallback ke
 * domain produksi supaya link WA tidak pernah berisi `localhost`/kosong.
 */
// Demo build: never fall back to the production host. A misconfigured env here
// would put live links into every WhatsApp message the demo generates.
const PROD_FALLBACK = 'https://tilawa-labs-maahir.vercel.app';

export function appOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '').trim();
  if (!fromEnv) return PROD_FALLBACK;
  // Hindari fallback ke localhost untuk link yang dikirim via WhatsApp
  // (peserta/musyrif buka di HP, bukan di mesin developer).
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(fromEnv)) {
    return PROD_FALLBACK;
  }
  return fromEnv;
}

export function absUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${appOrigin()}${p}`;
}

/**
 * Origin yang AMAN dipakai di header `Location` sebuah redirect.
 *
 * Latar: app berjalan di belakang reverse proxy (systemd `next-maahir.service`,
 * standalone). Bila proxy tidak meneruskan Host, `req.url`/`req.nextUrl` berisi
 * alamat BIND server — pernah terjadi `http://0.0.0.0:3009/hits/ketua`, dan
 * ketua kelas yang mengeklik magic link dari WhatsApp mendarat di alamat yang
 * mustahil dibuka dari HP.
 *
 * Urutan: x-forwarded-host → Host → NEXT_PUBLIC_APP_URL (appOrigin).
 * `localhost`/`127.0.0.1` SENGAJA tetap diterima — itu sah saat `npm run dev`;
 * yang dibuang hanya `0.0.0.0`, yang tak pernah bisa dibuka browser mana pun.
 */
export function publicOrigin(headers: Headers): string {
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (host && !/^0\.0\.0\.0(:|$)/.test(host)) {
    const lokal = /^(localhost|127\.0\.0\.1)(:|$)/i.test(host);
    const proto = headers.get('x-forwarded-proto') ?? (lokal ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return appOrigin();
}
