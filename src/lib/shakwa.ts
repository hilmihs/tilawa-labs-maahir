// Konfigurasi formulir Shakwa — satu sumber kebenaran untuk halaman publik,
// dashboard koordinator, rekap harian, dan API publik.
//
// Kenapa terpusat: teks panduan, daftar kategori, dan nomor tujuan WA dipakai di
// empat tempat. Kalau masing-masing menyalin sendiri, satu perubahan kategori
// akan menghasilkan formulir dan rekap yang tak sepakat soal kategori apa saja
// yang ada.

import type { Gender } from '@/types/db';

export type ShakwaKategori =
  | 'evaluasi'
  | 'pengajar'
  | 'peserta'
  | 'cerita_menarik'
  | 'modul_kurikulum'
  | 'ketidaksesuaian_aplikasi'
  | 'izin'
  | 'tali_kasih';

/**
 * Kosakata status mengikuti tabel `shakwa` yang sudah ada sejak migrasi 0008 —
 * label Indonesianya di STATUS_LABEL. Mengganti nilai kolomnya berarti mengubah
 * check constraint tabel lama tanpa keuntungan nyata.
 */
export type ShakwaStatus = 'submitted' | 'in_review' | 'resolved' | 'closed';

/** Status yang bisa dipilih koordinator; 'closed' hanya dibaca bila sudah ada. */
export const STATUS_PILIHAN: ShakwaStatus[] = ['submitted', 'in_review', 'resolved'];

export type ShakwaPelaporType = 'peserta' | 'pengajar';

/** Kunci tujuan WA; nomornya di TUJUAN_WA (bisa ditimpa ENV). */
export type ShakwaTujuan = 'koordinator_pengajar' | 'koordinator_peserta' | 'koordinator_kk';

export type ShakwaFieldPilihan = {
  name: string;
  label: string;
  opsi: string[];
};

export type ShakwaKategoriDef = {
  value: ShakwaKategori;
  /** Label di dropdown "Laporan Terkait". */
  label: string;
  /** Judul blok pertanyaan, mengikuti gaya formulir asal. */
  judulBlok: string;
  /** Petunjuk format yang muncul di atas kotak isian. */
  hintFormat: string;
  /** Label kotak isian utama. */
  labelIsi: string;
  butuhLogin: boolean;
  pakaiLampiran: boolean;
  waTujuan: ShakwaTujuan | null;
  /** Pertanyaan tambahan sebelum kotak isian utama. */
  fieldTambahan: ShakwaFieldPilihan[];
};

export const KATEGORI: ShakwaKategoriDef[] = [
  {
    value: 'evaluasi',
    label: 'Evaluasi',
    judulBlok: 'E V A L U A S I',
    hintFormat:
      'Nama; (jika tidak ingin dicantumkan silakan dikosongkan)\nHITS Batch .... dasar/lanjutan;\n\nEvaluasi;',
    labelIsi: 'Silakan tuliskan evaluasinya',
    butuhLogin: false,
    pakaiLampiran: false,
    waTujuan: 'koordinator_kk',
    fieldTambahan: [],
  },
  {
    value: 'pengajar',
    label: 'Pengajar',
    judulBlok: 'P E N G A J A R',
    hintFormat: 'Nama Lengkap Pengajar:\nHITS Batch .... dasar/lanjutan;\n\nPermintaan:',
    labelIsi: 'Permintaan / kendala terkait pengajar',
    butuhLogin: false,
    pakaiLampiran: false,
    waTujuan: 'koordinator_pengajar',
    fieldTambahan: [],
  },
  {
    value: 'peserta',
    label: 'Peserta',
    judulBlok: 'P E S E R T A',
    hintFormat: 'HITS Batch .... dasar/lanjutan\nHal;\n\nPermintaan:',
    labelIsi: 'Permintaan / kendala terkait peserta',
    butuhLogin: false,
    pakaiLampiran: false,
    waTujuan: 'koordinator_peserta',
    fieldTambahan: [],
  },
  {
    value: 'cerita_menarik',
    label: 'Cerita Menarik',
    judulBlok: 'C E R I T A   M E N A R I K',
    hintFormat:
      'Nama Lengkap Pengajar:\nNama Lengkap Peserta;\nHITS Batch .... dasar/lanjutan;\n\nCerita Menarik:',
    labelIsi: 'Ceritakan momennya',
    butuhLogin: false,
    pakaiLampiran: true,
    waTujuan: 'koordinator_kk',
    fieldTambahan: [],
  },
  {
    value: 'modul_kurikulum',
    label: 'Modul dan Kurikulum',
    judulBlok: 'M O D U L   D A N   K U R I K U L U M',
    hintFormat:
      'Apabila menemukan kesalahan atau kejanggalan dalam modul, panduan, dan lain-lain, silakan tuliskan saran atau koreksinya. Lampirkan foto bila perlu.',
    labelIsi: 'Saran / koreksi modul & kurikulum',
    butuhLogin: false,
    pakaiLampiran: true,
    waTujuan: 'koordinator_pengajar',
    fieldTambahan: [],
  },
  {
    value: 'ketidaksesuaian_aplikasi',
    label: 'Ketidaksesuaian Halaqah dengan Aplikasi',
    judulBlok: 'L A P O R A N   A P L I K A S I   H I T S',
    hintFormat:
      'Jadwal/hari/jam halaqah, anggota halaqah, atau nama & level di aplikasi berbeda dengan kondisi riil. Silakan ceritakan kondisinya, lampirkan tangkapan layar bila ada.',
    labelIsi: 'Ceritakan kondisinya',
    butuhLogin: false,
    pakaiLampiran: true,
    waTujuan: 'koordinator_peserta',
    fieldTambahan: [],
  },
  {
    value: 'izin',
    label: 'Izin',
    judulBlok: 'I Z I N',
    hintFormat:
      'Sebutkan alasan tidak mengajar, lalu isi rincian di bawah agar tak perlu tabayyun lagi saat ketua kelas mengisi observasi.',
    labelIsi: 'Alasan tidak mengajar',
    butuhLogin: true,
    pakaiLampiran: false,
    waTujuan: 'koordinator_pengajar',
    // Tanpa pertanyaan "sudah menginfokan koordinator?" — laporan izin ini
    // sendiri sudah jadi pemberitahuannya, jadi pertanyaannya mubazir.
    fieldTambahan: [],
  },
  {
    value: 'tali_kasih',
    label: 'Tali Kasih',
    judulBlok: 'T A L I   K A S I H',
    hintFormat: 'Kondisinya;\nMasa belum turun:\nJenis pertanyaan;',
    labelIsi: 'Kondisi tali kasih',
    butuhLogin: true,
    pakaiLampiran: true,
    waTujuan: 'koordinator_kk',
    fieldTambahan: [
      {
        name: 'sudah_presensi',
        label: 'Apakah Anda sudah menyelesaikan presensi peserta dan absensi pengajar?',
        opsi: ['Sudah'],
      },
      {
        name: 'punya_rekening_cimb',
        label: 'Apakah sudah memasukkan rekening CIMB penampung?',
        opsi: ['Sudah', 'Belum'],
      },
    ],
  },
];

/**
 * Pseudo-kategori khusus formulir: lupa password bukan laporan yang perlu
 * ditindaklanjuti koordinator, pelapor hanya butuh halaman resetnya. Sengaja di
 * luar KATEGORI supaya nilainya tak pernah masuk tabel `shakwa`, rekap harian,
 * maupun API publik — formulir cuma mengalihkan ke LUPA_PASSWORD_PATH.
 */
export const KATEGORI_LUPA_PASSWORD = 'lupa_password';
export const LUPA_PASSWORD_PATH = '/lupa-password';

export const KATEGORI_BY_VALUE: Record<ShakwaKategori, ShakwaKategoriDef> = Object.fromEntries(
  KATEGORI.map((k) => [k.value, k])
) as Record<ShakwaKategori, ShakwaKategoriDef>;

export function kategoriDef(v: string): ShakwaKategoriDef | null {
  return KATEGORI_BY_VALUE[v as ShakwaKategori] ?? null;
}

export const KATEGORI_LABEL: Record<ShakwaKategori, string> = Object.fromEntries(
  KATEGORI.map((k) => [k.value, k.label])
) as Record<ShakwaKategori, string>;

export const STATUS_LABEL: Record<ShakwaStatus, string> = {
  submitted: 'Baru',
  in_review: 'Diproses',
  resolved: 'Selesai',
  closed: 'Ditutup',
};


export type ShakwaIzinJenis = 'KMT' | 'KBLA' | 'JKG' | 'TIDAK_HADIR' | 'BADAL';

export const IZIN_JENIS: Array<{
  value: ShakwaIzinJenis;
  label: string;
  butuhMenit: boolean;
  butuhTanggalGanti: boolean;
  /** Wajib memilih pengajar pengganti (segender) — lihat lib/shakwa-badal.ts. */
  butuhBadal: boolean;
}> = [
  { value: 'KMT', label: 'Kelas mulai terlambat', butuhMenit: true, butuhTanggalGanti: false, butuhBadal: false },
  { value: 'KBLA', label: 'Kelas berakhir lebih awal', butuhMenit: true, butuhTanggalGanti: false, butuhBadal: false },
  { value: 'JKG', label: 'Jadwal kelas ganti', butuhMenit: false, butuhTanggalGanti: true, butuhBadal: false },
  { value: 'BADAL', label: 'Digantikan pengajar lain (badal)', butuhMenit: false, butuhTanggalGanti: false, butuhBadal: true },
  { value: 'TIDAK_HADIR', label: 'Tidak mengajar sama sekali', butuhMenit: false, butuhTanggalGanti: false, butuhBadal: false },
];

export const IZIN_JENIS_LABEL: Record<ShakwaIzinJenis, string> = Object.fromEntries(
  IZIN_JENIS.map((j) => [j.value, j.label])
) as Record<ShakwaIzinJenis, string>;

/**
 * Nomor tujuan WA per kategori. Konstanta supaya perubahannya terekam di git;
 * ENV disediakan untuk ganti cepat tanpa deploy saat pemegang nomor berganti.
 */
export type TujuanWaEntry = { nama: string; nomor: string };

/**
 * Satu slot tujuan. Bila diisi lebih dari satu orang, laporan dibagi bergiliran
 * (round-robin) di antara mereka — lihat `tujuanWa`.
 */
export type TujuanWaSlot = TujuanWaEntry[];

/**
 * Nomor tujuan WA per kategori × gender. Semua tujuan dipisah ikhwan/akhwat
 * supaya laporan diarahkan ke koordinator sesuai gender pelapor.
 * ENV disediakan untuk ganti cepat tanpa deploy saat pemegang nomor berganti.
 */
export const TUJUAN_WA: Record<ShakwaTujuan, Record<Gender, TujuanWaSlot>> = {
  // Kategori: Pengajar, Modul & Kurikulum, Izin.
  koordinator_pengajar: {
    ikhwan: [
      {
        nama: process.env.SHAKWA_NAMA_KOORDINATOR_PENGAJAR_IKHWAN || 'Ustadz Nadia Nur Cahyani',
        nomor: process.env.SHAKWA_WA_KOORDINATOR_PENGAJAR_IKHWAN || '081491074122',
      },
    ],
    akhwat: [
      {
        nama: process.env.SHAKWA_NAMA_KOORDINATOR_PENGAJAR_AKHWAT || 'Ustadzah Zahra Firdaus',
        nomor: process.env.SHAKWA_WA_KOORDINATOR_PENGAJAR_AKHWAT || '081788557280',
      },
    ],
  },
  // Kategori: Peserta, Ketidaksesuaian Halaqah dengan Aplikasi.
  // Sisi ikhwan dipegang berdua dan digilir per laporan masuk.
  koordinator_peserta: {
    ikhwan: [
      {
        nama: process.env.SHAKWA_NAMA_KOORDINATOR_PESERTA_IKHWAN || 'Ustadz Ahmad Nur Nugroho',
        nomor: process.env.SHAKWA_WA_KOORDINATOR_PESERTA_IKHWAN || '081547229165',
      },
      {
        nama: process.env.SHAKWA_NAMA_KOORDINATOR_PESERTA_IKHWAN_2 || 'Ustadz Luthfi Zahira Pratama',
        nomor: process.env.SHAKWA_WA_KOORDINATOR_PESERTA_IKHWAN_2 || '081266623790',
      },
    ],
    akhwat: [
      {
        nama: process.env.SHAKWA_NAMA_KOORDINATOR_PESERTA_AKHWAT || 'Ustadzah Yusuf Handayani',
        nomor: process.env.SHAKWA_WA_KOORDINATOR_PESERTA_AKHWAT || '081331947687',
      },
    ],
  },
  // Koordinator ketua kelas. Kategori: Evaluasi, Cerita Menarik, Tali Kasih.
  koordinator_kk: {
    ikhwan: [
      {
        nama: process.env.SHAKWA_NAMA_KOORDINATOR_KK_IKHWAN || 'Ustadz Amina Fitri Wijaya',
        nomor: process.env.SHAKWA_WA_KOORDINATOR_KK_IKHWAN || '081084081353',
      },
    ],
    akhwat: [
      {
        nama: process.env.SHAKWA_NAMA_KOORDINATOR_KK_AKHWAT || 'Ustadzah Rafi Qonita Lestari',
        nomor: process.env.SHAKWA_WA_KOORDINATOR_KK_AKHWAT || '081697886921',
      },
    ],
  },
};

/**
 * Nomor & nama koordinator tujuan sesuai gender pelapor. Bila slotnya dipegang
 * beberapa orang, `urutan` (jumlah laporan sejenis yang sudah masuk) memutar
 * giliran supaya bebannya terbagi rata.
 */
export function tujuanWa(tujuan: ShakwaTujuan, gender: Gender, urutan = 0): TujuanWaEntry {
  const slot = TUJUAN_WA[tujuan][gender];
  const idx = ((urutan % slot.length) + slot.length) % slot.length;
  return slot[idx];
}

/** Apakah slot tujuan ini digilir beberapa orang — penanda perlu hitung urutan. */
export function tujuanDigilir(tujuan: ShakwaTujuan, gender: Gender): boolean {
  return TUJUAN_WA[tujuan][gender].length > 1;
}

/** Kategori lain yang berbagi tujuan yang sama — dasar penghitung giliran. */
export function kategoriSetujuan(tujuan: ShakwaTujuan): ShakwaKategori[] {
  return KATEGORI.filter((k) => k.waTujuan === tujuan).map((k) => k.value);
}

/** Teks panduan kategori di kepala formulir — sama dengan formulir asal. */
export const PANDUAN_KATEGORI: Array<{ judul: string; poin: string[] }> = [
  {
    judul: '1. Evaluasi',
    poin: [
      'Kendala teknis saat mengisi atau mengakses form evaluasi.',
      'Masukan, kritik, atau saran terkait pelaksanaan program secara umum.',
    ],
  },
  {
    judul: '2. Pengajar',
    poin: [
      'Absensi Pengajar: kendala teknis atau masalah pencatatan kehadiran pengajar.',
      'Grup Halaqoh: kendala operasional atau komunikasi di dalam grup halaqoh.',
      'Akses Admin: pengajar belum dijadikan admin pada grup halaqoh.',
      'Lainnya: permintaan atau kendala lain yang berkaitan dengan pengajar.',
    ],
  },
  {
    judul: '3. Peserta',
    poin: [
      'Peserta Belum Terdaftar: nama peserta belum tercantum di aplikasi.',
      'Aduan Peserta: keluhan atau masalah khusus terkait peserta.',
      'Mutasi / Perpindahan Peserta: kendala terkait proses perpindahan peserta.',
      'Perubahan data pribadi peserta (nomor WhatsApp, email, dll.).',
    ],
  },
  {
    judul: '4. Cerita Menarik',
    poin: [
      'Kisah inspiratif, perkembangan signifikan peserta, atau momen berkesan selama halaqah.',
    ],
  },
  {
    judul: '5. Modul dan Kurikulum',
    poin: [
      'Akses modul/materi pembelajaran tidak bisa dibuka atau hilang.',
      'Masukan atau laporan ketidaksesuaian isi materi/kurikulum.',
      'Kesulitan menerapkan metode pengajaran yang ada di modul.',
    ],
  },
  {
    judul: '6. Ketidaksesuaian Halaqah dengan Aplikasi',
    poin: [
      'Data jadwal, hari, atau jam halaqah di aplikasi berbeda dengan kondisi riil.',
      'Anggota halaqah di aplikasi tidak sesuai dengan daftar di grup sebenarnya.',
      'Nama halaqah atau level pembelajaran di aplikasi tidak sinkron.',
    ],
  },
  {
    judul: '7. Izin',
    poin: [
      'Pengajuan izin tidak hadir pengajar (sakit, acara keluarga, atau tugas lain).',
      'Permohonan izin cuti sementara dari kegiatan pengajaran.',
    ],
  },
  {
    judul: '8. Tali Kasih',
    poin: [
      'Belum Memiliki Rekening CIMB: pengajar belum memasukkan atau belum punya rekening penampung.',
      'Laporan lainnya.',
    ],
  },
  {
    judul: '9. Lupa Password',
    poin: [
      'Tak perlu mengisi formulir ini — pilih kategori "Lupa Password" lalu buka halaman resetnya.',
    ],
  },
];

export const MAX_LAMPIRAN = 3;
export const MAX_LAMPIRAN_BYTES = 5 * 1024 * 1024;
export const LAMPIRAN_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/** SKW-YYYYMMDD-NNN. `urut` = nomor urut kiriman pada tanggal itu (mulai 1). */
export function nomorTiket(tanggalISO: string, urut: number): string {
  return `SKW-${tanggalISO.replace(/-/g, '')}-${String(urut).padStart(3, '0')}`;
}
