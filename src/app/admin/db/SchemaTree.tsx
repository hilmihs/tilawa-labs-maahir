'use client';

import { useEffect, useState } from 'react';
import { getSchemaAction, type SchemaActionResult } from './actions';
import type { SchemaGroup, SchemaColumn } from '@/lib/admin-schema';

function shortType(c: SchemaColumn): string {
  if (c.enumValues) return 'enum';
  if (c.dataType === 'USER-DEFINED') return c.udtName;
  if (c.dataType === 'character varying') return 'varchar';
  if (c.dataType === 'timestamp with time zone') return 'timestamptz';
  if (c.dataType === 'timestamp without time zone') return 'timestamp';
  return c.dataType;
}

function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        padding: '1px 6px',
        borderRadius: 6,
        background: color ?? 'var(--surface-2)',
        color: 'var(--muted)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export default function SchemaTree() {
  const [groups, setGroups] = useState<SchemaGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [openTables, setOpenTables] = useState<Set<string>>(new Set());
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    getSchemaAction().then((r: SchemaActionResult) => {
      if (!alive) return;
      if (r.ok) setGroups(r.groups);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  function toggleTable(name: string) {
    setOpenTables((prev) => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }

  function jumpTo(table: string) {
    setSearch('');
    setOpenTables((prev) => new Set(prev).add(table));
    setClosedGroups(new Set()); // pastikan semua grup terbuka
    setTimeout(() => {
      const el = document.getElementById(`schtbl-${table}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  if (error) {
    return (
      <div className="card-flat" style={{ padding: 14, borderColor: 'var(--danger, #c0392b)' }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--danger, #c0392b)' }}>{error}</pre>
      </div>
    );
  }
  if (!groups) {
    return <p className="t-small" style={{ color: 'var(--muted)' }}>Memuat skema…</p>;
  }

  const q = search.trim().toLowerCase();
  const matchTable = (t: SchemaGroup['tables'][number]) =>
    !q || t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q));

  const totalTables = groups.reduce((a, g) => a + g.tables.length, 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="Cari tabel / kolom…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ height: 34, width: 260, fontSize: 13 }}
        />
        <span className="t-small" style={{ color: 'var(--muted)' }}>{totalTables} tabel · {groups.length} domain</span>
      </div>

      {groups.map((g) => {
        const tables = g.tables.filter(matchTable);
        if (q && tables.length === 0) return null;
        const groupClosed = closedGroups.has(g.domain) && !q;
        return (
          <div key={g.domain} style={{ marginBottom: 14 }}>
            <button
              type="button"
              onClick={() =>
                setClosedGroups((prev) => {
                  const n = new Set(prev);
                  n.has(g.domain) ? n.delete(g.domain) : n.add(g.domain);
                  return n;
                })
              }
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start', gap: 8, height: 34, fontWeight: 600, fontSize: 13.5 }}
            >
              <span style={{ width: 12, display: 'inline-block' }}>{groupClosed ? '▸' : '▾'}</span>
              {g.domain}
              <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>({tables.length})</span>
            </button>

            {!groupClosed && (
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tables.map((t) => {
                  const open = openTables.has(t.name) || !!q;
                  return (
                    <div key={t.name} id={`schtbl-${t.name}`} className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => toggleTable(t.name)}
                        className="btn btn-ghost btn-sm"
                        style={{ width: '100%', justifyContent: 'flex-start', gap: 8, height: 36, padding: '0 12px', fontSize: 13 }}
                      >
                        <span style={{ width: 12, display: 'inline-block', color: 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
                        <strong style={{ fontFamily: 'var(--font-mono), monospace' }}>{t.name}</strong>
                        <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{t.rows} baris · {t.columns.length} kolom</span>
                      </button>

                      {open && (
                        <div style={{ padding: '4px 12px 12px 32px' }}>
                          {t.referencedBy.length > 0 && (
                            <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>dipakai oleh:</span>
                              {t.referencedBy.map((rb, i) => (
                                <button key={i} type="button" onClick={() => jumpTo(rb.table)} className="btn btn-ghost" style={{ height: 22, padding: '0 7px', fontSize: 11, fontFamily: 'var(--font-mono), monospace' }} title={`${rb.table}.${rb.column} → ${t.name}`}>
                                  {rb.table}
                                </button>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {t.columns.map((c) => (
                              <div key={c.name} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
                                <span style={{ fontFamily: 'var(--font-mono), monospace', minWidth: 190, fontWeight: c.isPk ? 700 : 400 }}>{c.name}</span>
                                <Badge>{shortType(c)}</Badge>
                                {c.isPk && <Badge color="rgba(180,140,20,0.18)">🔑 PK</Badge>}
                                {c.fk && (
                                  <button type="button" onClick={() => jumpTo(c.fk!.table)} className="btn btn-ghost" style={{ height: 22, padding: '0 7px', fontSize: 11, fontFamily: 'var(--font-mono), monospace', color: 'var(--accent, #2563eb)' }} title="lompat ke tabel tujuan">
                                    🔗 → {c.fk.table}.{c.fk.column}
                                  </button>
                                )}
                                {!c.nullable && <Badge>NOT NULL</Badge>}
                                {c.enumValues && <Badge>{'{' + c.enumValues.join(', ') + '}'}</Badge>}
                                {c.hasDefault && !c.isGenerated && (
                                  <Badge>default: {(c.defaultText ?? '').replace(/::[a-z_ ]+$/i, '').slice(0, 40)}</Badge>
                                )}
                                {c.isGenerated && <Badge>generated</Badge>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
