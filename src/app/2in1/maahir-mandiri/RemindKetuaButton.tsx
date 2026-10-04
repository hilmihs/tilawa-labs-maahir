'use client';

import { useState, useTransition } from 'react';
import { remindKetuaLibur } from './actions';

export function RemindKetuaButton({ kelasId, tanggal }: { kelasId: string; tanggal: string }) {
  const [pending, start] = useTransition();
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    start(async () => {
      const res = await remindKetuaLibur(kelasId, tanggal);
      if (res?.error) { setError(res.error); return; }
      if (res?.waUrl) setWaUrl(res.waUrl);
    });
  }

  if (waUrl) {
    return (
      <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-block" style={{ marginTop: 10 }}>
        Kirim pengingat ke ketua via WhatsApp →
      </a>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" onClick={go} disabled={pending} className="btn btn-ghost btn-block">
        {pending ? 'Menyiapkan…' : 'Hari ini libur? Ingatkan ketua kelas'}
      </button>
      {error && <p className="t-small" style={{ color: 'var(--danger)', marginTop: 6 }}>{error}</p>}
    </div>
  );
}
