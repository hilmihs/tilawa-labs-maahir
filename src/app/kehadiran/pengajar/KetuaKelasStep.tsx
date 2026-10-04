'use client';

import { useState, useTransition } from 'react';
import { submitKetuaKelas } from './actions';

interface Props {
  kelasHitsId: string;
  kelasName: string;
  pekan: number;
  currentKetuaName: string | null;
  onComplete: (waUrl?: string) => void;
  onSkip: () => void;
}

export function KetuaKelasStep({
  kelasHitsId,
  kelasName,
  pekan,
  currentKetuaName,
  onComplete,
  onSkip,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitKetuaKelas(undefined, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.ok) {
        onComplete(result.waUrl);
      }
    });
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <h3 className="t-h2" style={{ marginBottom: 4 }}>Siapa Ketua Kelas Anda?</h3>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        Kelas: <strong>{kelasName}</strong>
        {pekan === 1 && ' (opsional, bisa dilewati)'}
      </p>

      {currentKetuaName && (
        <div
          style={{
            background: 'var(--surface-2)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 12,
          }}
        >
          <p className="t-small">
            Ketua kelas saat ini: <strong>{currentKetuaName}</strong>
          </p>
        </div>
      )}

      <form action={handleSubmit}>
        <input type="hidden" name="kelas_hits_id" value={kelasHitsId} />

        <div style={{ marginBottom: 12 }}>
          <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Nama Ketua Kelas <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="text"
            name="ketua_name"
            required
            placeholder="Nama lengkap"
            className="input"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Nomor WhatsApp <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="tel"
            name="ketua_wa"
            required
            placeholder="08xxxxxxxxxx"
            className="input"
            style={{ width: '100%' }}
          />
        </div>

        {error && (
          <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-accent" disabled={pending} style={{ flex: 1 }}>
            {pending ? 'Menyimpan...' : 'Simpan Ketua Kelas'}
          </button>
          {pekan === 1 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onSkip}
              disabled={pending}
            >
              Lewati
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
