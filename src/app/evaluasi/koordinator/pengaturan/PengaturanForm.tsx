'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PengaturanInitial {
  nama_qn: string;
  nama_pb: string;
  ujian_attempts: number;
  jadwal: { qn: string[]; pb: string[]; ujian: string[] };
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// Sumbu rapot = track: tiap track punya ujian akhirnya sendiri (nomor_sesi 1 =
// Ujian QN, 2 = Ujian PB) dan masing-masing menyumbang 70% nilai akhir rapot
// track-nya. Jumlah sesi ujian karena itu tidak bisa lagi diatur koordinator.
const UJIAN_ATTEMPTS = 2;
const UJIAN_LABELS = ['Ujian QN', 'Ujian PB'];

const cardStyle: React.CSSProperties = {
  padding: 16,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--muted)',
  marginBottom: 12,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  border: '1px solid var(--line-2)',
  borderRadius: 8,
  font: 'inherit',
  fontSize: 14,
  background: 'var(--surface)',
  color: 'var(--ink)',
};
const dateInputStyle: React.CSSProperties = {
  flex: 1,
  height: 38,
  padding: '0 10px',
  border: '1px solid var(--line-2)',
  borderRadius: 7,
  font: 'inherit',
  fontSize: 13,
  background: 'var(--surface)',
  color: 'var(--ink)',
};

export function PengaturanForm({ initial }: { initial: PengaturanInitial }) {
  const [namaQn, setNamaQn] = useState(initial.nama_qn);
  const [namaPb, setNamaPb] = useState(initial.nama_pb);
  const [jadwal, setJadwal] = useState(initial.jadwal);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  const save = useCallback(
    async (payload: {
      nama_qn: string;
      nama_pb: string;
      ujian_attempts: number;
      jadwal: { qn: string[]; pb: string[]; ujian: string[] };
    }) => {
      setSaveState('saving');
      try {
        const res = await fetch('/api/evaluasi/config/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setSaveState(res.ok ? 'saved' : 'error');
      } catch {
        setSaveState('error');
      }
    },
    []
  );

  // Debounced autosave (700ms) pada perubahan apa pun.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Normalisasi tiap array jadwal jadi array padat berisi string ('' atau
      // 'YYYY-MM-DD') — cegah lubang/undefined yang di-serialize jadi null dan
      // ditolak validDateArray di route config (400). Jadwal ujian selalu 2
      // (Ujian QN & Ujian PB).
      const dense = (arr: string[], n: number): string[] =>
        Array.from({ length: n }, (_, i) => arr[i] ?? '');
      const qn = dense(jadwal.qn, 4);
      const pb = dense(jadwal.pb, 4);
      const ujian = dense(jadwal.ujian, UJIAN_ATTEMPTS);
      save({ nama_qn: namaQn, nama_pb: namaPb, ujian_attempts: UJIAN_ATTEMPTS, jadwal: { qn, pb, ujian } });
    }, 700);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [namaQn, namaPb, jadwal, save]);

  const setSchedule = (track: 'qn' | 'pb' | 'ujian', idx: number, value: string) => {
    setJadwal((prev) => {
      const arr = [...prev[track]];
      arr[idx] = value;
      return { ...prev, [track]: arr };
    });
  };

  const saveLabel =
    saveState === 'saving'
      ? 'Menyimpan…'
      : saveState === 'saved'
        ? 'Tersimpan'
        : saveState === 'error'
          ? 'Gagal menyimpan'
          : '';
  const saveColor =
    saveState === 'error' ? 'oklch(0.46 0.14 25)' : saveState === 'saved' ? 'oklch(0.40 0.10 150)' : 'var(--muted)';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 40px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/evaluasi/koordinator"
            className="btn btn-ghost btn-sm"
            style={{ height: 34, padding: '0 12px', fontSize: 12, textDecoration: 'none' }}
          >
            ← Dashboard
          </Link>
          {saveLabel && (
            <span className="t-small" style={{ color: saveColor, fontWeight: 600 }}>
              {saveLabel}
            </span>
          )}
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Pengaturan Program</div>
        <div className="t-small" style={{ marginBottom: 18 }}>
          Nama evaluasi berkala dan jadwal pelaksanaan. Ujian Akhir tetap 2 sesi.
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            maxWidth: 760,
          }}
        >
          {/* Nama evaluasi */}
          <div className="card-flat" style={cardStyle}>
            <div style={sectionTitle}>Nama evaluasi berkala</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>
                Track 1 (default: QN)
              </div>
              <input
                type="text"
                value={namaQn}
                maxLength={60}
                onChange={(e) => setNamaQn(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>
                Track 2 (default: PB)
              </div>
              <input
                type="text"
                value={namaPb}
                maxLength={60}
                onChange={(e) => setNamaPb(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 10 }}>
              Berlaku untuk semua halaqah — 4 sesi tiap track, tiap level.
            </div>
          </div>

          {/* Ujian attempts — dibekukan, tak bisa diubah */}
          <div className="card-flat" style={cardStyle}>
            <div style={sectionTitle}>Ujian Akhir — jumlah sesi</div>
            <div
              style={{
                height: 44,
                display: 'flex',
                alignItems: 'center',
                padding: '0 14px',
                borderRadius: 8,
                border: '1.5px solid var(--line-2)',
                background: 'var(--surface-2, var(--surface))',
                color: 'var(--ink-2)',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              2 · Ujian QN &amp; Ujian PB
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 10 }}>
              Tiap track punya ujian akhirnya sendiri dan masing-masing menyumbang 70% nilai akhir
              rapot track tersebut, jadi keduanya wajib ada.
            </div>
          </div>

          {/* Jadwal QN */}
          <div className="card-flat" style={cardStyle}>
            <div style={sectionTitle}>Jadwal {namaQn}</div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-2)', width: 56, flexShrink: 0 }}>
                  Sesi {i + 1}
                </span>
                <input
                  type="date"
                  value={jadwal.qn[i] ?? ''}
                  onChange={(e) => setSchedule('qn', i, e.target.value)}
                  style={dateInputStyle}
                />
              </div>
            ))}
          </div>

          {/* Jadwal PB */}
          <div className="card-flat" style={cardStyle}>
            <div style={sectionTitle}>Jadwal {namaPb}</div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-2)', width: 56, flexShrink: 0 }}>
                  Sesi {i + 1}
                </span>
                <input
                  type="date"
                  value={jadwal.pb[i] ?? ''}
                  onChange={(e) => setSchedule('pb', i, e.target.value)}
                  style={dateInputStyle}
                />
              </div>
            ))}
          </div>

          {/* Jadwal Ujian */}
          <div className="card-flat" style={{ ...cardStyle, gridColumn: '1 / -1' }}>
            <div style={sectionTitle}>Jadwal Ujian Akhir</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
              {Array.from({ length: UJIAN_ATTEMPTS }, (_, i) => i).map((i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)', width: 90, flexShrink: 0 }}>
                    {UJIAN_LABELS[i] ?? `Ujian ${i + 1}`}
                  </span>
                  <input
                    type="date"
                    value={jadwal.ujian[i] ?? ''}
                    onChange={(e) => setSchedule('ujian', i, e.target.value)}
                    style={dateInputStyle}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
