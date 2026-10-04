'use client';

import { useState, useMemo, useTransition } from 'react';
import { setPertemuanOverride, clearPertemuanOverride } from './actions';

export type OverrideRow = {
  pertemuanNo: number;
  level: string;
  levelLabel: string;
  baseDate: string | null;
  baseHari: string | null;
  overrideDate: string | null;
  isSkipped: boolean;
  note: string | null;
};

export type HalaqahOverrideData = {
  halaqahId: string;
  name: string;
  batchId: string;
  batchName: string;
  levelTagged: boolean;
  jadwalRaw: string | null;
  rows: OverrideRow[];
};

function RowForm({ halaqahId, row }: { halaqahId: string; row: OverrideRow }) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(row.overrideDate ?? '');
  const [skip, setSkip] = useState(row.isSkipped);
  const [msg, setMsg] = useState<string | null>(null);

  const hasOverride = row.overrideDate != null || row.isSkipped;
  const effective = skip ? '— (skip)' : date || row.baseDate || '—';

  function save() {
    setMsg(null);
    const fd = new FormData();
    fd.set('halaqah_id', halaqahId);
    fd.set('level', row.level);
    fd.set('pertemuan_no', String(row.pertemuanNo));
    fd.set('tanggal', skip ? '' : date);
    fd.set('is_skipped', String(skip));
    startTransition(async () => {
      const res = await setPertemuanOverride(undefined, fd);
      setMsg(res?.error ?? 'Tersimpan');
    });
  }

  function clear() {
    setMsg(null);
    const fd = new FormData();
    fd.set('halaqah_id', halaqahId);
    fd.set('level', row.level);
    fd.set('pertemuan_no', String(row.pertemuanNo));
    startTransition(async () => {
      const res = await clearPertemuanOverride(undefined, fd);
      if (res?.error) { setMsg(res.error); return; }
      setDate('');
      setSkip(false);
      setMsg('Override dihapus');
    });
  }

  return (
    <tr>
      <td className="nm">{row.pertemuanNo}<div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{row.levelLabel}</div></td>
      <td className="t-small">{row.baseDate ? `${row.baseHari} ${row.baseDate}` : '— (manual)'}</td>
      <td>
        <input
          type="date" value={date} disabled={skip || pending}
          onChange={(e) => setDate(e.target.value)} className="input" style={{ width: 150 }}
        />
      </td>
      <td>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={skip} disabled={pending} onChange={(e) => setSkip(e.target.checked)} />
          <span className="t-small">Skip</span>
        </label>
      </td>
      <td className="t-small" style={{ color: 'var(--muted-2)' }}>{effective}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="act-btn" onClick={save} disabled={pending}>Simpan</button>
        {hasOverride && (
          <button className="act-btn" onClick={clear} disabled={pending} style={{ marginLeft: 6 }}>Reset</button>
        )}
        {msg && <span className="t-small" style={{ marginLeft: 8, color: 'var(--muted-2)' }}>{msg}</span>}
      </td>
    </tr>
  );
}

export function PertemuanOverrideClient({
  data,
  batches,
}: {
  data: HalaqahOverrideData[];
  batches: { id: string; name: string }[];
}) {
  const [batchId, setBatchId] = useState<string>('');
  const [halaqahId, setHalaqahId] = useState<string>('');

  const filtered = useMemo(
    () => (batchId ? data.filter((d) => d.batchId === batchId) : data),
    [data, batchId]
  );
  const selected = useMemo(
    () => filtered.find((d) => d.halaqahId === halaqahId) ?? filtered[0] ?? null,
    [filtered, halaqahId]
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {batches.length > 1 && (
          <select
            className="input" value={batchId}
            onChange={(e) => { setBatchId(e.target.value); setHalaqahId(''); }}
            style={{ minWidth: 200 }}
          >
            <option value="">Semua batch</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <select
          className="input" value={selected?.halaqahId ?? ''}
          onChange={(e) => setHalaqahId(e.target.value)} style={{ minWidth: 260 }}
        >
          {filtered.map((d) => (
            <option key={d.halaqahId} value={d.halaqahId}>{d.name}</option>
          ))}
        </select>
      </div>

      {!selected ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada halaqah.</p>
      ) : !selected.levelTagged ? (
        <p className="t-small" style={{ color: 'var(--kuning-ink)' }}>
          Halaqah <strong>{selected.name}</strong> belum ditag level — jadwal pertemuan belum bisa
          dihitung. Tag level dulu di Validasi & Sumber Data.
        </p>
      ) : (
        <div className="card-flat" style={{ overflow: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
            <p className="t-body" style={{ fontWeight: 600 }}>{selected.name}</p>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              {selected.batchName}{selected.jadwalRaw ? ` · ${selected.jadwalRaw}` : ''}
            </p>
          </div>
          <table className="k-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Pertemuan</th>
                <th>Tanggal otomatis</th>
                <th>Override tanggal</th>
                <th>Skip</th>
                <th>Efektif</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {selected.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                    Belum ada pertemuan terderivasi (cek kaldik & jadwal).
                  </td>
                </tr>
              ) : (
                selected.rows.map((r) => (
                  <RowForm key={`${r.level}-${r.pertemuanNo}`} halaqahId={selected.halaqahId} row={r} />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
