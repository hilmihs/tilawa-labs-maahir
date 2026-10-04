// Penyaring halaqah yang dipakai BERSAMA oleh ranking disiplin, rincian
// insiden, dan cakupan observasi. Satu tempat supaya ketiganya menyaring
// himpunan halaqah yang persis sama — kalau salah satu ketinggalan, %On-Time
// dan blok "belum diobservasi" akan bicara tentang halaqah yang berbeda.

import type { Gender } from '@/types/db';

/** Kelas tatap muka vs kelas Zoom. */
export type KelasMode = 'online' | 'offline';

export type HalaqahScope = {
  gender?: Gender;
  /** id `hits_batch`. Kosong = semua batch. */
  batchId?: string;
  /** Kosong = online + offline. */
  kelas?: KelasMode;
};

/**
 * Tak ada kolom online/offline di DB — sheet HITS menuliskannya di kolom jadwal
 * ("Offline PEJATEN Senin & Rabu 18:30 - 20:00 WIB" vs "Online Senin & Rabu
 * ..."), dan itu yang tersimpan di `hits_halaqah.jadwal_raw`. Jadwal kosong
 * dianggap online: sebagian besar halaqah memang Zoom.
 */
export function isKelasOffline(jadwalRaw: string | null | undefined): boolean {
  return !!jadwalRaw && /offline/i.test(jadwalRaw);
}

/** Kolom yang WAJIB ikut di-select agar `lolosScope` bisa bekerja. */
export const HALAQAH_SCOPE_COLS = 'batch_id, jadwal_raw';

export type HalaqahScopeFields = { batch_id?: string | null; jadwal_raw?: string | null };

/** Gender tidak diuji di sini — query halaqah sudah memfilternya di DB. */
export function lolosScope(h: HalaqahScopeFields, scope: HalaqahScope): boolean {
  if (scope.batchId && h.batch_id !== scope.batchId) return false;
  if (scope.kelas && isKelasOffline(h.jadwal_raw) !== (scope.kelas === 'offline')) return false;
  return true;
}

/** Baca dari query-string; nilai asing jatuh ke "semua", bukan error. */
export function parseKelasMode(v: string | null | undefined): KelasMode | undefined {
  return v === 'online' || v === 'offline' ? v : undefined;
}

/** Baca id batch dari query-string — hanya UUID yang diterima. */
export function parseBatchId(v: string | null | undefined): string | undefined {
  return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : undefined;
}

export const KELAS_LABEL: Record<KelasMode, string> = {
  online: 'Kelas online',
  offline: 'Kelas offline',
};
