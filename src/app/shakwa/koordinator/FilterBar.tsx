'use client';

import { useState } from 'react';
import Link from 'next/link';
import { mergeQuery, type ShakwaQuery } from './ui-helpers';

/** Mundur `hari` hari dari tanggal ISO (YYYY-MM-DD) — murni, tanpa Date.now. */
function mundurHari(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - hari);
  return d.toISOString().slice(0, 10);
}

/** Label manusiawi untuk nilai status. */
const STATUS_LABEL_FILTER: Record<string, string> = {
  submitted: 'Baru',
  in_review: 'Diproses',
  resolved: 'Selesai',
  closed: 'Ditutup',
};

type DateMode = 'hari' | 'rentang';

/**
 * Penyaring rekap Shakwa. Form GET supaya hasilnya bisa di-bookmark.
 * Toggle mode tanggal merender HANYA input mode aktif, jadi param mode non-aktif
 * (mis. `dari`/`sampai` saat mode 'hari') tak ikut ter-submit.
 */
export function FilterBar({
  current,
  hariIni,
  kategoriOptions,
}: {
  current: ShakwaQuery;
  hariIni: string;
  kategoriOptions: Array<{ value: string; label: string }>;
}) {
  const [mode, setMode] = useState<DateMode>(current.dari || current.sampai ? 'rentang' : 'hari');

  const kategoriLabel = (val: string) => kategoriOptions.find((k) => k.value === val)?.label ?? val;

  // Chip filter aktif — dikumpulkan agar barisnya bisa disembunyikan bila kosong.
  const chips: Array<{ key: string; text: string; href: string }> = [];
  if (current.kategori) {
    chips.push({
      key: 'kategori',
      text: `Kategori: ${kategoriLabel(current.kategori)}`,
      href: mergeQuery(current, { kategori: null }),
    });
  }
  if (current.status) {
    chips.push({
      key: 'status',
      text: `Status: ${STATUS_LABEL_FILTER[current.status] ?? current.status}`,
      href: mergeQuery(current, { status: null }),
    });
  }
  if (current.dari || current.sampai) {
    chips.push({
      key: 'tanggal',
      text: `Rentang: ${current.dari ?? '…'} → ${current.sampai ?? '…'}`,
      href: mergeQuery(current, { tanggal: null, dari: null, sampai: null }),
    });
  } else if (current.tanggal) {
    chips.push({
      key: 'tanggal',
      text: `Tanggal: ${current.tanggal}`,
      href: mergeQuery(current, { tanggal: null, dari: null, sampai: null }),
    });
  }

  return (
    <>
      {/* Penyaring — form GET biasa supaya hasilnya bisa ditandai/di-bookmark. */}
      <form
        method="get"
        className="card-flat"
        style={{ padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        <div>
          <span className="t-tiny" style={{ display: 'block', color: 'var(--muted-2)' }}>
            Mode tanggal
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={() => setMode('hari')}
              className={`btn btn-sm ${mode === 'hari' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 32 }}
            >
              Satu hari
            </button>
            <button
              type="button"
              onClick={() => setMode('rentang')}
              className={`btn btn-sm ${mode === 'rentang' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 32 }}
            >
              Rentang
            </button>
          </div>
        </div>

        {mode === 'hari' ? (
          <div>
            <label className="t-tiny" htmlFor="f-tanggal" style={{ display: 'block', color: 'var(--muted-2)' }}>
              Tanggal
            </label>
            <input
              id="f-tanggal"
              type="date"
              name="tanggal"
              defaultValue={current.tanggal ?? hariIni}
              className="input"
              style={{ height: 32 }}
            />
          </div>
        ) : (
          <>
            <div>
              <label className="t-tiny" htmlFor="f-dari" style={{ display: 'block', color: 'var(--muted-2)' }}>
                Rentang dari
              </label>
              <input
                id="f-dari"
                type="date"
                name="dari"
                defaultValue={current.dari ?? ''}
                className="input"
                style={{ height: 32 }}
              />
            </div>
            <div>
              <label className="t-tiny" htmlFor="f-sampai" style={{ display: 'block', color: 'var(--muted-2)' }}>
                sampai
              </label>
              <input
                id="f-sampai"
                type="date"
                name="sampai"
                defaultValue={current.sampai ?? ''}
                className="input"
                style={{ height: 32 }}
              />
            </div>
          </>
        )}

        <div>
          <label className="t-tiny" htmlFor="f-kategori" style={{ display: 'block', color: 'var(--muted-2)' }}>
            Kategori
          </label>
          <select id="f-kategori" name="kategori" defaultValue={current.kategori ?? ''} className="input" style={{ height: 32 }}>
            <option value="">Semua</option>
            {kategoriOptions.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="t-tiny" htmlFor="f-status" style={{ display: 'block', color: 'var(--muted-2)' }}>
            Status
          </label>
          <select id="f-status" name="status" defaultValue={current.status ?? ''} className="input" style={{ height: 32 }}>
            <option value="">Semua</option>
            <option value="submitted">Baru</option>
            <option value="in_review">Diproses</option>
            <option value="resolved">Selesai</option>
          </select>
        </div>
        {/* Dropdown gender dibuang: halaman kini terkunci ke gender koordinator,
            jadi kendali ini hanya akan berbohong — dipilih, tak berpengaruh. */}
        <button type="submit" className="btn btn-sm btn-primary" style={{ height: 32 }}>
          Terapkan
        </button>
        <Link href="/shakwa/koordinator" className="t-tiny" style={{ color: 'var(--muted-2)', alignSelf: 'center' }}>
          Reset
        </Link>
      </form>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <Link href={`?tanggal=${hariIni}`} className="chip-select">
          Hari ini
        </Link>
        <Link href={`?dari=${mundurHari(hariIni, 6)}&sampai=${hariIni}`} className="chip-select">
          7 hari terakhir
        </Link>
        <Link href={`?dari=2020-01-01&sampai=${hariIni}&status=submitted`} className="chip-select">
          Belum ditangani (semua)
        </Link>
      </div>

      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {chips.map((c) => (
            <span
              key={c.key}
              className="badge"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {c.text}
              <Link
                href={c.href}
                aria-label={`Hapus filter ${c.text}`}
                style={{ color: 'var(--muted-2)', textDecoration: 'none', lineHeight: 1 }}
              >
                ✕
              </Link>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
