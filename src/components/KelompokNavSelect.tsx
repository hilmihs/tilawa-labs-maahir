'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Dropdown kelompok generik — push `?kelompok=<id>` sambil mempertahankan query
 * lain (mis. month). Dipakai spectator koordinator di halaman penilaian pedagogis
 * untuk berpindah antar kelompok.
 */
export function KelompokNavSelect({
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
    params.set('kelompok', e.target.value);
    router.push(`?${params.toString()}`);
  }

  return (
    <select className="chip-select" value={value} onChange={onChange} aria-label="Pilih kelompok">
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
