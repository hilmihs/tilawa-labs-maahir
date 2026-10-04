'use client';

import { useState } from 'react';
import {
  INDIKATOR_BY_KATEGORI,
  KATEGORI_LABEL,
  type Kategori,
} from '@/lib/matrix-indicators';
import type { MatrixTableRow } from '@/components/MatrixTable';

const KAT_ORDER: Kategori[] = ['hard', 'inspeksi', 'soft'];
const KAT_ACCENT: Record<Kategori, string> = {
  hard: 'var(--accent)',
  inspeksi: 'oklch(0.58 0.12 280)',
  soft: 'oklch(0.62 0.11 25)',
};

const C_LENGKAP = 'var(--hijau-ink)';
const C_SEBAGIAN = 'var(--kuning-ink, oklch(0.78 0.14 85))';
const C_KOSONG = 'var(--surface-3)';

type Seg = { n: number; color: string };

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Bar proporsi generik dari beberapa segmen berwarna. */
function Bar({ segs }: { segs: Seg[] }) {
  const total = segs.reduce((s, x) => s + x.n, 0) || 1;
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-3)' }}>
      {segs.map((s, i) =>
        s.n > 0 ? <span key={i} style={{ width: `${(s.n / total) * 100}%`, background: s.color, display: 'block' }} /> : null
      )}
    </div>
  );
}

/**
 * Rekap KELENGKAPAN pengisian data (bukan skor vs standar):
 * - Per aspek: berapa pengajar yang datanya LENGKAP (semua indikator terisi),
 *   SEBAGIAN (ada yang terisi tapi belum semua), atau KOSONG (belum diisi apa pun).
 * - Per indikator: berapa yang sudah terisi vs belum, dari total pengajar.
 */
export function MatrixRekapAspek({ rows }: { rows: MatrixTableRow[] }) {
  const [open, setOpen] = useState(true);
  const total = rows.length;

  return (
    <div className="card-flat" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 className="t-h3" style={{ marginBottom: 2 }}>Rekap Kelengkapan Data</h2>
          <p className="t-tiny" style={{ color: 'var(--muted)' }}>
            {total} pengajar · <span style={{ color: C_LENGKAP, fontWeight: 700 }}>hijau</span> lengkap ·{' '}
            <span style={{ color: C_SEBAGIAN, fontWeight: 700 }}>kuning</span> sebagian · abu belum diisi
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ height: 32 }} onClick={() => setOpen((o) => !o)}>
          {open ? 'Sembunyikan indikator' : 'Rincian indikator'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {KAT_ORDER.map((kat) => {
          const indikator = INDIKATOR_BY_KATEGORI[kat];
          const nInd = indikator.length;

          // Kelengkapan per pengajar untuk aspek ini.
          let lengkap = 0;
          let sebagian = 0;
          let kosong = 0;
          for (const r of rows) {
            const filled = indikator.filter((ind) => {
              const v = r.scores[ind.key];
              return v !== null && v !== undefined;
            }).length;
            if (filled === nInd) lengkap++;
            else if (filled === 0) kosong++;
            else sebagian++;
          }

          return (
            <div key={kat} style={{ borderLeft: `3px solid ${KAT_ACCENT[kat]}`, paddingLeft: 12 }}>
              {/* Header aspek */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span className="t-small" style={{ fontWeight: 600 }}>{KATEGORI_LABEL[kat]}</span>
                <span className="t-tiny t-mono" style={{ color: 'var(--muted)' }}>
                  <span style={{ color: C_LENGKAP, fontWeight: 700 }}>{lengkap}</span>
                  /{total} lengkap · {pct(lengkap, total)}%
                </span>
              </div>
              <Bar segs={[{ n: lengkap, color: C_LENGKAP }, { n: sebagian, color: C_SEBAGIAN }, { n: kosong, color: C_KOSONG }]} />
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
                {sebagian} sebagian · {kosong} belum diisi · {nInd} indikator/pengajar
              </p>

              {/* Rincian indikator: sudah terisi vs belum, dari total pengajar */}
              {open && (
                <div style={{ display: 'grid', gap: 8, marginTop: 10, paddingLeft: 4 }}>
                  {indikator.map((ind) => {
                    const sudah = rows.filter((r) => {
                      const v = r.scores[ind.key];
                      return v !== null && v !== undefined;
                    }).length;
                    const belum = total - sudah;
                    return (
                      <div key={ind.key} style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                            <span className="t-tiny">{ind.label}</span>
                            <span className="t-tiny t-mono" style={{ color: 'var(--muted)' }}>
                              <span style={{ color: C_LENGKAP, fontWeight: 700 }} title="sudah terisi">{sudah}</span>
                              {belum > 0 && <span style={{ color: 'var(--muted-2)' }} title="belum terisi"> · {belum} belum</span>}
                            </span>
                          </div>
                          <div style={{ marginTop: 3 }}>
                            <Bar segs={[{ n: sudah, color: C_LENGKAP }, { n: belum, color: C_KOSONG }]} />
                          </div>
                        </div>
                        <div className="t-tiny t-mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                          {sudah}/{total} terisi
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
