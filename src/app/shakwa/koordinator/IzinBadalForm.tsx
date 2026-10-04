'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { ubahBadalIzin } from './actions';

function TombolSimpan() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-xs" disabled={pending}>
      {pending ? '…' : 'Simpan'}
    </button>
  );
}

/**
 * Ganti pengajar badal satu rincian izin, langsung di kartu tiket. Pola sama
 * dengan IzinJadwalGantiForm: badal tak ikut mencocokkan izin ke tabayyun, jadi
 * aman diganti kapan saja; nilai lamanya tercatat di audit. Aturan siapa boleh
 * jadi badal diperiksa ulang di server (cekBadal).
 */
export function IzinBadalForm({
  izinId,
  badalPengajarId,
  calonBadal,
}: {
  izinId: string;
  badalPengajarId: string | null;
  calonBadal: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useFormState(ubahBadalIzin, undefined);

  return (
    <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
      <input type="hidden" name="izin_id" value={izinId} />
      <select
        name="badal_pengajar_id"
        defaultValue={badalPengajarId ?? ''}
        required
        className="input"
        style={{ height: 26, fontSize: 12, maxWidth: 220 }}
        aria-label="Pengajar badal"
      >
        <option value="">— pilih badal —</option>
        {calonBadal.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <TombolSimpan />
      {state?.error && (
        <span className="t-tiny" style={{ color: 'var(--danger)' }}>
          {state.error}
        </span>
      )}
      {state?.ok && (
        <span className="t-tiny" style={{ color: 'var(--hijau-ink, green)' }}>
          tersimpan
        </span>
      )}
    </form>
  );
}
