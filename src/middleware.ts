import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { maintenanceGate } from '@/lib/maintenance';
import { publicOrigin } from '@/lib/url';

// Prefix halaman terproteksi (butuh login). Bila belum login (cookie sesi
// tak ada) → arahkan ke home dengan ?next= supaya setelah login balik ke sini.
// Catatan: '/shakwa' sengaja TIDAK ada di sini — formulirnya memang pintu
// publik. Hanya dashboard koordinatornya yang butuh login.
const PROTECTED = [
  '/hits', '/observasi', '/matrix', '/kehadiran',
  '/2in1', '/penilaian', '/laporan', '/audit', '/akun', '/peserta',
  '/shakwa/koordinator', '/evaluasi',
];

// Pengecualian di dalam prefix terproteksi. `/evaluasi` dilindungi seluruhnya,
// tapi halaman cek keaslian rapot adalah tujuan QR yang tercetak di kertas —
// yang memindai adalah wali/peserta yang tidak punya akun. Tanpa carve-out ini
// setiap QR yang sudah tercetak berujung di form login.
const PUBLIC_EXCEPTIONS = ['/evaluasi/rapot/cek'];

const SESSION_COOKIE = 'maahir-hits-session';

export function middleware(req: NextRequest) {
  // Kunci maintenance (mulai 13 Juli 2026 WIB). Jalan paling awal, meng-cover
  // semua route termasuk /api/*. /api/health & bypass admin tetap lolos.
  const maint = maintenanceGate(req);
  if (maint) return maint;

  const { pathname, search } = req.nextUrl;
  // Sebarkan path ke server component (dipakai guard untuk redirect-after-login).
  const withPath = () => {
    const h = new Headers(req.headers);
    h.set('x-pathname', pathname + (search || ''));
    return NextResponse.next({ request: { headers: h } });
  };
  const isPublicException = PUBLIC_EXCEPTIONS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (isPublicException) return withPath();
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!isProtected) return withPath();
  if (req.cookies.has(SESSION_COOKIE)) return withPath();

  // Di belakang reverse proxy, nextUrl bisa berisi host internal (0.0.0.0:xxxx).
  // publicOrigin() memilih host yang benar-benar bisa dibuka browser. Versi lama
  // di sini mengosongkan url.port setelah menyalin host, sehingga di `npm run dev`
  // redirect mendarat di localhost tanpa port.
  const url = new URL('/', publicOrigin(req.headers));
  url.searchParams.set('next', pathname + (search || ''));
  return NextResponse.redirect(url);
}

export const config = {
  // Sertakan /api/* juga supaya maintenance bisa mengunci API. Aset statis
  // tetap di-exclude. /api/health & bypass admin di-allowlist di maintenanceGate.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
