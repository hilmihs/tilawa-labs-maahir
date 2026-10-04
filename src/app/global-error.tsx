'use client';

import { useEffect } from 'react';
import { maybeRecoverFromChunkError } from '@/lib/chunk-reload';
import { recordErrorDiag } from '@/lib/error-diag';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    recordErrorDiag(error);
    if (maybeRecoverFromChunkError(error)) return;
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#f4f2ed',
          color: '#1b1a17',
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            background: '#fff',
            border: '1px solid #e8e4dc',
            borderRadius: 12,
            padding: 28,
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Terjadi kendala</h1>
          <p style={{ fontSize: 14, lineHeight: 1.45, color: '#44423d', marginBottom: 16 }}>
            Aplikasi mengalami galat. Coba muat ulang halaman ini.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: '#7a766f', marginBottom: 16, fontFamily: 'ui-monospace, monospace' }}>
              Kode referensi: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#1b1a17',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Muat ulang
          </button>
        </div>
      </body>
    </html>
  );
}
