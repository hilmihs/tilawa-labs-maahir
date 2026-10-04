// Komponen navigasi & pengingat untuk dashboard Shakwa koordinator.
// Server component murni (tanpa 'use client') — cukup Link + helper query.
import Link from 'next/link';
import { mergeQuery, EPOCH_ISO, type ShakwaQuery } from './ui-helpers';

/**
 * Penanda menonjol jumlah aduan yang belum ditangani sepanjang waktu.
 * Tautannya membuka semua aduan berstatus `submitted` dari awal sistem
 * (EPOCH_ISO) sampai hari ini, sehingga tak tersaring periode aktif.
 */
export function BelumDitangani({ jumlah, hariIni }: { jumlah: number; hariIni: string }) {
  if (jumlah <= 0) return null;
  return (
    <Link
      href={`?dari=${EPOCH_ISO}&sampai=${hariIni}&status=submitted`}
      aria-label={`${jumlah} aduan belum ditangani sepanjang waktu — buka daftarnya`}
      className="t-small"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        borderRadius: 999,
        background: 'var(--merah-tint)',
        border: '1px solid var(--merah-line)',
        color: 'var(--merah-ink)',
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      ⚠ {jumlah} aduan belum ditangani →
    </Link>
  );
}

/**
 * Navigasi halaman berbasis query. Tautan mundur/maju dinonaktifkan jadi
 * span muted saat berada di batas. Sembunyi total bila hanya satu halaman.
 */
export function Paginasi({ page, totalHalaman, current }: { page: number; totalHalaman: number; current: ShakwaQuery }) {
  if (totalHalaman <= 1) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flexWrap: 'wrap',
        marginTop: 16,
      }}
    >
      {page <= 1 ? (
        <span className="t-small" style={{ color: 'var(--muted)' }}>
          ‹ Sebelumnya
        </span>
      ) : (
        <Link
          href={mergeQuery(current, { page: String(page - 1) })}
          className="btn btn-sm btn-ghost"
          style={{ textDecoration: 'none' }}
        >
          ‹ Sebelumnya
        </Link>
      )}

      <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
        Halaman {page} dari {totalHalaman}
      </span>

      {page >= totalHalaman ? (
        <span className="t-small" style={{ color: 'var(--muted)' }}>
          Berikutnya ›
        </span>
      ) : (
        <Link
          href={mergeQuery(current, { page: String(page + 1) })}
          className="btn btn-sm btn-ghost"
          style={{ textDecoration: 'none' }}
        >
          Berikutnya ›
        </Link>
      )}
    </div>
  );
}
