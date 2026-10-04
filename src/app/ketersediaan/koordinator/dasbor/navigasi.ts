import type { Gender } from '@/types/db';

export type TabDasbor = 'ringkasan' | 'jam' | 'pengajar' | 'pendaftar' | 'usulan' | 'pengaturan';
export type SaringGender = Gender | 'semua';

export const DAFTAR_TAB: { kunci: TabDasbor; label: string }[] = [
  { kunci: 'ringkasan', label: 'Ringkasan' },
  { kunci: 'jam', label: 'Jam & kapasitas' },
  { kunci: 'pengajar', label: 'Pengajar' },
  { kunci: 'pendaftar', label: 'Pendaftar' },
  { kunci: 'usulan', label: 'Usulan halaqah' },
  { kunci: 'pengaturan', label: 'Pengaturan' },
];

export function bacaTab(nilai: string | undefined): TabDasbor {
  return DAFTAR_TAB.some((t) => t.kunci === nilai) ? (nilai as TabDasbor) : 'ringkasan';
}

export function bacaGender(nilai: string | undefined, bawaan: SaringGender): SaringGender {
  return nilai === 'ikhwan' || nilai === 'akhwat' || nilai === 'semua' ? nilai : bawaan;
}

/**
 * Tautan dashboard. Gender selalu ditulis: tanpa itu, memilih "Semua" akan jatuh
 * kembali ke bawaan sesi koordinator yang bergender.
 */
export function tautanDasbor(p: { periode: string | null; tab: TabDasbor; g: SaringGender }): string {
  const q = new URLSearchParams();
  if (p.periode) q.set('periode', p.periode);
  if (p.tab !== 'ringkasan') q.set('tab', p.tab);
  q.set('g', p.g);
  return `/ketersediaan/koordinator?${q.toString()}`;
}
