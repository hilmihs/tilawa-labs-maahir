'use client';

import { useMemo, useRef, useState } from 'react';

export type GridPertemuan = { id: string; tanggal: string; label: string };
export type GridPeserta = {
  id: string;
  name: string;
  /** pertemuanId → { halaman, hadir, adaPresensi } */
  sel: Record<string, { halaman: string; hadir: boolean; adaPresensi: boolean }>;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Grid isian cepat: baris = peserta, kolom = pertemuan. Ketik angka → Enter
 * turun ke peserta berikutnya, panah untuk pindah sel, autosave 900ms.
 */
export function SetoranGrid({
  pertemuan,
  peserta,
}: {
  pertemuan: GridPertemuan[];
  peserta: GridPeserta[];
}) {
  const [rows, setRows] = useState<GridPeserta[]>(peserta);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(new Map<string, { pertemuan_id: string; anggota_id: string; halaman: string }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement | null>());

  const cellKey = (r: number, c: number) => `${r}:${c}`;

  function setCell(rowIdx: number, pertemuanId: string, value: string) {
    setRows((prev) => {
      const next = prev.map((p, i) =>
        i === rowIdx
          ? { ...p, sel: { ...p.sel, [pertemuanId]: { ...p.sel[pertemuanId], halaman: value } } }
          : p
      );
      const anggotaId = prev[rowIdx].id;
      dirty.current.set(`${pertemuanId}|${anggotaId}`, {
        pertemuan_id: pertemuanId,
        anggota_id: anggotaId,
        halaman: value,
      });
      schedule();
      return next;
    });
  }

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    setState('idle');
    timer.current = setTimeout(flush, 900);
  }

  async function flush() {
    if (dirty.current.size === 0) return;
    const batch = [...dirty.current.values()].map((d) => ({
      pertemuan_id: d.pertemuan_id,
      anggota_id: d.anggota_id,
      halaman: d.halaman === '' ? null : Number(d.halaman),
    }));
    dirty.current.clear();
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/2in1/setoran-kelas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal simpan');
      setState('saved');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal simpan');
      setState('error');
    }
  }

  function focusCell(r: number, c: number) {
    const el = inputs.current.get(cellKey(r, c));
    if (el) {
      el.focus();
      el.select();
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusCell(Math.min(r + 1, rows.length - 1), c);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(Math.max(r - 1, 0), c);
    } else if (e.key === 'ArrowRight' && (e.currentTarget.selectionStart ?? 0) >= e.currentTarget.value.length) {
      e.preventDefault();
      focusCell(r, Math.min(c + 1, pertemuan.length - 1));
    } else if (e.key === 'ArrowLeft' && (e.currentTarget.selectionEnd ?? 0) === 0) {
      e.preventDefault();
      focusCell(r, Math.max(c - 1, 0));
    }
  }

  const totalPerPeserta = useMemo(
    () =>
      rows.map((p) =>
        pertemuan.reduce((s, pt) => s + (Number(p.sel[pt.id]?.halaman) || 0), 0)
      ),
    [rows, pertemuan]
  );
  const totalPerPertemuan = useMemo(
    () =>
      pertemuan.map((pt) => rows.reduce((s, p) => s + (Number(p.sel[pt.id]?.halaman) || 0), 0)),
    [rows, pertemuan]
  );
  const totalSemua = totalPerPeserta.reduce((a, b) => a + b, 0);
  const belumTerisi = rows.reduce(
    (s, p) =>
      s +
      pertemuan.filter((pt) => p.sel[pt.id]?.adaPresensi && p.sel[pt.id]?.hadir && p.sel[pt.id]?.halaman === '')
        .length,
    0
  );

  return (
    <div>
      <div className="section-row" style={{ marginBottom: 8, alignItems: 'center' }}>
        <div className="t-small" style={{ color: 'var(--muted-2)' }}>
          Total <strong style={{ color: 'var(--ink)' }}>{totalSemua}</strong> halaman
          {belumTerisi > 0 ? ` · ${belumTerisi} sel hadir belum diisi` : ' · semua terisi'}
        </div>
        <div className="t-tiny">
          {state === 'saving' && <span style={{ color: 'var(--muted-2)' }}>Menyimpan…</span>}
          {state === 'saved' && <span style={{ color: 'var(--hijau-ink)' }}>✓ Tersimpan</span>}
          {state === 'error' && <span style={{ color: 'var(--merah-ink)' }}>✗ Gagal</span>}
        </div>
      </div>

      {error && (
        <div className="banner banner-error" style={{ marginBottom: 10 }}>
          <div className="desc">{error}</div>
        </div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
        <table className="k-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  background: 'var(--surface-2, #f6f6f6)',
                  minWidth: 140,
                  textAlign: 'left',
                }}
              >
                Peserta
              </th>
              {pertemuan.map((p) => (
                <th key={p.id} style={{ minWidth: 62, whiteSpace: 'nowrap' }}>
                  {p.label}
                </th>
              ))}
              <th style={{ minWidth: 58 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, r) => (
              <tr key={p.id}>
                <td
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    background: 'var(--surface, #fff)',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </td>
                {pertemuan.map((pt, c) => {
                  const cell = p.sel[pt.id];
                  const bisa = cell?.adaPresensi ?? false;
                  return (
                    <td key={pt.id} style={{ padding: 3, textAlign: 'center' }}>
                      <input
                        ref={(el) => {
                          inputs.current.set(cellKey(r, c), el);
                        }}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        disabled={!bisa}
                        value={cell?.halaman ?? ''}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setCell(r, pt.id, e.target.value)}
                        onKeyDown={(e) => onKey(e, r, c)}
                        title={
                          !bisa
                            ? 'Presensi pertemuan ini belum diisi untuk peserta tsb.'
                            : cell?.hadir
                              ? 'Jumlah halaman setoran'
                              : 'Peserta tidak hadir — biasanya kosong'
                        }
                        style={{
                          width: 52,
                          fontSize: 12,
                          textAlign: 'center',
                          padding: '5px 4px',
                          borderRadius: 6,
                          border: '1px solid var(--line)',
                          background: !bisa
                            ? 'var(--surface-3, #eee)'
                            : cell?.hadir
                              ? 'var(--surface, #fff)'
                              : 'var(--kuning-tint, #fff8e1)',
                          color: 'var(--ink)',
                        }}
                      />
                    </td>
                  );
                })}
                <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 12 }}>
                  {totalPerPeserta[r]}
                </td>
              </tr>
            ))}
            <tr>
              <td
                style={{
                  position: 'sticky',
                  left: 0,
                  background: 'var(--surface-2, #f6f6f6)',
                  fontSize: 11,
                  color: 'var(--muted-2)',
                }}
              >
                Total per pertemuan
              </td>
              {totalPerPertemuan.map((t, i) => (
                <td key={pertemuan[i].id} style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted-2)' }}>
                  {t}
                </td>
              ))}
              <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 12 }}>{totalSemua}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '8px 2px' }}>
        Enter / ↓ = peserta berikutnya · ← → = pindah pertemuan · tersimpan otomatis.
        Sel abu = presensi pertemuan itu belum diisi (isi dulu lewat{' '}
        <a href="/2in1/ketua-kelas/pertemuan">Riwayat Pertemuan</a>). Sel kuning = peserta tidak hadir.
      </div>

      <button
        type="button"
        onClick={flush}
        className="btn btn-primary btn-block"
        style={{ marginTop: 8 }}
      >
        Simpan Sekarang
      </button>
    </div>
  );
}
