import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiEnv } from '@/lib/api-public/env';
import { publicOrigin } from '@/lib/url';

// ── Mode maintenance situs ──────────────────────────────────────────────────
// Situs dikunci penuh mulai 13 Juli 2026 (WIB) karena migrasi database keluar
// dari Supabase. Semua halaman + API mengembalikan 503 maintenance, kecuali:
//   - /api/health          (monitoring)
//   - /maintenance         (halaman itu sendiri, kalau di-rewrite)
//   - aset _next/static     (di-exclude di matcher middleware)
//   - permintaan dgn bypass admin (cookie/param token)
//
// Kontrol via ENV (opsional):
//   MAINTENANCE_MODE=auto|on|off   default: auto (aktif kalau now >= start)
//   MAINTENANCE_START=<ISO>        default: 2026-07-13T00:00:00+07:00
//   MAINTENANCE_BYPASS_TOKEN=<str> kalau di-set, admin bisa lewat dgn token
//   MAINTENANCE_MESSAGE=<str>      override pesan yg ditampilkan
//
// Bypass admin: buka URL apa pun dgn ?maintenance_bypass=<TOKEN>. Cookie
// disimpan 7 hari, akses berikutnya otomatis lolos.

const DEFAULT_START = '2026-07-13T00:00:00+07:00';
const BYPASS_COOKIE = 'maahir-maint-bypass';
const BYPASS_PARAM = 'maintenance_bypass';

// Path yang tetap boleh diakses walau maintenance aktif.
// /api/admin/db = endpoint SQL admin (sudah token-gated) → tetap jalan saat
// maintenance supaya bisa selesaikan aduan/perbaikan data tanpa buka situs.
// /evaluasi/rapot/cek = tujuan QR yang sudah tercetak di lembar rapot; itu satu-
// satunya URL yang beredar di luar dan tidak bisa ditarik kembali kalau mati.
const ALLOW_PREFIXES = [
  '/api/health',
  '/maintenance',
  '/api/admin/db',
  '/evaluasi/rapot/cek',
];

export function isMaintenanceActive(now = new Date()): boolean {
  const mode = (apiEnv('MAINTENANCE_MODE') ?? 'auto').toLowerCase();
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  const start = new Date(apiEnv('MAINTENANCE_START') ?? DEFAULT_START);
  return now.getTime() >= start.getTime();
}

function hasBypass(req: NextRequest): boolean {
  const token = apiEnv('MAINTENANCE_BYPASS_TOKEN');
  if (!token) return false;
  return req.cookies.get(BYPASS_COOKIE)?.value === token;
}

function bypassGrant(req: NextRequest): NextResponse | null {
  const token = apiEnv('MAINTENANCE_BYPASS_TOKEN');
  if (!token) return null;
  const q = req.nextUrl.searchParams.get(BYPASS_PARAM);
  if (q && q === token) {
    // Set cookie lalu redirect ke path yg sama tanpa query param. Basis URL dari
    // header proxy — nextUrl bisa berisi alamat bind server (0.0.0.0:xxxx), yang
    // akan mendaratkan admin di alamat tak terbuka.
    const url = new URL(req.nextUrl.pathname, publicOrigin(req.headers));
    url.search = req.nextUrl.search;
    url.searchParams.delete(BYPASS_PARAM);
    const res = NextResponse.redirect(url);
    res.cookies.set(BYPASS_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });
    return res;
  }
  return null;
}

const MESSAGE_DEFAULT =
  'Situs sedang dalam pemeliharaan (migrasi database). Silakan kembali lagi nanti. Terima kasih atas kesabarannya.';

function pageHtml(): string {
  const msg = apiEnv('MAINTENANCE_MESSAGE') ?? MESSAGE_DEFAULT;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Pemeliharaan — Tilawa Labs</title>
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  background:#0b1220;color:#e6edf6}
.card{max-width:460px;width:100%;text-align:center;background:#131c2e;
  border:1px solid #223049;border-radius:18px;padding:40px 28px;
  box-shadow:0 12px 40px rgba(0,0,0,.35)}
.icon{font-size:52px;line-height:1;margin-bottom:12px}
h1{font-size:22px;margin:0 0 10px}
p{font-size:15px;line-height:1.6;color:#aebbcf;margin:0 0 8px}
.tag{display:inline-block;margin-top:18px;font-size:12px;letter-spacing:.06em;
  text-transform:uppercase;color:#7d8ba3;border-top:1px solid #223049;padding-top:16px;width:100%}
.bismillah{direction:rtl;font-size:26px;line-height:1.9;margin:0 0 20px;color:#e6edf6;
  font-family:"Traditional Arabic","Amiri","Scheherazade New",serif}
</style></head><body><div class="card">
<div class="bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
<div class="icon">🛠️</div>
<h1>Sedang Pemeliharaan</h1>
<p>${msg}</p>
<div class="tag">Tilawa Labs · Tilawah &amp; HITS</div>
</div></body></html>`;
}

/**
 * Panggil di awal middleware. Return:
 *   - NextResponse (503 maintenance / redirect bypass) → hentikan request.
 *   - null → maintenance tidak aktif / di-bypass / path allowlist → lanjut normal.
 */
export function maintenanceGate(req: NextRequest): NextResponse | null {
  if (!isMaintenanceActive()) return null;

  const { pathname } = req.nextUrl;
  if (ALLOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null;
  }

  // Admin mengaktifkan bypass via ?maintenance_bypass=token.
  const grant = bypassGrant(req);
  if (grant) return grant;
  if (hasBypass(req)) return null;

  // API → JSON 503; halaman → HTML 503.
  const isApi = pathname.startsWith('/api/');
  const headers: Record<string, string> = { 'Retry-After': '86400', 'Cache-Control': 'no-store' };
  if (isApi) {
    return new NextResponse(
      JSON.stringify({ error: 'maintenance', message: 'Situs sedang pemeliharaan.' }),
      { status: 503, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
  return new NextResponse(pageHtml(), {
    status: 503,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
