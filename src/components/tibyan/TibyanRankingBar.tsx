import type { TibyanRankRow } from '@/lib/tibyan-rekap';
import { persenColor } from '@/lib/status-color';

// Server component — bar horizontal %hadir per kelas (sudah terurut desc).
export function TibyanRankingBar({ rows }: { rows: TibyanRankRow[] }) {
  if (rows.length === 0) {
    return <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada kelas.</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((r) => {
        const p = r.persen ?? 0;
        return (
          <div key={r.kelasId} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 42px', gap: 8, alignItems: 'center' }}>
            <span className="t-tiny" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.kelasName}
              <span style={{ color: 'var(--muted-2)' }}> · {r.gender === 'ikhwan' ? 'I' : 'A'}</span>
            </span>
            <div style={{ background: 'var(--surface-2)', borderRadius: 5, height: 16, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${p}%`,
                  height: '100%',
                  background: persenColor(r.persen),
                  borderRadius: 5,
                  transition: 'width .2s',
                }}
              />
            </div>
            <span className="t-tiny" style={{ textAlign: 'right', fontWeight: 700, color: persenColor(r.persen) }}>
              {r.persen === null ? '—' : `${r.persen}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
