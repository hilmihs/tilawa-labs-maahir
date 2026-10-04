'use client';

import { useState } from 'react';
import type { KsSlot } from '@/types/db';
import { alihSlotAktif, tambahSlot } from './actions';
import { Bagian, useAksi } from './ui';

export function PanelSlot({ periodeId, slots }: { periodeId: string; slots: KsSlot[] }) {
  const { pending, jalan, tampilan } = useAksi();
  const [kelompok, setKelompok] = useState<'ikhwan' | 'akhwat'>('ikhwan');
  const [mode, setMode] = useState<'online' | 'offline'>('online');
  const [teks, setTeks] = useState('');
  const [lokasi, setLokasi] = useState('');

  const perluLokasi = slots.filter((s) => s.mode === 'offline' && s.lokasi === 'Belum ditentukan');

  return (
    <Bagian
      judul="Master slot"
      keterangan="Sumber tunggal daftar slot resmi. Slot dinonaktifkan, tidak dihapus — baris lama tetap punya rujukan yang sah."
    >
      {perluLokasi.length > 0 && (
        <p className="t-small" style={{ color: 'var(--merah-ink)', marginBottom: 8 }}>
          {perluLokasi.length} slot offline masih berlokasi &quot;Belum ditentukan&quot;. Dokumen konsep
          mencatat daftar offline belum diverifikasi ke koordinator lokasi — mohon dipastikan sebelum dipakai.
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Kelompok</span>
          <select
            className="input"
            value={kelompok}
            onChange={(e) => setKelompok(e.target.value as 'ikhwan' | 'akhwat')}
          >
            <option value="ikhwan">Ikhwan</option>
            <option value="akhwat">Akhwat</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Mode</span>
          <select
            className="input"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'online' | 'offline')}
          >
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 260px' }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Slot waktu</span>
          <input
            className="input"
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            placeholder="Senin & Rabu 06:00 - 07:30 WIB"
          />
        </label>
        {mode === 'offline' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 200px' }}>
            <span className="t-small" style={{ color: 'var(--muted-2)' }}>Lokasi</span>
            <input className="input" value={lokasi} onChange={(e) => setLokasi(e.target.value)} />
          </label>
        )}
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            jalan(
              () => tambahSlot({ periodeId, kelompok, mode, teks, lokasi }),
              () => setTeks('')
            )
          }
        >
          Tambah slot
        </button>
      </div>

      {tampilan}

      <div style={{ overflowX: 'auto' }}>
        <table className="t-small" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
              <th style={{ padding: '6px 8px' }}>Slot</th>
              <th style={{ padding: '6px 8px' }}>Kelompok</th>
              <th style={{ padding: '6px 8px' }}>Mode</th>
              <th style={{ padding: '6px 8px' }}>Lokasi</th>
              <th style={{ padding: '6px 8px' }}>Status</th>
              <th style={{ padding: '6px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--line)', opacity: s.aktif ? 1 : 0.55 }}>
                <td style={{ padding: '6px 8px' }}>{s.label}</td>
                <td style={{ padding: '6px 8px' }}>{s.kelompok === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}</td>
                <td style={{ padding: '6px 8px' }}>{s.mode === 'offline' ? 'Offline' : 'Online'}</td>
                <td style={{ padding: '6px 8px' }}>{s.lokasi ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>{s.aktif ? 'Aktif' : 'Nonaktif'}</td>
                <td style={{ padding: '6px 8px' }}>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={pending}
                    onClick={() => jalan(() => alihSlotAktif({ slotId: s.id, aktif: !s.aktif }))}
                  >
                    {s.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Bagian>
  );
}
