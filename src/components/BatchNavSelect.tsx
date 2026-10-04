'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/** Dropdown pilih batch — push `?batch=<id>` sambil pertahankan query lain. */
export function BatchNavSelect({
  options,
  value,
}: {
  options: Array<{ id: string; name: string }>;
  value: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set('batch', e.target.value);
    router.push(`?${params.toString()}`);
  }

  return (
    <select className="chip-select" value={value} onChange={onChange} aria-label="Pilih batch">
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}
