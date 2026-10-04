'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addNote } from '@/app/api/notes/actions';

interface Props {
  pengajarId: string;
}

/**
 * Tombol "Catatan" ringkas untuk baris noData koordinator: reveal textarea,
 * simpan catatan peer (terlihat rekan koordinator) via addNote. Tak memuat
 * daftar catatan — cukup tambah. Server action me-revalidate /hits/koordinator
 * & halaman detail pengajar, jadi catatan langsung tampak lintas koordinator.
 */
export function NoteQuickAdd({ pengajarId }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(addNote, undefined);

  // tutup otomatis setelah sukses (revalidate server → catatan tersimpan)
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state?.ok]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-sm btn-ghost"
        style={{ height: 26, padding: '0 8px', fontSize: 11 }}
      >
        + Catatan
      </button>
    );
  }

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
      <input type="hidden" name="target_type" value="pengajar" />
      <input type="hidden" name="target_id" value={pengajarId} />
      <input type="hidden" name="visibility" value="peer" />
      <textarea
        name="body"
        required
        rows={2}
        autoFocus
        placeholder="Catatan untuk rekan koordinator..."
        className="textarea"
        style={{ width: '100%', padding: 8, fontSize: 12 }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <SubmitBtn />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-sm btn-ghost"
          style={{ height: 26, padding: '0 8px', fontSize: 11 }}
        >
          Batal
        </button>
      </div>
      {state?.error && (
        <p className="t-small" style={{ color: 'var(--danger)', margin: 0 }}>{state.error}</p>
      )}
    </form>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-sm" style={{ height: 26, padding: '0 10px', fontSize: 11 }}>
      {pending ? 'Menyimpan...' : 'Simpan'}
    </button>
  );
}
