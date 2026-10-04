'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { addNote, deleteNote } from '@/app/api/notes/actions';

interface Note {
  id: string;
  author_role: string;
  author_name?: string;
  body: string;
  visibility: string;
  created_at: string;
  isMine: boolean;
}

interface Props {
  targetType: 'pengajar' | 'peserta';
  targetId: string;
  notes: Note[];
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function NotesPanel({ targetType, targetId, notes }: Props) {
  const [addState, addAction] = useFormState(addNote, undefined);

  return (
    <div style={{ marginBottom: 24 }}>
      <h2 className="t-h2" style={{ marginBottom: 10 }}>Catatan Antar Koordinator</h2>

      {/* Existing notes */}
      {notes.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          {notes.map((n) => (
            <div
              key={n.id}
              className="card-flat"
              style={{
                padding: '12px 16px',
                marginBottom: 8,
                borderLeft: `3px solid ${n.visibility === 'private' ? 'var(--muted-2)' : 'var(--accent)'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                <div className="t-tiny">
                  {n.author_name ?? n.author_role} · {fmtDateTime(n.created_at)}
                  {n.visibility === 'private' && (
                    <span className="badge badge-neutral" style={{ marginLeft: 8, fontSize: 10 }}>privat</span>
                  )}
                </div>
                {n.isMine && (
                  <form action={async (fd: FormData) => { await deleteNote(undefined, fd); }}>
                    <input type="hidden" name="note_id" value={n.id} />
                    <button type="submit" className="btn btn-sm btn-ghost" style={{ height: 26, padding: '0 8px', fontSize: 11 }}>
                      Hapus
                    </button>
                  </form>
                )}
              </div>
              <p className="t-small" style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{n.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="t-small" style={{ color: 'var(--muted)', marginBottom: 12 }}>
          Belum ada catatan.
        </p>
      )}

      {/* Add form */}
      <form action={addAction} className="card-flat" style={{ padding: 14 }}>
        <input type="hidden" name="target_type" value={targetType} />
        <input type="hidden" name="target_id" value={targetId} />
        <textarea
          name="body"
          required
          rows={3}
          placeholder="Tulis catatan singkat untuk rekan koordinator..."
          className="textarea"
          style={{ width: '100%', padding: 10, marginBottom: 8 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <label className="t-small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select name="visibility" defaultValue="peer" className="select" style={{ height: 32, fontSize: 12, padding: '0 8px' }}>
              <option value="peer">Untuk rekan koordinator</option>
              <option value="private">Privat (cuma saya)</option>
            </select>
          </label>
          <SubmitBtn />
        </div>
        {addState?.error && (
          <p className="t-small" style={{ color: 'var(--danger)', marginTop: 6 }}>{addState.error}</p>
        )}
      </form>
    </div>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-sm">
      {pending ? 'Menyimpan...' : 'Tambah catatan'}
    </button>
  );
}
