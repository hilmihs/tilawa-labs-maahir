'use client';

import { useMemo, useState, useTransition } from 'react';
import { HITS_LEVEL_LABEL } from '@/types/db';
import { MiniDistribution } from '@/components/ui/MiniDistribution';
import { resendKetuaLogin } from '@/app/hits/koordinator/actions';
import type { HitsRekapRow } from '@/lib/hits-rekap';

/** Sel kolom Ketua: nama + status login + tombol kirim-ulang pesan login. */
function KetuaCell({ row }: { row: HitsRekapRow }) {
  const [pending, start] = useTransition();
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!row.ketuaNama) {
    return <span style={{ color: 'var(--kuning-ink)' }}>belum ada</span>;
  }

  function resend() {
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set('ketua_kelas_id', row.ketuaKelasId ?? '');
      const res = await resendKetuaLogin(undefined, fd);
      if (res?.waUrl) setWaUrl(res.waUrl);
      else setErr(res?.error ?? 'Gagal.');
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <span style={{ fontWeight: 600 }}>{row.ketuaNama}</span>
      {row.ketuaLoggedIn ? (
        <span className="badge badge-hijau">aktif</span>
      ) : (
        <>
          <span className="badge badge-kuning">belum login</span>
          {row.ketuaKelasId && !waUrl && (
            <button type="button" className="btn btn-sm" onClick={resend} disabled={pending} style={{ height: 24, fontSize: 11, padding: '0 8px' }}>
              {pending ? '…' : 'Kirim-ulang login'}
            </button>
          )}
          {waUrl && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="badge badge-hijau" style={{ textDecoration: 'none' }}>
              Buka WA →
            </a>
          )}
          {err && <span className="t-tiny" style={{ color: 'var(--merah-ink)' }}>{err}</span>}
        </>
      )}
    </div>
  );
}

type SortKey = 'halaqah' | 'pengajar' | 'pctKbbs' | 'pctLatihan' | 'belumDiisi';

function pctBadge(pct: number | null): string {
  if (pct == null) return 'badge';
  if (pct >= 80) return 'badge badge-hijau';
  if (pct >= 50) return 'badge badge-kuning';
  return 'badge badge-merah';
}

/** Segmented pill control (pola /matrix/koordinator). */
function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex', background: 'var(--surface-3)', borderRadius: 999,
        padding: 3, gap: 2,
      }}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="btn btn-sm"
            style={{
              height: 30, borderRadius: 999, border: 'none', fontSize: 12,
              padding: '0 12px',
              background: on ? 'var(--accent)' : 'transparent',
              color: on ? '#fff' : 'var(--ink-2)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const STICKY_TH: React.CSSProperties = {
  position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface-2)',
};
const STICKY_TD: React.CSSProperties = {
  position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', fontWeight: 600,
};

export function HitsKoordinatorTable({ rows }: { rows: HitsRekapRow[] }) {
  const [q, setQ] = useState('');
  const [batch, setBatch] = useState('');
  const [level, setLevel] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('halaqah');
  const [asc, setAsc] = useState(true);

  const batches = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.batchId, r.batchName);
    return [...m.entries()];
  }, [rows]);

  const hasAnyData = useMemo(() => rows.some((r) => r.terisi > 0), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (batch && r.batchId !== batch) return false;
      if (level && r.level !== level) return false;
      if (needle) {
        const hay = `${r.halaqahName} ${r.pengajarNama ?? ''} ${r.ketuaNama ?? ''} ${r.batchName}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = asc ? 1 : -1;
    out.sort((a, b) => {
      const va = sortVal(a, sortKey);
      const vb = sortVal(b, sortKey);
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
    return out;
  }, [rows, q, batch, level, sortKey, asc]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(true);
    }
  }
  const arrow = (k: SortKey) => (k === sortKey ? (asc ? ' ▲' : ' ▼') : '');

  return (
    <div>
      <div
        className="card-flat"
        style={{
          padding: 12, marginBottom: 14, display: 'flex', gap: 12,
          flexWrap: 'wrap', alignItems: 'center',
        }}
      >
        <input
          className="input"
          placeholder="Cari halaqah / pengajar / ketua…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: '1 1 220px', height: 38 }}
        />
        <Segmented
          value={level}
          onChange={setLevel}
          options={[
            { value: '', label: 'Semua level' },
            { value: 'qoidah_nuroniyyah', label: 'QN' },
            { value: 'perbaikan_bacaan', label: 'PB' },
          ]}
        />
        {batches.length > 1 && (
          <select className="chip-select" value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="">Semua batch</option>
            {batches.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
      </div>

      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        {filtered.length} halaqah
        {!hasAnyData && ' · belum ada keterangan terisi — tag level di Validasi lalu ketua mulai mengisi'}
      </p>

      <div className="table-scroll">
        <table className="k-table tbl-cards" style={{ minWidth: 920 }}>
          <thead>
            <tr>
              <th onClick={() => toggleSort('halaqah')} style={{ ...STICKY_TH, cursor: 'pointer' }}>
                Halaqah{arrow('halaqah')}
              </th>
              <th>Batch / Level</th>
              <th onClick={() => toggleSort('pengajar')} style={{ cursor: 'pointer' }}>Pengajar{arrow('pengajar')}</th>
              <th>Ketua</th>
              <th onClick={() => toggleSort('belumDiisi')} style={{ cursor: 'pointer' }}>Belum diisi{arrow('belumDiisi')}</th>
              <th onClick={() => toggleSort('pctKbbs')} style={{ cursor: 'pointer' }}>%KBBS{arrow('pctKbbs')}</th>
              <th onClick={() => toggleSort('pctLatihan')} style={{ cursor: 'pointer' }}>%Latihan{arrow('pctLatihan')}</th>
              <th>Telat</th>
              <th>Hutang</th>
              <th style={{ minWidth: 120 }}>Rincian kondisi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const totalKondisi =
                r.kondisiCount.KBBS + r.kondisiCount.KMT + r.kondisiCount.JKG + r.kondisiCount.KBLA;
              return (
                <tr key={r.halaqahId}>
                  <td className="tbl-cardhead" style={STICKY_TD}>
                    <a href={`/hits/koordinator/halaqah/${r.halaqahId}`} style={{ color: 'var(--accent-2)', fontWeight: 600, textDecoration: 'none' }}>
                      {r.halaqahName}
                    </a>
                  </td>
                  <td className="t-tiny" data-label="Batch / Level">
                    {r.batchName}
                    <br />
                    <span style={{ color: r.level ? 'var(--muted-2)' : 'var(--kuning-ink)' }}>
                      {r.level ? HITS_LEVEL_LABEL[r.level] : '⚠ belum ditag'}
                    </span>
                  </td>
                  <td data-label="Pengajar">
                    {r.pengajarNama ?? '—'}
                    {!r.pengajarLinked && (
                      <span
                        className="badge badge-merah"
                        title="WA pengajar belum terhubung ke matrix"
                        style={{ marginLeft: 4 }}
                      >
                        !
                      </span>
                    )}
                  </td>
                  <td className="t-tiny" data-label="Ketua">
                    <KetuaCell row={r} />
                  </td>
                  <td data-label="Belum diisi">
                    {r.belumDiisi > 0 ? (
                      <span className="badge badge-merah">{r.belumDiisi}</span>
                    ) : (
                      <span className="badge badge-hijau">0</span>
                    )}
                    <span className="t-tiny" style={{ color: 'var(--muted-2)' }}> /{r.expected}</span>
                  </td>
                  <td data-label="%KBBS"><span className={pctBadge(r.pctKbbs)}>{r.pctKbbs == null ? '—' : `${r.pctKbbs}%`}</span></td>
                  <td data-label="%Latihan"><span className={pctBadge(r.pctLatihan)}>{r.pctLatihan == null ? '—' : `${r.pctLatihan}%`}</span></td>
                  <td data-label="Telat">{r.terlambat}</td>
                  <td data-label="Hutang">{r.hutangSaldo > 0 ? r.hutangSaldo : '—'}</td>
                  <td data-label="Rincian">
                    {totalKondisi === 0 ? (
                      <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>—</span>
                    ) : (
                      <MiniDistribution
                        showLegend={false}
                        height={7}
                        segments={[
                          { value: r.kondisiCount.KBBS, color: 'var(--hijau)', label: 'KBBS' },
                          { value: r.kondisiCount.KMT, color: 'var(--kuning)', label: 'KMT' },
                          { value: r.kondisiCount.JKG, color: 'var(--emas)', label: 'JKG' },
                          { value: r.kondisiCount.KBLA, color: 'var(--merah)', label: 'KBLA' },
                        ]}
                      />
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

function sortVal(r: HitsRekapRow, k: SortKey): string | number {
  switch (k) {
    case 'halaqah': return r.halaqahName;
    case 'pengajar': return r.pengajarNama ?? '';
    case 'pctKbbs': return r.pctKbbs ?? -1;
    case 'pctLatihan': return r.pctLatihan ?? -1;
    case 'belumDiisi': return r.belumDiisi;
  }
}
