'use client';

import { useState, useTransition } from 'react';
import {
  browseTableAction,
  insertRowAction,
  updateRowAction,
  deleteRowAction,
  type BrowseActionResult,
  type MutateActionResult,
} from './actions';
import type { ColumnMeta } from '@/lib/admin-crud';

interface TableInfo {
  name: string;
  rows: number;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function toInput(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

type FormMode = { kind: 'edit'; row: Record<string, any> } | { kind: 'add' } | null;

export default function TableBrowser({ tables }: { tables: TableInfo[] }) {
  const [table, setTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [pkColumns, setPkColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Form (edit/add)
  const [form, setForm] = useState<FormMode>(null);
  const [formVals, setFormVals] = useState<Record<string, string>>({});
  const [mutMsg, setMutMsg] = useState<string | null>(null);
  const [pendingCommit, setPendingCommit] = useState<null | { kind: 'save' | 'delete'; wouldAffect: number; payload: any }>(null);

  function load(tbl: string, p = 0, q = search) {
    setError(null);
    setMutMsg(null);
    startTransition(async () => {
      const r: BrowseActionResult = await browseTableAction(tbl, { page: p, pageSize, search: q });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setColumns(r.columns);
      setPkColumns(r.pkColumns);
      setRows(r.rows);
      setTotal(r.total);
      setPage(r.page);
    });
  }

  function pickTable(name: string) {
    setTable(name);
    setSearch('');
    setForm(null);
    setPendingCommit(null);
    load(name, 0, '');
  }

  function openAdd() {
    const init: Record<string, string> = {};
    for (const c of columns) if (!c.isGenerated) init[c.name] = '';
    setFormVals(init);
    setForm({ kind: 'add' });
    setMutMsg(null);
    setPendingCommit(null);
  }

  function openEdit(row: Record<string, any>) {
    const init: Record<string, string> = {};
    for (const c of columns) init[c.name] = toInput(row[c.name]);
    setFormVals(init);
    setForm({ kind: 'edit', row });
    setMutMsg(null);
    setPendingCommit(null);
  }

  function pkOf(row: Record<string, any>): Record<string, any> {
    const pk: Record<string, any> = {};
    for (const c of pkColumns) pk[c] = row[c];
    return pk;
  }

  // Preview (confirm=false) → arm commit
  function submitForm() {
    if (!table || !form) return;
    setError(null);
    setMutMsg(null);
    startTransition(async () => {
      let r: MutateActionResult;
      if (form.kind === 'add') {
        r = await insertRowAction(table, formVals, false);
      } else {
        const changes: Record<string, any> = {};
        for (const c of columns) {
          if (c.isPk || c.isGenerated) continue;
          if (toInput(form.row[c.name]) !== (formVals[c.name] ?? '')) changes[c.name] = formVals[c.name];
        }
        if (Object.keys(changes).length === 0) {
          setError('Tak ada perubahan.');
          return;
        }
        r = await updateRowAction(table, pkOf(form.row), changes, false);
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPendingCommit({ kind: 'save', wouldAffect: r.wouldAffect, payload: form });
    });
  }

  function commitSave() {
    if (!table || !form) return;
    startTransition(async () => {
      let r: MutateActionResult;
      if (form.kind === 'add') {
        r = await insertRowAction(table, formVals, true);
      } else {
        const changes: Record<string, any> = {};
        for (const c of columns) {
          if (c.isPk || c.isGenerated) continue;
          if (toInput(form.row[c.name]) !== (formVals[c.name] ?? '')) changes[c.name] = formVals[c.name];
        }
        r = await updateRowAction(table, pkOf(form.row), changes, true);
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPendingCommit(null);
      setForm(null);
      setMutMsg(form.kind === 'add' ? '✓ Baris ditambahkan.' : `✓ ${r.rowCount} baris di-update.`);
      load(table, page);
    });
  }

  function askDelete(row: Record<string, any>) {
    if (!table) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteRowAction(table, pkOf(row), false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPendingCommit({ kind: 'delete', wouldAffect: r.wouldAffect, payload: row });
    });
  }

  function commitDelete() {
    if (!table || pendingCommit?.kind !== 'delete') return;
    const row = pendingCommit.payload;
    startTransition(async () => {
      const r = await deleteRowAction(table, pkOf(row), true);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPendingCommit(null);
      setMutMsg(`✓ ${r.rowCount} baris dihapus.`);
      load(table, page);
    });
  }

  const shownTables = filter ? tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase())) : tables;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Sidebar tabel */}
      <aside className="card-flat" style={{ flex: '0 0 220px', maxWidth: 240, padding: 10, maxHeight: 620, overflowY: 'auto', position: 'sticky', top: 12 }}>
        <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8, fontWeight: 600 }}>{tables.length} TABEL</div>
        <input className="input" placeholder="Cari tabel…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ height: 32, marginBottom: 8, width: '100%', fontSize: 13 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shownTables.map((t) => (
            <button key={t.name} type="button" onClick={() => pickTable(t.name)}
              className={`btn btn-sm ${table === t.name ? 'btn-primary' : 'btn-ghost'}`}
              style={{ justifyContent: 'space-between', height: 30, padding: '0 8px', fontSize: 12, textAlign: 'left' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              <span style={{ color: table === t.name ? 'inherit' : 'var(--muted)', fontSize: 11, flexShrink: 0 }}>{t.rows}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Panel utama */}
      <section style={{ flex: '1 1 520px', minWidth: 0 }}>
        {!table ? (
          <div className="card-flat" style={{ padding: 32, textAlign: 'center' }}>
            <p className="t-body" style={{ color: 'var(--muted)' }}>Pilih tabel di kiri untuk mulai jelajah.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 15 }}>{table}</strong>
              <span className="t-small" style={{ color: 'var(--muted)' }}>{total} baris</span>
              <form onSubmit={(e) => { e.preventDefault(); load(table, 0, search); }} style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <input className="input" placeholder="Cari (kolom teks)…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ height: 32, fontSize: 13, width: 200 }} />
                <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>Cari</button>
              </form>
              <button type="button" className="btn btn-primary btn-sm" onClick={openAdd} disabled={pending || columns.length === 0}>＋ Tambah baris</button>
            </div>

            {error && (
              <div className="card-flat" style={{ marginBottom: 12, padding: 10, borderColor: 'var(--danger, #c0392b)' }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--danger, #c0392b)' }}>{error}</pre>
              </div>
            )}
            {mutMsg && <p className="t-small" style={{ color: 'var(--ok, #1a7f4b)', marginBottom: 12 }}>{mutMsg}</p>}

            {/* Form edit/add */}
            {form && (
              <div className="card-flat" style={{ padding: 14, marginBottom: 14 }}>
                <div className="t-tiny" style={{ fontWeight: 600, marginBottom: 10 }}>
                  {form.kind === 'add' ? 'Tambah baris baru' : 'Edit baris'}
                  {pkColumns.length === 0 && <span style={{ color: 'var(--danger, #c0392b)' }}> — tabel tanpa PK, edit/hapus lewat SQL Console</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                  {columns.filter((c) => !c.isGenerated).map((c) => {
                    const disabled = form.kind === 'edit' && c.isPk;
                    const val = formVals[c.name] ?? '';
                    const set = (v: string) => setFormVals((p) => ({ ...p, [c.name]: v }));
                    return (
                      <label key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span className="t-tiny" style={{ color: 'var(--muted)' }}>
                          {c.name}
                          <span style={{ opacity: 0.6 }}> · {c.enumValues ? 'enum' : c.dataType}{c.isPk ? ' · PK' : ''}{!c.nullable ? ' · NOT NULL' : ''}</span>
                        </span>
                        {c.enumValues ? (
                          <select className="select" value={val} onChange={(e) => set(e.target.value)} disabled={disabled} style={{ height: 34 }}>
                            {c.nullable && <option value="">∅ (null)</option>}
                            {c.enumValues.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                          </select>
                        ) : c.dataType === 'boolean' ? (
                          <select className="select" value={val} onChange={(e) => set(e.target.value)} disabled={disabled} style={{ height: 34 }}>
                            {c.nullable && <option value="">∅ (null)</option>}
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : c.dataType === 'json' || c.dataType === 'jsonb' ? (
                          <textarea className="input" value={val} onChange={(e) => set(e.target.value)} disabled={disabled} rows={2} style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12, padding: 8 }} />
                        ) : (
                          <input className="input" value={val} onChange={(e) => set(e.target.value)} disabled={disabled}
                            placeholder={c.nullable ? 'kosong = NULL' : c.hasDefault ? 'kosong = default' : ''}
                            style={{ height: 34, fontSize: 13, fontFamily: 'var(--font-mono), monospace' }} />
                        )}
                      </label>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  {!pendingCommit ? (
                    <>
                      <button type="button" className="btn btn-primary btn-sm" onClick={submitForm} disabled={pending || (form.kind === 'edit' && pkColumns.length === 0)}>
                        {pending ? 'Memproses…' : 'Preview'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setForm(null); setPendingCommit(null); }}>Batal</button>
                    </>
                  ) : (
                    <>
                      <span className="t-small" style={{ color: 'var(--muted)' }}>
                        {form.kind === 'add' ? 'Tambah 1 baris.' : `${pendingCommit.wouldAffect} baris akan berubah.`} Commit?
                      </span>
                      <button type="button" className="btn btn-sm" style={{ background: 'var(--danger, #c0392b)', color: '#fff' }} onClick={commitSave} disabled={pending}>Ya, commit</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingCommit(null)}>Batal</button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Konfirmasi hapus */}
            {pendingCommit?.kind === 'delete' && (
              <div className="card-flat" style={{ padding: 12, marginBottom: 14, borderColor: 'var(--danger, #c0392b)' }}>
                <span className="t-small" style={{ color: 'var(--danger, #c0392b)' }}>Hapus {pendingCommit.wouldAffect} baris permanen?</span>
                <div style={{ display: 'inline-flex', gap: 8, marginLeft: 10 }}>
                  <button type="button" className="btn btn-sm" style={{ background: 'var(--danger, #c0392b)', color: '#fff' }} onClick={commitDelete} disabled={pending}>Ya, hapus</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingCommit(null)}>Batal</button>
                </div>
              </div>
            )}

            {/* Grid baris */}
            <div className="card-flat" style={{ padding: 0, overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>Aksi</th>
                    {columns.map((c) => (
                      <th key={c.name} style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {c.name}{c.isPk ? ' 🔑' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--line)', background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-ghost btn-sm" style={{ height: 26, padding: '0 8px', fontSize: 11 }} onClick={() => openEdit(row)} disabled={pending}>Edit</button>
                        <button type="button" className="btn btn-ghost btn-sm" style={{ height: 26, padding: '0 8px', fontSize: 11, color: 'var(--danger, #c0392b)' }} onClick={() => askDelete(row)} disabled={pending || pkColumns.length === 0}>Hapus</button>
                      </td>
                      {columns.map((c) => (
                        <td key={c.name} style={{ padding: '6px 10px', fontFamily: 'var(--font-mono), monospace', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cellText(row[c.name])}>
                          {cellText(row[c.name])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={columns.length + 1} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>Tak ada baris.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={page === 0 || pending} onClick={() => load(table, page - 1)}>Sebelumnya</button>
                <span className="t-small" style={{ color: 'var(--muted)' }}>Halaman {page + 1} / {totalPages}</span>
                <button type="button" className="btn btn-ghost btn-sm" disabled={page + 1 >= totalPages || pending} onClick={() => load(table, page + 1)}>Selanjutnya</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
