'use client';

import { useCallback, useRef, useState } from 'react';
import { ScoreSelector } from '@/components/ScoreSelector';
import { RUBRIK_PEDAGOGIS, CATATAN_PEDAGOGIS } from '@/lib/penilaian-rubrik';

// Tooltip per skala (0–4) per aspek pedagogis, dari RUBRIK_PEDAGOGIS.
const PEDAGOGIS_TITLES: Record<string, string[]> = Object.fromEntries(
  RUBRIK_PEDAGOGIS.map((r) => [
    r.key,
    r.skala.map((s) => `${s.skala}: ${s.teks}${s.standar ? ' (Standar)' : ''}`),
  ])
);

// "Metode Pengajaran Modul" dilebur ke "Manajemen Halaqah" — satu aspek saja.
// Kolom skor_metode_pengajaran tetap ada di DB untuk data lama, tapi tidak
// diisi lagi dari form ini.
const PEDAGOGIS = [
  { skorField: 'skor_manajemen_halaqah', ketField: 'keterangan_halaqah', label: 'Manajemen Halaqah' },
  { skorField: 'skor_kepatuhan_silabus', ketField: 'keterangan_silabus', label: 'Kepatuhan Silabus' },
  { skorField: 'skor_evaluasi_penguasaan', ketField: 'keterangan_evaluasi', label: 'Evaluasi & Penguasaan' },
] as const;

// Kepatuhan SOP Teknis (kategori Inspeksi) TIDAK dinilai manual di sini —
// datanya dari inspeksi/observasi kelas.
const ALL = PEDAGOGIS;

type PenilaianData = {
  skor_metode_pengajaran: number | null;
  keterangan_metode: string | null;
  skor_kepatuhan_silabus: number | null;
  keterangan_silabus: string | null;
  skor_manajemen_halaqah: number | null;
  keterangan_halaqah: string | null;
  skor_evaluasi_penguasaan: number | null;
  keterangan_evaluasi: string | null;
  skor_kepatuhan_sop: number | null;
  keterangan_sop: string | null;
  catatan_umum: string | null;
};

type Member = { id: string; name: string; penilaian: PenilaianData | null };
type RowState = PenilaianData & { status: 'idle' | 'saving' | 'saved' | 'error'; error?: string };

const EMPTY: PenilaianData = {
  skor_metode_pengajaran: null, keterangan_metode: null,
  skor_kepatuhan_silabus: null, keterangan_silabus: null,
  skor_manajemen_halaqah: null, keterangan_halaqah: null,
  skor_evaluasi_penguasaan: null, keterangan_evaluasi: null,
  skor_kepatuhan_sop: null, keterangan_sop: null,
  catatan_umum: null,
};

export function PenilaianPedagogisForm({
  members,
  yearMonth,
  readOnly = false,
}: {
  members: Member[];
  yearMonth: string;
  readOnly?: boolean;
}) {
  const initialRows = (): Record<string, RowState> => {
    const out: Record<string, RowState> = {};
    for (const m of members) out[m.id] = { ...(m.penilaian ?? EMPTY), status: m.penilaian ? 'saved' : 'idle' };
    return out;
  };

  const [rows, setRows] = useState<Record<string, RowState>>(initialRows);
  const [expanded, setExpanded] = useState<string | null>(members[0]?.id ?? null);
  const [openNote, setOpenNote] = useState<Record<string, boolean>>({});
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const save = useCallback(async (pengajarId: string, state: RowState) => {
    setRows((prev) => ({ ...prev, [pengajarId]: { ...prev[pengajarId], status: 'saving' } }));
    try {
      const res = await fetch('/api/penilaian-pedagogis/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pengajar_id: pengajarId,
          year_month: yearMonth,
          skor_metode_pengajaran: state.skor_metode_pengajaran,
          keterangan_metode: state.keterangan_metode,
          skor_kepatuhan_silabus: state.skor_kepatuhan_silabus,
          keterangan_silabus: state.keterangan_silabus,
          skor_manajemen_halaqah: state.skor_manajemen_halaqah,
          keterangan_halaqah: state.keterangan_halaqah,
          skor_evaluasi_penguasaan: state.skor_evaluasi_penguasaan,
          keterangan_evaluasi: state.keterangan_evaluasi,
          catatan_umum: state.catatan_umum,
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

  function updateRow(pengajarId: string, patch: Partial<PenilaianData>) {
    if (readOnly) return;
    setRows((prev) => {
      const next: RowState = { ...prev[pengajarId], ...patch, status: 'idle' };
      if (debounceRefs.current[pengajarId]) clearTimeout(debounceRefs.current[pengajarId]);
      debounceRefs.current[pengajarId] = setTimeout(() => save(pengajarId, next), 800);
      return { ...prev, [pengajarId]: next };
    });
  }

  function pedagogisAvg(row: RowState): string {
    const scores = PEDAGOGIS.map((a) => row[a.skorField] as number | null).filter((s): s is number => s !== null);
    if (!scores.length) return '—';
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  }
  function filledCount(row: RowState): number {
    return ALL.filter((a) => (row[a.skorField] as number | null) !== null).length;
  }

  function PanduanPedagogis() {
    return (
      <details className="rubrik-panduan card-flat" style={{ padding: '10px 12px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          Panduan Standar Skala — Pedagogis
        </summary>
        <div className="rubrik-grid" style={{ marginTop: 10 }}>
          {RUBRIK_PEDAGOGIS.map((r) => (
            <div key={r.key} className="rubrik-block">
              <div className="t-small" style={{ fontWeight: 600, marginBottom: 6 }}>{r.judul}</div>
              <ul className="t-small" style={{ color: 'var(--ink-2)', margin: '0 0 8px', paddingLeft: 16 }}>
                {r.kriteria.map((k, i) => (
                  <li key={i} style={{ padding: '1px 0' }}>{k}</li>
                ))}
              </ul>
              <ul className="rubrik-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {r.skala.map((s) => (
                  <li
                    key={s.skala}
                    className={`rubrik-item${s.standar ? ' is-standar' : ''}`}
                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '3px 0' }}
                  >
                    <span className="rubrik-skala" data-v={s.skala}>{s.skala}</span>
                    <span className="t-small">
                      {s.teks}
                      {s.standar && <strong style={{ color: 'var(--hijau-ink)' }}> (Standar)</strong>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="t-small" style={{ color: 'var(--ink-2)', marginTop: 8 }}>{CATATAN_PEDAGOGIS}</p>
      </details>
    );
  }

  function renderAspect(m: Member, row: RowState, a: (typeof ALL)[number]) {
    const skor = row[a.skorField] as number | null;
    const ket = (row[a.ketField] as string | null) ?? '';
    const noteKey = `${m.id}:${a.skorField}`;
    const noteOpen = !!openNote[noteKey];
    return (
      <div key={a.skorField} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</span>
          {(!readOnly || ket) && (
            <button
              type="button"
              className={`note-btn${ket ? ' filled' : ''}`}
              onClick={() => setOpenNote((p) => ({ ...p, [noteKey]: !p[noteKey] }))}
              aria-label="Catatan"
              title="Catatan"
            >
              ✎{ket && <span className="ndot" />}
            </button>
          )}
        </div>
        <ScoreSelector label={`${a.label} — ${m.name}`} value={skor} titles={PEDAGOGIS_TITLES[a.skorField]} readOnly={readOnly} onChange={(v) => updateRow(m.id, { [a.skorField]: v } as Partial<PenilaianData>)} />
        {noteOpen && (
          readOnly ? (
            ket ? <p className="t-small" style={{ marginTop: 6, color: 'var(--ink-2)' }}>{ket}</p> : null
          ) : (
            <input
              type="text"
              className="note-field"
              style={{ marginTop: 6 }}
              placeholder="Catatan (opsional)…"
              value={ket}
              onChange={(e) => updateRow(m.id, { [a.ketField]: e.target.value || null } as Partial<PenilaianData>)}
            />
          )
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <PanduanPedagogis />
      {members.map((m) => {
        const row = rows[m.id];
        const isOpen = expanded === m.id;
        return (
          <div key={m.id} className="card-flat" style={{ overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : m.id)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className={`prog-pill${filledCount(row) === ALL.length ? ' done' : ''}`}>{filledCount(row)}/{ALL.length}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--hijau-ink)' }}>{pedagogisAvg(row)}</span>
                {!readOnly && row.status === 'saving' && <span className="spin" style={{ fontSize: 12, color: 'var(--muted-2)', display: 'inline-block' }}>⟳</span>}
                {!readOnly && row.status === 'saved' && <span style={{ fontSize: 12, color: 'var(--hijau-ink)' }}>✓</span>}
                {!readOnly && row.status === 'error' && <span title={row.error} style={{ fontSize: 12, color: 'var(--merah-ink)' }}>✗</span>}
                <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div className="t-tiny" style={{ color: 'var(--emas-ink)', margin: '4px 0 2px' }}>KOMPETENSI PEDAGOGIS (4 aspek → Matrix)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {PEDAGOGIS.map((a) => renderAspect(m, row, a))}
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <div className="t-tiny" style={{ color: 'var(--muted)', margin: '2px 0 6px' }}>CATATAN UMUM (opsional)</div>
                  {readOnly ? (
                    row.catatan_umum ? (
                      <p className="t-small" style={{ margin: 0, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{row.catatan_umum}</p>
                    ) : (
                      <p className="t-small" style={{ margin: 0, color: 'var(--muted-2)' }}>—</p>
                    )
                  ) : (
                    <textarea
                      className="note-field"
                      rows={3}
                      style={{ width: '100%', resize: 'vertical' }}
                      placeholder="Catatan bebas untuk pengajar ini (opsional)…"
                      value={row.catatan_umum ?? ''}
                      onChange={(e) => updateRow(m.id, { catatan_umum: e.target.value || null })}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
