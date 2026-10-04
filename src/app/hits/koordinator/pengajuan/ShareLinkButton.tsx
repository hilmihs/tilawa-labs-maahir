'use client';

import { useState } from 'react';

/**
 * Bagikan link keputusan bertoken: salin ke clipboard + buka WA share
 * (tanpa nomor → user pilih chat tujuan, mis. rekan koordinator).
 */
export function ShareLinkButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${label}\n${url}`)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button type="button" onClick={copy} className="btn btn-sm btn-ghost">
        {copied ? 'Tersalin ✓' : 'Salin link'}
      </button>
      <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
        WA
      </a>
    </span>
  );
}
