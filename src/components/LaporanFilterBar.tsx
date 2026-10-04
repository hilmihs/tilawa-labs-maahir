'use client';

import { useRouter, usePathname } from 'next/navigation';
import type { Gender } from '@/types/db';

interface MonthOption {
  value: string;
  label: string;
}

interface Props {
  monthOptions: MonthOption[];
  current: {
    bulan: string;
    gender: Gender;
  };
}

export function LaporanFilterBar({ monthOptions, current }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function pushWith(overrides: Partial<{ bulan: string; gender: Gender }>) {
    const params = new URLSearchParams();
    params.set('bulan', overrides.bulan ?? current.bulan);
    params.set('gender', overrides.gender ?? current.gender);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <label className="field-label">Pilih bulan</label>
      <select
        value={current.bulan}
        onChange={(e) => pushWith({ bulan: e.target.value })}
        className="input"
      >
        {monthOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="field-label" style={{ marginTop: 10 }}>
        Gender
      </label>
      <select
        value={current.gender}
        onChange={(e) => pushWith({ gender: e.target.value as Gender })}
        className="input"
      >
        <option value="ikhwan">Ikhwan</option>
        <option value="akhwat">Akhwat</option>
      </select>
    </div>
  );
}
