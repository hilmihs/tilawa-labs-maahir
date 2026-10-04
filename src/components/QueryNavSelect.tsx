'use client';

import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Dropdown generik yang menulis satu parameter query-string lalu navigasi.
 * Nilai kosong menghapus parameternya (kembali ke "semua"). Dipakai untuk
 * penyaring yang pilihannya datang dari data (batch) atau tetap (online/offline)
 * — pola sama dengan GenderNavSelect, tapi tak terikat satu nama parameter.
 */
export function QueryNavSelect({
  param,
  value,
  options,
  ariaLabel,
  allLabel,
}: {
  param: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  /** Teks opsi "semua" — kosongkan bila daftar sudah memuatnya sendiri. */
  allLabel?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    if (e.target.value) params.set(param, e.target.value);
    else params.delete(param);
    router.push(`?${params.toString()}`);
  }

  return (
    <select className="chip-select" value={value} onChange={onChange} aria-label={ariaLabel}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
