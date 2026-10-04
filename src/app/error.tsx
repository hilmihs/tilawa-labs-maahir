'use client';

import { useEffect } from 'react';
import { maybeRecoverFromChunkError } from '@/lib/chunk-reload';
import { recordErrorDiag } from '@/lib/error-diag';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Dicatat lebih dulu supaya "Laporkan Kendala" bisa menyertakannya.
    recordErrorDiag(error);
    // ChunkLoadError (deploy skew) → auto-reload sekali ambil chunk terbaru.
    if (maybeRecoverFromChunkError(error)) return;
    console.error('App error:', error);
  }, [error]);

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 480, width: '100%', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div
            aria-hidden
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--merah-tint)',
              border: '1px solid var(--merah-line)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--merah-ink)',
              fontWeight: 700,
            }}
          >
            !
          </div>
          <h1 className="t-h2" style={{ margin: 0 }}>Terjadi kendala</h1>
        </div>

        <p className="t-body" style={{ marginBottom: 14 }}>
          Halaman gagal dimuat. Coba muat ulang. Bila tetap gagal, gunakan tombol "Laporkan Kendala" di pojok layar untuk kirim laporan ke admin.
        </p>

        {error.digest && (
          <p className="t-tiny" style={{ color: 'var(--muted)', marginBottom: 16 }}>
            Kode referensi: {error.digest}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Muat ulang
          </button>
          <a className="btn btn-ghost" href="/">
            Kembali ke beranda
          </a>
        </div>
      </div>
    </main>
  );
}
