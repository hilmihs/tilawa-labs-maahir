import type { RoleAccess } from '@/types/db';
import type { IkonNama } from '@/components/FiturIkon';

export interface FeatureLink {
  href: string;
  title: string;
  description: string;
  match: (a: RoleAccess) => boolean;
  /**
   * Sembunyikan dari semua orang kecuali superadmin (termasuk saat superadmin
   * memakai "login sebagai"). Dipakai untuk fitur yang sudah ter-deploy tetapi
   * belum diumumkan — halamannya sendiri juga menjaga diri, ini hanya menutup
   * pintunya dari menu.
   */
  superadminOnly?: boolean;
  /**
   * Akses yang tak bisa dibaca dari role sesi — diturunkan dari DB per-request
   * (pengajar kelas Maahir lewat nomor WA; pemantau rekapnya lewat flag
   * koordinator). Link hanya tampil bila opsi bersangkutan true.
   */
  requires?: 'pengajarMaahir' | 'rekapPengajarMaahir';
  /** Kelompok menu di beranda — lihat `FEATURE_GROUPS` untuk urutannya. */
  group: FeatureGroup;
  /** Deskripsi satu baris untuk beranda; `description` tetap dipakai di tempat lain. */
  short: string;
  /** Ikon di menu beranda. */
  ikon: IkonNama;
}

export type FeatureGroup = 'mengajar' | 'maahir' | 'nilai' | 'koordinasi' | 'admin' | 'lainnya';

/** Urutan & judul kelompok menu di beranda. */
export const FEATURE_GROUPS: { key: FeatureGroup; label: string }[] = [
  { key: 'mengajar', label: 'Mengajar' },
  { key: 'maahir', label: 'Kelas Maahir & 2in1' },
  { key: 'nilai', label: 'Nilai & kompetensi' },
  { key: 'koordinasi', label: 'Koordinasi' },
  { key: 'admin', label: 'Admin' },
  { key: 'lainnya', label: 'Lainnya' },
];

/**
 * Single source of truth: fitur yang bisa diakses per role/akses.
 * Dipakai oleh menu beranda (src/app/page.tsx).
 */
export const FEATURE_LINKS: FeatureLink[] = [
  {
    href: '/2in1',
    title: 'Barnamij 2in1',
    description: 'Setoran Hafalan — Tuhfatul Athfal, Al-Jazariyyah, Syawahid',
    group: 'maahir',
    short: 'Setoran hafalan Tuhfah, Jazariyyah, Syawahid',
    ikon: 'mic',
    match: (a) =>
      a.role === 'peserta' ||
      a.role === 'musyrif' ||
      a.role === 'koordinator' ||
      a.role === 'syaikh',
  },
  {
    href: '/penilaian',
    title: 'Penilaian Pengajar',
    description: 'Input skor Kualitas Bacaan & Hafalan pengajar (0–4) tiap bulan',
    group: 'nilai',
    short: 'Skor bacaan & hafalan pengajar (0–4)',
    ikon: 'bintang',
    match: (a) => a.role === 'koordinator' || a.role === 'syaikh',
  },
  {
    href: '/laporan',
    title: 'Laporan 2in1',
    description: 'Rekap & unduh laporan setoran hafalan per bulan',
    group: 'koordinasi',
    short: 'Rekap & unduh laporan setoran bulanan',
    ikon: 'dokumen',
    match: (a) => a.role === 'koordinator' || a.role === 'syaikh',
  },
  {
    href: '/2in1/koordinator/kehadiran',
    title: 'Kehadiran Maahir',
    description: 'Rekap kehadiran semua kelas Maahir per bulan',
    group: 'maahir',
    short: 'Rekap kehadiran semua kelas Maahir',
    ikon: 'grafik',
    match: (a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran',
  },
  {
    href: '/kehadiran/pengajar',
    title: 'Kehadiran',
    description: 'Check-in kehadiran Kelas Maahir, Kajian At-Tibyan',
    group: 'mengajar',
    short: 'Check-in Kelas Maahir & Kajian At-Tibyan',
    ikon: 'kalender',
    match: (a) => a.role === 'pengajar',
  },
  // Rekap Pertemuan: dua pintu ke URL yang sama — pengajar (role) dan pengajar
  // kelas Maahir tanpa role pengajar (lewat WA). featureLinksFor membuang duplikat href.
  {
    href: '/kehadiran/pertemuan',
    title: 'Rekap Pertemuan',
    description: 'Jumlah pertemuan tiap program & halaqah yang Anda ajar, periode 16–15',
    group: 'mengajar',
    short: 'Pertemuan per halaqah, periode 16–15',
    ikon: 'grafik',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/kehadiran/pertemuan',
    title: 'Rekap Pertemuan',
    description: 'Jumlah pertemuan tiap program & halaqah yang Anda ajar, periode 16–15',
    group: 'mengajar',
    short: 'Pertemuan per halaqah, periode 16–15',
    ikon: 'grafik',
    match: () => true,
    requires: 'pengajarMaahir',
  },
  {
    href: '/kehadiran/pengajar-maahir',
    title: 'Check-in Kelas Maahir',
    description: 'Check-in kehadiran & materi tiap sesi kelas Maahir yang Anda ampu',
    group: 'maahir',
    short: 'Check-in & materi tiap sesi yang Anda ampu',
    ikon: 'kalender',
    match: () => true,
    requires: 'pengajarMaahir',
  },
  {
    href: '/2in1/koordinator/kehadiran/pengajar',
    title: 'Kehadiran Pengajar Maahir',
    description: 'Rekap check-in & capaian materi pengajar kelas Maahir per periode 16–15',
    group: 'maahir',
    short: 'Rekap check-in pengajar per periode 16–15',
    ikon: 'grafik',
    match: () => true,
    requires: 'rekapPengajarMaahir',
  },
  {
    href: '/kehadiran/pengajar/matrix',
    title: 'Matrix Saya',
    description: 'Lihat nilai kompetensi (matrix) Anda bulan ini & rinciannya',
    group: 'nilai',
    short: 'Nilai kompetensi Anda bulan ini',
    ikon: 'bintang',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/kehadiran/ketua-kelompok/penilaian',
    title: 'Penilaian Pedagogis',
    description: 'Nilai kompetensi pedagogis & SOP pengajar di kelompok Anda tiap bulan',
    group: 'nilai',
    short: 'Nilai pedagogis anggota kelompok Anda',
    ikon: 'kelompok',
    match: (a) => a.role === 'pengajar' && a.is_ketua,
  },
  {
    href: '/2in1/koordinator/nonaktif',
    title: 'Nonaktifkan Orang',
    description: 'Keluarkan seseorang dari daftar setoran, presensi Maahir, rekap, dan laporan',
    group: 'koordinasi',
    short: 'Keluarkan orang dari daftar & rekap',
    ikon: 'larang',
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/matrix/koordinator',
    title: 'Matrix Skill Guru',
    description: 'Dashboard matrix penilaian pengajar HITS — Hard/Pedagogis/Soft Skill',
    group: 'nilai',
    short: 'Matrix Hard/Pedagogis/Soft Skill pengajar',
    ikon: 'bintang',
    // Syaikh ikut: halaman ini mendaratkannya di tampilan blok (peringkat per
    // jenis kelas), sementara koordinator mendarat di tabel 14 indikator.
    match: (a) => a.role === 'koordinator' || a.role === 'syaikh',
  },
  {
    href: '/2in1/koordinator/pedagogis',
    title: 'Pemantauan Pedagogis',
    description: 'Pantau skor pedagogis & SOP semua pengajar (read-only)',
    group: 'nilai',
    short: 'Pantau skor pedagogis & SOP (baca-saja)',
    ikon: 'mata',
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/kehadiran/ketua-kelompok/penilaian',
    title: 'Penilaian Pedagogis (Kelompok)',
    description: 'Lihat detail rubrik pedagogis per anggota tiap kelompok (baca-saja)',
    group: 'nilai',
    short: 'Rubrik pedagogis per kelompok (baca-saja)',
    ikon: 'kelompok',
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/2in1/koordinator/penilaian-ketua',
    title: 'Penilaian Ketua Kelompok',
    description: 'Koordinator menilai pedagogis para ketua kelompok (yang tak dinilai di flow kelompok)',
    group: 'nilai',
    short: 'Nilai pedagogis para ketua kelompok',
    ikon: 'kelompok',
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/observasi/koordinator',
    title: 'Koordinator Ketua Kelas',
    description: 'Tabayyun, reminder observasi, dan monitoring kondisi halaqah',
    group: 'koordinasi',
    short: 'Tabayyun, reminder observasi, kondisi halaqah',
    ikon: 'mata',
    match: (a) => a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/hits/koordinator',
    title: 'Soft Skill HITS',
    description: 'Riwayat keterangan pengajar & latihan per halaqah — kontribusi soft skill matrix',
    group: 'koordinasi',
    short: 'Keterangan pengajar & latihan per halaqah',
    ikon: 'grafik',
    match: (a) => a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/haqibah/koordinator',
    title: 'Kelola Haqibah',
    description: 'Kelola folder & berkas pembantu pengajar — unggah, ubah nama, hapus',
    group: 'koordinasi',
    short: 'Unggah & kelola berkas pembantu pengajar',
    ikon: 'tas',
    match: (a) => a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/hits/ketua',
    title: 'Ketua Kelas HITS',
    description: 'Isi keterangan pengajar & latihan mandiri tiap pertemuan',
    group: 'mengajar',
    short: 'Isi keterangan pengajar & latihan mandiri',
    ikon: 'bendera',
    match: (a) => a.role === 'ketua_kelas',
  },
  {
    href: '/hits/pengajar',
    // Bukan "Ketua Kelas HITS" — nama itu milik fitur ketua kelas di /hits/ketua.
    title: 'Tunjuk Ketua Kelas',
    description: 'Tunjuk peserta sebagai ketua kelas halaqah HITS Anda',
    group: 'mengajar',
    short: 'Pilih ketua kelas halaqah HITS',
    ikon: 'bendera',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/ketersediaan/pengajar',
    title: 'Ketersediaan Mengajar',
    description: 'Nyatakan slot waktu yang Anda sanggupi — lihat jadwal Anda & peminat tiap slot',
    group: 'mengajar',
    short: 'Slot waktu yang Anda sanggupi',
    ikon: 'jam',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/ketersediaan/koordinator',
    title: 'Kelola Ketersediaan',
    description: 'Periode & master slot, verifikasi isian, pasokan vs permintaan per slot',
    group: 'koordinasi',
    short: 'Periode, slot, verifikasi isian',
    ikon: 'jam',
    match: (a) => a.role === 'koordinator',
  },
  {
    href: '/evaluasi/pengajar',
    title: 'Evaluasi Halaqah',
    description: 'Nilai bacaan Qur’an peserta per sesi — hitung Lahn (tajwid) & skor',
    group: 'mengajar',
    short: 'Nilai bacaan & hitung Lahn per sesi',
    ikon: 'buku',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/haqibah/pengajar',
    title: 'Haqibatul Mu’allim',
    description: 'Berkas pembantu pengajar — panduan ujian, tatib/SOP, modul, kurikulum',
    group: 'lainnya',
    short: 'Panduan, SOP, modul, kurikulum',
    ikon: 'tas',
    match: (a) => a.role === 'pengajar',
  },
  {
    href: '/evaluasi/koordinator',
    title: 'Rekap Evaluasi Halaqah',
    description: 'Dashboard evaluasi bacaan Qur’an — rekap skor & Lahn lintas halaqah',
    group: 'koordinasi',
    short: 'Rekap skor & Lahn lintas halaqah',
    ikon: 'buku',
    match: (a) => a.role === 'koordinator' || a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/shakwa/koordinator',
    title: 'Rekap Shakwa',
    description: 'Aduan & permintaan yang masuk lewat formulir Shakwa — rekap harian & tindak lanjut',
    group: 'koordinasi',
    short: 'Aduan masuk & tindak lanjut',
    ikon: 'pesan',
    match: (a) => a.role === 'koordinator' || a.role === 'koordinator_ketua_kelas',
  },
  {
    href: '/shakwa',
    title: 'Shakwa',
    description: 'Sampaikan aduan, izin, masukan, atau cerita menarik ke koordinator',
    group: 'lainnya',
    short: 'Aduan, izin, masukan',
    ikon: 'pesan',
    match: () => true,
  },
  {
    href: '/akun',
    title: 'Akun',
    description: 'Ganti password & informasi akun Anda',
    group: 'lainnya',
    short: 'Ganti password',
    ikon: 'orang',
    match: () => true,
  },
];

export type FeatureLinkOpts = {
  superadmin?: boolean;
  pengajarMaahir?: boolean;
  rekapPengajarMaahir?: boolean;
};

export function featureLinksFor(
  accesses: RoleAccess[],
  opts: FeatureLinkOpts = {}
): FeatureLink[] {
  // Satu href satu entri: orang yang sekaligus ketua kelompok & koordinator
  // cocok dengan dua entri Penilaian Pedagogis ke URL yang sama — ambil yang pertama.
  const seen = new Set<string>();
  return FEATURE_LINKS.filter((f) => {
    if (f.superadminOnly && !opts.superadmin) return false;
    if (f.requires && !opts[f.requires]) return false;
    if (!accesses.some((a) => f.match(a))) return false;
    if (seen.has(f.href)) return false;
    seen.add(f.href);
    return true;
  });
}
