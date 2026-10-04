'use client';

import { useRef, useState } from 'react';
import { butuhAlasan } from '@/lib/kehadiran-status';

type Status = 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan';

const STATUS_OPTIONS: { value: Status; label: string; color: string }[] = [
  { value: 'hadir', label: 'Hadir', color: 'var(--hijau)' },
  { value: 'terlambat', label: 'Terlambat', color: 'var(--kuning)' },
  { value: 'izin', label: 'Izin', color: '#64b5f6' },
  { value: 'sakit', label: 'Sakit', color: '#ce93d8' },
  { value: 'tidak_ada_keterangan', label: 'TKK', color: 'var(--muted-2)' },
];

type PesertaRow = {
  id: string;
  name: string;
  status: Status;
  catatan: string;
  setoran: string; // halaman setoran pertemuan ini (kosong = belum diisi)
  mode: 'offline' | 'online';
  /**
   * Peserta Takhassus yang dipresensi di kelas halaqah ini — setorannya diisi
   * ketua di sini walau kelasnya bukan Takhassus.
   */
  takhassus?: boolean;
};

export function KehadiranForm({
  pertemuanId,
  pesertaList,
  materi: materiAwal = '',
  showSetoran = false,
}: {
  pertemuanId: string;
  pesertaList: PesertaRow[];
  materi?: string;
  showSetoran?: boolean;
}) {
  const [rows, setRows] = useState<PesertaRow[]>(pesertaList);
  // Materi pertemuan — per-pertemuan (seragam se-kelas). Ref supaya autosave yang
  // ditunda membaca nilai terbaru, bukan closure lama.
  const [materi, setMateri] = useState(materiAwal);
  const materiRef = useRef(materiAwal);
  const [globalStatus, setGlobalStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateMateri(value: string) {
    materiRef.current = value;
    setMateri(value);
    scheduleAutoSave(rows);
  }

  function updateRow(pesertaId: string, patch: Partial<PesertaRow>) {
    setRows((prev) => {
      const next = prev.map((r) => r.id === pesertaId ? { ...r, ...patch } : r);
      scheduleAutoSave(next);
      return next;
    });
  }

  function markAll(status: Status) {
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, status }));
      scheduleAutoSave(next);
      return next;
    });
  }

  function scheduleAutoSave(current: PesertaRow[]) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setGlobalStatus('idle');
    saveTimeout.current = setTimeout(() => saveAll(current), 1000);
  }

  async function saveAll(current: PesertaRow[]) {
    // Tidak hadir (izin/sakit/TKK) wajib beralasan — API menolak dengan 400.
    // Dicegat di sini supaya autosave tak berulang kali menabrak server dan
    // ketua tahu SIAPA yang alasannya masih kosong, bukan cuma "✗ Gagal".
    const belumBeralasan = current.filter(
      (r) => butuhAlasan(r.status) && r.catatan.trim() === ''
    );
    if (belumBeralasan.length > 0) {
      setError(
        `Alasan wajib diisi untuk ${belumBeralasan.length} peserta yang tidak hadir: ` +
          belumBeralasan.map((r) => r.name).join(', ')
      );
      setGlobalStatus('error');
      return;
    }
    setGlobalStatus('saving');
    setError(null);
    try {
      const res = await fetch(`/api/2in1/kehadiran/${pertemuanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: current.map((r) => ({
            anggota_id: r.id,
            status: r.status,
            catatan: r.catatan || undefined,
            mode: r.mode,
            ...(showSetoran || r.takhassus
              ? { setoran_halaman: r.setoran === '' ? null : r.setoran }
              : {}),
          })),
          ...(showSetoran ? { materi: materiRef.current } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal simpan');
      setGlobalStatus('saved');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal simpan');
      setGlobalStatus('error');
    }
  }

  const hadir = rows.filter((r) => r.status === 'hadir' || r.status === 'terlambat').length;

  return (
    <div>
      {/* Summary bar */}
      <div className="section-row" style={{ marginBottom: 12 }}>
        <div className="t-small">
          <span style={{ color: 'var(--hijau-ink)', fontWeight: 600 }}>{hadir}</span>
          <span style={{ color: 'var(--muted-2)' }}> / {rows.length} hadir</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {globalStatus === 'saving' && <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>Menyimpan…</span>}
          {globalStatus === 'saved' && <span className="t-tiny" style={{ color: 'var(--hijau-ink)' }}>✓ Tersimpan</span>}
          {globalStatus === 'error' && <span className="t-tiny" style={{ color: 'var(--merah-ink)' }}>✗ Gagal</span>}
        </div>
      </div>

      {/* Materi pertemuan — per-pertemuan, seragam se-kelas (takhassus). */}
      {showSetoran && (
        <div className="card" style={{ padding: '10px 12px', marginBottom: 12 }}>
          <label className="t-tiny" style={{ color: 'var(--muted-2)', display: 'block', marginBottom: 4 }}>
            Materi pertemuan ini (mis. surat/juz yang disetorkan)
          </label>
          <input
            type="text"
            value={materi}
            onChange={(e) => updateMateri(e.target.value)}
            placeholder="materi / tema…"
            style={{
              width: '100%',
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-input, #f5f5f5)',
            }}
          />
        </div>
      )}

      {/* Bulk mark */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => markAll(o.value)}
            className="btn btn-xs btn-ghost"
            style={{ fontSize: 11 }}
          >
            Semua {o.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          <div className="desc">{error}</div>
        </div>
      )}

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((p) => (
          <div key={p.id} className="card" style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {p.name}
                {p.takhassus && (
                  <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>Takhassus</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => updateRow(p.id, { status: o.value })}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    fontWeight: p.status === o.value ? 700 : 400,
                    background: p.status === o.value ? o.color : 'var(--bg-input, #f0f0f0)',
                    color: p.status === o.value ? '#fff' : 'var(--muted-2)',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {/* Hadir offline / online — hanya untuk peserta yang hadir. */}
            {(p.status === 'hadir' || p.status === 'terlambat') && (
              <div style={{ marginTop: 6, display: 'flex', gap: 4, alignItems: 'center' }}>
                <span className="t-tiny" style={{ color: 'var(--muted-2)', marginRight: 2 }}>Ikut</span>
                {(['offline', 'online'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateRow(p.id, { mode: m })}
                    style={{
                      padding: '3px 10px',
                      fontSize: 11,
                      fontWeight: p.mode === m ? 700 : 400,
                      background: p.mode === m ? 'var(--accent, #3b82f6)' : 'var(--bg-input, #f0f0f0)',
                      color: p.mode === m ? '#fff' : 'var(--muted-2)',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    {m === 'offline' ? 'Offline' : 'Online'}
                  </button>
                ))}
              </div>
            )}
            {/* Setoran hafalan pertemuan ini — hanya sesi Kelas Maahir & peserta yang hadir. */}
            {(showSetoran || p.takhassus) && (p.status === 'hadir' || p.status === 'terlambat' || p.setoran) && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>Setoran</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={p.setoran}
                  onChange={(e) => updateRow(p.id, { setoran: e.target.value })}
                  placeholder="0"
                  style={{
                    width: 70,
                    fontSize: 11,
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-input, #f5f5f5)',
                  }}
                />
                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>halaman</span>
              </div>
            )}
            {(butuhAlasan(p.status) || p.catatan) && (
              <input
                type="text"
                value={p.catatan}
                onChange={(e) => updateRow(p.id, { catatan: e.target.value })}
                placeholder={butuhAlasan(p.status) ? 'alasan tidak hadir (wajib)…' : 'catatan...'}
                style={{
                  marginTop: 6,
                  width: '100%',
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 6,
                  // Tandai merah selagi alasan wajib masih kosong.
                  border:
                    butuhAlasan(p.status) && p.catatan.trim() === ''
                      ? '1px solid var(--merah, #dc2626)'
                      : '1px solid var(--border)',
                  background: 'var(--bg-input, #f5f5f5)',
                }}
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => saveAll(rows)}
        className="btn btn-primary btn-block"
        style={{ marginTop: 20 }}
      >
        Simpan Kehadiran
      </button>
    </div>
  );
}
