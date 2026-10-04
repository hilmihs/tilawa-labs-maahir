'use client';

import { useState, useTransition } from 'react';
import { reminderMassalHariIni, type ReminderItem } from './actions';

export function ReminderMassalPanel({ enabled, efektif }: { enabled: boolean; efektif: string }) {
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<ReminderItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await reminderMassalHariIni();
      if (res.error) { setError(res.error); return; }
      setItems(res.items ?? []);
    });
  }

  return (
    <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600 }}>Reminder Massal Pengisian</div>
          <div className="t-small" style={{ color: 'var(--muted-2)' }}>
            Kirim link isi keterangan ke semua ketua yang belum mengisi pertemuan hari ini.
          </div>
        </div>
        <button onClick={handleClick} disabled={!enabled || pending} className="btn btn-sm">
          {pending ? 'Menyiapkan…' : 'Buat Link Reminder'}
        </button>
      </div>

      {!enabled && (
        <div className="t-small" style={{ color: 'var(--kuning-ink)', marginTop: 8 }}>
          Sistem observasi mulai efektif {efektif}.
        </div>
      )}
      {error && <div className="t-small" style={{ color: 'var(--merah-ink)', marginTop: 8 }}>{error}</div>}

      {items && (
        items.length === 0 ? (
          <div className="t-small" style={{ color: 'var(--hijau-ink)', marginTop: 8 }}>
            Semua ketua sudah mengisi (atau tidak ada pertemuan hari ini).
          </div>
        ) : (
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{items.length} ketua perlu diingatkan:</div>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
                <span className="t-small">{it.ketuaName} — {it.kelasName}</span>
                <a href={it.waUrl} target="_blank" rel="noreferrer" className="act-btn wa" style={{ fontSize: 11, flexShrink: 0 }}>
                  Kirim WA
                </a>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
