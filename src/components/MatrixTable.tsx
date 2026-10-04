'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  INDIKATOR,
  INDIKATOR_BY_KATEGORI,
  KATEGORI_STANDAR,
  scoreColor,
  type IndikatorKey,
  type Kategori,
} from '@/lib/matrix-indicators';

export type MatrixTableRow = {
  id: string;
  name: string;
  kelompokName: string;
  active: boolean;
  ranking: number | null;
  scores: Partial<Record<IndikatorKey, number | null>>;
  hard: number | null;
  pedagogis: number | null;
  soft: number | null;
  keseluruhan: number | null;
  teguranBulan: number;
  teguranKum: number;
  risk: { level: string; score: number; label: string; color: string } | null;
  finalized: boolean | null;
  hasMatrix: boolean;
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

const KAT_ORDER: Kategori[] = ['hard', 'inspeksi', 'soft'];
const KAT_SHORT: Record<Kategori, string> = { hard: 'Hard Skill', inspeksi: 'Inspeksi', soft: 'Soft Skill' };
const KAT_ACCENT: Record<Kategori, string> = {
  hard: 'var(--accent)',
  inspeksi: 'oklch(0.58 0.12 280)',
  soft: 'oklch(0.62 0.11 25)',
};

function medal(rank: number | null): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export function MatrixTable({ rows, month, gender }: { rows: MatrixTableRow[]; month: string; gender: string }) {
  const [detail, setDetail] = useState(false);
  const detailHref = (id: string) => `/matrix/koordinator/pengajar/${id}?bulan=${month}&gender=${gender}`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setDetail((d) => !d)}
          className={`btn btn-sm ${detail ? 'btn-accent' : 'btn-ghost'}`}
          style={{ height: 34 }}
        >
          {detail ? 'Tampilan ringkas' : 'Rincian 14 indikator'}
        </button>
      </div>

      <div className="card-flat" style={{ padding: 0, overflowX: 'auto', borderRadius: 'var(--r-lg)' }}>
        <table className="matrix-grid tbl-cards" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, minWidth: detail ? 1180 : 820 }}>
          <thead>
            {detail && (
              <tr>
                <th className="mg-sticky mg-head" style={{ left: 0, zIndex: 4 }} />
                <th className="mg-head" />
                {KAT_ORDER.map((k) => (
                  <th
                    key={k}
                    colSpan={INDIKATOR_BY_KATEGORI[k].length}
                    className="mg-head"
                    style={{ textAlign: 'center', color: KAT_ACCENT[k], borderBottom: `2px solid ${KAT_ACCENT[k]}`, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 11 }}
                  >
                    {KAT_SHORT[k]}
                  </th>
                ))}
                <th className="mg-head" />
                <th className="mg-head" />
                <th className="mg-head" />
              </tr>
            )}
            <tr>
              <th className="mg-sticky mg-head" style={{ left: 0, zIndex: 4, textAlign: 'left' }}>Pengajar</th>
              <th className="mg-head" style={{ textAlign: 'left' }}>Kelompok</th>
              {detail
                ? INDIKATOR.map((ind) => (
                    <th key={ind.key} className="mg-head mg-num" title={`${ind.label} · standar ${ind.standar}`}>
                      {ind.short}
                    </th>
                  ))
                : (
                  <>
                    <th className="mg-head mg-num">Hard</th>
                    <th className="mg-head mg-num">Pedagogis</th>
                    <th className="mg-head mg-num">Soft</th>
                  </>
                )}
              <th className="mg-head mg-num" style={{ fontWeight: 700 }}>Rata²</th>
              <th className="mg-head mg-num">Teguran</th>
              <th className="mg-head" style={{ textAlign: 'center' }}>Risk</th>
              <th className="mg-head" style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const flagged = r.teguranKum >= 3;
              const md = medal(r.ranking);
              return (
                <tr key={r.id} className="mg-row" style={{ background: flagged ? 'var(--merah-tint)' : undefined }}>
                  <td className="mg-sticky mg-name tbl-cardhead" style={{ left: 0, background: flagged ? 'var(--merah-tint)' : 'var(--surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span className="mg-rank">{md ?? (r.ranking ?? '—')}</span>
                      <Link href={detailHref(r.id)} className="mg-link">{r.name}</Link>
                      {!r.active && <span className="badge badge-merah" style={{ fontSize: 9, height: 18 }}>Nonaktif</span>}
                    </div>
                  </td>
                  <td className="mg-kelompok" data-label="Kelompok">{r.kelompokName}</td>
                  {detail
                    ? INDIKATOR.map((ind) => {
                        const v = r.scores[ind.key];
                        return (
                          <td key={ind.key} className="mg-num" data-label={ind.short} style={{ color: scoreColor(v ?? null, ind.standar) }}>
                            {v === null || v === undefined ? '—' : v}
                          </td>
                        );
                      })
                    : (
                      <>
                        <td className="mg-num" data-label="Hard" style={{ color: scoreColor(r.hard, KATEGORI_STANDAR.hard) }}>{fmt(r.hard)}</td>
                        <td className="mg-num" data-label="Inspeksi" style={{ color: scoreColor(r.pedagogis, KATEGORI_STANDAR.inspeksi) }}>{fmt(r.pedagogis)}</td>
                        <td className="mg-num" data-label="Soft" style={{ color: scoreColor(r.soft, KATEGORI_STANDAR.soft) }}>{fmt(r.soft)}</td>
                      </>
                    )}
                  <td className="mg-num" data-label="Rata²" style={{ fontWeight: 700, color: scoreColor(r.keseluruhan, 3.5) }}>{fmt(r.keseluruhan)}</td>
                  <td className="mg-num" data-label="Teguran" style={{ color: flagged ? 'var(--merah-ink)' : 'var(--muted)', fontWeight: flagged ? 700 : 400 }}>
                    {r.teguranBulan}/{r.teguranKum}
                  </td>
                  <td data-label="Risk" style={{ textAlign: 'center', padding: '8px' }}>
                    {r.risk ? (
                      <span className="badge" style={{ background: 'transparent', borderColor: r.risk.color, color: r.risk.color, fontSize: 11 }} title={`Score ${r.risk.score}/100`}>
                        {r.risk.label} {r.risk.score}
                      </span>
                    ) : <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>—</span>}
                  </td>
                  <td data-label="Status" style={{ textAlign: 'center', padding: '8px' }}>
                    {r.finalized ? (
                      <span className="badge badge-hijau"><span className="dot" />Final</span>
                    ) : r.hasMatrix ? (
                      <span className="badge badge-kuning"><span className="dot" />Draft</span>
                    ) : (
                      <span className="badge badge-neutral"><span className="dot" />Belum</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
