'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Dropdown periode (bulan) generik — push `?month=YYYY-MM` sambil mempertahankan
 * query lain. Dipakai untuk navigasi bulan di dashboard pedagogis.
 *
 * `clear` membuang param lain saat bulan berganti. Dipakai halaman yang punya
 * filter turunan bulan (mis. rentang tanggal): kalau tak dibuang, rentang bulan
 * lama ikut terbawa dan bulan yang baru dipilih tak berpengaruh apa-apa.
 */
export function MonthNavSelect({
  options,
  value,
  hash,
  clear,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  hash?: string;
  clear?: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    // Value kosong = opsi "semua periode" (dipakai halaman SP) → buang paramnya.
    if (e.target.value) params.set('month', e.target.value);
    else params.delete('month');
    for (const c of clear ?? []) params.delete(c);
    router.push(`?${params.toString()}${hash ? `#${hash}` : ''}`);
  }

  return (
    <select className="chip-select" value={value} onChange={onChange} aria-label="Pilih bulan">
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
