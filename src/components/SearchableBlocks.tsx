'use client';

import { useMemo, useState, type ReactNode } from 'react';

export type SearchableBlock = {
  key: string;
  /** Teks yang dicari (nama kelas + semua nama anggota, huruf kecil). */
  text: string;
  node: ReactNode;
};

/**
 * Kotak cari + daftar blok yang difilter di klien. Blok-nya sendiri dirender
 * di server (dilewatkan sebagai ReactNode), jadi tak ada data yang dihitung ulang.
 */
export function SearchableBlocks({
  blocks,
  placeholder = 'Cari nama peserta atau kelas…',
}: {
  blocks: SearchableBlock[];
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const shown = useMemo(
    () => (query === '' ? blocks : blocks.filter((b) => b.text.includes(query))),
    [blocks, query]
  );

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="Cari peserta atau kelas"
          style={{
            width: '100%',
            fontSize: 13,
            padding: '9px 12px 9px 32px',
            borderRadius: 10,
            border: '1px solid var(--line)',
            background: 'var(--surface, #fff)',
            color: 'var(--ink)',
          }}
        />
        <span
          aria-hidden
          style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}
        >
          🔍
        </span>
      </div>

      {query !== '' && (
        <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
          {shown.length} kelas cocok dengan &ldquo;{q.trim()}&rdquo;
          {shown.length === 0 ? ' — coba kata kunci lain.' : ''}
        </p>
      )}

      {shown.map((b) => (
        <div key={b.key}>{b.node}</div>
      ))}
    </div>
  );
}
