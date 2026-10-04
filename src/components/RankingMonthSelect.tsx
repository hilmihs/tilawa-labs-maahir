'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Selector periode (bulan) untuk ranking di dashboard koordinator. Mengubah
 * searchParam `month` sambil mempertahankan filter lain (gender/kelas/q/dst).
 */
export function RankingMonthSelect({
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
    params.set('month', e.target.value);
    router.push(`?${params.toString()}#ranking`);
  }

  return (
    <select className="chip-select" value={value} onChange={onChange} aria-label="Pilih bulan ranking">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
