'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { ScoreSelector } from '@/components/ScoreSelector';

type PenilaianRow = {
  skor_bacaan: number | null;
  ket_bacaan: string | null;
  skor_hafalan: number | null;
  ket_hafalan: string | null;
  assessor_role: string | null;
};

type PesertaItem = {
  id: string;
  name: string;
  gender: 'ikhwan' | 'akhwat';
  kelas_id: string;
  kelas: { id: string; name: string } | null;
  penilaian: PenilaianRow | null;
};

type RowState = {
  skor_bacaan: number | null;
  ket_bacaan: string;
  skor_hafalan: number | null;
  ket_hafalan: string;
  status: 'idle' | 'saving' | 'saved' | 'error';
  error?: string;
};

export function PenilaianPesertaForm({
  pesertaList,
  yearMonth,
  title,
  defaultCollapsed = false,
}: {
  pesertaList: PesertaItem[];
  yearMonth: string;
  /** Section title, e.g. "Ikhwan" / "Akhwat" */
  title?: string;
  defaultCollapsed?: boolean;
  /** kept for back-compat; assessor resolved server-side */
  assessorRole?: 'koordinator' | 'syaikh';
}) {
  const initialRows = (): Record<string, RowState> => {
    const out: Record<string, RowState> = {};
    for (const p of pesertaList) {
      out[p.id] = {
        skor_bacaan: p.penilaian?.skor_bacaan ?? null,
        ket_bacaan: p.penilaian?.ket_bacaan ?? '',
        skor_hafalan: p.penilaian?.skor_hafalan ?? null,
        ket_hafalan: p.penilaian?.ket_hafalan ?? '',
        status: p.penilaian ? 'saved' : 'idle',
      };
    }
    return out;
  };

  const [rows, setRows] = useState<Record<string, RowState>>(initialRows);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const save = useCallback(async (pesertaId: string, state: RowState) => {
    setRows((prev) => ({ ...prev, [pesertaId]: { ...prev[pesertaId], status: 'saving' } }));
    try {
      const res = await fetch('/api/2in1/penilaian/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peserta_id: pesertaId,
          year_month: yearMonth,
          skor_bacaan: state.skor_bacaan,
          ket_bacaan: state.ket_bacaan || null,
          skor_hafalan: state.skor_hafalan,
          ket_hafalan: state.ket_hafalan || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal simpan');
      setRows((prev) => ({ ...prev, [pesertaId]: { ...prev[pesertaId], status: 'saved', error: undefined } }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal simpan';
      setRows((prev) => ({ ...prev, [pesertaId]: { ...prev[pesertaId], status: 'error', error: msg } }));
    }
  }, [yearMonth]);

  function scheduleAutoSave(pesertaId: string, newState: RowState) {
    if (debounceRefs.current[pesertaId]) clearTimeout(debounceRefs.current[pesertaId]);
    debounceRefs.current[pesertaId] = setTimeout(() => {
      save(pesertaId, newState);
    }, 800);
  }

  function updateRow(pesertaId: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const next = { ...prev[pesertaId], ...patch, status: 'idle' as const };
      scheduleAutoSave(pesertaId, next);
      return { ...prev, [pesertaId]: next };
    });
  }

  function toggleNote(pesertaId: string) {
    setOpenNotes((p) => ({ ...p, [pesertaId]: !p[pesertaId] }));
  }

  // Realtime progress per kategori
  const progress = useMemo(() => {
    let bacaan = 0;
    let hafalan = 0;
    for (const p of pesertaList) {
      const r = rows[p.id];
      if (r?.skor_bacaan !== null && r?.skor_bacaan !== undefined) bacaan++;
      if (r?.skor_hafalan !== null && r?.skor_hafalan !== undefined) hafalan++;
    }
    return { bacaan, hafalan, total: pesertaList.length };
  }, [rows, pesertaList]);

  if (pesertaList.length === 0) return null;

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
        <span className={`prog-pill${progress.hafalan === progress.total ? ' done' : ''}`}>
          Hafalan {progress.hafalan}/{progress.total}
        </span>
        <span className="caret">▼</span>
      </button>

      {!collapsed && (
        <div className="card-flat table-scroll" style={{ marginTop: 8 }}>
          <table className="pen-table">
            <thead>
              <tr>
                <th className="name-col">Nama</th>
                <th>Bacaan (0–4)</th>
                <th>Hafalan (0–4)</th>
                <th style={{ width: 36 }} aria-label="Catatan" />
                <th style={{ width: 22 }} aria-label="Status" />
              </tr>
            </thead>
            <tbody>
              {pesertaList.map((p) => {
                const row = rows[p.id];
                const noteOpen = !!openNotes[p.id];
                const hasNote = !!(row.ket_bacaan || row.ket_hafalan);
                return (
                  <FragmentRow key={p.id}>
                    <tr className="pen-row">
                      <td className="name-col">
                        <div className="pen-name">{p.name}</div>
                        {p.kelas && <div className="pen-sub">{p.kelas.name}</div>}
                      </td>
                      <td>
                        <ScoreSelector
                          label={`Bacaan ${p.name}`}
                          value={row.skor_bacaan}
                          onChange={(v) => updateRow(p.id, { skor_bacaan: v })}
                        />
                      </td>
                      <td>
                        <ScoreSelector
                          label={`Hafalan ${p.name}`}
                          value={row.skor_hafalan}
                          onChange={(v) => updateRow(p.id, { skor_hafalan: v })}
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
                            value={row.ket_bacaan}
                            onChange={(e) => updateRow(p.id, { ket_bacaan: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="note-field"
                            placeholder="Catatan hafalan…"
                            value={row.ket_hafalan}
                            onChange={(e) => updateRow(p.id, { ket_hafalan: e.target.value })}
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
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
