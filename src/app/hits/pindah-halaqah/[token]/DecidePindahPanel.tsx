'use client';

import { useState, useTransition } from 'react';
import { approvePindah, rejectPindah } from './actions';

export function DecidePindahPanel({
  token,
  status,
  catatan,
}: {
  token: string;
  status: string;
  catatan: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(
    status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : null
  );
  const [requesterWaUrl, setRequesterWaUrl] = useState<string | null>(null);

  if (done) {
    return (
      <div className="card-flat" style={{ padding: '16px', textAlign: 'center' }}>
        <p className="t-body" style={{ fontWeight: 600, color: done === 'approved' ? 'var(--hijau-ink)' : 'var(--danger)' }}>
          {done === 'approved' ? 'Pemindahan disetujui — halaqah kini menjadi milik Anda.' : 'Pemindahan ditolak.'}
        </p>
        {catatan && (
          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>Catatan: {catatan}</p>
        )}
        {done === 'approved' && requesterWaUrl && (
          <a href={requesterWaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-wa btn-block" style={{ marginTop: 12 }}>
            Beri tahu pengaju via WhatsApp
          </a>
        )}
        {done === 'approved' && (
          <a href="/hits/pengajar" className="btn-ghost btn-block" style={{ marginTop: 8 }}>
            Buka daftar halaqah & tunjuk ketua
          </a>
        )}
      </div>
    );
  }

  function decide(kind: 'approve' | 'reject') {
    setError(null);
    startTransition(async () => {
      const res = kind === 'approve' ? await approvePindah(token, note) : await rejectPindah(token, note);
      if (res?.error) { setError(res.error); return; }
      if (res?.decided) {
        setDone(res.decided);
        if (res.requesterWaUrl) setRequesterWaUrl(res.requesterWaUrl);
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label className="field-label">Catatan (opsional)</label>
        <textarea
          className="textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Catatan untuk pengaju…"
        />
      </div>

      {error && <p className="t-small" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => decide('approve')} style={{ flex: 1 }}>
          {pending ? 'Memproses…' : 'Setujui pindah'}
        </button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => decide('reject')} style={{ flex: 1 }}>
          Tolak
        </button>
      </div>
    </div>
  );
}
