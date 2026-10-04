'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { ubahStatusShakwa } from './actions';
import { STATUS_LABEL, STATUS_PILIHAN } from '@/lib/shakwa';
import type { ShakwaStatus } from '@/lib/shakwa';

// 'closed' tak ditawarkan — hanya nilai warisan yang mungkin sudah ada di baris lama.
const STATUS_LIST: ShakwaStatus[] = STATUS_PILIHAN;

function TombolSimpan() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
      {pending ? 'Menyimpan…' : 'Simpan'}
    </button>
  );
}

/** Ubah status + catatan tindak lanjut satu aduan. */
export function ShakwaTindakForm({
  id,
  status,
  catatan,
}: {
  id: string;
  status: ShakwaStatus;
  catatan: string | null;
}) {
  const [state, action] = useFormState(ubahStatusShakwa, undefined);

  return (
    <form action={action} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start' }}>
      <input type="hidden" name="id" value={id} />
      <select name="status" defaultValue={status} className="input" style={{ height: 30, fontSize: 12 }}>
        {STATUS_LIST.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <input
        name="catatan"
        defaultValue={catatan ?? ''}
        placeholder="Catatan tindak lanjut…"
        className="input"
        style={{ height: 30, fontSize: 12, flex: '1 1 200px', minWidth: 160 }}
      />
      <TombolSimpan />
      {state?.error && (
        <div className="t-tiny" style={{ color: 'var(--merah-ink)', flexBasis: '100%' }}>
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="t-tiny" style={{ color: 'var(--hijau-ink)', flexBasis: '100%' }}>
          Tersimpan.
        </div>
      )}
    </form>
  );
}
