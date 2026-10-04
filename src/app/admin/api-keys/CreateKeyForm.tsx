'use client';
import { useState } from 'react';
import { createKey, revokeKey } from './actions';
import type { ScopeName } from '@/lib/api-public/types';

const SCOPES: ScopeName[] = ['maahir', 'hits', 'penilaian', 'evaluasi', 'shakwa'];

export function CreateKeyForm() {
  const [nama, setNama] = useState('');
  const [scopes, setScopes] = useState<ScopeName[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const { raw } = await createKey({ nama, scopes, expiresAt: expiresAt || null, keterangan: keterangan || null });
      setRevealed(raw);
      setNama('');
      setScopes([]);
      setExpiresAt('');
      setKeterangan('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal membuat key.');
    } finally {
      setBusy(false);
    }
  }

  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4 };

  return (
    <section className="card-flat" style={{ padding: 16 }}>
      <h2 className="t-body" style={{ fontWeight: 700, marginBottom: 12 }}>Buat key baru</h2>

      {revealed && (
        <div
          style={{
            background: 'var(--warn-bg, #fff8e1)',
            border: '1px solid var(--warn, #e0a500)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <div className="t-small" style={{ fontWeight: 700, marginBottom: 6 }}>
            Salin sekarang — key ini tidak bisa dilihat lagi.
          </div>
          <pre
            style={{
              userSelect: 'all',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontFamily: 'var(--font-mono), monospace',
              fontSize: 13,
              background: 'var(--surface, #fff)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '8px 10px',
              margin: '0 0 10px',
            }}
          >
            {revealed}
          </pre>
          <button className="btn btn-sm btn-primary" onClick={() => setRevealed(null)}>Sudah saya salin</button>
        </div>
      )}

      {err && <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 12 }}>{err}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label className="t-tiny" style={labelStyle}>Nama konsumen</label>
          <input
            className="input"
            placeholder="mis. dashboard-yayasan"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            style={{ width: '100%', height: 36 }}
          />
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <label className="t-tiny" style={labelStyle}>Kedaluwarsa (opsional)</label>
          <input
            className="input"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={{ height: 36 }}
          />
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <label className="t-tiny" style={labelStyle}>Keterangan (opsional)</label>
          <input
            className="input"
            placeholder="catatan bebas"
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            style={{ width: '100%', height: 36 }}
          />
        </div>
      </div>

      <div style={{ margin: '14px 0' }}>
        <label className="t-tiny" style={labelStyle}>Scope</label>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {SCOPES.map((s) => (
            <label key={s} className="t-body" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={(e) => setScopes((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))}
              />
              {s}
            </label>
          ))}
        </div>
      </div>

      <button className="btn btn-primary btn-sm" disabled={busy || !nama || !scopes.length} onClick={submit}>
        {busy ? 'Membuat…' : 'Buat key'}
      </button>
    </section>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>Cabut</button>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>yakin?</span>
      <button
        className="btn btn-sm btn-danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await revokeKey(id);
          location.reload();
        }}
      >
        {busy ? '…' : 'Ya, cabut'}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>Batal</button>
    </span>
  );
}
