'use client';

import { useRouter } from 'next/navigation';

/**
 * Dropdown kelas di bagian Ujian. URL tiap opsi sudah dirakit di server
 * (UjianMonitoring), jadi di sini cukup pindah halaman saat pilihan berubah.
 */
export function UjianKelasSelect({
  value,
  options,
}: {
  value: string;
  options: Array<{ value: string; label: string; href: string }>;
}) {
  const router = useRouter();
  return (
    <select
      className="chip-select"
      aria-label="Filter kelas ujian"
      value={value}
      onChange={(e) => {
        const o = options.find((x) => x.value === e.target.value);
        if (o) router.push(o.href);
      }}
      style={{ maxWidth: '100%' }}
    >
      {options.map((o) => (
        <option key={o.value || 'semua'} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
