'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitSelfPresensi } from './actions';
import { butuhAlasan, type StatusKehadiran } from '@/lib/kehadiran-status';

type Status = StatusKehadiran;

const STATUS_OPTIONS: { value: Status; label: string; color: string }[] = [
  { value: 'hadir', label: 'Hadir', color: 'var(--hijau)' },
  { value: 'izin', label: 'Izin', color: '#64b5f6' },
  { value: 'sakit', label: 'Sakit', color: '#ce93d8' },
  { value: 'terlambat', label: 'Terlambat', color: 'var(--kuning)' },
  { value: 'tidak_ada_keterangan', label: 'Tidak hadir', color: 'var(--merah)' },
];

export function SelfPresensiForm({
  kelasId,
  anggotaId,
  tanggal,
  program,
  remaining,
  askSetoran = false,
  initialStatus = 'hadir',
  initialCatatan = '',
  initialSetoran = null,
  initialMode = 'offline',
  submitLabel,
}: {
  kelasId: string;
  anggotaId: string;
  tanggal: string;
  program: string;
  remaining: number;
  askSetoran?: boolean;
  initialStatus?: Status;
  initialCatatan?: string;
  initialSetoran?: number | null;
  initialMode?: 'offline' | 'online';
  submitLabel?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [catatan, setCatatan] = useState(initialCatatan);
  const [setoran, setSetoran] = useState(initialSetoran === null ? '' : String(initialSetoran));
  const [mode, setMode] = useState<'offline' | 'online'>(initialMode);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Ikut offline/online hanya relevan saat hadir.
  const showMode = status === 'hadir' || status === 'terlambat';

  // Setoran hafalan hanya untuk sesi Kelas Maahir & saat hadir/terlambat.
  const showSetoran = askSetoran && program === 'kelas_maahir' && (status === 'hadir' || status === 'terlambat');

  // Tidak hadir wajib beralasan (dicek ulang di server action).
  const perluAlasan = butuhAlasan(status);
  const alasanKosong = perluAlasan && catatan.trim() === '';

  function save() {
    if (alasanKosong) {
      setError('Alasan wajib diisi untuk Izin / Sakit / Tidak hadir.');
      return;
    }
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set('kelas_id', kelasId);
      fd.set('anggota_id', anggotaId);
      fd.set('tanggal', tanggal);
      fd.set('program', program);
      fd.set('status', status);
      fd.set('catatan', catatan);
      if (showSetoran) fd.set('setoran_halaman', setoran);
      if (showMode) fd.set('mode', mode);
      const res = await submitSelfPresensi(undefined, fd);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setStatus(o.value)}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
              border: status === o.value ? `2px solid ${o.color}` : '1px solid var(--line)',
              background: status === o.value ? o.color : 'var(--surface)',
              color: status === o.value ? '#fff' : 'inherit',
              fontWeight: status === o.value ? 700 : 500, fontSize: 14,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {showMode && (
        <div style={{ marginTop: 12 }}>
          <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 4 }}>
            Ikut kelas secara
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['offline', 'online'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  border: mode === m ? '2px solid var(--accent, #3b82f6)' : '1px solid var(--line)',
                  background: mode === m ? 'var(--accent, #3b82f6)' : 'var(--surface)',
                  color: mode === m ? '#fff' : 'inherit',
                  fontWeight: mode === m ? 700 : 500,
                }}
              >
                {m === 'offline' ? 'Offline (hadir di tempat)' : 'Online'}
              </button>
            ))}
          </div>
        </div>
      )}

      {showSetoran && (
        <div style={{ marginTop: 12 }}>
          <label className="field-label">Setoran hafalan (halaman)</label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={setoran}
            onChange={(e) => setSetoran(e.target.value)}
            placeholder="mis. 2"
            className="input"
            style={{ width: '100%' }}
          />
        </div>
      )}

      {perluAlasan && (
        <div style={{ marginTop: 10 }}>
          <label className="field-label">
            Alasan tidak hadir <span style={{ color: 'var(--merah, #dc2626)' }}>*</span>
          </label>
          <input
            type="text"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="mis. sakit demam, mudik, ada acara keluarga…"
            className="input"
            style={{ width: '100%' }}
            aria-required
          />
          <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
            Wajib diisi — alasan ini yang muncul di rekap kehadiran & laporan bulanan.
          </p>
        </div>
      )}

      {error && <p className="t-small" style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</p>}

      <button type="button" onClick={save} disabled={pending || alasanKosong}
        className={`btn btn-block ${pending || alasanKosong ? 'btn-soft' : 'btn-primary'}`} style={{ marginTop: 16 }}>
        {pending
          ? 'Menyimpan…'
          : alasanKosong
            ? 'Isi alasan dulu'
            : submitLabel ?? (remaining > 1 ? 'Simpan & Lanjut →' : 'Simpan & Selesai')}
      </button>
    </div>
  );
}
