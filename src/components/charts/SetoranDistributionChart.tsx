'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  cycle_label: string;
  hijau: number;
  kuning: number;
  merah: number;
}

interface Props {
  data: DataPoint[];
  height?: number;
}

export function SetoranDistributionChart({ data, height = 220 }: Props) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="cycle_label" stroke="var(--muted)" fontSize={10} />
          <YAxis stroke="var(--muted)" fontSize={11} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line-2)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="hijau" stackId="a" fill="oklch(0.62 0.11 150)" name="Hijau" />
          <Bar dataKey="kuning" stackId="a" fill="oklch(0.78 0.13 85)" name="Kuning" />
          <Bar dataKey="merah" stackId="a" fill="oklch(0.62 0.16 25)" name="Merah" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
