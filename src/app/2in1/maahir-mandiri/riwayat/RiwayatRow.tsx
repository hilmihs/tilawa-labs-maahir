'use client';

import { useState } from 'react';
import { SelfPresensiForm } from '../SelfPresensiForm';

type Status = 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan';

const STATUS_LABEL: Record<string, string> = {
  hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', terlambat: 'Terlambat', tidak_ada_keterangan: 'Tidak hadir',
};
const STATUS_BADGE: Record<string, string> = {
  hadir: 'badge-hijau', terlambat: 'badge-kuning', izin: 'badge-kuning',
  sakit: 'badge-kuning', tidak_ada_keterangan: 'badge-merah',
};

export function RiwayatRow({
  kelasId,
  anggotaId,
  tanggal,
  program,
  programLabel,
  tanggalLabel,
  status,
  catatan,
  setoran,
  mode,
  askSetoran,
}: {
  kelasId: string;
  anggotaId: string;
  tanggal: string;
  program: string;
  programLabel: string;
  tanggalLabel: string;
  status: string;
  catatan: string | null;
  setoran: number | null;
  mode: 'offline' | 'online';
  askSetoran: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="card-flat" style={{ padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{tanggalLabel}</div>
          <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
            {programLabel}
            {askSetoran ? ` · Setoran: ${setoran ?? 0} hlm` : ''}
            {catatan ? ` · ${catatan}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span className={`badge ${STATUS_BADGE[status] ?? ''}`}>{STATUS_LABEL[status] ?? status}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Tutup' : 'Edit'}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ marginTop: 12 }}>
          <SelfPresensiForm
            kelasId={kelasId}
            anggotaId={anggotaId}
            tanggal={tanggal}
            program={program}
            remaining={1}
            askSetoran={askSetoran}
            initialStatus={status as Status}
            initialCatatan={catatan ?? ''}
            initialSetoran={setoran}
            initialMode={mode}
            submitLabel="Simpan perubahan"
          />
        </div>
      )}
    </div>
  );
}
