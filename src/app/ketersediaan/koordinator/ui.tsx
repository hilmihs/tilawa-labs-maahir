'use client';

import { useState, useTransition } from 'react';
import type { Hasil } from './actions';

/** Kotak pesan seragam untuk seluruh panel koordinator. */
export function Kotak({
  nada,
  children,
}: {
  nada: 'baik' | 'galat' | 'netral';
  children: React.ReactNode;
}) {
  const warna =
    nada === 'galat'
      ? 'var(--merah-ink)'
      : nada === 'baik'
        ? 'var(--hijau-ink)'
        : 'var(--muted-2)';
  return (
    <div
      className="t-small"
      style={{
        border: `1px solid ${nada === 'netral' ? 'var(--line)' : warna}`,
        color: warna,
        borderRadius: 8,
        padding: '8px 10px',
        margin: '8px 0',
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </div>
  );
}

export function Bagian({
  judul,
  keterangan,
  children,
}: {
  judul: string;
  keterangan?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
      <h2 className="t-h2" style={{ fontSize: 16, marginBottom: keterangan ? 2 : 8 }}>
        {judul}
      </h2>
      {keterangan && (
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
          {keterangan}
        </p>
      )}
      {children}
    </section>
  );
}

/**
 * Pembungkus pemanggilan server action: menyeragamkan status menunggu, pesan
 * berhasil, dan pesan galat supaya tiap panel tidak menuliskannya ulang.
 */
export function useAksi() {
  const [pending, mulai] = useTransition();
  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  function jalan(fn: () => Promise<Hasil>, sesudah?: (data: unknown) => void) {
    setPesan(null);
    setGalat(null);
    mulai(async () => {
      const r = await fn();
      if (r.ok) {
        setPesan(r.pesan);
        sesudah?.(r.data);
      } else {
        setGalat(r.error);
      }
    });
  }

  const tampilan = (
    <>
      {galat && <Kotak nada="galat">{galat}</Kotak>}
      {pesan && <Kotak nada="baik">{pesan}</Kotak>}
    </>
  );

  return { pending, jalan, tampilan, setPesan, setGalat };
}

export function Angka({
  label,
  nilai,
  ubah,
  min,
  max,
}: {
  label: string;
  nilai: number;
  ubah: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="t-small" style={{ color: 'var(--muted-2)' }}>{label}</span>
      <input
        className="input"
        type="number"
        value={nilai}
        min={min}
        max={max}
        onChange={(e) => ubah(Number(e.target.value))}
        style={{ width: 110 }}
      />
    </label>
  );
}
