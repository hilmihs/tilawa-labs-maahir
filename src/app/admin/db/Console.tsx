'use client';

import { useState, useTransition } from 'react';
import { runConsoleSql, type ConsoleResult } from './actions';

interface TableInfo {
  name: string;
  rows: number;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function Console({ tables }: { tables: TableInfo[] }) {
  const [sql, setSql] = useState('SELECT * FROM peserta LIMIT 20;');
  const [result, setResult] = useState<ConsoleResult | null>(null);
  const [allowNonTx, setAllowNonTx] = useState(false);
  const [confirmArm, setConfirmArm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState('');

  function run(confirm: boolean, sqlOverride?: string) {
    const q = (sqlOverride ?? sql).trim();
    if (!q) return;
    setConfirmArm(false);
    startTransition(async () => {
      const r = await runConsoleSql(q, confirm, allowNonTx);
      setResult(r);
    });
  }

  function pickTable(name: string) {
    const q = `SELECT * FROM "${name}" LIMIT 100;`;
    setSql(q);
    run(false, q);
  }

  const shownTables = filter
    ? tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
    : tables;

  const ok = result?.ok === true ? result : null;
  const err = result?.ok === false ? result.error : null;

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Sidebar: daftar tabel */}
      <aside
        className="card-flat"
        style={{ flex: '0 0 240px', maxWidth: 260, padding: 10, maxHeight: 520, overflowY: 'auto', position: 'sticky', top: 12 }}
      >
        <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8, fontWeight: 600 }}>
          {tables.length} TABEL
        </div>
        <input
          className="input"
          placeholder="Cari tabel…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ height: 32, marginBottom: 8, width: '100%', fontSize: 13 }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shownTables.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => pickTable(t.name)}
              className="btn btn-ghost btn-sm"
              style={{ justifyContent: 'space-between', height: 30, padding: '0 8px', fontSize: 12, textAlign: 'left' }}
              title={`SELECT * FROM ${t.name} LIMIT 100`}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>{t.rows}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Konsol */}
      <section style={{ flex: '1 1 480px', minWidth: 0 }}>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          rows={6}
          style={{
            width: '100%',
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
            fontSize: 13,
            padding: 12,
            borderRadius: 10,
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            color: 'var(--text)',
            resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(false)}>
            {pending ? 'Menjalankan…' : 'Jalankan (read / preview)'}
          </button>

          {!confirmArm ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => setConfirmArm(true)}
              style={{ color: 'var(--danger, #c0392b)' }}
            >
              Commit tulis…
            </button>
          ) : (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span className="t-tiny" style={{ color: 'var(--danger, #c0392b)' }}>Commit permanen?</span>
              <button type="button" className="btn btn-sm" style={{ background: 'var(--danger, #c0392b)', color: '#fff' }} disabled={pending} onClick={() => run(true)}>
                Ya, commit
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmArm(false)}>Batal</button>
            </span>
          )}

          <label className="t-tiny" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: 'var(--muted)', marginLeft: 'auto' }}>
            <input type="checkbox" checked={allowNonTx} onChange={(e) => setAllowNonTx(e.target.checked)} />
            izinkan non-transaksional (VACUUM/CONCURRENTLY)
          </label>
        </div>

        {/* Hasil */}
        {err && (
          <div className="card-flat" style={{ marginTop: 14, padding: 12, borderColor: 'var(--danger, #c0392b)' }}>
            <div className="t-tiny" style={{ color: 'var(--danger, #c0392b)', fontWeight: 600, marginBottom: 4 }}>ERROR</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>{err}</pre>
          </div>
        )}

        {ok && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <span className={`badge ${ok.committed ? 'badge-hijau' : ok.requiresConfirm ? 'badge-kuning' : 'badge-neutral'}`} style={{ fontSize: 11 }}>
                <span className="dot" />
                {ok.kind === 'read'
                  ? 'READ'
                  : ok.committed
                    ? 'COMMITTED'
                    : ok.requiresConfirm
                      ? 'PREVIEW (belum di-commit)'
                      : 'WRITE'}
              </span>
              <span className="t-small" style={{ color: 'var(--muted)' }}>
                {ok.kind === 'write' && !ok.committed && typeof ok.wouldAffect === 'number'
                  ? `${ok.wouldAffect} baris akan terdampak`
                  : `${ok.rowCount} baris`}
                {ok.truncated ? ` (ditampilkan ${ok.rows.length})` : ''}
              </span>
            </div>

            {ok.notice && (
              <p className="t-small" style={{ color: 'var(--muted)', marginBottom: 10 }}>{ok.notice}</p>
            )}

            {ok.rows.length > 0 && (
              <div className="card-flat" style={{ padding: 0, overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', textAlign: 'left', position: 'sticky', top: 0 }}>
                      {ok.columns.map((c) => (
                        <th key={c} style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ok.rows.map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--line)', background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                        {ok.columns.map((c) => (
                          <td key={c} style={{ padding: '7px 10px', fontFamily: 'var(--font-mono), monospace', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cellText(row[c])}>
                            {cellText(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ok.kind === 'read' && ok.rows.length === 0 && (
              <p className="t-small" style={{ color: 'var(--muted)' }}>(0 baris)</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
