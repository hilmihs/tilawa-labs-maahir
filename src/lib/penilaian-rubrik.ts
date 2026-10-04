// Panduan standar skala penilaian kualitas pengajar (Bacaan & Hafalan).
// Sumber: sheet "Referensi" Template_Penilaian_Pengajar_HITS.xlsx.
// Single source of truth untuk legend di PenilaianMasyaikhForm.

export type RubrikSkala = {
  skala: 0 | 1 | 2 | 3 | 4;
  teks: string;
  standar?: boolean;
};

export const RUBRIK_BACAAN: RubrikSkala[] = [
  { skala: 0, teks: 'Akumulasi Lahn Jaliy + Lahn Khafiy 1–23' },
  { skala: 1, teks: 'Akumulasi Lahn Jaliy + Lahn Khafiy 24–46' },
  { skala: 2, teks: 'Akumulasi Lahn Jaliy + Lahn Khafiy 47–69' },
  { skala: 3, teks: 'Akumulasi Lahn Jaliy + Lahn Khafiy 70–85', standar: true },
  { skala: 4, teks: 'Akumulasi Lahn Jaliy + Lahn Khafiy 86–100' },
];

export const CATATAN_BACAAN =
  'Lahn Jaliy: Ubah Huruf, Ubah Harakat, Tukar Mad. ' +
  'Lahn Khafiy: Shifat Huruf, Kesempurnaan Makhraj, Itmamul Harakat, ' +
  'Hukum Nun & Mim, Zamanul Huruf, Zamanul Ghunnah, Zamanul Mudud.';

// Indikator Standar / Kriteria — kolom "Referensi" template.
export const KRITERIA_BACAAN = [
  'Tidak ada Lahn Jaliy dari hasil ujian akhir (setiap Lahn Jaliy mengurangi nilai 50).',
  'Kadar Lahn Khafiy dari hasil ujian akhir tidak boleh di bawah standar yang ditetapkan.',
];

export const RUBRIK_HAFALAN: RubrikSkala[] = [
  { skala: 0, teks: 'Hafal 0–4 juz' },
  { skala: 1, teks: 'Hafal 5–10 juz', standar: true },
  { skala: 2, teks: 'Hafal 11–15 juz' },
  { skala: 3, teks: 'Hafal 16–20 juz' },
  { skala: 4, teks: 'Hafal 21–30 juz' },
];

export const KRITERIA_HAFALAN = [
  'Menghafal 5 juz (prasyarat masuk Maahir).',
];

// ── Panduan Inspeksi (dulu "Kompetensi Pedagogis / Metodologi") ─────────────
// Sumber: sheet "Referensi" Matrix Guru.xlsx — B. Kompetensi Pedagogis.
// Pola skala 0–4 = jumlah teguran Koordinator: 4 teguran→0, 3→1, 2→2, 1→3,
// patuh (tanpa teguran)→4 (Standar). Standar tiap aspek = skala 4.

export type RubrikPedagogis = {
  /** key skor_* di penilaian_pedagogis / MatrixRow. */
  key:
    | 'skor_metode_pengajaran'
    | 'skor_kepatuhan_silabus'
    | 'skor_manajemen_halaqah'
    | 'skor_evaluasi_penguasaan';
  judul: string;
  kriteria: string[];
  skala: RubrikSkala[];
};

// Skala teguran generik (dipakai 4 aspek pedagogis), {X} = objek pelanggaran.
const teguranSkala = (patuhTeks: string, langgarTeks: string): RubrikSkala[] => [
  { skala: 0, teks: `${langgarTeks} dan mendapat teguran 4 kali` },
  { skala: 1, teks: `${langgarTeks} dan mendapat teguran 3 kali` },
  { skala: 2, teks: `${langgarTeks} dan mendapat teguran 2 kali` },
  { skala: 3, teks: `${langgarTeks} dan mendapat teguran 1 kali` },
  { skala: 4, teks: patuhTeks, standar: true },
];

export const RUBRIK_PEDAGOGIS: RubrikPedagogis[] = [
  {
    key: 'skor_kepatuhan_silabus',
    judul: 'Kepatuhan Silabus',
    kriteria: [
      'Sesuai Silabus: materi sesuai timeline dan bab yang ditetapkan (tidak terlalu cepat/lambat).',
      'Batas toleransi: tidak melebihi atau kurang dari 3 dars dari dars seharusnya.',
    ],
    skala: teguranSkala(
      'Hasil inspeksi menunjukkan pengajar mengikuti silabus',
      'Hasil inspeksi menunjukkan pengajar tidak mengikuti silabus'
    ),
  },
  {
    key: 'skor_manajemen_halaqah',
    judul: 'Manajemen Halaqah',
    kriteria: [
      'Menjelaskan materi sesuai dengan panduan dan modul pengajaran yang disusun Koordinator.',
      'Interaktif (2 arah): kelas tidak satu arah; pengajar memancing partisipasi aktif murid dan mengoreksi langsung.',
      'Keramahan: Senyum, Sapa, Salam; memanggil peserta dengan panggilan baik (mis. Mas/Mba + Nama).',
    ],
    skala: teguranSkala(
      'Hasil inspeksi menunjukkan pengajar mengikuti panduan modul, memberikan koreksi langsung, dan halaqah berjalan interaktif',
      'Hasil inspeksi menunjukkan pengajar tidak mengikuti panduan modul, tidak memberikan koreksi langsung, atau halaqah tidak interaktif'
    ),
  },
  {
    key: 'skor_evaluasi_penguasaan',
    judul: 'Evaluasi & Penguasaan',
    kriteria: [
      'Tugas Pekanan: wajib memberikan dan memeriksa tugas latihan mandiri kepada peserta setiap pekan.',
    ],
    skala: teguranSkala(
      'Hasil laporan observasi ketua kelas menunjukkan pengajar memberikan tugas latihan',
      'Hasil laporan observasi ketua kelas menunjukkan pengajar tidak memberikan tugas latihan'
    ),
  },
];

export const CATATAN_PEDAGOGIS =
  'Skala 0–4 mengikuti jumlah teguran Koordinator pada bulan berjalan: ' +
  '4 teguran = 0, 3 = 1, 2 = 2, 1 = 3, tanpa teguran (patuh) = 4 (Standar). ' +
  'Pengajar yang mencapai 4 kali teguran dinonaktifkan (Rujukan: SOP Penonaktifan Pengajar — HITS).';
