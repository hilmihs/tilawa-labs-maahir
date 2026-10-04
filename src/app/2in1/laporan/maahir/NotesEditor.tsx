'use client';

import { useState } from 'react';
import { createNote, editNote, removeNote } from './actions';
import type { LaporanNote } from '@/lib/laporan-note';

/**
 * Catatan laporan bulanan: daftar catatan yang bisa ditambah/ubah/hapus
 * koordinator, tampil juga di file Excel.
 */
export function NotesEditor({ month, notes }: { month: string; notes: LaporanNote[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  async function run(fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    if (res.error) setError(res.error);
    setBusy(false);
    return res;
  }

  async function onAdd() {
    if (!draft.trim()) return;
    const fd = new FormData();
    fd.set('month', month);
    fd.set('teks', draft);
    const res = await run(() => createNote(undefined, fd));
    if (res.ok) setDraft('');
  }

  async function onSaveEdit(id: string) {
    const fd = new FormData();
    fd.set('id', id);
    fd.set('teks', editText);
    const res = await run(() => editNote(undefined, fd));
    if (res.ok) setEditId(null);
  }

  async function onDelete(id: string) {
    const fd = new FormData();
    fd.set('id', id);
    await run(() => removeNote(undefined, fd));
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="t-h2" style={{ marginBottom: 6 }}>Catatan / Poin Menarik</h2>
      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        Catatan bulan ini — ikut tercetak di file Excel.
      </p>

      {error && (
        <div className="banner banner-error" style={{ marginBottom: 10 }}>
          <div className="desc">{error}</div>
        </div>
      )}

      {notes.length === 0 && (
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
          Belum ada catatan.
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 10px' }}>
        {notes.map((n) => (
          <li
            key={n.id}
            className="card-flat"
            style={{ padding: '8px 12px', marginBottom: 6, display: 'flex', gap: 10, alignItems: 'flex-start' }}
          >
            {editId === n.id ? (
              <>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  style={{
                    flex: 1, fontSize: 13, padding: '6px 8px', borderRadius: 8,
                    border: '1px solid var(--line)', background: 'var(--surface, #fff)', color: 'var(--ink)',
                  }}
                />
                <button type="button" className="btn btn-xs btn-primary" disabled={busy} onClick={() => onSaveEdit(n.id)}>
                  Simpan
                </button>
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => setEditId(null)}>
                  Batal
                </button>
              </>
            ) : (
              <>
                <span className="t-small" style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{n.teks}</span>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() => { setEditId(n.id); setEditText(n.teks); }}
                >
                  Ubah
                </button>
                <button type="button" className="btn btn-xs btn-ghost" disabled={busy} onClick={() => onDelete(n.id)}>
                  Hapus
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Tambah catatan… mis. Maahir reguler 6A–6D akhwat libur sampai 23 Agustus 2026"
          style={{
            flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--line)', background: 'var(--surface, #fff)', color: 'var(--ink)',
          }}
        />
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || !draft.trim()} onClick={onAdd}>
          Tambah
        </button>
      </div>
    </section>
  );
}
