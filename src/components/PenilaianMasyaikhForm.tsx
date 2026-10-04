'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { ScoreSelector } from '@/components/ScoreSelector';
import {
  RUBRIK_BACAAN,
  CATATAN_BACAAN,
  KRITERIA_BACAAN,
  type RubrikSkala,
} from '@/lib/penilaian-rubrik';

type PenilaianRow = {
  skor_bacaan: number | null;
  keterangan_bacaan: string | null;
  assessor_role: string | null;
};

type PengajarItem = {
  id: string;
  name: string;
  gender: 'ikhwan' | 'akhwat';
  kelompokLabel: string | null;
  is_ketua: boolean;
  penilaian: PenilaianRow | null;
};

type RowState = {
  skor_bacaan: number | null;
  keterangan_bacaan: string;
  status: 'idle' | 'saving' | 'saved' | 'error';
  error?: string;
};

export function PenilaianMasyaikhForm({
  pengajarList,
  yearMonth,
  title,
  defaultCollapsed = false,
}: {
  pengajarList: PengajarItem[];
  yearMonth: string;
  /** Section title, e.g. "Ikhwan" / "Akhwat" */
  title?: string;
  defaultCollapsed?: boolean;
}) {
  const initialRows = (): Record<string, RowState> => {
    const out: Record<string, RowState> = {};
    for (const p of pengajarList) {
      out[p.id] = {
        skor_bacaan: p.penilaian?.skor_bacaan ?? null,
        keterangan_bacaan: p.penilaian?.keterangan_bacaan ?? '',
        status: p.penilaian ? 'saved' : 'idle',
      };
    }
    return out;
  };

  const [rows, setRows] = useState<Record<string, RowState>>(initialRows);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const save = useCallback(async (pengajarId: string, state: RowState) => {
    setRows((prev) => ({ ...prev, [pengajarId]: { ...prev[pengajarId], status: 'saving' } }));
    try {
      const res = await fetch('/api/penilaian-masyaikh/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pengajar_id: pengajarId,
          year_month: yearMonth,
          skor_bacaan: state.skor_bacaan,
          keterangan_bacaan: state.keterangan_bacaan || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal simpan');
      setRows((prev) => ({ ...prev, [pengajarId]: { ...prev[pengajarId], status: 'saved', error: undefined } }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal simpan';
      setRows((prev) => ({ ...prev, [pengajarId]: { ...prev[pengajarId], status: 'error', error: msg } }));
    }
  }, [yearMonth]);

  function scheduleAutoSave(pengajarId: string, newState: RowState) {
    if (debounceRefs.current[pengajarId]) clearTimeout(debounceRefs.current[pengajarId]);
    debounceRefs.current[pengajarId] = setTimeout(() => {
      save(pengajarId, newState);
    }, 800);
  }

  function updateRow(pengajarId: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const next = { ...prev[pengajarId], ...patch, status: 'idle' as const };
      scheduleAutoSave(pengajarId, next);
      return { ...prev, [pengajarId]: next };
    });
  }

  function toggleNote(pengajarId: string) {
    setOpenNotes((p) => ({ ...p, [pengajarId]: !p[pengajarId] }));
  }

  // Realtime progress per kategori
  const progress = useMemo(() => {
    let bacaan = 0;
    for (const p of pengajarList) {
      const r = rows[p.id];
      if (r?.skor_bacaan !== null && r?.skor_bacaan !== undefined) bacaan++;
    }
    return { bacaan, total: pengajarList.length };
  }, [rows, pengajarList]);

  // Tooltip per pill (skala -> teks rubrik)
  const titleBacaan = useMemo(() => RUBRIK_BACAAN.map((r) => `${r.skala}: ${r.teks}`), []);

  if (pengajarList.length === 0) return null;

  return (
    <div className="pen-sec">
      <button
        type="button"
        className={`pen-sec-head${collapsed ? ' collapsed' : ''}`}
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className="ttl">{title}</span>
        <span className={`prog-pill${progress.bacaan === progress.total ? ' done' : ''}`}>
          Bacaan {progress.bacaan}/{progress.total}
        </span>
        <span className="caret">▼</span>
      </button>

      {!collapsed && (
        <>
          <PanduanStandar />
          <div className="card-flat table-scroll" style={{ marginTop: 8 }}>
            <table className="pen-table">
              <thead>
                <tr>
                  <th className="name-col">Nama</th>
                  <th>Bacaan (0–4)</th>
                  <th style={{ width: 36 }} aria-label="Catatan" />
                  <th style={{ width: 22 }} aria-label="Status" />
                </tr>
              </thead>
              <tbody>
                {pengajarList.map((p) => {
                  const row = rows[p.id];
                  const noteOpen = !!openNotes[p.id];
                  const hasNote = !!row.keterangan_bacaan;
                  return (
                    <FragmentRow key={p.id}>
                      <tr className="pen-row">
                        <td className="name-col">
                          <div className="pen-name">
                            {p.name}
                            {p.is_ketua && <span className="ketua-badge">Ketua</span>}
                          </div>
                          {p.kelompokLabel && <div className="pen-sub">{p.kelompokLabel}</div>}
                        </td>
                        <td>
                          <ScoreSelector
                            label={`Bacaan ${p.name}`}
                            value={row.skor_bacaan}
                            onChange={(v) => updateRow(p.id, { skor_bacaan: v })}
                            titles={titleBacaan}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className={`note-btn${hasNote ? ' filled' : ''}`}
                            onClick={() => toggleNote(p.id)}
                            aria-label={noteOpen ? 'Tutup catatan' : 'Catatan'}
                            aria-expanded={noteOpen}
                            title="Catatan"
                          >
                            ✎{hasNote && <span className="ndot" />}
                          </button>
                        </td>
                        <td className="pen-status">
                          {row.status === 'saving' && <span className="spin" style={{ color: 'var(--muted-2)', display: 'inline-block' }}>⟳</span>}
                          {row.status === 'saved' && <span style={{ color: 'var(--hijau-ink)' }}>✓</span>}
                          {row.status === 'error' && (
                            <span title={row.error} style={{ color: 'var(--merah-ink)', cursor: 'help' }}>✗</span>
                          )}
                        </td>
                      </tr>
                      {noteOpen && (
                        <tr className="note-row">
                          <td className="name-col" />
                          <td>
                            <input
                              type="text"
                              className="note-field"
                              placeholder="Catatan bacaan…"
                              value={row.keterangan_bacaan}
                              onChange={(e) => updateRow(p.id, { keterangan_bacaan: e.target.value })}
                            />
                          </td>
                          <td colSpan={2} />
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function PanduanStandar() {
  return (
    <details className="rubrik-panduan card-flat" style={{ marginTop: 8, padding: '10px 12px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
        Panduan Standar Skala
      </summary>
      <div className="rubrik-grid" style={{ marginTop: 10 }}>
        <RubrikBlock
          judul="Kualitas Bacaan"
          items={RUBRIK_BACAAN}
          kriteria={KRITERIA_BACAAN}
          catatan={CATATAN_BACAAN}
        />
      </div>
    </details>
  );
}

function RubrikBlock({ judul, items, kriteria, catatan }: { judul: string; items: RubrikSkala[]; kriteria?: string[]; catatan?: string }) {
  return (
    <div className="rubrik-block">
      <div className="t-small" style={{ fontWeight: 600, marginBottom: 6 }}>{judul}</div>
      {kriteria && kriteria.length > 0 && (
        <ul className="t-small" style={{ color: 'var(--ink-2)', margin: '0 0 8px', paddingLeft: 16 }}>
          {kriteria.map((k, i) => (
            <li key={i} style={{ padding: '1px 0' }}>{k}</li>
          ))}
        </ul>
      )}
      <ul className="rubrik-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((r) => (
          <li
            key={r.skala}
            className={`rubrik-item${r.standar ? ' is-standar' : ''}`}
            style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '3px 0' }}
          >
            <span className="rubrik-skala" data-v={r.skala}>{r.skala}</span>
            <span className="t-small">
              {r.teks}
              {r.standar && <strong style={{ color: 'var(--hijau-ink)' }}> (Standar)</strong>}
            </span>
          </li>
        ))}
      </ul>
      {catatan && (
        <p className="t-small" style={{ color: 'var(--ink-2)', marginTop: 6 }}>{catatan}</p>
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
