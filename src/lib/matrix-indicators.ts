// Single source of truth untuk 12 indikator Matrix Skill Guru.
// Label, kategori, standar, dan deskripsi diambil dari templat penilaian
// (Matrix Guru xlsx baris 1-4). Dipakai oleh tabel koordinator, halaman detail
// pengajar, radar chart, dan export Excel — supaya konsisten satu tempat.

import type { MatrixRow } from '@/lib/matrix-compute';

// 'inspeksi' dulu bernama 'pedagogis'. Kolom DB tetap rata_rata_pedagogis
// (lihat KATEGORI_RATA_KEY) supaya data historis tak perlu dimigrasi.
export type Kategori = 'hard' | 'inspeksi' | 'soft';

// key = nama kolom skor_* di matrix_rekap / MatrixRow.
// skor_metode_pengajaran tidak lagi jadi indikator tersendiri — nilainya
// dilebur ke skor_manajemen_halaqah (rata-rata keduanya), lihat matrix-compute.
export type IndikatorKey =
  | 'skor_bacaan'
  | 'skor_tajwid'
  | 'skor_kehadiran_maahir'
  | 'skor_kehadiran_tibyan'
  | 'skor_kepatuhan_silabus'
  | 'skor_manajemen_halaqah'
  | 'skor_evaluasi_penguasaan'
  | 'skor_kedisiplinan_waktu'
  | 'skor_komitmen_jadwal'
  | 'skor_tanggung_jawab'
  | 'skor_kepatuhan_sop';

export interface Indikator {
  key: IndikatorKey;
  label: string;
  short: string; // label ringkas untuk header tabel / sumbu radar
  kategori: Kategori;
  standar: number; // skala 0-4
  deskripsi: string; // kriteria standar (dari templat)
  /** Keterangan teks per-indikator tersimpan di kolom ini (jika ada). */
  keteranganKey?: string;
  sumber: string;
}

/** Urutan tampil kategori. Satu sumber supaya tak ada daftar tulis-tangan. */
export const KATEGORI_ORDER: readonly Kategori[] = ['hard', 'inspeksi', 'soft'];

export const KATEGORI_LABEL: Record<Kategori, string> = {
  hard: 'Kompetensi Al-Qur’an (Hard Skill)',
  inspeksi: 'Inspeksi',
  soft: 'Kompetensi Profesionalisme (Soft Skill)',
};

export const KATEGORI_RATA_KEY: Record<Kategori, keyof MatrixRow> = {
  hard: 'rata_rata_hard_skill',
  inspeksi: 'rata_rata_pedagogis',
  soft: 'rata_rata_soft_skill',
};

// Standar rata-rata per kategori (untuk pewarnaan agregat).
export const KATEGORI_STANDAR: Record<Kategori, number> = {
  hard: 3,
  inspeksi: 4,
  soft: 4,
};

// Bobot kategori untuk rata_rata_keseluruhan (keputusan rapat Agustus 2026):
// Hard Skill 40% · Observasi (soft) 40% · Inspeksi 20%. Kategori yang kosong
// (null) di-skip beserta bobotnya — sisanya dinormalisasi ulang (weightedAvg).
export const KATEGORI_BOBOT: Record<Kategori, number> = {
  hard: 0.4,
  soft: 0.4,
  inspeksi: 0.2,
};

export const STANDAR_KESELURUHAN = 3.67;

// Bobot hard skill — total 8 porsi. Null di-skip beserta bobotnya saat hitung
// rata_rata_hard_skill (lihat weightedAvg di matrix-compute.ts).
export const HARD_BOBOT: Partial<Record<IndikatorKey, number>> = {
  skor_kehadiran_maahir: 3,
  skor_kehadiran_tibyan: 3,
  skor_bacaan: 1,
  skor_tajwid: 1,
};

export const INDIKATOR: Indikator[] = [
  // A. Hard Skill
  {
    key: 'skor_bacaan',
    label: 'Kualitas Bacaan',
    short: 'Bacaan',
    kategori: 'hard',
    standar: 3,
    deskripsi: 'Nilai Ujian 70–85 — kualitas bacaan Al-Qur’an pengajar.',
    keteranganKey: 'keterangan_bacaan',
    sumber: 'Penilaian Masyaikh',
  },
  {
    key: 'skor_tajwid',
    label: 'Tajwid',
    short: 'Tajwid',
    kategori: 'hard',
    standar: 2,
    deskripsi: 'Penguasaan Nuraniyyah dan Tuhfatul Athfal (dari rekaman setoran 2in1).',
    sumber: 'Setoran 2in1',
  },
  {
    key: 'skor_kehadiran_maahir',
    label: 'Kehadiran Kelas Maahir',
    short: 'Hadir Maahir',
    kategori: 'hard',
    standar: 4,
    deskripsi: 'Kehadiran di Program Maahir / Halaqah Alumni 80–100%.',
    sumber: 'Kehadiran Pengembangan',
  },
  {
    key: 'skor_kehadiran_tibyan',
    label: 'Kehadiran Kajian At-Tibyan',
    short: 'Hadir At-Tibyan',
    kategori: 'hard',
    standar: 4,
    deskripsi: 'Kehadiran di Kajian At-Tibyan 80–100%.',
    sumber: 'Kehadiran Pengembangan',
  },
  // B. Inspeksi
  {
    key: 'skor_kepatuhan_silabus',
    label: 'Kepatuhan Silabus',
    short: 'Silabus',
    kategori: 'inspeksi',
    standar: 4,
    deskripsi: 'Hasil inspeksi menunjukkan pengajar mengikuti silabus.',
    keteranganKey: 'keterangan_silabus',
    sumber: 'Penilaian Pedagogis',
  },
  {
    key: 'skor_evaluasi_penguasaan',
    label: 'Evaluasi & Penguasaan',
    short: 'Evaluasi',
    kategori: 'inspeksi',
    standar: 4,
    deskripsi: 'Pengajar memberikan tugas latihan dan mengevaluasi penguasaan peserta.',
    keteranganKey: 'keterangan_evaluasi',
    sumber: 'Penilaian Pedagogis (ketua kelompok)',
  },
  // C. Soft Skill (Profesionalisme)
  {
    key: 'skor_manajemen_halaqah',
    label: 'Manajemen Halaqah',
    short: 'Manajemen',
    kategori: 'soft',
    standar: 4,
    deskripsi:
      'Pengajar mengikuti panduan modul, memberikan koreksi langsung, dan halaqah berjalan interaktif. ' +
      '(Gabungan dari “Metode Pengajaran Modul” + “Manajemen Halaqah” lama — nilainya rata-rata keduanya.)',
    keteranganKey: 'keterangan_halaqah',
    sumber: 'Penilaian Pedagogis',
  },
  {
    key: 'skor_kepatuhan_sop',
    label: 'Kepatuhan SOP Teknis',
    short: 'SOP Teknis',
    kategori: 'soft',
    standar: 4,
    deskripsi: 'Hasil inspeksi menunjukkan pengajar on-cam ketika KBM berlangsung.',
    keteranganKey: 'keterangan_sop',
    sumber: 'Inspeksi / Observasi Kelas',
  },
  {
    key: 'skor_kedisiplinan_waktu',
    label: 'Kedisiplinan Waktu (On-Time)',
    short: 'Disiplin',
    kategori: 'soft',
    standar: 4,
    deskripsi:
      'Hanya soal jam kelas: (1) Mulai Tepat Waktu — kelas dimulai sesuai jadwal, ' +
      'toleransi keterlambatan maksimal 5 menit (KMT); (2) Durasi Sesuai — kelas ' +
      'tidak diakhiri lebih awal (KBLA). Pertemuan yang diagendakan ulang (JKG) atau ' +
      'dibawakan badal tidak dinilai di sini — itu masuk Komitmen Jadwal & Kehadiran.',
    sumber: 'Laporan Ketua Kelas',
  },
  {
    key: 'skor_komitmen_jadwal',
    label: 'Komitmen Jadwal & Kehadiran',
    short: 'Komitmen',
    kategori: 'soft',
    standar: 4,
    deskripsi:
      'Soal kelas ada atau tidak: (1) Anti-Mangkir — kelas tidak diadakan tanpa ' +
      'pemberitahuan, dinilai dari tabayyun yang diputus BUKAN udzur syar\'i; ' +
      '(2) Stabilitas Jadwal — meminimalisir perubahan hari (JKG "diagendakan di hari ' +
      'lain") & pengalihan ke badal, agar ritme belajar murid terjaga.',
    sumber: 'HITS Keterangan Harian & Tabayyun',
  },
  {
    key: 'skor_tanggung_jawab',
    label: 'Tanggung Jawab & Keadilan',
    short: 'Tanggung Jawab',
    kategori: 'soft',
    standar: 4,
    deskripsi: 'Pengajar mengganti jadwal dan memastikan semua murid hadir atau mendapat sesi privat.',
    sumber: 'Laporan Ketua Kelas',
  },
];

export const INDIKATOR_BY_KATEGORI: Record<Kategori, Indikator[]> = {
  hard: INDIKATOR.filter((i) => i.kategori === 'hard'),
  inspeksi: INDIKATOR.filter((i) => i.kategori === 'inspeksi'),
  soft: INDIKATOR.filter((i) => i.kategori === 'soft'),
};

/** Warna skor relatif terhadap standar (pakai CSS token). */
export function scoreColor(value: number | null | undefined, standar: number): string {
  if (value === null || value === undefined) return 'var(--muted-2)';
  if (value >= standar) return 'var(--hijau-ink)';
  if (value >= standar - 1) return 'var(--kuning-ink)';
  return 'var(--merah-ink)';
}
