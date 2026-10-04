'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/** Dropdown pilih minggu (Senin ISO) — push `?mode=minggu&week=YYYY-MM-DD`. */
export function WeekNavSelect({
  options,
  value,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set('mode', 'minggu');
    params.set('week', e.target.value);
    router.push(`?${params.toString()}`);
  }

  return (
    <select className="chip-select" value={value} onChange={onChange} aria-label="Pilih minggu">
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
