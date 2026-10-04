// Tipe kontrak API agent dashboard.example.org (docs/API_hilmihswebid.md) + bentuk baris
// mirror-shape yang dihasilkan map.ts. Field sumber sesuai probe live 2026-08-22.

/** gender numerik sumber: 1 = ikhwan, 2 = akhwat. */
export type SrcGender = 1 | 2;

export interface SrcProgram {
  slug: string;
  name: string;
  dataSourceType: 'tilawah_api' | 'berkah_api' | 'mabni_api' | string;
  syncPaused: boolean;
  batch: { family: string; label: string; order: number } | null;
}
export interface ProgramsResponse {
  programs: SrcProgram[];
  families: Record<string, string[]>;
  meta: { generatedAt: string };
}

export interface SrcPengajar {
  pengajar: string;            // nama; bisa "(tanpa pengajar)"
  phone: string | null;        // tanpa kode negara, bisa null
  genders: SrcGender[];
}
export interface SrcHalaqah {
  halaqahId: number;
  name: string;
  pengajar: string | null;
  guruPhone: string | null;
  level: string | null;        // teks: "HITS Dasar" / "M1" / ...
  gender: SrcGender;
  type: string | null;
}
export interface SrcPeserta {
  tilawahUserId: number;
  name: string;
  userCode: string | null;
  gender: SrcGender;
  halaqahId: number;
  halaqahName: string | null;
  pengajar: string | null;
}

/** Envelope generik hilmihs. */
export interface Envelope<T> {
  meta: { generatedAt: string; caps?: Record<string, number>; truncated?: Record<string, number> };
  [k: string]: T[] | unknown;
}

// ── Bentuk mirror-shape (hasil map, cocok kolom eval_*). Gender sudah enum. ──
import type { Gender } from '@/types/db';

export interface MirrorBatch {
  id: string; nama: string; aktif: boolean;
  /** Slug program induk. Program berangkatan tunggal → sama dengan `id`. */
  family: string;
  batch_label: string | null;
  batch_order: number | null;
}
export interface MirrorPengajar { id: string; nama: string; gender: Gender; whatsapp: string | null }
export interface MirrorHalaqah {
  id: string; nama: string; gender: Gender; level: string | null;
  pengajar_id: string | null; batch_id: string; mustawa: number | null;
}
export interface MirrorPeserta {
  id: string; nama: string; gender: Gender; halaqah_id: string;
  is_ketua: boolean; aktif: boolean; urutan: number;
}
export interface MirrorSnapshot {
  batch: MirrorBatch[];
  pengajar: MirrorPengajar[];
  halaqah: MirrorHalaqah[];
  peserta: MirrorPeserta[];
}

export type MirrorEntity = 'batch' | 'pengajar' | 'halaqah' | 'peserta';
