'use client';
import { useState, useTransition } from 'react';
import { setKajianLibur, hapusKajianLibur } from './actions';
import type { HitsKajianLibur } from '@/types/db';

export function KajianLiburPanel({ libur }: { libur: HitsKajianLibur[] }) {
  const [pending, start] = useTransition();
  const [tanggal, setTanggal] = useState('');
  const [ket, setKet] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="filter-bar">
        {/* kj-input: skala 34px/13px yang sama dengan filter-bar Rekap */}
        <input
          type="date"
          className="kj-input"
          style={{ maxWidth: 170 }}
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          aria-label="Tanggal libur"
        />
        <input
          className="kj-input"
          style={{ maxWidth: 240 }}
          placeholder="Keterangan"
          value={ket}
          onChange={(e) => setKet(e.target.value)}
          aria-label="Keterangan libur"
        />
        <span className="grow" />
        <button
          type="button"
          className="act-btn"
          disabled={pending || !tanggal}
          onClick={() => start(async () => { await setKajianLibur(tanggal, ket); setTanggal(''); setKet(''); })}
        >
          Tambah Libur
        </button>
      </div>

      {libur.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada tanggal libur.</p>
      ) : (
        <ul className="card-flat" style={{ padding: 0, overflow: 'hidden', listStyle: 'none', margin: 0 }}>
          {libur.map((l) => (
            <li key={l.id} className="row">
              <span className="t-mono">{l.tanggal}</span>
              <span className="t-small" style={{ color: 'var(--muted)' }}>{l.keterangan || '—'}</span>
              <span className="grow" />
              <button
                type="button"
                className="act-btn"
                style={{ color: 'var(--merah-ink)' }}
                disabled={pending}
                aria-label={`Hapus libur ${l.tanggal}`}
                onClick={() => start(async () => { await hapusKajianLibur(l.tanggal); })}
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
