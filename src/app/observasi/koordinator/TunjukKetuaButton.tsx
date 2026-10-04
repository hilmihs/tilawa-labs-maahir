'use client';

import { useState, useTransition } from 'react';
import { reminderTunjukKetua } from './actions';

export function TunjukKetuaButton({ pengajarId, kelasName }: { pengajarId: string; kelasName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await reminderTunjukKetua(pengajarId, kelasName);
      if (res.error) { setError(res.error); return; }
      if (res.waUrl) window.open(res.waUrl, '_blank');
    });
  }

  return (
    <>
      <button onClick={handleClick} disabled={pending} className="act-btn wa" style={{ fontSize: 11, flexShrink: 0 }}>
        {pending ? '...' : 'Reminder Tunjuk Ketua'}
      </button>
      {error && <span className="t-small" style={{ color: 'var(--danger)' }}>{error}</span>}
    </>
  );
}
