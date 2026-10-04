'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TibyanTrendPoint } from '@/lib/tibyan-rekap';

function shortDate(t: string): string {
  return new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function TibyanTrendChart({ data, height = 220 }: { data: TibyanTrendPoint[]; height?: number }) {
  const chartData = data.map((d) => ({ sabtu: shortDate(d.tanggal), '%Hadir': d.persen }));

  if (chartData.length === 0) {
    return <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada sesi.</p>;
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="sabtu" stroke="var(--muted)" fontSize={11} />
          <YAxis domain={[0, 100]} stroke="var(--muted)" fontSize={11} unit="%" />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line-2)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="%Hadir"
            stroke="var(--ink)"
            strokeWidth={2.5}
            dot={{ r: 4 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
