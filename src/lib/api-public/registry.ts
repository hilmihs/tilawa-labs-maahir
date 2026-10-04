// registry.ts — deklarasi entitas + daftar kolom terlarang + audit saat modul dimuat.
import type { EntityDef } from './types';

export const FORBIDDEN_COLUMNS: string[] = [
  'password_hash',
  // `whatsapp` = nama kolom di `eval_pengajar` (mirror hilmihs) — nomor WA di
  // app ini adalah identitas login, jadi setara kredensial.
  'whatsapp_number', 'whatsapp', 'ketua_wa', 'wakil_wa', 'pengajar_wa', 'pelapor_wa',
  'magic_token',
  'new_password_plaintext',
  // 'akses_token' = token /tabayyun/<token> dan /ketersediaan/konfirmasi/<token>:
  // pemegangnya bisa mengirim klarifikasi atau menyatakan kesediaan mengajar atas
  // nama pengajar. Setara kredensial, jangan pernah diekspos.
  // 'undangan_token' = /ketersediaan/undangan/<token>: membuka identitas halaqah
  // dan tautan grup WhatsApp kelas.
  'token', 'akses_token', 'undangan_token',
  // Nomor WA pendaftar, sebelum maupun sesudah dinormalisasi.
  'wa', 'wa_normal',
  // Tautan undangan grup WhatsApp — siapa pun yang memegangnya bisa masuk grup.
  'grup_wa_link', 'invite_link',
  'audio_url',
  'masukan', 'ket_bacaan', 'ket_hafalan', 'catatan_umum',
];

/** Lempar bila ada entitas menyebut kolom terlarang. Dipanggil saat modul dimuat. */
export function auditEntities(entities: Record<string, EntityDef>): void {
  for (const [key, def] of Object.entries(entities)) {
    for (const col of def.columns) {
      if (FORBIDDEN_COLUMNS.includes(col)) {
        throw new Error(`[api registry] entitas '${key}' menyebut kolom terlarang '${col}'`);
      }
    }
  }
}

export const ENTITIES: Record<string, EntityDef> = {
  'program-kelas': {
    route: 'program-kelas', table: 'program_kelas', scope: 'maahir',
    columns: ['id', 'name', 'gender', 'jadwal_hari', 'waktu_mulai', 'waktu_selesai', 'self_attendance', 'presensi_sifat', 'ikut_tibyan', 'created_at'],
    filters: [
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'self_attendance', column: 'self_attendance', kind: 'bool' },
      { param: 'presensi_sifat', column: 'presensi_sifat', kind: 'eq' },
      { param: 'ikut_tibyan', column: 'ikut_tibyan', kind: 'bool' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  anggota: {
    route: 'anggota', table: 'program_kelas_anggota', scope: 'maahir',
    columns: ['id', 'program_kelas_id', 'peserta_id', 'name', 'is_ketua', 'is_wakil', 'mulai_tanggal', 'created_at'],
    filters: [
      { param: 'program_kelas_id', column: 'program_kelas_id', kind: 'eq' },
      { param: 'is_ketua', column: 'is_ketua', kind: 'bool' },
      { param: 'is_wakil', column: 'is_wakil', kind: 'bool' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  pertemuan: {
    route: 'pertemuan', table: 'pertemuan_program', scope: 'maahir',
    columns: ['id', 'program_kelas_id', 'kelas_id', 'program', 'tanggal', 'nama_kegiatan', 'waktu_mulai', 'waktu_selesai', 'keterangan', 'created_at'],
    filters: [
      { param: 'program_kelas_id', column: 'program_kelas_id', kind: 'eq' },
      { param: 'program', column: 'program', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
  kehadiran: {
    route: 'kehadiran', table: 'kehadiran_peserta', scope: 'maahir',
    columns: ['id', 'pertemuan_id', 'anggota_id', 'peserta_id', 'status', 'mode', 'setoran_halaman', 'catatan', 'diisi_at', 'updated_at', 'created_at'],
    filters: [
      { param: 'pertemuan_id', column: 'pertemuan_id', kind: 'eq' },
      { param: 'anggota_id', column: 'anggota_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'mode', column: 'mode', kind: 'eq' },
      { param: 'sejak', column: 'updated_at', kind: 'since' },
    ],
    order: { column: 'updated_at', dir: 'desc' },
  },
  libur: {
    route: 'libur', table: 'program_kelas_libur', scope: 'maahir',
    columns: ['id', 'program_kelas_id', 'tanggal_mulai', 'tanggal_selesai', 'keterangan', 'created_at'],
    filters: [
      { param: 'program_kelas_id', column: 'program_kelas_id', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal_mulai', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal_selesai', kind: 'date_to' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  pemutihan: {
    route: 'pemutihan', table: 'maahir_pemutihan', scope: 'maahir',
    // `batch_id` menandai pemutihan yang lahir dari satu aksi massal koordinator
    // — konsumen bisa mengelompokkannya tanpa menebak lewat waktu & alasan.
    columns: ['id', 'anggota_id', 'month', 'tanggal', 'alasan', 'dibuat_oleh', 'dibatalkan_pada', 'batch_id', 'created_at'],
    filters: [
      { param: 'anggota_id', column: 'anggota_id', kind: 'eq' },
      { param: 'month', column: 'month', kind: 'eq' },
      { param: 'aktif', column: 'dibatalkan_pada', kind: 'is_null' },
      { param: 'batch_id', column: 'batch_id', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'laporan-note': {
    route: 'laporan-note', table: 'laporan_maahir_note', scope: 'maahir',
    columns: ['id', 'month', 'teks', 'urutan', 'created_at', 'updated_at'],
    filters: [{ param: 'month', column: 'month', kind: 'eq' }],
    order: { column: 'urutan', dir: 'asc' },
  },
  'setoran-target': {
    // Target setoran hafalan Takhassus, halaman PER BULAN (sejak migrasi 0070;
    // sebelumnya kolomnya bernama `halaman_per_hari` dan bersatuan hari).
    // anggota_id kosong = default seluruh kelas; berlaku_mulai membedakan versi,
    // baris lama tak dihapus saat target berubah.
    route: 'setoran-target', table: 'maahir_setoran_target', scope: 'maahir',
    columns: [
      'id', 'program_kelas_id', 'anggota_id', 'halaman_per_bulan',
      'berlaku_mulai', 'catatan', 'dibuat_oleh', 'created_at',
    ],
    filters: [
      { param: 'program_kelas_id', column: 'program_kelas_id', kind: 'eq' },
      { param: 'anggota_id', column: 'anggota_id', kind: 'eq' },
    ],
    order: { column: 'berlaku_mulai', dir: 'desc' },
  },
  peserta: {
    route: 'peserta', table: 'peserta', scope: 'maahir',
    columns: ['id', 'name', 'gender', 'kelas_id', 'active', 'created_at'],
    filters: [
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'active', column: 'active', kind: 'bool' },
      { param: 'kelas_id', column: 'kelas_id', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  kelas: {
    route: 'kelas', table: 'kelas', scope: 'maahir',
    columns: ['id', 'name', 'gender', 'musyrif_id', 'created_at'],
    filters: [{ param: 'gender', column: 'gender', kind: 'eq' }],
    order: { column: 'name', dir: 'asc' },
  },
  setoran: {
    route: 'setoran', table: 'setoran', scope: 'maahir',
    columns: ['id', 'peserta_id', 'week_start', 'status', 'submitted_at', 'checked_at', 'checked_by_musyrif_id', 'created_at', 'updated_at'],
    filters: [
      { param: 'peserta_id', column: 'peserta_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'week_start', column: 'week_start', kind: 'eq' },
      { param: 'tanggal_dari', column: 'week_start', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'week_start', kind: 'date_to' },
    ],
    order: { column: 'week_start', dir: 'desc' },
  },
  rekaman: {
    route: 'rekaman', table: 'rekaman', scope: 'maahir',
    columns: ['id', 'setoran_id', 'jenis', 'duration_seconds', 'recorded_at', 'nilai', 'checked_at', 'created_at'],
    filters: [
      { param: 'setoran_id', column: 'setoran_id', kind: 'eq' },
      { param: 'jenis', column: 'jenis', kind: 'eq' },
      { param: 'nilai', column: 'nilai', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'setoran-musyrif': {
    route: 'setoran-musyrif', table: 'setoran_musyrif', scope: 'maahir',
    columns: ['id', 'musyrif_id', 'week_start', 'status', 'submitted_at', 'checked_at', 'checked_by_syaikh_id', 'created_at'],
    filters: [
      { param: 'musyrif_id', column: 'musyrif_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'week_start', column: 'week_start', kind: 'eq' },
      { param: 'tanggal_dari', column: 'week_start', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'week_start', kind: 'date_to' },
    ],
    order: { column: 'week_start', dir: 'desc' },
  },
  'rekaman-musyrif': {
    route: 'rekaman-musyrif', table: 'rekaman_musyrif', scope: 'maahir',
    columns: ['id', 'setoran_musyrif_id', 'jenis', 'duration_seconds', 'nilai', 'checked_at', 'created_at'],
    filters: [
      { param: 'setoran_musyrif_id', column: 'setoran_musyrif_id', kind: 'eq' },
      { param: 'jenis', column: 'jenis', kind: 'eq' },
      { param: 'nilai', column: 'nilai', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/batch': {
    route: 'hits/batch', table: 'hits_batch', scope: 'hits',
    columns: ['id', 'slug', 'name', 'start_date', 'active', 'created_at'],
    filters: [{ param: 'active', column: 'active', kind: 'bool' }],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/halaqah': {
    route: 'hits/halaqah', table: 'hits_halaqah', scope: 'hits',
    columns: ['id', 'batch_id', 'name', 'gender', 'pengajar_id', 'level', 'program', 'start_date', 'jadwal_hari', 'created_at'],
    filters: [
      { param: 'batch_id', column: 'batch_id', kind: 'eq' },
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'level', column: 'level', kind: 'eq' },
      { param: 'program', column: 'program', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/halaqah-peserta': {
    route: 'hits/halaqah-peserta', table: 'hits_halaqah_peserta', scope: 'hits',
    columns: ['id', 'halaqah_id', 'murid_id', 'nama', 'is_ketua', 'created_at'],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'is_ketua', column: 'is_ketua', kind: 'bool' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/kaldik-hari': {
    route: 'hits/kaldik-hari', table: 'hits_kaldik_hari', scope: 'hits',
    columns: ['id', 'batch_id', 'level', 'tanggal', 'pekan', 'is_libur'],
    filters: [
      { param: 'batch_id', column: 'batch_id', kind: 'eq' },
      { param: 'level', column: 'level', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
      { param: 'pekan', column: 'pekan', kind: 'eq' },
      { param: 'is_libur', column: 'is_libur', kind: 'bool' },
    ],
    order: { column: 'tanggal', dir: 'asc' },
  },
  'hits/kaldik-pertemuan': {
    route: 'hits/kaldik-pertemuan', table: 'hits_kaldik_pertemuan', scope: 'hits',
    columns: ['id', 'halaqah_id', 'level', 'pertemuan_no', 'tanggal', 'is_skipped', 'note'],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'level', column: 'level', kind: 'eq' },
      { param: 'pertemuan_no', column: 'pertemuan_no', kind: 'eq' },
      { param: 'is_skipped', column: 'is_skipped', kind: 'bool' },
    ],
    order: { column: 'pertemuan_no', dir: 'asc' },
  },
  'hits/keterangan-harian': {
    route: 'hits/keterangan-harian', table: 'hits_keterangan_harian', scope: 'hits',
    columns: ['id', 'halaqah_id', 'level', 'pertemuan_no', 'tanggal', 'kondisi', 'status_latihan', 'created_at'],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'level', column: 'level', kind: 'eq' },
      { param: 'pertemuan_no', column: 'pertemuan_no', kind: 'eq' },
      { param: 'kondisi', column: 'kondisi', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
  'hits/pelanggaran': {
    route: 'hits/pelanggaran', table: 'hits_pelanggaran', scope: 'hits',
    columns: ['id', 'keterangan_id', 'jenis', 'menit'],
    filters: [
      { param: 'keterangan_id', column: 'keterangan_id', kind: 'eq' },
      { param: 'jenis', column: 'jenis', kind: 'eq' },
    ],
    order: { column: 'id', dir: 'asc' },
  },
  'hits/hutang-bayar': {
    route: 'hits/hutang-bayar', table: 'hits_hutang_bayar', scope: 'hits',
    columns: ['id', 'halaqah_id', 'pengajar_id', 'keterangan_id', 'menit', 'sumber', 'tanggal', 'created_at'],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
  'hits/teguran': {
    route: 'hits/teguran', table: 'hits_teguran', scope: 'hits',
    columns: ['id', 'pengajar_id', 'category', 'year_month', 'nomor_teguran', 'created_at'],
    filters: [
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'category', column: 'category', kind: 'eq' },
      { param: 'year_month', column: 'year_month', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/tabayyun': {
    route: 'hits/tabayyun', table: 'hits_tabayyun', scope: 'hits',
    columns: ['id', 'keterangan_id', 'pengajar_id', 'status', 'kondisi', 'deadline_at', 'created_at'],
    filters: [
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'keterangan_id', column: 'keterangan_id', kind: 'eq' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
  'hits/kajian-presensi': {
    route: 'hits/kajian-presensi', table: 'hits_kajian_presensi', scope: 'hits',
    columns: ['id', 'tanggal', 'status', 'created_at'],
    filters: [
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
  'hits/kajian-libur': {
    route: 'hits/kajian-libur', table: 'hits_kajian_libur', scope: 'hits',
    columns: ['id', 'tanggal'],
    filters: [
      { param: 'tanggal_dari', column: 'tanggal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tanggal', kind: 'date_to' },
    ],
    order: { column: 'tanggal', dir: 'desc' },
  },
  'hits/pengajar': {
    route: 'hits/pengajar', table: 'pengajar', scope: 'hits',
    columns: ['id', 'name', 'gender', 'kelompok_id', 'is_ketua', 'matrix_exclude', 'active', 'created_at'],
    filters: [
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'active', column: 'active', kind: 'bool' },
      { param: 'kelompok_id', column: 'kelompok_id', kind: 'eq' },
    ],
    order: { column: 'name', dir: 'asc' },
  },
  'hits/kelompok-pengajar': {
    route: 'hits/kelompok-pengajar', table: 'kelompok_pengajar', scope: 'hits',
    columns: ['id', 'name', 'gender', 'created_at'],
    filters: [{ param: 'gender', column: 'gender', kind: 'eq' }],
    order: { column: 'name', dir: 'asc' },
  },
  'penilaian-peserta': {
    route: 'penilaian-peserta', table: 'penilaian_peserta', scope: 'penilaian',
    columns: ['id', 'peserta_id', 'year_month', 'skor_bacaan', 'skor_hafalan', 'assessor_role', 'updated_at'],
    filters: [
      { param: 'peserta_id', column: 'peserta_id', kind: 'eq' },
      { param: 'year_month', column: 'year_month', kind: 'eq' },
      { param: 'sejak', column: 'updated_at', kind: 'since' },
    ],
    order: { column: 'year_month', dir: 'desc' },
  },
  'penilaian-masyaikh': {
    route: 'penilaian-masyaikh', table: 'penilaian_masyaikh', scope: 'penilaian',
    columns: ['id', 'pengajar_id', 'year_month', 'skor_bacaan', 'skor_hafalan', 'assessor_role', 'updated_at'],
    filters: [
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'year_month', column: 'year_month', kind: 'eq' },
      { param: 'sejak', column: 'updated_at', kind: 'since' },
    ],
    order: { column: 'year_month', dir: 'desc' },
  },
  'penilaian-pedagogis': {
    route: 'penilaian-pedagogis', table: 'penilaian_pedagogis', scope: 'penilaian',
    columns: ['id', 'pengajar_id', 'year_month', 'skor_metode_pengajaran', 'skor_kepatuhan_silabus', 'skor_manajemen_halaqah', 'skor_evaluasi_penguasaan', 'skor_kepatuhan_sop', 'updated_at'],
    filters: [
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'year_month', column: 'year_month', kind: 'eq' },
      { param: 'sejak', column: 'updated_at', kind: 'since' },
    ],
    order: { column: 'year_month', dir: 'desc' },
  },
  'matrix-rekap': {
    route: 'matrix-rekap', table: 'matrix_rekap', scope: 'penilaian',
    columns: ['id', 'pengajar_id', 'year_month', 'skor_bacaan', 'skor_hafalan', 'skor_tajwid', 'skor_kehadiran_maahir', 'skor_kehadiran_tibyan', 'rata_rata_hard_skill', 'skor_metode_pengajaran', 'skor_kepatuhan_silabus', 'skor_manajemen_halaqah', 'skor_evaluasi_penguasaan', 'rata_rata_pedagogis', 'skor_kedisiplinan_waktu', 'skor_komitmen_jadwal', 'skor_tanggung_jawab', 'skor_kepatuhan_sop', 'rata_rata_soft_skill', 'rata_rata_keseluruhan', 'ranking', 'total_teguran_bulan', 'total_teguran_kumulatif', 'updated_at'],
    filters: [
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'year_month', column: 'year_month', kind: 'eq' },
      { param: 'sejak', column: 'updated_at', kind: 'since' },
    ],
    order: { column: 'year_month', dir: 'desc' },
  },
  'indikator-standar': {
    route: 'indikator-standar', table: 'indikator_standar', scope: 'penilaian',
    columns: ['kode', 'kategori', 'nama', 'standar'],
    filters: [{ param: 'kategori', column: 'kategori', kind: 'eq' }],
    order: { column: 'kode', dir: 'asc' },
  },
  // ── Evaluasi Halaqah (scope `evaluasi`) ──
  // `eval_*` adalah tabel mirror dari dashboard.example.org, ditimpa tiap sinkron —
  // konsumen harus memperlakukan `id`-nya sebagai kunci stabil, bukan barisnya.
  'evaluasi/batch': {
    route: 'evaluasi/batch', table: 'eval_batch', scope: 'evaluasi',
    // `family` = slug program induk; satu family bisa punya banyak angkatan
    // (`batch_label`/`batch_order`). Program berangkatan tunggal: family === id.
    columns: ['id', 'nama', 'aktif', 'family', 'batch_label', 'batch_order', 'rapot_ujian_terpisah', 'synced_at'],
    filters: [
      { param: 'aktif', column: 'aktif', kind: 'bool' },
      { param: 'family', column: 'family', kind: 'eq' },
    ],
    order: { column: 'nama', dir: 'asc' },
  },
  'evaluasi/pengajar': {
    // `whatsapp` TIDAK diekspos (ada di FORBIDDEN_COLUMNS) — itu identitas login.
    route: 'evaluasi/pengajar', table: 'eval_pengajar', scope: 'evaluasi',
    columns: ['id', 'nama', 'gender', 'synced_at'],
    filters: [{ param: 'gender', column: 'gender', kind: 'eq' }],
    order: { column: 'nama', dir: 'asc' },
  },
  'evaluasi/halaqah': {
    route: 'evaluasi/halaqah', table: 'eval_halaqah', scope: 'evaluasi',
    columns: ['id', 'nama', 'gender', 'mustawa', 'level', 'pengajar_id', 'batch_id', 'ambang_ujian', 'synced_at'],
    filters: [
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'batch_id', column: 'batch_id', kind: 'eq' },
      { param: 'level', column: 'level', kind: 'eq' },
    ],
    order: { column: 'nama', dir: 'asc' },
  },
  'evaluasi/peserta': {
    route: 'evaluasi/peserta', table: 'eval_peserta', scope: 'evaluasi',
    columns: ['id', 'nama', 'gender', 'halaqah_id', 'is_ketua', 'aktif', 'urutan', 'synced_at'],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'aktif', column: 'aktif', kind: 'bool' },
      { param: 'is_ketua', column: 'is_ketua', kind: 'bool' },
    ],
    order: { column: 'urutan', dir: 'asc' },
  },
  // Sesi evaluasi per halaqah. `status`: 'draft' = masih bisa disunting pengajar,
  // 'terkirim' = sudah dikirim ke koordinator. `dihapus` = sesi dibatalkan —
  // konsumen sebaiknya menyaring `dihapus=false`.
  'evaluasi/sesi': {
    route: 'evaluasi/sesi', table: 'evaluasi_sesi', scope: 'evaluasi',
    columns: [
      'id', 'halaqah_id', 'jenis', 'nomor_sesi', 'tgl_jadwal', 'surat', 'ayat_mulai',
      'ayat_selesai', 'ambang', 'status', 'dihapus', 'created_at', 'updated_at',
    ],
    filters: [
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'jenis', column: 'jenis', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'dihapus', column: 'dihapus', kind: 'bool' },
      { param: 'tanggal_dari', column: 'tgl_jadwal', kind: 'date_from' },
      { param: 'tanggal_sampai', column: 'tgl_jadwal', kind: 'date_to' },
      { param: 'sejak', column: 'updated_at', kind: 'ts_since' },
    ],
    order: { column: 'tgl_jadwal', dir: 'desc' },
  },
  // Nilai tiap peserta per sesi: jumlah kesalahan lahn per kategori + skor.
  // Baris milik sesi 'draft' masih bisa berubah — untuk angka final, ambil dulu
  // `evaluasi/sesi?status=terkirim` lalu saring nilai dengan `sesi_id`.
  // `catatan` (teks bebas pengajar) sengaja TIDAK diekspos.
  'evaluasi/nilai': {
    route: 'evaluasi/nilai', table: 'evaluasi_nilai', scope: 'evaluasi',
    columns: [
      'id', 'sesi_id', 'peserta_id', 'hadir', 'done', 'confirmed', 'ayat_terakhir',
      'jk_huruf', 'jk_harakat', 'jk_mad', 'jk_tasydid',
      'kh_izhar', 'kh_idgham_bighunnah', 'kh_idgham_bilaghunnah', 'kh_idgham_mimi',
      'kh_iqlab', 'kh_ikhfa_hakiki', 'kh_ikhfa_syafawi',
      'skor', 'updated_at',
    ],
    filters: [
      { param: 'sesi_id', column: 'sesi_id', kind: 'eq' },
      { param: 'peserta_id', column: 'peserta_id', kind: 'eq' },
      { param: 'hadir', column: 'hadir', kind: 'bool' },
      { param: 'confirmed', column: 'confirmed', kind: 'bool' },
      { param: 'sejak', column: 'updated_at', kind: 'ts_since' },
    ],
    order: { column: 'updated_at', dir: 'desc' },
  },
  // Rapot resmi (snapshot beku ber-QR). Yang keluar hanya ANGKA + lifecycle:
  //  - `token` tak pernah keluar (di FORBIDDEN_COLUMNS) — pemegangnya bisa
  //    membuka halaman verifikasi publik /evaluasi/rapot/cek/<token>.
  //  - `payload` tak diekspos — snapshot penuh itu memuat catatan bebas pengajar.
  // PERINGATAN KONSUMEN: `berkala_avg`/`ujian_pb_skor` punya SEMANTIK BERBEDA per
  // `jenis_rapot` (era legacy vs era track), jadi WAJIB filter `jenis_rapot`
  // sebelum menjumlahkan apa pun. Lihat EvaluasiRapot di src/types/db.ts.
  'evaluasi/rapot': {
    route: 'evaluasi/rapot', table: 'evaluasi_rapot', scope: 'evaluasi',
    columns: [
      'id', 'halaqah_id', 'peserta_id', 'jenis_rapot', 'nilai_akhir', 'berkala_avg',
      'ujian_skor', 'ujian_pb_skor', 'lulus', 'ambang', 'diterbitkan_oleh',
      'diterbitkan_at', 'status', 'superseded_by', 'dicabut_at',
    ],
    filters: [
      { param: 'peserta_id', column: 'peserta_id', kind: 'eq' },
      { param: 'halaqah_id', column: 'halaqah_id', kind: 'eq' },
      { param: 'jenis_rapot', column: 'jenis_rapot', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      { param: 'lulus', column: 'lulus', kind: 'bool' },
      // `diterbitkan_at` timestamptz — batas hari ditafsir WIB agar sama dengan
      // dashboard koordinator.
      { param: 'tanggal_dari', column: 'diterbitkan_at', kind: 'ts_from' },
      { param: 'tanggal_sampai', column: 'diterbitkan_at', kind: 'ts_to' },
      { param: 'sejak', column: 'diterbitkan_at', kind: 'ts_since' },
    ],
    order: { column: 'diterbitkan_at', dir: 'desc' },
  },
  musyrif: {
    route: 'musyrif', table: 'musyrif', scope: 'ref', refShared: true,
    columns: ['id', 'name', 'gender', 'active'],
    filters: [{ param: 'gender', column: 'gender', kind: 'eq' }, { param: 'active', column: 'active', kind: 'bool' }],
    order: { column: 'name', dir: 'asc' },
  },
  koordinator: {
    route: 'koordinator', table: 'koordinator', scope: 'ref', refShared: true,
    columns: ['id', 'name', 'gender', 'active'],
    filters: [{ param: 'gender', column: 'gender', kind: 'eq' }, { param: 'active', column: 'active', kind: 'bool' }],
    order: { column: 'name', dir: 'asc' },
  },
  syaikh: {
    route: 'syaikh', table: 'syaikh', scope: 'ref', refShared: true,
    columns: ['id', 'name', 'gender', 'active'],
    filters: [{ param: 'gender', column: 'gender', kind: 'eq' }, { param: 'active', column: 'active', kind: 'bool' }],
    order: { column: 'name', dir: 'asc' },
  },
  'koordinator-ketua-kelas': {
    route: 'koordinator-ketua-kelas', table: 'koordinator_ketua_kelas', scope: 'ref', refShared: true,
    columns: ['id', 'name', 'gender', 'active'],
    filters: [{ param: 'gender', column: 'gender', kind: 'eq' }, { param: 'active', column: 'active', kind: 'bool' }],
    order: { column: 'name', dir: 'asc' },
  },
  // Aduan Shakwa per-baris — MEMBUKA teks aduan (`isi`), nama pelapor, saran, dan
  // catatan reviewer. Ini PII + isi sensitif; entitas ini sengaja diberi scope
  // `shakwa` tersendiri agar hanya key yang eksplisit diberi scope itu bisa baca.
  // `lampiran` (path storage) TIDAK diekspos — butuh signed-URL & bisa bocor.
  shakwa: {
    route: 'shakwa', table: 'shakwa', scope: 'shakwa',
    columns: [
      'id', 'nomor_tiket', 'pelapor_type', 'pengajar_id', 'nama', 'gender', 'kategori',
      'halaqoh', 'isi', 'saran_kritik', 'status', 'catatan_reviewer', 'reviewed_by_role',
      'reviewed_at', 'created_at',
    ],
    filters: [
      { param: 'pelapor_type', column: 'pelapor_type', kind: 'eq' },
      { param: 'pengajar_id', column: 'pengajar_id', kind: 'eq' },
      { param: 'gender', column: 'gender', kind: 'eq' },
      { param: 'kategori', column: 'kategori', kind: 'eq' },
      { param: 'status', column: 'status', kind: 'eq' },
      // `created_at` timestamptz — batas hari ditafsir WIB (UTC+7) agar sama
      // persis dengan dashboard koordinator (lihat shakwa-rekap.ts). `sejak`
      // untuk sinkron inkremental (juga awal-hari WIB).
      { param: 'tanggal_dari', column: 'created_at', kind: 'ts_from' },
      { param: 'tanggal_sampai', column: 'created_at', kind: 'ts_to' },
      { param: 'sejak', column: 'created_at', kind: 'ts_since' },
    ],
    order: { column: 'created_at', dir: 'desc' },
  },
};

auditEntities(ENTITIES);

export function getEntity(route: string): EntityDef | null {
  return ENTITIES[route] ?? null;
}
