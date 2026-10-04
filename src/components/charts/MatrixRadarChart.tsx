'use client';

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts';

export interface RadarDataPoint {
  indikator: string; // short label for axis
  skor: number | null;
  standar: number;
}

interface Props {
  data: RadarDataPoint[];
  height?: number;
}

export function MatrixRadarChart({ data, height = 280 }: Props) {
  // Guard: render only if ≥5 non-null indicators
  const nonNull = data.filter((d) => d.skor !== null);
  if (nonNull.length < 5) return null;

  // Fill null scores with 0 for radar rendering (they'll look flat)
  const chartData = data.map((d) => ({
    indikator: d.indikator,
    skor: d.skor ?? 0,
    standar: d.standar,
  }));

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RadarChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="var(--line-2)" />
          <PolarAngleAxis
            dataKey="indikator"
            tick={{ fontSize: 10, fill: 'var(--muted)', fontWeight: 500 }}
            tickLine={false}
          />
          {/* Standar polygon — dashed outline */}
          <Radar
            name="Standar"
            dataKey="standar"
            stroke="var(--muted-2)"
            strokeWidth={1}
            strokeDasharray="4 3"
            fill="transparent"
            dot={false}
          />
          {/* Skor aktual — filled accent at ~25% opacity */}
          <Radar
            name="Skor"
            dataKey="skor"
            stroke="var(--accent)"
            strokeWidth={1.5}
            fill="var(--accent)"
            fillOpacity={0.25}
            dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
