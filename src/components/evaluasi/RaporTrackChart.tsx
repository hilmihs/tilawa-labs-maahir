'use client';

import { buildTrackGeometry, tierOf, AMBANG, type Jenis } from '@/lib/evaluasi';

interface RaporTrackChartProps {
  label: string;
  history: (number | null)[];
  jenis: Jenis;
}

export function RaporTrackChart({ label, history }: RaporTrackChartProps) {
  const geo = buildTrackGeometry(history);
  const filled = geo.sessions.filter((s) => s.filled);
  const filledCount = filled.length;

  const trendArrow = filledCount < 2 ? '' : geo.trend > 0 ? '↑' : geo.trend < 0 ? '↓' : '→';
  const trendColor =
    geo.trend > 0 ? 'oklch(0.40 0.10 150)' : geo.trend < 0 ? 'oklch(0.46 0.14 25)' : '#a8a39a';
  const avgLabel = geo.avg == null ? '–' : geo.avg;

  let insight: string;
  const nums = filled.map((s) => s.score as number);
  if (nums.length === 0) insight = 'Belum ada sesi tercatat.';
  else if (nums.length === 1) insight = 'Sesi pertama: ' + nums[0] + ' — belum ada tren.';
  else if (geo.trend > 0) insight = 'Naik ' + geo.trend + ' poin dari sesi sebelumnya.';
  else if (geo.trend < 0) insight = 'Turun ' + Math.abs(geo.trend) + ' poin — perlu perhatian lebih.';
  else insight = 'Stabil dibanding sesi sebelumnya.';
  if (geo.avg != null)
    insight +=
      geo.avg >= AMBANG
        ? ' Rata-rata di atas ambang standar.'
        : ` Rata-rata masih di bawah ambang standar (${AMBANG}).`;

  const chartPadRight = geo.chartW - geo.padX;

  return (
    <div style={{ background: '#faf8f4', border: '1px solid #e8e4dc', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#1b1a17' }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: trendColor }}>
          {trendArrow} rata-rata {avgLabel}
        </span>
      </div>
      <svg viewBox={`0 0 ${geo.chartW} ${geo.chartH}`} style={{ width: '100%', height: 88, display: 'block', margin: '4px 0 2px' }}>
        <line x1={geo.padX} y1={geo.ambangY} x2={chartPadRight} y2={geo.ambangY} stroke="#d8d3c8" strokeWidth={1.5} strokeDasharray="3,3" />
        {geo.points && (
          <polyline points={geo.points} fill="none" stroke="oklch(0.58 0.09 165)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {geo.sessions.map((sess) => {
          const dotFill = sess.filled ? tierOf(sess.score as number).color : '#d8d3c8';
          return (
            <circle key={sess.no} cx={sess.cx} cy={sess.cy} r={sess.filled ? 5 : 3} fill={dotFill} stroke="#ffffff" strokeWidth={1.5} />
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px', marginBottom: 10 }}>
        {geo.sessions.map((sess) => (
          <span key={sess.no} style={{ fontSize: 9, color: '#a8a39a', fontWeight: 600, width: 30, textAlign: 'center' }}>
            S{sess.no}·{sess.filled ? sess.score : '–'}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#5c5950', lineHeight: 1.4, borderTop: '1px solid #e8e4dc', paddingTop: 8 }}>{insight}</div>
    </div>
  );
}
