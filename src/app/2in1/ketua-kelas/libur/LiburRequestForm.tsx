'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { ajukanLibur } from './actions';

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
      {pending ? 'Memproses…' : 'Ajukan libur'}
    </button>
  );
}

export function LiburRequestForm({
  kelasOptions,
}: {
  kelasOptions: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useFormState(ajukanLibur, undefined);

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label className="field-label">Kelas</label>
        <select name="program_kelas_id" className="chip-select" required style={{ width: '100%' }}>
          {kelasOptions.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label">Tanggal diliburkan</label>
        <input type="date" name="tanggal" className="input" required style={{ width: '100%' }} />
      </div>

      <div>
        <label className="field-label">Alasan</label>
        <textarea name="alasan" className="textarea" placeholder="Mis. libur nasional / kegiatan pesantren…" />
      </div>

      {state?.error && (
        <p className="t-small" style={{ color: 'var(--danger)' }}>{state.error}</p>
      )}

      {state?.waUrl ? (
        <div className="card-flat" style={{ padding: 14, textAlign: 'center' }}>
          <p className="t-small" style={{ marginBottom: 10 }}>
            Pengajuan tersimpan. Kirim ke koordinator untuk disetujui:
          </p>
          <a href={state.waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block">
            Kirim via WhatsApp →
          </a>
        </div>
      ) : (
        <SubmitBtn />
      )}
    </form>
  );
}
