'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { submitCheckinMaahir } from './actions';
import type { CheckinAwal } from '@/lib/maahir-checkin-pengajar';

/**
 * Form check-in satu sesi. Tanpa aturan terlambat — yang dicatat hanya jam
 * tekan tombol. Bila sudah ada isian, form berperan sebagai penyunting materi/
 * catatan (status tetap bisa diubah selama periodenya terbuka).
 */
export function CheckinMaahirForm({
  kelasId,
  kelasName,
  tanggal,
  tanggalLabel,
  awal,
  susulan,
  ringkas,
}: {
  kelasId: string;
  kelasName: string;
  tanggal: string;
  tanggalLabel: string;
  awal: CheckinAwal;
  /** Sesi lampau → tombolnya "Isi susulan", bukan "Check-in". */
  susulan: boolean;
  /** Tampilan ringkas untuk baris tabel rekap (tanpa judul kelas/tanggal). */
  ringkas?: boolean;
}) {
  const [state, action] = useFormState(submitCheckinMaahir, undefined);
  const [open, setOpen] = useState(!awal);
  const [status, setStatus] = useState<'hadir' | 'izin' | 'sakit'>(awal?.status ?? 'hadir');
  const key = `${kelasId}|${tanggal}`;
  const milikSaya = state?.key === key;

  useEffect(() => {
    if (milikSaya && state?.ok && awal) setOpen(false);
  }, [milikSaya, state?.ok, awal]);

  if (awal && !open) {
    return (
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>
        {awal.materi ? 'Sunting materi' : 'Isi materi'}
      </button>
    );
  }

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name="kelas_id" value={kelasId} />
      <input type="hidden" name="tanggal" value={tanggal} />
      {!ringkas && (
        <div>
          <div style={{ fontWeight: 600 }}>{kelasName}</div>
          <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{tanggalLabel}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['hadir', 'izin', 'sakit'] as const).map((st) => (
          <label
            key={st}
            className="btn btn-sm"
            style={{
              cursor: 'pointer',
              background: status === st ? 'var(--ink)' : 'var(--surface-2)',
              color: status === st ? '#fff' : 'var(--ink)',
            }}
          >
            <input
              type="radio"
              name="status"
              value={st}
              checked={status === st}
              onChange={() => setStatus(st)}
              style={{ display: 'none' }}
            />
            {st === 'hadir' ? 'Hadir' : st === 'izin' ? 'Izin' : 'Sakit'}
          </label>
        ))}
      </div>
      <textarea
        name="materi"
        rows={2}
        defaultValue={awal?.materi ?? ''}
        placeholder="Materi pertemuan ini (boleh diisi setelah kelas)…"
        className="textarea"
        style={{ width: '100%', padding: 8, fontSize: 13 }}
      />
      <input
        name="catatan"
        defaultValue={awal?.catatan ?? ''}
        placeholder={status === 'hadir' ? 'Catatan (opsional)' : 'Alasan (wajib)'}
        required={status !== 'hadir'}
        className="input"
        style={{ width: '100%', padding: 8, fontSize: 13 }}
      />
      {milikSaya && state?.error && (
        <div className="t-small" style={{ color: 'var(--merah-ink)' }}>{state.error}</div>
      )}
      {milikSaya && state?.ok && (
        <div className="t-small" style={{ color: 'var(--hijau-ink)' }}>Tersimpan.</div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <SubmitBtn label={awal ? 'Simpan' : susulan ? 'Isi susulan' : 'Check-in sekarang'} />
        {awal && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
            Batal
          </button>
        )}
        {awal && (
          <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
            diisi {awal.jam}{awal.susulan ? ' (susulan)' : ''}
          </span>
        )}
      </div>
    </form>
  );
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
      {pending ? 'Menyimpan…' : label}
    </button>
  );
}
