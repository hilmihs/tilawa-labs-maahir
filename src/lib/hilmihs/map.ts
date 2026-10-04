// Fungsi MURNI: response hilmihs → bentuk mirror eval_*. Aman diuji tsx.
import { normalizeWhatsApp } from '@/lib/whatsapp';
import type { Gender } from '@/types/db';
import type {
  SrcGender, SrcPengajar, SrcHalaqah, SrcPeserta, SrcProgram,
  MirrorBatch, MirrorPengajar, MirrorHalaqah, MirrorPeserta,
} from './types';

export function konvGender(g: SrcGender): Gender {
  return g === 2 ? 'akhwat' : 'ikhwan';
}

export function prefixId(slug: string, srcId: number): string {
  return `${slug}:${srcId}`;
}

/** Normalisasi WA; null/kosong → null (bukan '62'). */
export function normalizeWaOrNull(phone: string | null | undefined): string | null {
  if (!phone || !phone.trim()) return null;
  return normalizeWhatsApp(phone);
}

/** Identitas pengajar: by WA bila ada, else by nama+program (fallback stabil). */
export function pengajarId(waNormal: string | null, slug: string, nama: string): string {
  return waNormal ? `wa:${waNormal}` : `nm:${slug}:${nama}`;
}

export function mapBatch(p: SrcProgram): MirrorBatch {
  return {
    id: p.slug,
    nama: p.name,
    aktif: !p.syncPaused,
    // Program berangkatan tunggal (batch null) jadi family beranggota satu, supaya
    // sisi pembaca tak perlu cabang khusus.
    //
    // `||` di sini, bukan `??`: family kosong ("") lolos dari `??` dan, karena
    // kolomnya NOT NULL, tersimpan apa adanya — semua program bermasalah lalu
    // melebur jadi satu family kosong dan salah dikelompokkan di dashboard.
    family: p.batch?.family || p.slug,
    batch_label: p.batch?.label ?? null,
    // `??` di sini WAJIB, bukan `||`: order 0 itu sah, dan `||` mengubahnya null.
    batch_order: p.batch?.order ?? null,
  };
}

export function mapPengajar(slug: string, r: SrcPengajar): MirrorPengajar {
  const wa = normalizeWaOrNull(r.phone);
  return {
    id: pengajarId(wa, slug, r.pengajar),
    nama: r.pengajar,
    gender: konvGender(r.genders?.[0] ?? 1),
    whatsapp: wa,
  };
}

/**
 * Gender halaqah: utamakan petunjuk dari NAMA (mengandung "AKHWAT"/"IKHWAN"),
 * baru jatuh ke gender numerik source. Source dpq mengirim gender=1 untuk semua
 * halaqah termasuk yang bernama "DPQ AKHWAT" — nama lebih dapat dipercaya.
 */
export function genderHalaqah(nama: string, srcGender: SrcGender): Gender {
  if (/\bakhwat\b/i.test(nama)) return 'akhwat';
  if (/\bikhwan\b/i.test(nama)) return 'ikhwan';
  return konvGender(srcGender);
}

export function mapHalaqah(slug: string, r: SrcHalaqah): MirrorHalaqah {
  const wa = normalizeWaOrNull(r.guruPhone);
  return {
    id: prefixId(slug, r.halaqahId),
    nama: r.name,
    gender: genderHalaqah(r.name, r.gender),
    level: r.level ?? null,
    pengajar_id: wa ? `wa:${wa}` : (r.pengajar ? `nm:${slug}:${r.pengajar}` : null),
    batch_id: slug,
    mustawa: null,
    // ambang_ujian TIDAK dipetakan: kolom terkurasi lokal (default DB 70). Sumber
    // hilmihs tak menyediakannya — dulu dipaksa 70 & masuk COMPARE shg tiap sync
    // menimpa nilai kurasi. Kini dibiarkan agar setelan per-halaqah bertahan.
  };
}

export function mapPeserta(slug: string, r: SrcPeserta, urutan: number): MirrorPeserta {
  return {
    id: prefixId(slug, r.tilawahUserId),
    nama: r.name,
    gender: konvGender(r.gender),
    halaqah_id: prefixId(slug, r.halaqahId),
    is_ketua: false,
    aktif: true,
    urutan,
  };
}
