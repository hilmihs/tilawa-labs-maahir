'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  year_month: string;
  rata_rata_hard_skill: number | null;
  rata_rata_pedagogis: number | null;
  rata_rata_soft_skill: number | null;
  rata_rata_keseluruhan: number | null;
}

interface Props {
  data: DataPoint[];
  height?: number;
}

export function MatrixTrendChart({ data, height = 240 }: Props) {
  const sorted = [...data].sort((a, b) => a.year_month.localeCompare(b.year_month));
  const chartData = sorted.map((d) => ({
    bulan: d.year_month,
    Hard: d.rata_rata_hard_skill != null ? Number(d.rata_rata_hard_skill) : null,
    Inspeksi: d.rata_rata_pedagogis != null ? Number(d.rata_rata_pedagogis) : null,
    Soft: d.rata_rata_soft_skill != null ? Number(d.rata_rata_soft_skill) : null,
    'Rata-rata': d.rata_rata_keseluruhan != null ? Number(d.rata_rata_keseluruhan) : null,
  }));

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="bulan" stroke="var(--muted)" fontSize={11} />
          <YAxis domain={[0, 4]} stroke="var(--muted)" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line-2)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="Hard" stroke="oklch(0.62 0.11 150)" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="Inspeksi" stroke="oklch(0.78 0.13 85)" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="Soft" stroke="oklch(0.58 0.09 165)" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="Rata-rata" stroke="var(--ink)" strokeWidth={2.5} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
