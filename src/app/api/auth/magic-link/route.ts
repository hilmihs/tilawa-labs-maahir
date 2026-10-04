import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { publicOrigin } from '@/lib/url';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

/**
 * Halaman konfirmasi: ditampilkan saat link auto-login dibuka oleh perangkat yang
 * SUDAH login sebagai orang lain (mis. pengajar yang menunjuk ketua, atau pesan WA
 * yang ter-forward). Tanpa ini, sesi lama tersapu diam-diam → "buka akun jadi
 * pindah akun lain".
 */
function confirmPage(args: {
  currentName: string;
  ketuaName: string;
  confirmUrl: string;
}): NextResponse {
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Konfirmasi masuk</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f4f2ee;color:#1a1a1a}
  .wrap{max-width:420px;margin:0 auto;padding:48px 20px}
  h1{font-size:20px;margin:0 0 8px}
  p{font-size:15px;line-height:1.5;color:#555;margin:0 0 12px}
  .name{font-weight:600;color:#1a1a1a}
  a.btn{display:block;text-align:center;text-decoration:none;padding:14px 16px;border-radius:12px;font-weight:600;font-size:15px;margin-top:10px}
  .primary{background:#0a7d4d;color:#fff}
  .ghost{background:#fff;color:#1a1a1a;border:1px solid #ddd}
</style></head>
<body><div class="wrap">
  <h1>Anda sedang masuk sebagai akun lain</h1>
  <p>Perangkat ini sedang login sebagai <span class="name">${escapeHtml(args.currentName)}</span>.</p>
  <p>Link ini adalah login khusus untuk akun Ketua Kelas <span class="name">${escapeHtml(args.ketuaName)}</span>. Jika Anda lanjut, Anda akan keluar dari akun saat ini dan masuk sebagai ketua tersebut.</p>
  <a class="btn primary" href="${escapeHtml(args.confirmUrl)}">Masuk sebagai Ketua ${escapeHtml(args.ketuaName)}</a>
  <a class="btn ghost" href="/">Tetap di akun saya</a>
</div></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Token wajib diisi.' }, { status: 400 });
  }
  const confirmed = req.nextUrl.searchParams.get('confirm') === '1';

  const { data: ketua } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, name, gender, kelas_hits_id, hits_halaqah_id, active')
    .eq('magic_token', token)
    .maybeSingle();

  if (!ketua || !ketua.active) {
    return NextResponse.json(
      { error: 'Link tidak valid atau sudah kadaluarsa.' },
      { status: 401 },
    );
  }

  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);

  // Sudah login sebagai ketua kelas yang sama → idempotent, langsung ke dashboard.
  const alreadyThisKetua = accesses.some(
    (a) => a.role === 'ketua_kelas' && a.ketua_kelas_id === ketua.id,
  );
  if (alreadyThisKetua) {
    return NextResponse.redirect(new URL('/hits/ketua', publicOrigin(req.headers)));
  }

  // Login sebagai identitas LAIN & belum konfirmasi → jangan sapu sesi diam-diam.
  if (accesses.length > 0 && !confirmed) {
    const confirmUrl = `/api/auth/magic-link?token=${encodeURIComponent(token)}&confirm=1`;
    return confirmPage({
      currentName: accesses[0].name,
      ketuaName: ketua.name,
      confirmUrl,
    });
  }

  // Tidak ada sesi (ketua asli buka link-nya) ATAU sudah konfirmasi switch.
  const access = {
    role: 'ketua_kelas' as const,
    ketua_kelas_id: ketua.id,
    name: ketua.name,
    gender: ketua.gender,
    kelas_hits_id: ketua.kelas_hits_id,
    hits_halaqah_id: ketua.hits_halaqah_id ?? null,
  };
  s.session = access;
  s.accesses = [access];
  await s.save();

  await supabaseAdmin
    .from('ketua_kelas')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', ketua.id);

  // Semua ketua kelas kini diarahkan ke dashboard HITS (observasi lama di-retire).
  // Basis URL diambil dari header proxy, BUKAN req.url: di balik reverse proxy
  // req.url bisa berisi alamat bind server (0.0.0.0:3009), dan link WhatsApp
  // yang diklik dari HP berujung di alamat yang tak bisa dibuka.
  return NextResponse.redirect(new URL('/hits/ketua', publicOrigin(req.headers)));
}
