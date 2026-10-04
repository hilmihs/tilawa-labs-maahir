'use client';

import { useState, useTransition } from 'react';
import { ubahLevelHalaqah } from './actions';

type HalaqahLevel = { id: string; name: string; program: 'dasar' | 'lanjutan' | null };

export function UbahLevelPanel({ halaqahList }: { halaqahList: HalaqahLevel[] }) {
  if (halaqahList.length === 0) return null;

  return (
    <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
      <h2 className="t-h2" style={{ marginBottom: 4 }}>Level Halaqah</h2>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
        Ubah level halaqah bila peserta belajar materi yang berbeda dari yang tercatat.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {halaqahList.map((h) => <LevelCard key={h.id} halaqah={h} />)}
      </div>
    </div>
  );
}

function LevelCard({ halaqah }: { halaqah: HalaqahLevel }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [open, setOpen] = useState(false);

  const currentLabel = halaqah.program === 'lanjutan' ? 'Lanjutan' : 'Dasar';
  const targetProgram = halaqah.program === 'lanjutan' ? 'dasar' : 'lanjutan';
  const targetLabel = halaqah.program === 'lanjutan' ? 'Dasar' : 'Lanjutan';

  function handleSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await ubahLevelHalaqah(undefined, fd);
      if (res?.error) { setError(res.error); return; }
      if (res?.ok) { setSuccess(true); setOpen(false); }
    });
  }

  return (
    <div className="card-flat" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <p className="t-body" style={{ fontWeight: 600 }}>{halaqah.name}</p>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
            Level saat ini:{' '}
            <span style={{
              fontWeight: 600,
              color: halaqah.program === 'lanjutan' ? 'var(--accent)' : 'var(--hijau-ink)',
            }}>
              {success ? targetLabel : currentLabel}
            </span>
          </p>
        </div>
        {!success && (
          <button className="btn btn-sm btn-ghost" onClick={() => setOpen((o) => !o)} style={{ whiteSpace: 'nowrap' }}>
            Ubah Level
          </button>
        )}
      </div>

      {open && !success && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
          <p className="t-small" style={{ marginBottom: 8 }}>
            Ganti dari <strong>{currentLabel}</strong> ke <strong>{targetLabel}</strong>?
          </p>
          <form action={handleSubmit} style={{ display: 'flex', gap: 8 }}>
            <input type="hidden" name="halaqah_id" value={halaqah.id} />
            <input type="hidden" name="program" value={targetProgram} />
            <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
              {pending ? 'Menyimpan…' : `Ya, ubah ke ${targetLabel}`}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
              Batal
            </button>
          </form>
          {error && <p className="t-small" style={{ color: 'var(--danger)', marginTop: 6 }}>{error}</p>}
        </div>
      )}

      {success && (
        <p className="t-small" style={{ color: 'var(--hijau-ink)', marginTop: 6 }}>
          Level diubah ke {targetLabel}. Refresh halaman untuk melihat perubahan.
        </p>
      )}
    </div>
  );
}
