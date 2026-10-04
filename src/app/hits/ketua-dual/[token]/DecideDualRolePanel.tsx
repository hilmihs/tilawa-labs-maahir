'use client';

import { useState, useTransition } from 'react';
import { approveDualRole, rejectDualRole } from './actions';

export function DecideDualRolePanel({
  token,
  status,
  catatan,
  initialKetuaWaUrl,
  initialPengajarWaUrl,
}: {
  token: string;
  status: string;
  catatan: string | null;
  initialKetuaWaUrl?: string | null;
  initialPengajarWaUrl?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(
    status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : null
  );
  const [ketuaWaUrl, setKetuaWaUrl] = useState<string | null>(initialKetuaWaUrl ?? null);
  const [pengajarWaUrl, setPengajarWaUrl] = useState<string | null>(initialPengajarWaUrl ?? null);

  if (done) {
    return (
      <div className="card-flat" style={{ padding: '16px', textAlign: 'center' }}>
        <p className="t-body" style={{ fontWeight: 600, color: done === 'approved' ? 'var(--hijau-ink)' : 'var(--danger)' }}>
          {done === 'approved' ? 'Peran ganda disetujui — ketua kini juga memimpin halaqah ini.' : 'Pengajuan ditolak.'}
        </p>
        {catatan && <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>Catatan: {catatan}</p>}
        {done === 'approved' && ketuaWaUrl && (
          <a href={ketuaWaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-wa btn-block" style={{ marginTop: 12 }}>
            Infokan auth ke ketua via WhatsApp
          </a>
        )}
        {done === 'approved' && pengajarWaUrl && (
          <a href={pengajarWaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-wa btn-block" style={{ marginTop: 8 }}>
            Beritahu pengajar (sudah disetujui)
          </a>
        )}
      </div>
    );
  }

  function decide(kind: 'approve' | 'reject') {
    setError(null);
    startTransition(async () => {
      const res = kind === 'approve' ? await approveDualRole(token, note) : await rejectDualRole(token, note);
      if (res?.error) { setError(res.error); return; }
      if (res?.decided) {
        setDone(res.decided);
        if (res.ketuaWaUrl) setKetuaWaUrl(res.ketuaWaUrl);
        if (res.pengajarWaUrl) setPengajarWaUrl(res.pengajarWaUrl);
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
          Catatan (opsional)
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="mis: benar, sudah dikonfirmasi"
          className="input"
          style={{ width: '100%' }}
        />
      </div>
      {error && <p className="t-small" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => decide('approve')} disabled={pending} className="btn btn-primary" style={{ flex: 1 }}>
          {pending ? '...' : 'Setujui'}
        </button>
        <button onClick={() => decide('reject')} disabled={pending} className="btn-ghost" style={{ flex: 1 }}>
          Tolak
        </button>
      </div>
    </div>
  );
}
