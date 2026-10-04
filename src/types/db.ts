// Mirror dari schema SQL. Update kalau migration berubah.

import type { Jenis } from '@/lib/evaluasi';
import type { JenisRapot, RapotPayload } from '@/lib/rapot';

export type Gender = 'ikhwan' | 'akhwat';

export type StatusSetoran = 'draft' | 'submitted' | 'checked';

export type JenisRekaman = 'tuhfatul_athfal' | 'jazariyyah' | 'syawahid';

export type NilaiRekaman = 'hijau' | 'kuning' | 'merah';

export const JENIS_REKAMAN: JenisRekaman[] = [
  'tuhfatul_athfal',
  'jazariyyah',
  'syawahid',
];

export const JENIS_REKAMAN_LABEL: Record<JenisRekaman, string> = {
  tuhfatul_athfal: 'Tuhfatul Athfal',
  jazariyyah: 'Al-Jazariyyah',
  syawahid: 'Syawahid',
};

// Limit durasi maksimal rekaman per jenis (detik). Default 30 menit;
// Matan Al-Jazariyyah 45 menit. Dipakai client (AudioRecorder auto-stop).
export const JENIS_REKAMAN_MAX_DURASI_SEC: Record<JenisRekaman, number> = {
  tuhfatul_athfal: 30 * 60,
  jazariyyah: 45 * 60,
  syawahid: 30 * 60,
};

export const NILAI_LABEL: Record<NilaiRekaman, string> = {
  hijau: 'Hijau (Baik)',
  kuning: 'Kuning (Perlu Perbaikan)',
  merah: 'Merah (Belum Lulus)',
};

export interface Musyrif {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  last_login_at: string | null;
  active: boolean;
  created_at: string;
}

export interface Koordinator {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  last_login_at: string | null;
  active: boolean;
  created_at: string;
}

export interface Syaikh {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  last_login_at: string | null;
  active: boolean;
  created_at: string;
}

export interface Kelas {
  id: string;
  name: string;
  gender: Gender;
  musyrif_id: string;
  created_at: string;
}

export interface Peserta {
  id: string;
  name: string;
  gender: Gender;
  kelas_id: string;
  whatsapp_number: string;
  password_hash: string | null;
  active: boolean;
  created_at: string;
}

export interface Setoran {
  id: string;
  peserta_id: string;
  week_start: string; // ISO date (YYYY-MM-DD), Senin awal cycle 2-pekan
  status: StatusSetoran;
  submitted_at: string | null;
  checked_at: string | null;
  checked_by_musyrif_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Rekaman {
  id: string;
  setoran_id: string;
  jenis: JenisRekaman;
  audio_url: string | null;
  duration_seconds: number | null;
  recorded_at: string | null;
  nilai: NilaiRekaman | null;
  masukan: string | null;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetoranMusyrif {
  id: string;
  musyrif_id: string;
  week_start: string; // Senin awal cycle 2-pekan
  status: StatusSetoran;
  submitted_at: string | null;
  checked_at: string | null;
  checked_by_syaikh_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RekamanMusyrif {
  id: string;
  setoran_musyrif_id: string;
  jenis: JenisRekaman;
  audio_url: string | null;
  duration_seconds: number | null;
  recorded_at: string | null;
  nilai: NilaiRekaman | null;
  masukan: string | null;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

// ========== Ujian 2in1 (0080) ==========

// Predikat ujian 4 tingkat. Warna: mumtaz hijau, jayyid kuning, maqbul & dhaif
// sama-sama merah — tetap disimpan terpisah.
export type PredikatUjian = 'mumtaz' | 'jayyid' | 'maqbul' | 'dhaif';

export interface UjianPeriode {
  id: string;
  nama: string;
  mulai: string; // YYYY-MM-DD
  selesai: string; // YYYY-MM-DD, inklusif
  created_at: string;
  updated_at: string;
}

export interface Ujian {
  id: string;
  periode_id: string;
  peserta_id: string;
  status: StatusSetoran;
  submitted_at: string | null;
  checked_at: string | null;
  checked_by_musyrif_id: string | null;
  alasan_belum: string | null;
  alasan_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RekamanUjian {
  id: string;
  ujian_id: string;
  jenis: JenisRekaman;
  audio_url: string | null;
  duration_seconds: number | null;
  recorded_at: string | null;
  predikat: PredikatUjian | null;
  masukan: string | null;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

// Composite types untuk query dengan JOIN
export interface SetoranWithRekaman extends Setoran {
  rekaman: Rekaman[];
}

export interface PesertaWithKelas extends Peserta {
  kelas: Kelas;
}

// ========== HITS Matrix types ==========

export type KondisiKelas = 'KBBS' | 'KMT' | 'JKG' | 'KBLA' | 'LIBUR';
export type StatusLatihan = 'TAL' | 'PTML' | 'SML';
export type StatusCheckin = 'hadir' | 'izin' | 'sakit';
export type JenisAlasan = 'terlambat' | 'alpa';
export type StatusPengajuan = 'pending' | 'accepted' | 'rejected';
export type StatusTabayyun = 'pending' | 'awaiting_reason' | 'decided';

export const KONDISI_KELAS_LABEL: Record<KondisiKelas, string> = {
  KBBS: 'Kelas Berjalan Baik & Sesuai',
  KMT: 'Kelas Mulai Terlambat (>5 menit)',
  JKG: 'Jadwal Kelas Ganti',
  KBLA: 'Kelas Berakhir Lebih Awal',
  LIBUR: 'Libur / Tidak Ada Kelas',
};

export const STATUS_LATIHAN_LABEL: Record<StatusLatihan, string> = {
  TAL: 'Tidak Ada Latihan',
  PTML: 'Peserta Tidak Mengerjakan Latihan',
  SML: 'Semua Mengerjakan Latihan',
};

export const STATUS_CHECKIN_LABEL: Record<StatusCheckin, string> = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
};

export interface KelompokPengajar {
  id: string;
  name: string;
  gender: Gender;
  created_at: string;
}

export interface Pengajar {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  kelompok_id: string;
  is_ketua: boolean;
  musyrif_id: string | null;
  // Override id eval_pengajar (mirror hilmihs, 'wa:<nomor>'). null = cocokkan
  // otomatis lewat whatsapp_number — lihat evaluasi-pengajar.ts.
  eval_pengajar_id: string | null;
  // Blok ranking Matrix Skill Guru yang DISIMPAN (dipakai akhwat; ikhwan
  // diturunkan otomatis dari kelas Maahir). Nilai: lihat MATRIX_BLOK_TERSIMPAN
  // di lib/matrix-blok.ts. null = belum dikelompokkan.
  matrix_blok: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface KelasHits {
  id: string;
  name: string;
  gender: Gender;
  pengajar_id: string;
  jadwal_hari: string | null;
  jadwal_waktu_mulai: string | null;
  jadwal_waktu_selesai: string | null;
  created_at: string;
}

export interface KetuaKelas {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  password_hash: string | null;
  kelas_hits_id: string | null;
  batch_id: string | null;
  magic_token: string | null;
  hits_halaqah_id: string | null;
  hits_halaqah_peserta_id: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface KoordinatorKetuaKelas {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  link_grup_wa: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface BatchConfig {
  id: string;
  name: string;
  start_date: string;
  created_at: string;
}

// ---------- HITS soft-skill (batch-native, spreadsheet-driven) ----------

export type HitsLevel = 'qoidah_nuroniyyah' | 'perbaikan_bacaan';
export type HitsKondisi = 'KBBS' | 'KMT' | 'JKG' | 'KBLA' | 'LIBUR';
export type HitsStatusLatihan = 'TAL' | 'PTML' | 'SML';
export type HitsSource = 'sheet' | 'manual';
export type HitsStatusTabayyun = 'pending' | 'awaiting_reason' | 'decided';

export const HITS_LEVEL_LABEL: Record<HitsLevel, string> = {
  qoidah_nuroniyyah: 'Qoidah Nuroniyyah',
  perbaikan_bacaan: 'Perbaikan Bacaan',
};

export const HITS_KONDISI_LABEL: Record<HitsKondisi, string> = {
  KBBS: 'Kelas Berjalan Baik & Sesuai',
  KMT: 'Kelas Mulai Terlambat (>5 menit)',
  JKG: 'Jadwal Kelas Ganti',
  KBLA: 'Kelas Berakhir Lebih Awal',
  LIBUR: 'Libur / Tidak Ada Kelas',
};

export const HITS_STATUS_LATIHAN_LABEL: Record<HitsStatusLatihan, string> = {
  TAL: 'Tidak Ada Latihan',
  PTML: 'Peserta Tidak Mengerjakan Latihan',
  SML: 'Semua Mengerjakan Latihan',
};

// ---------- HITS pelanggaran (multi per pertemuan, tabel anak) ----------
// Satu pertemuan bisa punya beberapa pelanggaran sekaligus. KBBS = tak ada
// baris pelanggaran. BADAL = pengajar pengganti; guru asli dihitung JKG.
export type HitsPelanggaranJenis = 'KMT' | 'KBLA' | 'JKG' | 'BADAL' | 'TIDAK_LATIHAN';

export const HITS_PELANGGARAN_LABEL: Record<HitsPelanggaranJenis, string> = {
  KMT: 'Kelas Mulai Terlambat (>5 menit)',
  KBLA: 'Kelas Berakhir Lebih Awal',
  JKG: 'Jadwal Kelas Ganti',
  BADAL: 'Pengajar Digantikan (Badal)',
  TIDAK_LATIHAN: 'Latihan Mandiri Tidak Diberikan',
};

export const HITS_JKG_OPSI_LABEL: Record<'ganti_hari' | 'cicil', string> = {
  ganti_hari: 'Ganti hari (satu pertemuan penuh)',
  cicil: 'Dicicil ke beberapa pertemuan',
};

/** Label ringkas untuk headline kondisi/pelanggaran (KBBS/LIBUR + 5 jenis). */
export function hitsHeadlineLabel(x: string): string {
  if (x === 'KBBS') return HITS_KONDISI_LABEL.KBBS;
  if (x === 'LIBUR') return HITS_KONDISI_LABEL.LIBUR;
  return HITS_PELANGGARAN_LABEL[x as HitsPelanggaranJenis] ?? x;
}

export interface HitsPelanggaran {
  id: string;
  keterangan_id: string;
  jenis: HitsPelanggaranJenis;
  menit: number | null;
  jkg_opsi: 'ganti_hari' | 'cicil' | null;
  cicil_n: 2 | 3 | null;
  badal_nama: string | null;
  badal_mulai: 'sesuai' | 'lebih_awal' | null;
  created_at: string;
}

export interface HitsHutangBayar {
  id: string;
  halaqah_id: string;
  pengajar_id: string | null;
  keterangan_id: string | null;
  menit: number;
  tanggal: string;
  dilaporkan_oleh: string | null;
  catatan: string | null;
  /** 'ketua' = laporan ketua kelas (replace-all per keterangan). 'tabayyun' = disetujui koordinator. */
  sumber: 'ketua' | 'tabayyun';
  created_at: string;
}

export interface HitsBatch {
  id: string;
  name: string;
  slug: string;
  start_date: string;
  active: boolean;
  created_at: string;
}

export interface HitsKaldikHari {
  id: string;
  batch_id: string;
  level: HitsLevel;
  tanggal: string;
  hari: string;
  pekan: number | null;
  is_libur: boolean;
  libur_note: string | null;
  source: HitsSource;
  created_at: string;
}

export interface HitsKaldikPertemuan {
  id: string;
  halaqah_id: string;
  pertemuan_no: number;
  tanggal: string;
  pekan: number | null;
  is_skipped: boolean;
  note: string | null;
  set_by_role: string;
  set_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface HitsHalaqah {
  id: string;
  batch_id: string;
  level: HitsLevel | null;
  name: string;
  sheet_gid: string | null;
  jadwal_raw: string | null;
  jadwal_hari: string[];
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  gender: Gender | null;
  pengajar_nama_sheet: string | null;
  pengajar_id: string | null;
  pengajar_wa: string | null;
  source: HitsSource;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HitsHalaqahPeserta {
  id: string;
  halaqah_id: string;
  murid_id: string | null;
  nama: string;
  jenis_kelamin: string | null;
  status_peserta: string | null;
  is_ketua: boolean;
  ketua_wa: string | null;
  source: HitsSource;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HitsKeteranganHarian {
  id: string;
  halaqah_id: string;
  pertemuan_no: number;
  tanggal: string;
  kondisi: HitsKondisi;
  terlambat: boolean;
  latihan_diberikan: boolean | null;
  status_latihan: HitsStatusLatihan | null;
  semua_selesai: boolean | null;
  // Status on-cam pengajar saat KBM (sumber Kepatuhan SOP Teknis di matrix).
  // null = tak berlaku (libur / JKG / BADAL) atau belum diobservasi.
  pengajar_on_cam: boolean | null;
  catatan: string | null;
  diisi_by_role: string;
  diisi_by_id: string;
  editable: boolean;
  created_at: string;
  updated_at: string;
}

export interface HitsTabayyun {
  id: string;
  keterangan_id: string;
  halaqah_id: string;
  pengajar_id: string | null;
  koordinator_kk_id: string | null;
  kondisi: string; // headline pelanggaran (KMT/KBLA/JKG/BADAL/TIDAK_LATIHAN), relaxed dari enum di 0036
  alasan_pengajar: string | null;
  alasan_submitted_at: string | null;
  is_udzur_syari: boolean | null;
  keputusan_catatan: string | null;
  decided_at: string | null;
  status: HitsStatusTabayyun;
  deadline_at: string;
  reminder_sent_at: string | null;
  /** Token akses publik /tabayyun/<token>. Null = reminder belum pernah dikirim. */
  akses_token: string | null;
  /** Klaim pengajar (menit). 0 = belum menunaikan, null = belum menjawab. */
  bayar_menit_klaim: number | null;
  bayar_catatan: string | null;
  /** Disetujui koordinator; sumber baris hits_hutang_bayar sumber='tabayyun'. */
  bayar_menit_disetujui: number | null;
  /** Menit observasi − menit yang dilaporkan lewat izin pra-kelas. > 0 = izin tak menutupi. */
  izin_selisih_menit: number | null;
  created_at: string;
}

// ---------- Shakwa (formulir aduan & layanan) ----------

/** Tabel dari migrasi 0008 (+0015 reviewer, +0049 tiket/lampiran/jawaban). */
export interface Shakwa {
  id: string;
  nomor_tiket: string;
  pelapor_type: 'peserta' | 'pengajar';
  kategori: string; // ShakwaKategori — divalidasi di src/lib/shakwa.ts
  gender: Gender;
  nama: string;
  pelapor_wa: string | null;
  halaqoh: string | null;
  pengajar_id: string | null;
  isi: string;
  saran_kritik: string | null;
  jawaban: Record<string, string>;
  lampiran: string[];
  status: 'submitted' | 'in_review' | 'resolved' | 'closed';
  catatan_reviewer: string | null;
  reviewed_by_id: string | null;
  reviewed_by_role: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ShakwaIzin {
  id: string;
  shakwa_id: string;
  pengajar_id: string;
  halaqah_id: string | null;
  tanggal: string; // YYYY-MM-DD
  jenis: 'KMT' | 'KBLA' | 'JKG' | 'TIDAK_HADIR' | 'BADAL';
  menit: number | null;
  jadwal_ganti: string | null;
  /** Wajib untuk jenis BADAL, null untuk jenis lain (CHECK di 0091). */
  badal_pengajar_id: string | null;
  alasan: string;
  dipakai_tabayyun_id: string | null;
  created_at: string;
}

export interface HitsTeguran {
  id: string;
  pengajar_id: string;
  year_month: string;
  category: string;
  nomor_teguran: number;
  source_ref_type: string | null;
  source_ref_id: string | null;
  keterangan: string | null;
  issued_by_role: string;
  issued_by_id: string;
  created_at: string;
}

export interface HitsSheetSource {
  id: string;
  batch_id: string | null;
  kind: 'kaldik' | 'presensi';
  spreadsheet_id: string;
  gid: string | null;
  label: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  active: boolean;
  created_at: string;
}

export type HitsKajianStatus = 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpa';

export interface HitsKajianPresensi {
  id: string;
  ketua_wa: string;
  tanggal: string;            // YYYY-MM-DD (Minggu)
  status: HitsKajianStatus | null;
  checkin_at: string | null;  // ISO
  reminder_sent_at: string | null; // ISO
  created_at: string;
}

export interface HitsKajianLibur {
  id: string;
  tanggal: string;            // YYYY-MM-DD
  keterangan: string | null;
  created_at: string;
}

export interface ProgramKehadiran {
  id: string;
  name: string;
  hari: string[];
  waktu_mulai: string;
  waktu_selesai: string;
  active: boolean;
  created_at: string;
}

export interface CheckinPengajar {
  id: string;
  pengajar_id: string;
  program_id: string | null;
  kelas_hits_id: string | null;
  tanggal: string;
  status: StatusCheckin;
  checked_in_at: string;
  is_terlambat: boolean;
  invalidated_by: string | null;
  invalidated_at: string | null;
  created_at: string;
}

// ========== Check-in pengajar Kelas Maahir (0076) ==========

/** Pengajar kelas Maahir (program_kelas). Identitas = WA; tanpa password sendiri. */
export interface MaahirPengajar {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  active: boolean;
  created_at: string;
}

export interface MaahirPengajarKelas {
  id: string;
  pengajar_id: string;
  program_kelas_id: string;
  active: boolean;
  created_at: string;
}

export type StatusCheckinMaahir = 'hadir' | 'izin' | 'sakit';

export interface MaahirCheckinPengajar {
  id: string;
  pengajar_id: string;
  program_kelas_id: string;
  tanggal: string;
  status: StatusCheckinMaahir;
  /** Jam isi apa adanya — tak ada aturan terlambat. */
  checked_in_at: string;
  /** true = diisi bukan di hari-H. */
  susulan: boolean;
  materi: string | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
}

export interface PengajuanAlasan {
  id: string;
  pengajar_id: string;
  program_id: string | null;
  kelas_hits_id: string | null;
  tanggal: string;
  jenis: JenisAlasan;
  alasan: string;
  status: StatusPengajuan;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface LiburProgram {
  id: string;
  program_id: string | null;
  kelas_hits_id: string | null;
  tanggal: string;
  gender: Gender | null;
  keterangan: string | null;
  created_by_id: string | null;
  created_at: string;
}

export interface ObservasiKelas {
  id: string;
  kelas_hits_id: string;
  ketua_kelas_id: string;
  tanggal: string;
  kondisi: KondisiKelas;
  pengajar_on_cam: boolean | null;
  latihan_mandiri_diberikan: boolean | null;
  status_latihan_val: StatusLatihan | null;
  semua_siswa_selesai_latihan: boolean | null;
  catatan: string | null;
  created_at: string;
}

export interface Tabayyun {
  id: string;
  observasi_id: string;
  pengajar_id: string;
  koordinator_kk_id: string;
  alasan_pengajar: string | null;
  alasan_submitted_at: string | null;
  is_udzur_syari: boolean | null;
  keputusan_catatan: string | null;
  decided_at: string | null;
  status: StatusTabayyun;
  deadline_at: string;
  created_at: string;
}

export interface Teguran {
  id: string;
  pengajar_id: string;
  year_month: string;
  category: string;
  nomor_teguran: number;
  source_ref_type: string | null;
  source_ref_id: string | null;
  keterangan: string | null;
  issued_by_role: string;
  issued_by_id: string;
  created_at: string;
}

export interface MatrixRekap {
  id: string;
  pengajar_id: string;
  year_month: string;
  skor_bacaan: number | null;
  skor_hafalan: number | null;
  skor_tajwid: number | null;
  skor_kehadiran_maahir: number | null;
  skor_kehadiran_tibyan: number | null;
  rata_rata_hard_skill: number | null;
  skor_metode_pengajaran: number | null;
  skor_kepatuhan_silabus: number | null;
  skor_manajemen_halaqah: number | null;
  skor_evaluasi_penguasaan: number | null;
  rata_rata_pedagogis: number | null;
  skor_kedisiplinan_waktu: number | null;
  skor_komitmen_jadwal: number | null;
  skor_tanggung_jawab: number | null;
  skor_kepatuhan_sop: number | null;
  rata_rata_soft_skill: number | null;
  rata_rata_keseluruhan: number | null;
  ranking: number | null;
  total_teguran_bulan: number;
  total_teguran_kumulatif: number;
  finalized_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface IndikatorStandar {
  kode: string;
  nama: string;
  kategori: string;
  standar: number;
}

export const INDIKATOR_STANDAR: Record<string, number> = {
  bacaan: 3,
  hafalan: 1,
  tajwid: 2,
  kehadiran_maahir: 4,
  kehadiran_tibyan: 4,
  metode_pengajaran: 4,
  kepatuhan_silabus: 4,
  manajemen_halaqah: 4,
  evaluasi_penguasaan: 4,
  kedisiplinan_waktu: 4,
  komitmen_jadwal: 4,
  tanggung_jawab: 4,
  kepatuhan_sop: 4,
};

// ========== Password reset request ==========

export type StatusResetRequest = 'pending' | 'accepted' | 'declined';

export interface PasswordResetRequest {
  id: string;
  whatsapp_number: string;
  requester_name: string | null;
  status: StatusResetRequest;
  decided_by_wa: string | null;
  decided_at: string | null;
  created_at: string;
}

// ========== Evaluasi Halaqah (migration 0051) ==========

export interface EvalBatch {
  id: string;
  nama: string;
  aktif: boolean;
  /** Kolom kurasi (0058), tidak ikut ditimpa sinkron hilmihs.
   *  true = nilai akhir murni skor ujian + rapot Ujian QN/PB terpisah. */
  rapot_ujian_terpisah: boolean;
  /** Slug program induk (0073). Program berangkatan tunggal → sama dengan `id`. */
  family: string;
  /** Label angkatan, mis. "April 2026". null untuk program berangkatan tunggal. */
  batch_label: string | null;
  /** Urutan angkatan dalam family, menaik. null untuk program berangkatan tunggal. */
  batch_order: number | null;
  synced_at: string;
}

export interface EvalPengajar {
  id: string;
  nama: string;
  gender: Gender;
  whatsapp: string | null;
  synced_at: string;
}

export interface EvalHalaqah {
  id: string;
  nama: string;
  /** Koreksi lokal atas `nama` (0068); NULL = ikut data pusat. Tak disentuh sinkron. */
  nama_override: string | null;
  gender: Gender;
  mustawa: number | null;
  level: string | null;
  /** Koreksi lokal atas `level` (0068) — "Dasar" | "Lanjutan" | NULL. */
  level_override: string | null;
  pengajar_id: string | null;
  batch_id: string | null;
  ambang_ujian: number;
  /** Kolom yang sudah disunting lokal — kebal sync hilmihs (0074). */
  kurasi: string[];
  synced_at: string;
}

export interface EvalPeserta {
  id: string;
  nama: string;
  /** Koreksi ejaan lokal atas `nama` (0068); NULL = ikut data pusat. */
  nama_override: string | null;
  gender: Gender;
  halaqah_id: string | null;
  is_ketua: boolean;
  aktif: boolean;
  urutan: number;
  /** Kolom yang sudah disunting lokal — kebal sync hilmihs (0074). */
  kurasi: string[];
  synced_at: string;
}

export interface EvalConfig {
  gender: Gender;
  nama_qn: string;
  nama_pb: string;
  ujian_attempts: number;
  jadwal: { qn: string[]; pb: string[]; ujian: string[] };
  updated_at: string;
}

export interface EvaluasiSesi {
  id: string;
  halaqah_id: string;
  jenis: Jenis;
  nomor_sesi: number;
  tgl_jadwal: string | null;
  surat: string;
  ayat_mulai: number;
  ayat_selesai: number;
  ambang: number;
  status: 'draft' | 'terkirim';
  /** Soft-delete sesi ujian (0052). Reversible; nilai lama tetap tersimpan
   *  tapi sesi disembunyikan dari picker & progres. */
  dihapus: boolean;
  dibuat_oleh: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvaluasiNilai {
  id: string;
  sesi_id: string;
  peserta_id: string;
  hadir: boolean;
  ayat_terakhir: number | null;
  jk_huruf: number;
  jk_harakat: number;
  jk_mad: number;
  jk_tasydid: number;
  kh_izhar: number;
  kh_idgham_bighunnah: number;
  kh_idgham_bilaghunnah: number;
  kh_idgham_mimi: number;
  kh_iqlab: number;
  kh_ikhfa_hakiki: number;
  kh_ikhfa_syafawi: number;
  skor: number;
  catatan: string | null;
  confirmed: boolean;
  done: boolean;
  updated_at: string;
}

/**
 * Rapot resmi beku (0053) + lifecycle supersede/cabut (0054) + FK RESTRICT (0055)
 * + `ujian_skor` netral-track (0062). Snapshot ber-QR: barisnya TIDAK PERNAH
 * dihitung ulang, jadi baris era lama dan era track hidup berdampingan di tabel
 * yang sama dan kolom yang sama bisa punya semantik berbeda per `jenis_rapot`.
 */
export interface EvaluasiRapot {
  id: string;
  /** Token acak untuk URL verifikasi publik `/evaluasi/rapot/cek/[token]`. Unik. */
  token: string;
  halaqah_id: string;
  peserta_id: string;
  /** 4 nilai legacy ('berkala'|'ujian'|'ujian_qn'|'ujian_pb') + 2 track ('qn'|'pb'). */
  jenis_rapot: JenisRapot;
  nilai_akhir: number | null;
  /** SEMANTIK BEDA PER ERA: baris berkala/ujian = rata gabungan QN+PB; baris
   *  qn/pb = rata sesi track itu saja; baris ujian_qn/ujian_pb = null.
   *  Query yang membacanya WAJIB memfilter `jenis_rapot`. */
  berkala_avg: number | null;
  /** LEGACY (0053). Baris `qn` selalu null — pakai `ujian_skor`. */
  ujian_pb_skor: number | null;
  /** 0062. Skor ujian yang dipakai `nilai_akhir` baris ini:
   *  baris qn = Ujian QN; baris pb/ujian_pb/ujian = Ujian PB. */
  ujian_skor: number | null;
  lulus: boolean | null;
  /** Ambang yang dibekukan saat terbit (default DB 70). */
  ambang: number;
  /** Snapshot penuh; union dua era — persempit dengan `isRapotTrack`. */
  payload: RapotPayload;
  /** eval_pengajar.id; null bila pengajarnya sudah dihapus (ON DELETE SET NULL). */
  diterbitkan_oleh: string | null;
  diterbitkan_at: string;
  status: 'aktif' | 'digantikan' | 'dicabut';
  /** Rapot pengganti (0054); terisi pada baris berstatus 'digantikan'. */
  superseded_by: string | null;
  dicabut_at: string | null;
  dicabut_oleh: string | null;
}

/**
 * Keputusan koordinator atas peserta yang tidak lulus (0075): mengulang di KELAS
 * mana. Tidak mengubah status rapot — rapot menampilkannya sebagai keterangan
 * tambahan, dan hanya bila barisnya ada.
 */
export interface EvalKeputusanMengulang {
  peserta_id: string;
  /** Kelas pengulangan: 'qn' = Kelas QN, 'pb' = Kelas PB. */
  keputusan: 'qn' | 'pb';
  /** koordinator.id; null bila koordinatornya sudah dihapus. */
  ditetapkan_oleh: string | null;
  ditetapkan_at: string;
}

export interface EvalSyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  source_generated_at: string | null;
  counts: Record<string, { create?: number; update?: number; deactivate?: number }>;
  status: 'running' | 'ok' | 'error';
  error: string | null;
}
export interface EvalSyncStage {
  id: string;
  run_id: string;
  entity: 'batch' | 'pengajar' | 'halaqah' | 'peserta';
  op: 'create' | 'update' | 'deactivate';
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  flags: string[];
  applied_at: string | null;
  applied_by: string | null;
  rejected: boolean;
  rejected_by: string | null;
  created_at: string;
}

// ========== Haqibatul Mu'allim (migration 0059) ==========

export interface HaqibahFolder {
  id: string;
  /** null = folder akar. Maksimum 3 tingkat. */
  parent_id: string | null;
  nama: string;
  urutan: number;
  created_at: string;
  updated_at: string;
}

export interface HaqibahFile {
  id: string;
  /** null = berkas di akar (bukan di dalam folder). */
  folder_id: string | null;
  /** Nama tampil, TANPA ekstensi. */
  nama: string;
  /** Relatif terhadap bucket `haqibah`: '<uuid>.<ext>'. */
  storage_path: string;
  ext: string;
  mime: string;
  /** bigint di DB, dibaca sebagai number oleh parser pg (byte). */
  ukuran: number;
  urutan: number;
  /** Nama/WA aktor pengunggah, untuk jejak. */
  diunggah_oleh: string | null;
  created_at: string;
  updated_at: string;
}

// ========== Ketersediaan Mengajar HITS (ks_*) ==========
// Rancangan: docs/superpowers/specs/2026-08-30-ketersediaan-mengajar-hits-design.md
// Model bergulir: form ketersediaan boleh selalu terbuka, pendaftaran murid tak
// pernah ditutup per slot, halaqah lahir saat murid cukup + pengajar tersedia.

export type KsMode = 'online' | 'offline';
export type KsModePengajar = KsMode | 'keduanya';
/** 0 = Senin … 6 = Ahad. Sejajar dengan `int_days` /api/days CMS tilawah. */
export type KsHariIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** Dua kelompok umur (keputusan 16 Sep 2026). Pendaftar 15–17 tahun ikut kelompok pertama. */
export type KsPitaUmur = '<=45' | '46+';

export const KS_PITA_UMUR: KsPitaUmur[] = ['<=45', '46+'];

/** Rentang libur periode, tanggal `YYYY-MM-DD` inklusif. */
export interface KsLibur {
  mulai: string;
  selesai: string;
  keterangan: string;
}

export interface KsPeriode {
  id: string;
  nama: string;
  mulai: string;
  selesai: string;
  /** null = form sudah terbuka. */
  form_buka: string | null;
  /** null = tidak pernah ditutup (mode bergulir). */
  form_tutup: string | null;
  kapasitas_halaqah: number;
  minimal_slot: number;
  ambang_bentuk: number;
  ambang_bawah: number;
  usia_antrean_maks_hari: number;
  jeda_mulai_hari: number;
  tenggat_konfirmasi_jam: number;
  penyegaran_hari: number;
  pengingat_penyegaran_hari: number;
  /** Lama (0072). Tidak dibaca lagi — diganti dua kolom per jenjang di bawah. */
  jumlah_pertemuan: number;
  /** Pertemuan yang dibuat di CMS tilawah untuk halaqah HITS Dasar. 0 = tidak membuat. */
  jumlah_pertemuan_dasar: number;
  /** Pertemuan yang dibuat di CMS tilawah untuk halaqah HITS Lanjutan. 0 = tidak membuat. */
  jumlah_pertemuan_lanjutan: number;
  /** Tanggal yang dilompati saat menyusun tanggal pertemuan (0078). */
  libur: KsLibur[];
  /** Gerbang kirim ke CMS tilawah. false = outbox hanya mencatat payload. */
  kirim_nyata: boolean;
  tilawah_program_id: number | null;
  tilawah_batch_id: number | null;
  aktif: boolean;
  created_at: string;
  updated_at: string;
}

export interface KsSlot {
  id: string;
  periode_id: string;
  kelompok: Gender;
  mode: KsMode;
  /** Teks tampilan & ekspor, mis. "Senin & Rabu 06:00 - 07:30 WIB". */
  label: string;
  hari: string[];
  /** Kanonik untuk mesin — perbandingan teks hari tidak dapat diandalkan. */
  hari_idx: KsHariIdx[];
  waktu_mulai: string;
  waktu_selesai: string;
  lokasi: string | null;
  aktif: boolean;
  urutan: number;
  created_at: string;
  updated_at: string;
}

export type KsPengisianStatus = 'aktif' | 'basi' | 'nonaktif';

/** Asal isian: pengajar mengisi sendiri, atau diimpor koordinator dari xlsx. */
export type KsPengisianSumber = 'form' | 'impor';

export interface KsPengisian {
  id: string;
  periode_id: string;
  pengajar_id: string;
  mode: KsModePengajar;
  lokasi: string | null;
  alasan_kurang_slot: string | null;
  komitmen: boolean;
  catatan_koordinator: string | null;
  submitted_at: string | null;
  disegarkan_pada: string | null;
  pengingat_penyegaran_pada: string | null;
  status: KsPengisianStatus;
  terkunci: boolean;
  sumber: KsPengisianSumber;
  created_at: string;
  updated_at: string;
}

/**
 * Daftar pengajar yang boleh mengisi ketersediaan pada satu periode (0085).
 * Periode tanpa satu pun baris = semua pengajar boleh — lihat
 * `src/lib/ketersediaan-kelayakan.ts`.
 */
export interface KsKelayakan {
  id: string;
  periode_id: string;
  pengajar_id: string;
  boleh: boolean;
  alasan: string | null;
  diubah_oleh: string | null;
  created_at: string;
  updated_at: string;
}

export type KsKetersediaanStatus =
  | 'diajukan'
  | 'terverifikasi'
  | 'perlu_konfirmasi'
  | 'ditolak';

/** Enam butir verifikasi dokumen konsep, disimpan apa adanya di kolom `cek`. */
export interface KsCekButir {
  nama_terdaftar?: boolean;
  wa_sah?: boolean;
  tanpa_bentrok_maahir?: boolean;
  tanpa_bentrok_hits?: boolean;
  slot_cukup?: boolean;
  slot_aktif?: boolean;
}

export interface KsKetersediaan {
  id: string;
  pengisian_id: string;
  slot_id: string;
  status: KsKetersediaanStatus;
  cek: KsCekButir;
  /** Alasan pengajar saat menyanggah slot yang terkunci karena bentrok. */
  bentrok_alasan: string | null;
  sanggahan_status: 'menunggu' | 'diterima' | 'ditolak' | null;
  sanggahan_catatan: string | null;
  catatan: string | null;
  /** Urutan prioritas pengajar di jam ini (1 = didahulukan). null = tidak diatur. */
  prioritas: number | null;
  created_at: string;
  updated_at: string;
}

/** Kunci pemetaan kolom CSV responses Google Form pendaftaran murid. */
export interface KsPemetaanKolom {
  nama?: string;
  wa?: string;
  tanggal_lahir?: string;
  /** Kolom usia langsung. Dipakai bila tanggal lahir kosong atau tak terbaca. */
  umur?: string;
  gender?: string;
  level?: string;
  slot?: string;
  timestamp?: string;
  /** Tautan rekaman bacaan — bahan verifikasi pendaftar HITS Lanjutan. */
  rekaman?: string;
}

export interface KsPendaftarSumber {
  id: string;
  periode_id: string;
  nama: string;
  csv_url: string;
  pemetaan_kolom: KsPemetaanKolom;
  aktif: boolean;
  terakhir_tarik: string | null;
  terakhir_status: 'ok' | 'gagal' | null;
  terakhir_pesan: string | null;
  created_at: string;
  updated_at: string;
}

/** `diganti` = kiriman formulir lama dari orang yang sama, digantikan kiriman terbarunya. */
export type KsPendaftarStatus = 'valid' | 'ditahan' | 'dialokasikan' | 'batal' | 'diganti';

export interface KsPendaftar {
  id: string;
  periode_id: string;
  sumber_id: string | null;
  /** Cetakan timestamp + WA baris sheet. Tarikan ulang memperbarui, bukan menggandakan. */
  sumber_row_key: string;
  nama: string;
  wa: string | null;
  wa_normal: string | null;
  tanggal_lahir: string | null;
  umur: number | null;
  pita_umur: KsPitaUmur | null;
  gender: Gender | null;
  level_pilihan: string | null;
  slot_label_raw: string | null;
  slot_id: string | null;
  /** Tautan rekaman bacaan dari form, bila diisi. */
  rekaman_url: string | null;
  /** Timestamp baris sheet — dasar usia antrean. */
  didaftar_pada: string | null;
  status: KsPendaftarStatus;
  alasan_ditahan: string[];
  catatan: string | null;
  ditarik_pada: string;
  created_at: string;
  updated_at: string;
}

export interface KsPrioritasPreset {
  id: string;
  /** null = preset dipakai lintas periode. */
  periode_id: string | null;
  nama: string;
  gender: Gender;
  tipe: 'matrix' | 'manual';
  /** YYYY-MM, wajib bila tipe = 'matrix'. */
  matrix_bulan: string | null;
  dibuat_oleh: string | null;
  created_at: string;
  updated_at: string;
}

export interface KsPrioritasUrutan {
  id: string;
  preset_id: string;
  pengajar_id: string;
  urutan: number;
  created_at: string;
}

export type KsUsulanStatus =
  | 'usulan'
  | 'disetujui'
  | 'menunggu'
  | 'dikonfirmasi'
  | 'ditolak'
  | 'kedaluwarsa'
  | 'dikirim'
  | 'gagal'
  | 'batal';

export interface KsUsulan {
  id: string;
  periode_id: string;
  slot_id: string;
  pengajar_id: string | null;
  nama_halaqah: string | null;
  level: string;
  pita_umur: KsPitaUmur | null;
  /** true bila dibentuk dengan pita digabung karena antrean sudah terlalu tua. */
  pita_digabung: boolean;
  /** Putaran alokasi berputar yang melahirkannya. */
  putaran: number;
  urutan_prioritas: number | null;
  status: KsUsulanStatus;
  tanggal_mulai: string | null;
  akses_token: string | null;
  token_kedaluwarsa: string | null;
  dikonfirmasi_pada: string | null;
  alasan_tolak: string | null;
  grup_wa_link: string | null;
  grup_sumber: 'pengajar' | 'kolam' | null;
  tilawah_halaqah_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface KsUsulanPeserta {
  id: string;
  usulan_id: string;
  pendaftar_id: string;
  status: 'diusulkan' | 'terenroll' | 'gagal' | 'dikeluarkan';
  tilawah_user_id: number | null;
  undangan_token: string | null;
  undangan_dibuka_pada: string | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
}

export interface KsGrupPool {
  id: string;
  periode_id: string;
  gender: Gender;
  invite_link: string;
  status: 'kosong' | 'terpakai' | 'rusak';
  usulan_id: string | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
}

export interface KsTilawahSlotMap {
  id: string;
  periode_id: string;
  tilawah_batch_id: number;
  slot_id: string;
  day_id: number;
  session_id: number;
  /** true bila masih berisi tebakan mesin yang belum disahkan koordinator. */
  usulan_otomatis: boolean;
  disahkan_oleh: string | null;
  disahkan_pada: string | null;
  created_at: string;
  updated_at: string;
}

export interface KsTilawahLevelMap {
  id: string;
  periode_id: string;
  tilawah_batch_id: number;
  level_nama: string;
  level_id: number;
  disahkan_oleh: string | null;
  disahkan_pada: string | null;
  created_at: string;
  updated_at: string;
}

export type KsOutboxAksi =
  | 'buat_halaqah'
  | 'buat_pertemuan'
  | 'cari_user'
  | 'buat_user'
  | 'enrol';

export interface KsOutbox {
  id: string;
  usulan_id: string;
  peserta_id: string | null;
  aksi: KsOutboxAksi;
  urutan: number;
  payload: Record<string, unknown>;
  status: 'antre' | 'terkirim' | 'gagal' | 'dilewati';
  percobaan: number;
  respons: Record<string, unknown> | null;
  error_terakhir: string | null;
  terkirim_pada: string | null;
  created_at: string;
  updated_at: string;
}

export interface KsLog {
  id: string;
  periode_id: string | null;
  entitas: string;
  entitas_id: string | null;
  aksi: string;
  sebelum: Record<string, unknown> | null;
  sesudah: Record<string, unknown> | null;
  alasan: string | null;
  aktor_wa: string | null;
  aktor_nama: string | null;
  created_at: string;
}

export interface KsSlotRiwayat {
  id: string;
  periode_label: string;
  slot_label: string;
  kelompok: Gender;
  mode: KsMode;
  halaqah_terbentuk: number;
  halaqah_batal: number;
  pendaftar: number;
  sumber: 'impor' | 'sistem';
  created_at: string;
  updated_at: string;
}

// ========== Session types ==========

export interface PesertaSession {
  role: 'peserta';
  peserta_id: string;
  name: string;
  gender: Gender;
  kelas_id: string;
}

export interface MusyrifSession {
  role: 'musyrif';
  musyrif_id: string;
  name: string;
  gender: Gender;
}

export interface KoordinatorSession {
  role: 'koordinator';
  koordinator_id: string;
  name: string;
  gender: Gender;
}

export interface SyaikhSession {
  role: 'syaikh';
  syaikh_id: string;
  name: string;
  gender: Gender;
}

export interface PengajarSession {
  role: 'pengajar';
  pengajar_id: string;
  name: string;
  gender: Gender;
  kelompok_id: string;
  is_ketua: boolean;
}

export interface KetuaKelasSession {
  role: 'ketua_kelas';
  ketua_kelas_id: string;
  name: string;
  gender: Gender;
  kelas_hits_id: string | null;
  hits_halaqah_id?: string | null;
}

export interface KoordinatorKetuaKelasSession {
  role: 'koordinator_ketua_kelas';
  koordinator_kk_id: string;
  name: string;
  gender: Gender;
}

/**
 * Koordinator akses TERBATAS — hanya rekap Kehadiran Maahir
 * (/2in1/koordinator/kehadiran). Bukan role 'koordinator' penuh: semua halaman
 * koordinator lain (pedagogis, matrix, admin) tetap tertutup (deny-by-default).
 * Berasal dari baris koordinator dgn kolom kehadiran_only = true.
 */
export interface KoordinatorKehadiranSession {
  role: 'koordinator_kehadiran';
  koordinator_id: string;
  name: string;
  gender: Gender;
}

export type RoleAccess =
  | PesertaSession
  | MusyrifSession
  | KoordinatorSession
  | SyaikhSession
  | PengajarSession
  | KetuaKelasSession
  | KoordinatorKetuaKelasSession
  | KoordinatorKehadiranSession;

export type Session = RoleAccess;
export type Role = RoleAccess['role'];

export interface SessionData {
  active: RoleAccess;
  accesses: RoleAccess[];
}
