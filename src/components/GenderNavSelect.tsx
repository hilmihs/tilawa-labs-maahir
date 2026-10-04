'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/** Dropdown pilih gender halaqah — push `?gender=` ('', ikhwan, akhwat). */
export function GenderNavSelect({ value }: { value: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    if (e.target.value) params.set('gender', e.target.value);
    else params.delete('gender');
    router.push(`?${params.toString()}`);
  }

  return (
    <select className="chip-select" value={value} onChange={onChange} aria-label="Pilih gender">
      <option value="">Ikhwan &amp; Akhwat</option>
      <option value="ikhwan">Ikhwan</option>
      <option value="akhwat">Akhwat</option>
    </select>
  );
}
