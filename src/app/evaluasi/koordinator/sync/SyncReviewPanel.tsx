'use client';
import { useState, useTransition } from 'react';
import type { EvalSyncStage } from '@/types/db';
import { triggerPull, approve, reject } from './actions';

const OP_STYLE: Record<string, { bg: string; ink: string }> = {
  create: { bg: 'var(--hijau-tint)', ink: 'var(--hijau-ink)' },
  update: { bg: 'var(--kuning-tint)', ink: 'var(--kuning-ink)' },
  deactivate: { bg: 'var(--merah-tint)', ink: 'var(--merah-ink)' },
};

export function SyncReviewPanel({ stage }: { stage: EvalSyncStage[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const flagged = stage.filter((s) => s.flags.length);
  const clean = stage.filter((s) => !s.flags.length);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function act(fn: (ids: string[]) => Promise<unknown>, ids: string[]) {
    setMsg(null);
    start(async () => { const r = await fn(ids); setMsg(JSON.stringify(r)); setSel(new Set()); });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-primary" disabled={pending}
          onClick={() => act(() => triggerPull(), [])}>
          {pending ? '…' : '⟳ Sinkronkan sekarang'}
        </button>
        <button className="btn btn-sm btn-ghost" disabled={pending || !clean.length}
          onClick={() => act(approve, clean.map((s) => s.id))}>
          ✓ Approve semua non-flag ({clean.length})
        </button>
        <button className="btn btn-sm btn-ghost" disabled={pending || !sel.size}
          onClick={() => act(approve, [...sel])}>Approve terpilih ({sel.size})</button>
        <button className="btn btn-sm btn-ghost" disabled={pending || !sel.size}
          onClick={() => act(reject, [...sel])}>Tolak terpilih</button>
      </div>
      {msg && <p className="t-tiny" style={{ color: 'var(--muted-2)' }}>{msg}</p>}

      {flagged.length > 0 && (
        <>
          <h2 className="t-h3" style={{ color: 'var(--merah-ink)', margin: '10px 0 6px' }}>
            ⚠ Perlu perhatian ({flagged.length})
          </h2>
          <StageTable rows={flagged} sel={sel} toggle={toggle} />
        </>
      )}
      <h2 className="t-h3" style={{ margin: '14px 0 6px' }}>Perubahan ({clean.length})</h2>
      <StageTable rows={clean} sel={sel} toggle={toggle} />
    </div>
  );
}

function StageTable({ rows, sel, toggle }: {
  rows: EvalSyncStage[]; sel: Set<string>; toggle: (id: string) => void;
}) {
  if (!rows.length) return <p className="t-tiny" style={{ color: 'var(--muted)' }}>—</p>;
  return (
    <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="k-table">
          <thead><tr>
            <th style={{ width: 30 }}></th><th>Entity</th><th>Op</th><th>ID</th>
            <th>Nama (after)</th><th>Flags</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const os = OP_STYLE[r.op];
              const nama = (r.after as { nama?: string } | null)?.nama
                ?? (r.before as { nama?: string } | null)?.nama ?? '—';
              return (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="t-tiny">{r.entity}</td>
                  <td><span className="badge" style={{ background: os.bg, color: os.ink, borderColor: os.ink }}>{r.op}</span></td>
                  <td className="t-mono t-tiny">{r.entity_id}</td>
                  <td className="t-tiny">{nama}</td>
                  <td className="t-tiny" style={{ color: 'var(--merah-ink)' }}>{r.flags.join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
