import type { TibyanKpi } from '@/lib/tibyan-rekap';
import { persenColor } from '@/lib/status-color';

// Server component — kartu KPI ringkas (reuse kelas .matrix-stat-grid).
export function TibyanKpiCards({ kpi, target }: { kpi: TibyanKpi; target: number }) {
  const persenStr = kpi.overallPersen === null ? '—' : `${kpi.overallPersen}%`;
  return (
    <div className="matrix-stat-grid" style={{ marginBottom: 20 }}>
      <div className="stat">
        <div className="v" style={{ color: persenColor(kpi.overallPersen) }}>{persenStr}</div>
        <div className="l">%Hadir keseluruhan</div>
      </div>
      <div className="stat">
        <div className="v">{kpi.totalSesi}</div>
        <div className="l">Sesi Sabtu</div>
      </div>
      <div className="stat">
        <div className="v">{kpi.totalAnggota}</div>
        <div className="l">Total anggota</div>
      </div>
      <div className="stat">
        <div className="v" style={{ color: kpi.kelasDiBawahTarget > 0 ? 'var(--merah)' : 'var(--hijau)' }}>
          {kpi.kelasDiBawahTarget}
        </div>
        <div className="l">Kelas &lt; {target}%</div>
      </div>
    </div>
  );
}
