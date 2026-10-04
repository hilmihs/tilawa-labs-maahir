// Pemulihan ChunkLoadError (client-only).
//
// Gejala: browser gagal memuat chunk JS Next (`Loading chunk NNNN failed`,
// status 500/404 pada /_next/static/chunks/...). Penyebab lazim: DEPLOY SKEW —
// tab lama memegang HTML yang menunjuk hash chunk versi lama; setelah redeploy
// file itu hilang / server sempat restart → chunk gagal → error boundary
// "Terjadi kendala". Bukan bug data.
//
// Mitigasi: reload SEKALI untuk mengambil HTML + hash chunk terbaru. Guard
// sessionStorage mencegah loop refresh jika kegagalan ternyata persisten (outage
// nyata) — setelah 1 percobaan, biarkan halaman error tampil normal.

/** True bila error ini ChunkLoadError DAN kita memicu reload pemulihan. */
export function maybeRecoverFromChunkError(error: { name?: string; message?: string }): boolean {
  if (typeof window === 'undefined') return false;
  const msg = error?.message ?? '';
  const isChunkError =
    error?.name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed|ChunkLoadError|Loading CSS chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
      msg
    );
  if (!isChunkError) return false;
  try {
    const KEY = '__chunk_reload_at';
    const last = Number(sessionStorage.getItem(KEY) || '0');
    // Maks 1 reload per 15 dtk → cegah loop refresh saat kegagalan persisten.
    if (Date.now() - last > 15000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    // sessionStorage bisa diblok (mode privat/iframe) → jangan reload agar tak loop.
  }
  return false;
}
