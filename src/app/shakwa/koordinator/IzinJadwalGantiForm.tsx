'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { ubahJadwalGantiIzin } from './actions';

function TombolSimpan() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-xs" disabled={pending}>
      {pending ? '…' : 'Simpan'}
    </button>
  );
}

/**
 * Betulkan tanggal kelas pengganti satu rincian izin, langsung di kartu tiket.
 *
 * Sengaja tanpa konfirmasi: yang bisa berubah cuma satu tanggal keterangan, dan
 * nilai lamanya tercatat di audit. Yang TIDAK disediakan di sini adalah sunting
 * tanggal/jenis/menit izin — itu memengaruhi tabayyun, hutang, dan rekap yang
 * sudah terlanjur dihitung, jadi bukan urusan kotak kecil di pojok kartu.
 */
export function IzinJadwalGantiForm({
  izinId,
  jadwalGanti,
  sudahTerpakai,
}: {
  izinId: string;
  jadwalGanti: string | null;
  sudahTerpakai: boolean;
}) {
  const [state, action] = useFormState(ubahJadwalGantiIzin, undefined);

  return (
    <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
      <input type="hidden" name="izin_id" value={izinId} />
      <input
        type="date"
        name="jadwal_ganti"
        defaultValue={jadwalGanti ?? ''}
        className="input"
        style={{ height: 26, fontSize: 12, width: 140 }}
        aria-label="Tanggal kelas pengganti"
      />
      <TombolSimpan />
      {/* Izin yang sudah menempel ke tabayyun tetap boleh dibetulkan — tanggal
          pengganti tak ikut mencocokkan izin — tapi koordinator perlu tahu
          bahwa baris ini sudah dipakai di tempat lain. */}
      {sudahTerpakai && (
        <span className="t-tiny" style={{ color: 'var(--muted)' }}>
          sudah dipakai tabayyun
        </span>
      )}
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
