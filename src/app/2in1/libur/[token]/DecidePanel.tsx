'use client';

import { useState, useTransition } from 'react';
import { approveLibur, rejectLibur } from './actions';

export function DecidePanel({
  token,
  status,
  catatanKoordinator,
}: {
  token: string;
  status: string;
  catatanKoordinator: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [catatan, setCatatan] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(
    status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : null
  );

  if (done) {
    return (
      <div className="card-flat" style={{ padding: 16, textAlign: 'center' }}>
        <p className="t-body" style={{ fontWeight: 600, color: done === 'approved' ? 'var(--hijau-ink)' : 'var(--danger)' }}>
          {done === 'approved' ? 'Disetujui — pertemuan tanggal itu diliburkan & teranulir.' : 'Pengajuan ditolak.'}
        </p>
        {catatanKoordinator && (
          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>Catatan: {catatanKoordinator}</p>
        )}
      </div>
    );
  }

  function decide(kind: 'approve' | 'reject') {
    setError(null);
    startTransition(async () => {
      const res = kind === 'approve' ? await approveLibur(token, catatan) : await rejectLibur(token, catatan);
      if (res?.error) { setError(res.error); return; }
      if (res?.decided) setDone(res.decided);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label className="field-label">Catatan (opsional)</label>
        <textarea
          className="textarea"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Catatan untuk ketua kelas…"
        />
      </div>

      {error && <p className="t-small" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => decide('approve')} style={{ flex: 1 }}>
          {pending ? 'Memproses…' : 'Setujui & liburkan'}
        </button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => decide('reject')} style={{ flex: 1 }}>
          Tolak
        </button>
      </div>
    </div>
  );
}
