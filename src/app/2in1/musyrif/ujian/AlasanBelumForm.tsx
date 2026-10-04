'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { simpanAlasanBelumUjian, type AlasanResult } from './actions';

export function AlasanBelumForm({
  periodeId,
  pesertaId,
  alasan,
}: {
  periodeId: string;
  pesertaId: string;
  alasan: string | null;
}) {
  const [state, formAction] = useFormState<AlasanResult | undefined, FormData>(simpanAlasanBelumUjian, undefined);
  return (
    <form action={formAction} style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
      <input type="hidden" name="periode_id" value={periodeId} />
      <input type="hidden" name="peserta_id" value={pesertaId} />
      <input
        className="input"
        name="alasan"
        defaultValue={alasan ?? ''}
        maxLength={500}
        placeholder="Alasan belum ujian (sakit, safar, uzur…)"
        style={{ flex: 1, height: 32, fontSize: 12 }}
      />
      <Tombol />
      {state?.ok && <span style={{ fontSize: 11, color: 'var(--hijau-ink)' }}>✓</span>}
      {state?.error && <span style={{ fontSize: 11, color: 'var(--merah-ink)' }}>{state.error}</span>}
    </form>
  );
}

function Tombol() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-xs btn-ghost" disabled={pending} style={{ whiteSpace: 'nowrap' }}>
      {pending ? '…' : 'Simpan'}
    </button>
  );
}
