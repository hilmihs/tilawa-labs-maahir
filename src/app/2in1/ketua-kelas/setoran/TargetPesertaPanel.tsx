'use client';

import { useState } from 'react';
import { simpanTargetPeserta, type TargetKetuaResult } from './target-actions';

export type TargetBaris = {
  anggotaId: string;
  name: string;
  /** Target yang berlaku hari ini; null = belum diatur. */
  nilai: number | null;
  /** true = angka itu dari default kelas, bukan setelan khusus peserta ini. */
  sumberDefault: boolean;
};

/**
 * Ketua kelas Takhassus Akhwat memasang target hafalan bulanan tiap pesertanya.
 * Disimpan per baris, bukan borongan: tiap simpan menerbitkan satu versi
 * bertanggal, jadi menyimpan sekaligus akan membuat belasan versi untuk angka
 * yang sebenarnya tak berubah.
 */
export function TargetPesertaPanel({
  kelasId,
  kelasName,
  baris,
  berlakuLabel,
}: {
  kelasId: string;
  kelasName: string;
  baris: TargetBaris[];
  berlakuLabel: string;
}) {
  const [hasil, setHasil] = useState<TargetKetuaResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function simpan(anggotaId: string, form: HTMLFormElement) {
    const fd = new FormData(form);
    fd.set('program_kelas_id', kelasId);
    fd.set('anggota_id', anggotaId);
    setBusy(anggotaId);
    setHasil(null);
    setHasil(await simpanTargetPeserta(undefined, fd));
    setBusy(null);
  }

  return (
    <div className="card-flat" style={{ padding: 12, marginBottom: 16 }}>
      <div className="t-small" style={{ fontWeight: 600, marginBottom: 2 }}>
        Target hafalan bulanan — {kelasName}
      </div>
      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        Halaman per bulan untuk tiap peserta. Laporan bulanan memakainya apa adanya — sakit dan
        libur tidak menguranginya — lalu menampilkan persentase capaiannya. Berlaku mulai{' '}
        {berlakuLabel} (periode berjalan) — bulan yang sudah lewat tak ikut berubah.
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

      {baris.map((b) => (
        <form
          key={b.anggotaId}
          onSubmit={(e) => {
            e.preventDefault();
            simpan(b.anggotaId, e.currentTarget);
          }}
          style={{
            display: 'flex', gap: 8, alignItems: 'center',
            padding: '6px 0', borderTop: '1px solid var(--surface-3)',
          }}
        >
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div className="t-small" style={{ fontWeight: b.sumberDefault || b.nilai === null ? 400 : 600 }}>
              {b.name}
            </div>
            <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
              {b.nilai === null
                ? 'belum diatur'
                : b.sumberDefault
                  ? `ikut default kelas (${b.nilai} hal/bln)`
                  : `${b.nilai} hal/bln`}
            </div>
          </div>
          <input
            type="text"
            inputMode="decimal"
            name="halaman_per_bulan"
            defaultValue={b.nilai ?? ''}
            placeholder="hal/bln"
            className="input"
            style={{ height: 32, width: 92, flexShrink: 0 }}
            required
          />
          <button
            type="submit"
            className="btn btn-xs btn-ghost"
            style={{ flexShrink: 0 }}
            disabled={busy !== null}
          >
            {busy === b.anggotaId ? '…' : 'Simpan'}
          </button>
        </form>
      ))}
    </div>
  );
}
