'use client';

import { useState } from 'react';

/** Salin teks rekap harian ke papan klip — untuk ditempel ke grup koordinator. */
export function SalinRekapButton({ teks }: { teks: string }) {
  const [status, setStatus] = useState<'idle' | 'ok' | 'gagal'>('idle');

  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost"
      style={{ height: 32, padding: '0 12px', border: '1px solid var(--line)' }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(teks);
          setStatus('ok');
        } catch {
          setStatus('gagal');
        }
        setTimeout(() => setStatus('idle'), 2500);
      }}
    >
      {status === 'ok' ? '✓ Tersalin' : status === 'gagal' ? 'Gagal menyalin' : '⧉ Salin rekap'}
    </button>
  );
}
