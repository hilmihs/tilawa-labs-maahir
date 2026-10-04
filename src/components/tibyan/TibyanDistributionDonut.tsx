'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { TibyanDistribusi } from '@/lib/tibyan-rekap';
import { CODE_COLOR, CODE_LABEL } from '@/lib/status-color';
import type { StatusCode } from '@/lib/maahir-rekap';

const ORDER: StatusCode[] = ['H', 'T', 'I', 'S', 'A'];

export function TibyanDistributionDonut({
  data,
  height = 220,
}: {
  data: TibyanDistribusi;
  height?: number;
}) {
  const rows = ORDER.map((code) => ({
    code,
    name: CODE_LABEL[code],
    value: data[code as Exclude<StatusCode, '-'>],
    color: CODE_COLOR[code],
  })).filter((r) => r.value > 0);

  const total = rows.reduce((s, r) => s + r.value, 0);

  if (total === 0) {
    return <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada data.</p>;
  }

  return (
    <div style={{ width: '100%', height, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
              {rows.map((r) => (
                <Cell key={r.code} fill={r.color} stroke="var(--surface)" />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => [`${v} (${Math.round((v / total) * 100)}%)`, '']}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--line-2)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
        {rows.map((r) => (
          <span key={r.code} className="t-tiny" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: r.color, display: 'inline-block' }} />
            {r.name} {Math.round((r.value / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
