'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Initials, Icon } from '@/components/icons';
import type { NilaiRekaman } from '@/types/db';

export type MonitoringRow = {
  id: string;
  name: string;
  gender: string;
  kelasName: string;
  musyrifName: string;
  statusKey: 'belum' | 'menunggu' | 'selesai';
  nilai: NilaiRekaman[];
  submittedAt: string | null;
  pesertaHref: string;
  actionUrl: string | null;
  actionLabel: string | null;
  actionWarn: boolean;
};

type SortKey = 'name' | 'kelas' | 'musyrif' | 'nilai';

const NILAI_SKOR: Record<string, number> = { hijau: 4, kuning: 2, merah: 0 };

function nilaiSortVal(r: MonitoringRow): number {
  if (r.statusKey === 'selesai') {
    const avg = r.nilai.length
      ? r.nilai.reduce((a, n) => a + (NILAI_SKOR[n] ?? 0), 0) / r.nilai.length
      : 0;
    return 20 + avg;
  }
  if (r.statusKey === 'menunggu') return 10;
  return 0;
}

export function MonitoringTable({ rows, total }: { rows: MonitoringRow[]; total: number }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);

  function toggle(k: SortKey) {
    if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(1); }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      let c = 0;
      if (sortKey === 'name') c = a.name.localeCompare(b.name, 'id');
      else if (sortKey === 'kelas') c = a.kelasName.localeCompare(b.kelasName, 'id');
      else if (sortKey === 'musyrif') c = a.musyrifName.localeCompare(b.musyrifName, 'id');
      else if (sortKey === 'nilai') c = nilaiSortVal(a) - nilaiSortVal(b);
      return c * dir;
    });
    return arr;
  }, [rows, sortKey, dir]);

  return (
    <>
      <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="k-table">
            <thead>
              <tr>
                <SortTh label="Peserta" k="name" sortKey={sortKey} dir={dir} onClick={toggle} style={{ width: '26%' }} />
                <SortTh label="Kelas" k="kelas" sortKey={sortKey} dir={dir} onClick={toggle} style={{ width: '12%' }} />
                <SortTh label="Musyrif/Musyrifah" k="musyrif" sortKey={sortKey} dir={dir} onClick={toggle} style={{ width: '18%' }} />
                <th style={{ width: '14%' }}>Status</th>
                <SortTh label="Nilai" k="nilai" sortKey={sortKey} dir={dir} onClick={toggle} style={{ width: '12%' }} />
                <th style={{ width: '18%' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                    Tidak ada peserta sesuai filter.
                  </td>
                </tr>
              )}
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                        <Initials name={r.name} />
                      </div>
                      <div>
                        <Link href={r.pesertaHref} className="nm" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dashed var(--line-2)' }}>
                          {r.name}
                        </Link>
                        <div className="sub">{r.gender}</div>
                      </div>
                    </div>
                  </td>
                  <td>Kelas {r.kelasName || '-'}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{r.musyrifName || '—'}</td>
                  <td>
                    <StatusBadge status={r.statusKey} />
                    {r.submittedAt && r.statusKey !== 'belum' && <div className="sub">{r.submittedAt}</div>}
                  </td>
                  <td>
                    {r.statusKey === 'selesai' && r.nilai.length > 0 ? (
                      <span className="nilai-trio">
                        {r.nilai.slice(0, 3).map((n, i) => <span key={i} className={`d ${n}`} />)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--muted-2)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {r.actionUrl ? (
                      <a href={r.actionUrl} target="_blank" rel="noopener" className={`act-btn wa${r.actionWarn ? ' warn' : ''}`}>
                        {Icon.wa(11)} {r.actionLabel}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="t-small">Menampilkan {sorted.length} dari {total} peserta</div>
    </>
  );
}

function SortTh({
  label, k, sortKey, dir, onClick, style,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey | null;
  dir: 1 | -1;
  onClick: (k: SortKey) => void;
  style?: React.CSSProperties;
}) {
  const active = sortKey === k;
  return (
    <th style={{ ...style, cursor: 'pointer', userSelect: 'none' }} onClick={() => onClick(k)} aria-sort={active ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label} <span style={{ color: active ? 'var(--accent-2)' : 'var(--muted-2)', fontSize: 10 }}>{active ? (dir === 1 ? '▲' : '▼') : '↕'}</span>
    </th>
  );
}

function StatusBadge({ status }: { status: 'belum' | 'menunggu' | 'selesai' }) {
  if (status === 'selesai') return <span className="badge badge-hijau"><span className="dot" />selesai</span>;
  if (status === 'menunggu') return <span className="badge badge-kuning"><span className="dot" />menunggu cek</span>;
  return <span className="badge badge-merah"><span className="dot" />belum setor</span>;
}
