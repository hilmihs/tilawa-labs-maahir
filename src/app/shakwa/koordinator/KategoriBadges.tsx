// Badge ringkasan per-kategori sebagai pintasan penyaring (server component).
// Menggantikan badge statis di page.tsx: klik untuk memfilter kategori, klik
// lagi kategori aktif untuk membersihkan filter.
import Link from 'next/link';
import { mergeQuery, type ShakwaQuery } from './ui-helpers';

export function KategoriBadges({
  perKategori,
  current,
}: {
  perKategori: Array<{ kategori: string; label: string; jumlah: number }>;
  current: ShakwaQuery;
}) {
  if (perKategori.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
      {perKategori.map((k) => {
        const aktif = current.kategori === k.kategori;
        const href = aktif
          ? mergeQuery(current, { kategori: null })
          : mergeQuery(current, { kategori: k.kategori });
        return (
          <Link
            key={k.kategori}
            href={href}
            className="badge"
            aria-pressed={aktif}
            style={{
              textDecoration: 'none',
              ...(aktif
                ? {
                    background: 'var(--accent)',
                    borderColor: 'var(--accent)',
                    color: 'var(--on-accent, #fff)',
                  }
                : {}),
            }}
          >
            {k.label}: {k.jumlah}
            {aktif ? ' ✕' : ''}
          </Link>
        );
      })}
    </div>
  );
}
