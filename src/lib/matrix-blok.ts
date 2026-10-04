// Pemecahan ranking Matrix Skill Guru jadi blok. Rata-rata hard skill sebagian
// besar berasal dari kehadiran + setoran di kelas Maahir yang DIIKUTI pengajar,
// jadi mengadu pengajar Takhassus (hadir tiap hari, ada nilai tajwid) dengan
// pengajar Talaqqi (1x sepekan, tak menyetor) menghasilkan peringkat yang tak
// sebanding.
//
// Dua gender memakai taksonomi yang BERBEDA, dan itu disengaja:
//
// - Ikhwan: blok diturunkan otomatis dari keanggotaan `program_kelas_anggota`
//   (lihat `matrix-blok-data.ts`), karena nama kelasnya memang memisahkan
//   Takhassus / Tahfizh / sisanya.
// - Akhwat: nama kelas TAK bisa memisahkan Tahfidz dari Alumni/Talaqqi (semua
//   varian "Halaqah Pagi/Siang" + "Talaqqi" bercampur), dan dua kategori yang
//   dipakai koordinator — Takhashush & Koordinator — tak punya padanan kelas
//   sama sekali. Karena itu bloknya DISIMPAN, di kolom `pengajar.matrix_blok`,
//   mengikuti list subjektif koordinator akhwat.
//
// Sengaja BEBAS import server (supabaseAdmin) supaya bisa dipakai komponen
// client. Query-nya ada di `matrix-blok-data.ts`.

import type { Gender } from '@/types/db';

export type MatrixBlok =
  | 'takhassus'
  | 'koordinator'
  | 'tahfizh'
  | 'talaqqi'
  | 'maahir6'
  | 'lintas'
  | 'tanpa_kelas';

/** Urutan tampil blok, atas ke bawah — beda per gender. */
const ORDER: Record<Gender, readonly MatrixBlok[]> = {
  ikhwan: ['takhassus', 'tahfizh', 'talaqqi', 'lintas', 'tanpa_kelas'],
  akhwat: ['takhassus', 'koordinator', 'tahfizh', 'talaqqi', 'maahir6', 'tanpa_kelas'],
};

export function urutanBlok(gender: Gender): readonly MatrixBlok[] {
  return ORDER[gender];
}

/** Semua blok yang sah disimpan di `pengajar.matrix_blok` (akhwat). */
export const MATRIX_BLOK_TERSIMPAN: readonly MatrixBlok[] = [
  'takhassus',
  'koordinator',
  'tahfizh',
  'talaqqi',
  'maahir6',
];

export function isMatrixBlok(v: unknown): v is MatrixBlok {
  return typeof v === 'string' && (MATRIX_BLOK_TERSIMPAN as readonly string[]).includes(v);
}

const LABEL: Record<Gender, Record<MatrixBlok, string>> = {
  ikhwan: {
    takhassus: 'Peserta Takhassus',
    koordinator: 'Koordinator',
    tahfizh: "Peserta Tahfidzul Qur'an",
    talaqqi: 'Peserta Talaqqi / Alumni / lainnya',
    maahir6: 'Peserta Maahir 6',
    lintas: 'Lintas jenis (anggota ≥2 blok)',
    tanpa_kelas: 'Tanpa kelas Maahir',
  },
  akhwat: {
    takhassus: 'Takhashush',
    koordinator: 'Koordinator',
    tahfizh: 'Tahfidz',
    talaqqi: 'Alumni / Talaqqi',
    maahir6: 'Maahir 6A–6D',
    lintas: 'Lintas jenis (anggota ≥2 blok)',
    tanpa_kelas: 'Belum dikelompokkan',
  },
};

const KETERANGAN: Record<Gender, Record<MatrixBlok, string>> = {
  ikhwan: {
    takhassus: 'Anggota kelas Maahir Takhassus.',
    koordinator: 'Koordinator halaqah.',
    tahfizh: "Anggota kelas Maahir Tahfidzul Qur'an 1 & 2.",
    talaqqi:
      'Anggota kelas Maahir selain Takhassus & Tahfidz (Talaqqi, Alumni, Maahir 6A/6B, Intensif, dll).',
    maahir6: 'Anggota kelas Maahir 6.',
    lintas: 'Terdaftar di lebih dari satu jenis kelas — tak bisa dimasukkan satu blok.',
    tanpa_kelas: 'Tak punya keanggotaan kelas Maahir yang aktif pada bulan ini.',
  },
  akhwat: {
    takhassus: 'Pengajar Takhashush.',
    koordinator: 'Koordinator halaqah akhwat.',
    tahfizh: 'Pengajar Tahfidz.',
    talaqqi: 'Pengajar Alumni / Talaqqi.',
    maahir6: 'Pengajar kelas Maahir 6A, 6B, 6C, & 6D.',
    lintas: 'Terdaftar di lebih dari satu jenis kelas — tak bisa dimasukkan satu blok.',
    tanpa_kelas: 'Belum dimasukkan ke blok mana pun oleh koordinator.',
  },
};

export function labelBlok(blok: MatrixBlok, gender: Gender): string {
  return LABEL[gender][blok];
}

export function keteranganBlok(blok: MatrixBlok, gender: Gender): string {
  return KETERANGAN[gender][blok];
}

/** Jenis kelas yang bisa jadi blok tunggal (jalur otomatis ikhwan). */
export type JenisKelasMaahir = 'takhassus' | 'tahfizh' | 'talaqqi';

function normal(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

/**
 * Jenis kelas dari NAMANYA — tak ada kolom penanda di `program_kelas`.
 * Urutan cek penting: 'Takhassus' diperiksa lebih dulu, sisanya yang bukan
 * Takhassus/Tahfizh jatuh ke 'talaqqi' (termasuk Alumni, Maahir 6A/6B,
 * Intensif, & kelas lain-lain).
 *
 * Ejaannya beragam: kelas asli di DB tertulis "Maahir Tahfidzul Qur'an 1/2"
 * (d-z), sementara orang juga menulis 'Tahfizul'/'Tahfizhul'/'Tahfizh'. Karena
 * itu pencocokan berhenti di prefiks 'tahfi' saja — semua variannya berawal
 * begitu, dan tak ada kata lain di nama kelas yang mengandungnya.
 */
export function jenisKelasMaahir(name: string): JenisKelasMaahir {
  const n = normal(name);
  if (n.includes('takhassus') || n.includes('takhasus')) return 'takhassus';
  if (n.includes('tahfi')) return 'tahfizh';
  return 'talaqqi';
}

/** Blok final dari kumpulan jenis kelas yang diikuti satu orang. */
export function blokDariJenis(jenis: ReadonlySet<JenisKelasMaahir>): MatrixBlok {
  if (jenis.size === 0) return 'tanpa_kelas';
  if (jenis.size > 1) return 'lintas';
  return [...jenis][0];
}
