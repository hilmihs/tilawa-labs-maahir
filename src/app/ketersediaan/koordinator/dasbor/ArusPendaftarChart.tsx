'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TitikArus } from '@/lib/ketersediaan-dasbor';

const WARNA = { ikhwan: '#2a78d6', akhwat: '#eb6834' } as const;
const NAMA = { ikhwan: 'Ikhwan', akhwat: 'Akhwat' } as const;

const tanggalPendek = (t: string) =>
  new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const angka = (n: number) => n.toLocaleString('id-ID');

export function ArusPendaftarChart({
  data,
  tampil,
  batasAntrean,
}: {
  data: TitikArus[];
  tampil: ('ikhwan' | 'akhwat')[];
  /** Tanggal antrean tertua genap batas penggabungan kelompok umur. */
  batasAntrean: string | null;
}) {
  if (data.length === 0) {
    return (
      <p className="t-small" style={{ margin: 0, color: 'var(--muted)' }}>
        Belum ada pendaftar yang ditarik untuk periode ini.
      </p>
    );
  }
  const akhir = data[data.length - 1];
  const garisBatas = batasAntrean && batasAntrean >= data[0].tanggal && batasAntrean <= akhir.tanggal;

  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 64, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="tanggal"
              tickFormatter={tanggalPendek}
              stroke="var(--muted)"
              fontSize={11}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              stroke="var(--muted)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={48}
              allowDecimals={false}
              tickFormatter={(v: number) => angka(v)}
            />
            <Tooltip
              labelFormatter={(t) => tanggalPendek(String(t))}
              formatter={(v, n) => [angka(Number(v)), NAMA[n as keyof typeof NAMA] ?? String(n)]}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 8, fontSize: 12 }}
              cursor={{ stroke: 'var(--line-2)' }}
            />
            {tampil.length > 1 && (
              <Legend formatter={(v) => NAMA[v as keyof typeof NAMA] ?? v} wrapperStyle={{ fontSize: 12 }} />
            )}
            {garisBatas && (
              <ReferenceLine
                x={batasAntrean}
                stroke="var(--muted-2)"
                label={{ value: 'kelompok umur boleh digabung', position: 'insideTopRight', fontSize: 11, fill: 'var(--muted)' }}
              />
            )}
            {tampil.map((g) => (
              <Line
                key={g}
                type="monotone"
                dataKey={g}
                name={g}
                stroke={WARNA[g]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
                label={({ x, y, index }: { x: number; y: number; index: number }) =>
                  index === data.length - 1 ? (
                    <text x={x + 8} y={y + 4} fontSize={12} fill="var(--ink-2)">
                      {angka(akhir[g])}
                    </text>
                  ) : (
                    <g />
                  )
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="t-small" style={{ color: 'var(--muted)', marginTop: 6 }}>
        Jumlah pendaftar kumulatif per hari sejak kiriman pertama, termasuk yang tertahan saringan. Kiriman ulang
        formulir tidak dihitung dua kali.
      </figcaption>
    </figure>
  );
}
