// Jejak error terakhir untuk dilampirkan ke "Laporkan Kendala".
//
// Laporan yang cuma berbunyi "halaman gagal dimuat" tak bisa ditelusuri: tanpa
// digest, error server tak bisa dicocokkan dengan log, dan ChunkLoadError (skew
// deploy, bukan bug data) tak bisa dibedakan dari error data. Error boundary
// menuliskan ringkasannya di sini, tombol laporan membacanya.

const KEY = '__last_error_diag';

/** Simpan ringkasan error boundary (client-only, sessionStorage). */
export function recordErrorDiag(error: { name?: string; message?: string; digest?: string }): void {
  if (typeof window === 'undefined') return;
  const parts = [
    error?.digest ? `digest=${error.digest}` : null,
    error?.name && error.name !== 'Error' ? error.name : null,
    // Pesan dipotong: cuma penanda jenis error, bukan isi lengkap.
    error?.message ? error.message.slice(0, 120) : null,
  ].filter(Boolean);
  if (parts.length === 0) return;
  try {
    sessionStorage.setItem(KEY, `${parts.join(' · ')} @ ${new Date().toISOString()}`);
  } catch {
    // sessionStorage bisa diblok (mode privat/iframe) → laporan tetap terkirim
    // tanpa kode error.
  }
}

/** Ringkasan error terakhir, atau null bila belum ada. */
export function readLastErrorDiag(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
