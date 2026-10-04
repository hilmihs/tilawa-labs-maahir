'use client';

import { useState } from 'react';
import { simpanTargetSaya, type TargetResult } from './actions';

/**
 * Peserta Takhassus Ikhwan memasang target hafalan bulanannya sendiri.
 * Tanggal berlakunya tak bisa dipilih — server mengunci ke awal periode
 * berjalan, jadi di sini ia hanya ditampilkan.
 */
export function TargetSayaForm({
  nilai,
  berlakuLabel,
  sumberDefault,
}: {
  /** Target yang berlaku sekarang; null = belum pernah diatur. */
  nilai: number | null;
  berlakuLabel: string;
  /** true = angka yang tampil berasal dari default kelas, bukan setelan sendiri. */
  sumberDefault: boolean;
}) {
  const [hasil, setHasil] = useState<TargetResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setHasil(null);
    setHasil(await simpanTargetSaya(undefined, new FormData(e.currentTarget)));
    setBusy(false);
  }

  return (
    <div className="card-flat" style={{ padding: 12, marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Target hafalan saya</div>
      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        {nilai === null
          ? 'Belum diatur — laporan bulanan belum bisa menghitung capaian Anda.'
          : sumberDefault
            ? `Sekarang mengikuti target kelas: ${nilai} halaman/bulan.`
            : `Sekarang ${nilai} halaman/bulan.`}{' '}
        Laporan memakai angka ini apa adanya — sakit dan libur tidak menguranginya.
      </p>

      {hasil?.error && (
        <div className="banner banner-error" style={{ marginBottom: 8 }}>
          <div className="desc">{hasil.error}</div>
        </div>
      )}
      {hasil?.ok && (
        <div className="banner banner-success" style={{ marginBottom: 8 }}>
          <div className="desc">Target tersimpan.</div>
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 auto' }}>
          <label className="t-tiny" htmlFor="target_saya" style={{ display: 'block', marginBottom: 2 }}>
            Halaman per bulan
          </label>
          <input
            id="target_saya"
            type="text"
            inputMode="decimal"
            name="halaman_per_bulan"
            defaultValue={nilai ?? ''}
            placeholder="mis. 80 atau 32"
            className="input"
            style={{ height: 36, width: '100%' }}
            required
          />
        </div>
        <button type="submit" className="btn btn-sm btn-primary" style={{ height: 36 }} disabled={busy}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
      </form>

      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
        Berlaku mulai {berlakuLabel} (periode berjalan). Bulan yang sudah lewat tak ikut berubah —
        hubungi koordinator bila perlu diperbaiki.
      </p>
    </div>
  );
}
