'use client';

import { useState } from 'react';

// Tombol cabut rapot — hanya tampil di layar (disembunyikan saat print).
// Konfirmasi dua-langkah inline (tanpa dialog native).
export default function CabutButton({ token, status }: { token: string; status: string }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'saving' | 'done' | 'error'>(
    status === 'dicabut' ? 'done' : 'idle'
  );

  if (state === 'done') {
    return (
      <div
        className="noprint"
        style={{
          position: 'fixed',
          bottom: 24,
          left: 24,
          zIndex: 50,
          padding: '10px 16px',
          borderRadius: 999,
          background: 'oklch(0.96 0.04 25)',
          border: '1px solid oklch(0.85 0.08 25)',
          color: 'oklch(0.46 0.14 25)',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Rapot dicabut
      </div>
    );
  }

  const cabut = async () => {
    setState('saving');
    try {
      const res = await fetch('/api/evaluasi/rapot/cabut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error('gagal');
      setState('done');
    } catch {
      setState('error');
    }
  };

  const wrap: React.CSSProperties = {
    position: 'fixed',
    bottom: 24,
    left: 24,
    zIndex: 50,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  };

  if (state === 'confirm') {
    return (
      <div className="noprint" style={wrap}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1b1a17' }}>Cabut rapot ini?</span>
        <button
          type="button"
          onClick={cabut}
          style={{ padding: '10px 16px', borderRadius: 999, border: 'none', background: 'oklch(0.55 0.16 25)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Ya, cabut
        </button>
        <button
          type="button"
          onClick={() => setState('idle')}
          style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid #e8e4dc', background: '#fff', color: '#44423d', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Batal
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="noprint"
      onClick={() => setState('confirm')}
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 50,
        padding: '12px 18px',
        borderRadius: 999,
        border: '1px solid oklch(0.85 0.08 25)',
        background: '#fff',
        color: 'oklch(0.46 0.14 25)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
      }}
    >
      {state === 'error' ? 'Gagal — coba lagi' : '✕ Cabut rapot'}
    </button>
  );
}
