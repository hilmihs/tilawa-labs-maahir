import type { StatusCode } from './maahir-rekap';

// Warna status kehadiran (dipakai chip tabel, heatmap At-Tibyan, donut).
export const CODE_COLOR: Record<StatusCode, string> = {
  H: 'var(--hijau)',
  T: 'var(--kuning)',
  I: '#64b5f6',
  S: '#ce93d8',
  A: 'var(--merah)',
  '-': 'var(--muted-2)',
};

export const CODE_LABEL: Record<StatusCode, string> = {
  H: 'Hadir',
  T: 'Terlambat',
  I: 'Izin',
  S: 'Sakit',
  A: 'Tanpa Ket.',
  '-': 'Belum ada',
};

// Warna ambang %hadir (dipakai badge & bar ranking).
export function persenColor(p: number | null): string {
  if (p === null) return 'var(--muted-2)';
  if (p >= 80) return 'var(--hijau)';
  if (p >= 50) return 'var(--kuning)';
  return 'var(--merah)';
}

export function persenBadgeClass(p: number | null): string {
  if (p === null) return 'badge';
  if (p >= 80) return 'badge badge-hijau';
  if (p >= 50) return 'badge badge-kuning';
  return 'badge badge-merah';
}
