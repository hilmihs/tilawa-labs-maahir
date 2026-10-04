import type { Gender } from '@/types/db';

/**
 * Normalisasi nomor WhatsApp ke format internasional tanpa "+" / spasi.
 * Contoh: "0812-3456-7890" → "6281234567890"
 *         "+62 812 3456 7890" → "6281234567890"
 */
export function normalizeWhatsApp(input: string): string {
  let n = input.replace(/[^\d]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (!n.startsWith('62')) n = '62' + n;
  return n;
}

/**
 * Generate link wa.me dengan pesan pre-filled.
 * User tetap harus tap tombol "Kirim" di WhatsApp setelah link dibuka.
 */
export function buildWaMeUrl(phone: string, message: string): string {
  const normalized = normalizeWhatsApp(phone);
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encoded}`;
}

/**
 * Sapaan gender-aware. ikhwan → "Ustadz", akhwat → "Ustadzah".
 */
export function salutation(gender: Gender): 'Ustadz' | 'Ustadzah' {
  return gender === 'ikhwan' ? 'Ustadz' : 'Ustadzah';
}

/**
 * Titel role tertinggi: Syaikh (ikhwan) atau Ustadzah (akhwat).
 */
export function syaikhTitle(gender: Gender): 'Syaikh' | 'Ustadzah' {
  return gender === 'ikhwan' ? 'Syaikh' : 'Ustadzah';
}

/**
 * Titel role musyrif: Musyrif (ikhwan) atau Musyrifah (akhwat).
 */
export function musyrifTitle(gender: Gender): 'Musyrif' | 'Musyrifah' {
  return gender === 'ikhwan' ? 'Musyrif' : 'Musyrifah';
}

// ============================================================
// Template pesan untuk setiap skenario notifikasi
// ============================================================

// ---------- Peserta ↔ Musyrif ----------

export function tplPesertaSubmitToMusyrif(args: {
  pesertaName: string;
  pesertaGender: Gender;
  kelasName: string;
  musyrifGender: Gender;
  cekUrl: string;
}): string {
  const sapaan = salutation(args.musyrifGender);
  const ana = args.pesertaGender === 'ikhwan' ? 'Ana' : 'Ana (akhwat)';
  return [
    `Assalamu'alaikum ${sapaan},`,
    ``,
    `${ana} ${args.pesertaName} (kelas ${args.kelasName}) telah menyetorkan hafalan pekan ini.`,
    ``,
    `Mohon kesediaan ${sapaan.toLowerCase()} untuk memeriksa rekaman pada tautan berikut:`,
    args.cekUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplMusyrifFeedbackToPeserta(args: {
  pesertaName: string;
  pesertaGender: Gender;
  nilaiSummary: string;
  masukanGabungan: string;
}): string {
  const sapaan = salutation(args.pesertaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pesertaName},`,
    ``,
    `Berikut hasil pemeriksaan setoran hafalan antum pekan ini:`,
    ``,
    args.nilaiSummary,
    ``,
    `Catatan & masukan:`,
    args.masukanGabungan,
    ``,
    `Semoga istiqamah, baarakallaahu fiik.`,
  ].join('\n');
}

export function tplReminderPesertaBelumSetor(args: {
  pesertaName: string;
  pesertaGender: Gender;
  setorUrl: string;
  deadlineLabel: string;
}): string {
  const sapaan = salutation(args.pesertaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pesertaName},`,
    ``,
    `Pengingat — antum belum menyetorkan hafalan pada cycle ini. Mohon segera setor melalui tautan berikut sebelum batas waktu (${args.deadlineLabel}):`,
    args.setorUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

// ===== Ujian 2in1 =====

export function tplPesertaUjianToMusyrif(args: {
  pesertaName: string;
  pesertaGender: Gender;
  kelasName: string;
  musyrifGender: Gender;
  periodeNama: string;
  nilaiUrl: string;
}): string {
  const sapaan = salutation(args.musyrifGender);
  const ana = args.pesertaGender === 'ikhwan' ? 'Ana' : 'Ana (akhwat)';
  return [
    `Assalamu'alaikum ${sapaan},`,
    ``,
    `${ana} ${args.pesertaName} (kelas ${args.kelasName}) telah mengirim rekaman ${args.periodeNama}.`,
    ``,
    `Mohon kesediaan ${sapaan.toLowerCase()} untuk menilai rekaman pada tautan berikut:`,
    args.nilaiUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplMusyrifHasilUjianToPeserta(args: {
  pesertaName: string;
  pesertaGender: Gender;
  periodeNama: string;
  nilaiSummary: string;
  masukanGabungan: string;
  lihatUrl: string;
}): string {
  const sapaan = salutation(args.pesertaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pesertaName},`,
    ``,
    `Berikut hasil ${args.periodeNama} antum:`,
    ``,
    args.nilaiSummary,
    ``,
    `Catatan & masukan:`,
    args.masukanGabungan,
    ``,
    `Detail nilai: ${args.lihatUrl}`,
    ``,
    `Semoga istiqamah, baarakallaahu fiik.`,
  ].join('\n');
}

export function tplReminderPesertaBelumUjian(args: {
  pesertaName: string;
  pesertaGender: Gender;
  periodeNama: string;
  rentangLabel: string;
  ujianUrl: string;
}): string {
  const sapaan = salutation(args.pesertaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pesertaName},`,
    ``,
    `Pengingat — antum belum mengirim rekaman ${args.periodeNama} (${args.rentangLabel}). Mohon segera rekam dan kirim melalui tautan berikut:`,
    args.ujianUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplReminderKetuaIsiPresensi(args: {
  ketuaName: string;
  gender: Gender;
  kelasName: string;
  belumCount: number;
  monthLabel: string;
  presensiUrl: string;
}): string {
  const sapaan = salutation(args.gender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.ketuaName},`,
    ``,
    `Pengingat — presensi kehadiran kelas ${args.kelasName} (${args.monthLabel}) masih ada ${args.belumCount} yang belum diisi. Mohon segera dilengkapi melalui tautan berikut:`,
    args.presensiUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplReminderMusyrifBelumCek(args: {
  musyrifName: string;
  musyrifGender: Gender;
  pesertaName: string;
  kelasName: string;
  cekUrl: string;
}): string {
  const sapaan = salutation(args.musyrifGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.musyrifName},`,
    ``,
    `Pengingat — setoran dari ${args.pesertaName} (kelas ${args.kelasName}) masih menunggu pemeriksaan.`,
    ``,
    `Tautan pemeriksaan:`,
    args.cekUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

// ---------- Musyrif ↔ Syaikh ----------

export function tplMusyrifSubmitToSyaikh(args: {
  musyrifName: string;
  musyrifGender: Gender;
  syaikhGender: Gender;
  cekUrl: string;
}): string {
  const titel = syaikhTitle(args.syaikhGender);
  const sapaan = salutation(args.musyrifGender);
  return [
    `Assalamu'alaikum ${titel},`,
    ``,
    `Ana ${sapaan} ${args.musyrifName} telah menyetorkan hafalan pada cycle ini.`,
    ``,
    `Mohon kesediaan ${titel.toLowerCase()} untuk memeriksa rekaman pada tautan berikut:`,
    args.cekUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplSyaikhFeedbackToMusyrif(args: {
  musyrifName: string;
  musyrifGender: Gender;
  nilaiSummary: string;
  masukanGabungan: string;
}): string {
  const sapaan = salutation(args.musyrifGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.musyrifName},`,
    ``,
    `Berikut hasil pemeriksaan setoran hafalan antum cycle ini:`,
    ``,
    args.nilaiSummary,
    ``,
    `Catatan & masukan:`,
    args.masukanGabungan,
    ``,
    `Semoga istiqamah, baarakallaahu fiik.`,
  ].join('\n');
}

export function tplReminderMusyrifBelumSetor(args: {
  musyrifName: string;
  musyrifGender: Gender;
  setorUrl: string;
  deadlineLabel: string;
}): string {
  const sapaan = salutation(args.musyrifGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.musyrifName},`,
    ``,
    `Pengingat — antum belum menyetorkan hafalan pada cycle ini. Mohon segera setor melalui tautan berikut sebelum batas waktu (${args.deadlineLabel}):`,
    args.setorUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplReminderSyaikhBelumCek(args: {
  syaikhName: string;
  syaikhGender: Gender;
  musyrifName: string;
  cekUrl: string;
}): string {
  const titel = syaikhTitle(args.syaikhGender);
  return [
    `Assalamu'alaikum ${titel} ${args.syaikhName},`,
    ``,
    `Pengingat — setoran dari ${args.musyrifName} masih menunggu pemeriksaan.`,
    ``,
    `Tautan pemeriksaan:`,
    args.cekUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

// ============================================================
// Template HITS — Kehadiran & Observasi
// ============================================================

export function tplReminderPengajarCheckin(args: {
  pengajarName: string;
  pengajarGender: Gender;
  programName: string;
  checkinUrl: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Pengingat — mohon segera check-in kehadiran untuk *${args.programName}* hari ini.`,
    ``,
    `Tautan check-in:`,
    args.checkinUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplPengajarAlasanToKetuaKelompok(args: {
  pengajarName: string;
  pengajarGender: Gender;
  ketuaGender: Gender;
  ketuaName: string;
  programName: string;
  tanggal: string;
  jenis: string;
  alasan: string;
  reviewUrl: string;
}): string {
  const sapaan = salutation(args.ketuaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.ketuaName},`,
    ``,
    `${salutation(args.pengajarGender)} ${args.pengajarName} mengajukan alasan *${args.jenis}* pada *${args.programName}* tanggal ${args.tanggal}:`,
    ``,
    `"${args.alasan}"`,
    ``,
    `Mohon ditinjau dan diputuskan melalui tautan:`,
    args.reviewUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplLiburProgram(args: {
  pengajarName: string;
  pengajarGender: Gender;
  programName: string;
  tanggal: string;
  keterangan: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Diberitahukan bahwa *${args.programName}* pada tanggal *${args.tanggal}* diliburkan.`,
    args.keterangan ? `Keterangan: ${args.keterangan}` : '',
    ``,
    `Jazakumullahu khairan.`,
  ].filter(Boolean).join('\n');
}

export function tplReminderKetuaKelompokTugas(args: {
  ketuaName: string;
  ketuaGender: Gender;
  tugasPending: string[];
  dashboardUrl: string;
}): string {
  const sapaan = salutation(args.ketuaGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.ketuaName},`,
    ``,
    `Ada tugas yang perlu ditindaklanjuti:`,
    ...args.tugasPending.map((t) => `• ${t}`),
    ``,
    `Silakan cek dashboard:`,
    args.dashboardUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplTabayyunToPengajar(args: {
  pengajarName: string;
  pengajarGender: Gender;
  tanggal: string;
  kelasName: string;
  /** URL klarifikasi — sekarang tautan token /tabayyun/<token>. */
  formUrl: string;
  /** Daftar pelanggaran pertemuan (sudah diformat), mis. "KMT — telat 10 menit". */
  pelanggaran: string[];
  hutangSaldo?: number;
}): string {
  const sapaan = salutation(args.pengajarGender);
  const daftar = args.pelanggaran.length
    ? args.pelanggaran.map((p) => `• ${p}`)
    : ['• (rincian tidak tersedia)'];
  const adaHutang = !!args.hutangSaldo && args.hutangSaldo > 0;
  const hutangLines = adaHutang
    ? ['', `Selain itu, tercatat *sisa hutang menit ${args.hutangSaldo} menit* yang perlu diganti.`]
    : [];
  const permintaan = adaHutang
    ? `Mohon sampaikan alasan/klarifikasi, sekaligus *berapa menit hutang yang sudah ditunaikan* pada pertemuan tersebut, melalui tautan berikut:`
    : `Mohon sampaikan alasan/klarifikasi melalui tautan berikut:`;
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Berdasarkan laporan observasi kelas *${args.kelasName}* tanggal *${args.tanggal}*, tercatat hal berikut:`,
    ...daftar,
    ...hutangLines,
    ``,
    permintaan,
    args.formUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/**
 * Teguran ghosting: pengajar tak merespons tabayyun dalam 72 jam sejak diingatkan
 * → teguran terbit. Pesannya sengaja tak menyebut vonis udzur; yang disampaikan
 * hanya fakta terbitnya teguran. `diingatkanWib`/`deadlineWib` = string waktu WIB
 * yang sudah diformat oleh pemanggil.
 */
export function tplTabayyunGhostingTeguran(args: {
  pengajarName: string;
  pengajarGender: Gender;
  tanggalObservasi: string;
  diingatkanWib: string;
  deadlineWib: string;
  nomorTeguran: number;
  pelanggaran: string[];
  hutangSaldo?: number;
}): string {
  const sapaan = salutation(args.pengajarGender);
  const daftar = args.pelanggaran.length
    ? args.pelanggaran.map((p) => `• ${p}`)
    : ['• (rincian tidak tersedia)'];
  const hutangLines =
    args.hutangSaldo && args.hutangSaldo > 0
      ? ['', `Tercatat pula *sisa hutang menit ${args.hutangSaldo} menit* yang perlu diganti.`]
      : [];
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Terkait observasi kelas tanggal *${args.tanggalObservasi}*:`,
    ...daftar,
    ``,
    `Permintaan klarifikasi telah dikirim pada *${args.diingatkanWib}* dengan tenggat *${args.deadlineWib}* (72 jam). Hingga tenggat terlewati belum ada respons.`,
    ``,
    `Oleh karena itu, diterbitkan *teguran ke-${args.nomorTeguran}*.`,
    ...hutangLines,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplTeguranToPengajar(args: {
  pengajarName: string;
  pengajarGender: Gender;
  nomorTeguran: number;
  kategori: string;
  keterangan: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Ini adalah *teguran ke-${args.nomorTeguran}* terkait: ${args.kategori}.`,
    args.keterangan ? `Keterangan: ${args.keterangan}` : '',
    ``,
    `Mohon agar tidak mengulangi hal ini di waktu mendatang karena berkaitan dengan amanah kepada umat.`,
    args.nomorTeguran >= 3 ? `\n⚠️ Peringatan: teguran ke-4 akan mengakibatkan penonaktifan pengajar.` : '',
    ``,
    `Jazakumullahu khairan.`,
  ].filter(Boolean).join('\n');
}

export function tplSuratNonaktif(args: {
  pengajarName: string;
  pengajarGender: Gender;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Dengan berat hati kami sampaikan bahwa berdasarkan akumulasi 4 kali teguran, antum untuk sementara *dinonaktifkan* dari tugas sebagai pengajar HITS.`,
    ``,
    `Mohon hubungi koordinator untuk langkah selanjutnya.`,
    ``,
    `Semoga Allah memudahkan urusan antum.`,
  ].join('\n');
}

export function tplAlasanDiterima(args: {
  pengajarName: string;
  pengajarGender: Gender;
  kondisi: string;
  tanggal: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Alasan antum terkait *${args.kondisi}* pada tanggal *${args.tanggal}* telah diterima sebagai udzur syar'i.`,
    ``,
    `Mohon agar ke depan bisa mengkondisikan sebaik mungkin agar kelas berjalan sesuai jadwal.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplJadwalPindahToKoorKK(args: {
  pengajarName: string;
  pengajarGender: Gender;
  kelasName: string;
  tanggalAsal: string;
  tanggalPengganti: string;
  waktuPengganti: string;
  alasan: string;
}): string {
  return [
    `Assalamu'alaikum,`,
    ``,
    `${salutation(args.pengajarGender)} ${args.pengajarName} memindahkan jadwal *${args.kelasName}*:`,
    `• Jadwal asal: ${args.tanggalAsal}`,
    `• Jadwal pengganti: ${args.tanggalPengganti}, ${args.waktuPengganti}`,
    `• Alasan: ${args.alasan}`,
    ``,
    `Mohon ditindaklanjuti.`,
  ].join('\n');
}

export function tplHapusPertemuanToKoorKK(args: {
  ketuaName: string;
  kelasName: string;
  pertemuanNo: number;
  tanggal: string | null;
  levelLabel: string;
  alasan: string;
  approveUrl: string;
}): string {
  return [
    `Assalamu'alaikum,`,
    ``,
    `Ketua kelas *${args.ketuaName}* mengajukan penghapusan pertemuan yang dianggap kelebihan/salah:`,
    `• Halaqah: ${args.kelasName}`,
    `• Pertemuan: ${args.pertemuanNo} (${args.levelLabel})${args.tanggal ? ` · ${args.tanggal}` : ''}`,
    `• Alasan: ${args.alasan || '-'}`,
    ``,
    `Setujui / tolak di sini:`,
    args.approveUrl,
  ].join('\n');
}

export function tplLiburToKoordinator(args: {
  requesterName: string;
  kelasName: string;
  tanggalLabel: string;
  alasan: string;
  approveUrl: string;
}): string {
  return [
    `Assalamu'alaikum,`,
    ``,
    `Ketua/Wakil kelas *${args.requesterName}* mengajukan agar tanggal berikut diliburkan:`,
    `• Kelas: ${args.kelasName}`,
    `• Tanggal: ${args.tanggalLabel}`,
    `• Alasan: ${args.alasan || '-'}`,
    ``,
    `Jika disetujui, pertemuan tanggal itu tidak dihitung dalam kehadiran.`,
    `Setujui / tolak di sini:`,
    args.approveUrl,
  ].join('\n');
}

export function tplReminderLiburToKetua(args: {
  ketuaName: string | null;
  pesertaName: string;
  kelasName: string;
  tanggalLabel: string;
}): string {
  return [
    `Assalamu'alaikum${args.ketuaName ? ` ${args.ketuaName}` : ''},`,
    ``,
    `${args.pesertaName} mengingatkan bahwa pertemuan berikut sepertinya libur:`,
    `• Kelas: ${args.kelasName}`,
    `• Tanggal: ${args.tanggalLabel}`,
    ``,
    `Mohon ajukan libur ke koordinator lewat menu "Ajukan Libur" di Presensi Mandiri, agar kehadiran tanggal ini tidak dihitung.`,
  ].join('\n');
}

export function tplJadwalPindahToKetuaKelas(args: {
  ketuaKelasName: string;
  ketuaKelasGender: Gender;
  pengajarName: string;
  kelasName: string;
  tanggalAsal: string;
  tanggalPengganti: string;
  waktuPengganti: string;
}): string {
  const sapaan = salutation(args.ketuaKelasGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.ketuaKelasName},`,
    ``,
    `Diberitahukan bahwa jadwal *${args.kelasName}* bersama ${args.pengajarName} dipindahkan:`,
    `• Jadwal asal: ${args.tanggalAsal}`,
    `• Jadwal baru: ${args.tanggalPengganti}, ${args.waktuPengganti}`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplReminderKetuaKelasObservasi(args: {
  ketuaKelasName: string;
  ketuaKelasGender: Gender;
  kelasName: string;
  observasiUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${args.ketuaKelasName},`,
    ``,
    `Pengingat — mohon isi laporan observasi kelas *${args.kelasName}* hari ini melalui tautan:`,
    args.observasiUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplReminderPengajarTunjukKetua(args: {
  pengajarName: string;
  pengajarGender: Gender;
  kelasName: string;
  url: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Pengingat — halaqah *${args.kelasName}* belum memiliki ketua kelas. Mohon segera tunjuk salah satu peserta sebagai ketua melalui tautan:`,
    args.url,
    ``,
    `Ketua kelas bertugas mengisi keterangan pengajar & latihan tiap pertemuan.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplMagicLinkKetuaKelas(args: {
  ketuaKelasName: string;
  ketuaKelasGender: Gender;
  kelasName: string;
  magicUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${args.ketuaKelasName},`,
    ``,
    `Silakan isi observasi kelas *${args.kelasName}* hari ini:`,
    args.magicUrl,
    ``,
    `(Link ini hanya untuk Anda)`,
  ].join('\n');
}

export function tplPindahHalaqahToTarget(args: {
  targetName: string;
  targetGender: Gender;
  requesterName: string;
  halaqahName: string;
  approveUrl: string;
  loginUrl: string;
}): string {
  const sapaan = salutation(args.targetGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.targetName},`,
    ``,
    `${args.requesterName} mengajukan pemindahan halaqah *${args.halaqahName}* kepada antum sebagai pengajar.`,
    ``,
    `*Cara menyetujui:*`,
    `1. Login dulu (nomor WA + password) di:`,
    args.loginUrl,
    `2. Lalu buka tautan persetujuan berikut & pilih *Setujui* / *Tolak*:`,
    args.approveUrl,
    ``,
    `(Hanya antum sebagai pengajar tujuan yang bisa menyetujui.)`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Ke approver (owner halaqah / koordinator KK): minta persetujuan pengambilan halaqah. */
export function tplKlaimHalaqahApproval(args: {
  approverName: string;
  approverGender: Gender;
  requesterName: string;
  halaqahName: string;
  approveUrl: string;
  loginUrl: string;
  ownerKind: 'pengajar' | 'koordinator_kk';
}): string {
  const sapaan = salutation(args.approverGender);
  const konteks =
    args.ownerKind === 'pengajar'
      ? `${args.requesterName} ingin mengambil alih halaqah *${args.halaqahName}* yang saat ini antum pegang.`
      : `${args.requesterName} ingin menjadi pengajar halaqah *${args.halaqahName}* (belum ada pengajarnya).`;
  return [
    `Assalamu'alaikum ${sapaan} ${args.approverName},`,
    ``,
    konteks,
    ``,
    `*Cara memutuskan:*`,
    `1. Login dulu (nomor WA + password) di:`,
    args.loginUrl,
    `2. Lalu buka tautan persetujuan & pilih *Setujui* / *Tolak*:`,
    args.approveUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplPindahDisetujuiToRequester(args: {
  requesterName: string;
  requesterGender: Gender;
  targetName: string;
  halaqahName: string;
  pengajarUrl: string;
}): string {
  const sapaan = salutation(args.requesterGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.requesterName},`,
    ``,
    `Pemindahan halaqah *${args.halaqahName}* telah *disetujui* oleh ${args.targetName}.`,
    ``,
    `Mohon cek kembali daftar halaqah untuk memastikan sudah benar, lalu tunjuk ketua kelas:`,
    args.pengajarUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplKetuaKelasTerpilih(args: {
  ketuaKelasName: string;
  ketuaKelasGender: Gender;
  kelasName: string;
  magicUrl: string;
  linkGrupWa: string | null;
  // HITS soft-skill: login WA + password.
  loginUrl?: string;
  loginWa?: string;
  initialPassword?: string;
}): string {
  const lines = [
    `Assalamu'alaikum ${args.ketuaKelasName},`,
    ``,
    `Anda telah dipilih sebagai *Ketua Kelas ${args.kelasName}*.`,
    ``,
    `Tugas Anda adalah mengisi keterangan pengajar & latihan tiap pertemuan.`,
  ];
  if (args.loginUrl && args.initialPassword) {
    lines.push(``);
    lines.push(`*Cara masuk:*`);
    lines.push(args.loginUrl);
    lines.push(`Nomor WA: ${args.loginWa ?? '(nomor ini)'}`);
    lines.push(`Password awal: ${args.initialPassword}`);
    lines.push(`(ketik ${args.initialPassword.length} angka itu saja — tanpa spasi/tanda bintang; mohon ganti setelah login)`);
    lines.push(``);
    lines.push(`Atau langsung lewat link khusus berikut:`);
    lines.push(args.magicUrl);
  } else {
    lines.push(``);
    lines.push(`Silakan masuk melalui link berikut:`);
    lines.push(args.magicUrl);
    lines.push(``);
    lines.push(`(Link ini khusus untuk Anda, jangan dibagikan)`);
  }
  if (args.linkGrupWa) {
    lines.push(``);
    lines.push(`Silakan bergabung ke grup koordinasi ketua kelas:`);
    lines.push(args.linkGrupWa);
  }
  lines.push(``);
  lines.push(`Jazakumullahu khairan.`);
  return lines.join('\n');
}

/** Ke approver (pengajar existing / koordinator KK): minta persetujuan peran ganda ketua. */
export function tplKetuaDualRoleApproval(args: {
  approverName: string;
  approverGender: Gender;
  ketuaName: string;
  newHalaqahName: string;
  requesterName: string;
  approveUrl: string;
  loginUrl: string;
}): string {
  const sapaan = salutation(args.approverGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.approverName},`,
    ``,
    `*${args.ketuaName}* sudah menjadi ketua kelas di halaqah lain.`,
    `${args.requesterName} ingin menjadikannya ketua juga di halaqah *${args.newHalaqahName}* (peran ganda).`,
    ``,
    `Mohon konfirmasi apakah ${args.ketuaName} memang bersedia & sesuai memegang peran ganda ini.`,
    ``,
    `*Cara memutuskan:*`,
    `1. Login dulu (nomor WA + password) di:`,
    args.loginUrl,
    `2. Lalu buka tautan persetujuan & pilih *Setujui* / *Tolak*:`,
    args.approveUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Ke ketua yang SUDAH punya akun & pernah login: info tambahan halaqah (tanpa password). */
export function tplKetuaDualRoleInfo(args: {
  ketuaName: string;
  newHalaqahName: string;
  loginUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${args.ketuaName},`,
    ``,
    `Anda kini juga menjadi *Ketua Kelas ${args.newHalaqahName}* (tambahan dari halaqah yang sudah Anda pegang).`,
    ``,
    `Gunakan akun & password yang SAMA seperti biasa. Setelah login, pilih halaqah lewat menu di dashboard ketua:`,
    args.loginUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Ke pengajar: konfirmasi peran ganda ketua disetujui. */
export function tplKetuaDualRoleDisetujui(args: {
  pengajarName: string;
  ketuaName: string;
  newHalaqahName: string;
}): string {
  return [
    `Assalamu'alaikum ${args.pengajarName},`,
    ``,
    `Pengajuan peran ganda *${args.ketuaName}* sebagai ketua kelas *${args.newHalaqahName}* telah *disetujui*.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Ke koordinator KK: minta keputusan koreksi pertemuan. */
export function tplKoreksiPertemuanApproval(args: {
  approverName: string;
  approverGender: Gender;
  ketuaName: string;
  halaqahName: string;
  jumlahItem: number;
  approveUrl: string;
  loginUrl: string;
}): string {
  const sapaan = salutation(args.approverGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.approverName},`,
    ``,
    `${args.ketuaName} (ketua *${args.halaqahName}*) mengajukan *${args.jumlahItem} koreksi pertemuan*.`,
    ``,
    `*Cara memutuskan:*`,
    `1. Login dulu di:`,
    args.loginUrl,
    `2. Buka tautan & setujui/tolak per item:`,
    args.approveUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Ke ketua: hasil keputusan koreksi. */
export function tplKoreksiPertemuanInfo(args: {
  ketuaName: string;
  halaqahName: string;
  disetujui: number;
  ditolak: number;
}): string {
  return [
    `Assalamu'alaikum ${args.ketuaName},`,
    ``,
    `Koreksi pertemuan *${args.halaqahName}* telah diputuskan: *${args.disetujui} disetujui*, ${args.ditolak} ditolak.`,
    ``,
    `Silakan cek kembali daftar pertemuan di dashboard ketua.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Ke ketua kelas: pengingat mengisi presensi Kajian Adab. Tanpa sapaan ustadz. */
export function tplReminderKajianAdab(args: {
  namaKetua: string | null;
  tanggalWib: string; // mis. "Ahad, 4 Jan 2026"
}): string {
  return [
    `Assalamu'alaikum${args.namaKetua ? ` ${args.namaKetua}` : ''},`,
    ``,
    `Kami mencatat antum/i belum mengisi presensi Kajian Adab pada ${args.tanggalWib}.`,
    `Mohon segera isi presensi (Hadir/Izin/Sakit) melalui menu Kajian Adab di aplikasi.`,
    ``,
    `Bila tidak ada respons dalam 3 hari, akan tercatat sebagai Alpa.`,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Ke ketua kelas: pengingat mengisi keterangan halaqah periode ini. Tanpa sapaan ustadz. */
export function tplReminderIsiKeterangan(args: {
  ketuaNama: string | null;
  halaqahName: string;
  periodeLabel: string;
  isiUrl: string;
}): string {
  return [
    `Assalamu'alaikum${args.ketuaNama ? ` ${args.ketuaNama}` : ''},`,
    ``,
    `Kami mencatat keterangan halaqah *${args.halaqahName}* pada periode *${args.periodeLabel}* belum terisi.`,
    `Mohon segera lengkapi keterangan pengajar & latihan tiap pertemuan melalui:`,
    args.isiUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/**
 * Dari pelapor Shakwa ke penanggung jawab kategori. Dibuka pelapor sendiri
 * setelah formulir tersimpan — isi pesannya sudah memuat nomor tiket supaya
 * koordinator bisa menautkan percakapan WA ke baris aduannya.
 */
export function tplShakwaKeTujuan(args: {
  nomorTiket: string;
  kategoriLabel: string;
  nama: string;
  halaqahLabel: string;
  isi: string;
  rincian?: string[];
}): string {
  return [
    `Assalamu'alaikum,`,
    ``,
    `Saya *${args.nama}* menyampaikan laporan lewat formulir Shakwa.`,
    ``,
    `Nomor tiket: *${args.nomorTiket}*`,
    `Kategori: *${args.kategoriLabel}*`,
    `Halaqoh: ${args.halaqahLabel}`,
    ``,
    args.isi,
    ...(args.rincian && args.rincian.length ? ['', 'Rincian:', ...args.rincian.map((r) => `• ${r}`)] : []),
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/**
 * Pengajar yang izin mengabari badalnya — dibuka dari layar sukses formulir
 * Shakwa. Tak ada gateway WA; pengajar sendiri yang menekan kirim.
 */
export function tplKabariBadal(args: {
  namaBadal: string;
  namaPengajar: string;
  /** Badal selalu segender dengan pengajar — menentukan sapaan antum/anti. */
  gender: 'ikhwan' | 'akhwat';
  tanggal: string;
  halaqahNama: string | null;
  nomorTiket: string;
}): string {
  return [
    `Assalamu'alaikum ${args.namaBadal},`,
    ``,
    `Saya *${args.namaPengajar}* berhalangan mengajar dan memohon kesediaan ${args.gender === 'akhwat' ? 'anti' : 'antum'} menjadi badal:`,
    ``,
    `Tanggal: *${args.tanggal}*`,
    `Halaqah: ${args.halaqahNama ?? 'semua halaqah saya hari itu'}`,
    ``,
    `Izinnya sudah tercatat di Shakwa (tiket ${args.nomorTiket}).`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Balasan koordinator ke pelapor Shakwa (dibuka dari dashboard). */
export function tplShakwaBalasPelapor(args: {
  nama: string;
  nomorTiket: string;
  kategoriLabel: string;
}): string {
  return [
    `Assalamu'alaikum ${args.nama},`,
    ``,
    `Terkait laporan Shakwa *${args.nomorTiket}* (${args.kategoriLabel}) yang antum/i kirim —`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Rekap harian Shakwa ke koordinator (teks siap tempel). */
export function tplShakwaRekapHarian(args: {
  tanggalLabel: string;
  total: number;
  perKategori: Array<{ label: string; jumlah: number }>;
  belumDitangani: number;
  dashboardUrl: string;
}): string {
  const baris = args.perKategori.length
    ? args.perKategori.map((k) => `• ${k.label}: ${k.jumlah}`)
    : ['• (tidak ada laporan)'];
  return [
    `*Rekap Shakwa ${args.tanggalLabel}*`,
    ``,
    `Total laporan masuk: *${args.total}*`,
    ...baris,
    ``,
    `Belum ditangani: *${args.belumDitangani}*`,
    args.dashboardUrl,
  ].join('\n');
}

/**
 * Ke ketua kelas: pengingat RINCI mengisi observasi — memuat daftar pertemuan
 * yang belum diobservasi (tanggal + nomor pertemuan) dan tautan pengisian.
 * Tanpa sapaan ustadz (ketua kelas = peserta).
 */
export function tplReminderKetuaKelasObservasiRinci(args: {
  ketuaNama: string | null;
  halaqahName: string;
  pengajarName: string;
  periodeLabel: string;
  belumList: Array<{ tanggal: string; pertemuanNo: number | null }>;
  isiUrl: string;
}): string {
  const daftar = args.belumList.length
    ? args.belumList.map(
        (p) => `• ${p.tanggal}${p.pertemuanNo ? ` — pertemuan ke-${p.pertemuanNo}` : ''}`
      )
    : ['• (semua pertemuan sudah terisi)'];
  return [
    `Assalamu'alaikum${args.ketuaNama ? ` ${args.ketuaNama}` : ''},`,
    ``,
    `Pengingat — observasi kelas *${args.halaqahName}* (pengajar ${args.pengajarName}) periode *${args.periodeLabel}* masih ada *${args.belumList.length}* pertemuan yang belum diisi:`,
    ...daftar,
    ``,
    `Mohon segera lengkapi keterangan pengajar & latihan tiap pertemuan melalui tautan berikut:`,
    args.isiUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/**
 * Rekap indisipliner HITS satu periode untuk ditempel ke grup koordinator —
 * seluruh pengajar & insiden. `perPengajar` sudah diformat oleh pemanggil
 * (satu baris per pengajar), supaya template tetap sederhana.
 */
export function tplHitsRekapInsidenGrup(args: {
  periodeLabel: string;
  genderLabel: string;
  totalInsiden: number;
  totalPengajar: number;
  byBadge: { KMT: number; KBLA: number; JKG: number; TL: number };
  belumDiputus: number;
  perPengajar: string[];
  dashboardUrl: string;
}): string {
  return [
    `*Rekap Indisipliner HITS*`,
    `Periode: ${args.periodeLabel} · ${args.genderLabel}`,
    ``,
    `Total insiden: *${args.totalInsiden}* (dari ${args.totalPengajar} pengajar)`,
    `KMT ${args.byBadge.KMT} · KBLA ${args.byBadge.KBLA} · JKG ${args.byBadge.JKG} · TL ${args.byBadge.TL}`,
    `Belum diputus: *${args.belumDiputus}*`,
    ``,
    ...(args.perPengajar.length ? ['Rincian per pengajar:', ...args.perPengajar] : ['(tidak ada insiden pada periode ini)']),
    ``,
    args.dashboardUrl,
  ].join('\n');
}

/** Ke pengajar: konfirmasi/ingatkan data periode belum masuk. */
export function tplReminderPengajarIsiData(args: {
  pengajarName: string;
  pengajarGender: Gender;
  periodeLabel: string;
}): string {
  const sapaan = salutation(args.pengajarGender);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Kami belum menerima keterangan pertemuan halaqah antum/i pada periode *${args.periodeLabel}*.`,
    `Mohon koordinasikan dengan ketua kelas agar keterangan pengajar & latihan segera terisi,`,
    `atau kabari kami bila ada kendala.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/**
 * Ingatkan pengajar melengkapi penilaian Evaluasi Halaqah. Dipakai tombol
 * "Ingatkan" di dashboard koordinator evaluasi — tombol itu sebelumnya mati
 * (tak ada handler), jadi koordinator harus mengetik pesannya sendiri.
 */
export function tplReminderPengajarIsiNilaiEvaluasi(args: {
  pengajarName: string;
  pengajarGender: Gender;
  namaHalaqah: string;
  periodeLabel: string;
  selesai: number;
  total: number;
}): string {
  const sapaan = salutation(args.pengajarGender);
  const sisa = Math.max(0, args.total - args.selesai);
  return [
    `Assalamu'alaikum ${sapaan} ${args.pengajarName},`,
    ``,
    `Penilaian *${args.periodeLabel}* untuk halaqah *${args.namaHalaqah}* belum lengkap.`,
    `Baru ${args.selesai} dari ${args.total} peserta yang dinilai — tersisa ${sisa}.`,
    ``,
    `Mohon dilengkapi, atau kabari kami bila ada kendala.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

// ── Ketersediaan Mengajar HITS ─────────────────────────────────────────────

/**
 * Ajakan konfirmasi ke pengajar setelah halaqahnya dinyatakan penuh.
 * Sengaja menyebut jumlah peserta, bukan namanya: identitas murid baru terbuka
 * setelah pengajar menyatakan bersedia.
 */
export function tplKonfirmasiHalaqahPenuh(args: {
  pengajarName: string;
  pengajarGender: Gender;
  slotLabel: string;
  level: string;
  jumlahPeserta: number;
  tanggalMulai: string;
  batasKonfirmasi: string;
  konfirmasiUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${salutation(args.pengajarGender)} ${args.pengajarName},`,
    ``,
    `Halaqah Anda sudah penuh dan siap dimulai:`,
    `• Jadwal: ${args.slotLabel}`,
    `• Level: ${args.level}`,
    `• Peserta: ${args.jumlahPeserta} murid`,
    `• Mulai mengajar: ${args.tanggalMulai}`,
    ``,
    `Mohon konfirmasi kesediaan melalui tautan berikut sebelum ${args.batasKonfirmasi}:`,
    args.konfirmasiUrl,
    ``,
    `Setelah Anda menyetujui, daftar peserta akan terbuka beserta langkah pembuatan grup WhatsApp.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Pengingat sebelum tenggat konfirmasi habis. */
export function tplIngatkanKonfirmasi(args: {
  pengajarName: string;
  pengajarGender: Gender;
  slotLabel: string;
  batasKonfirmasi: string;
  konfirmasiUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${salutation(args.pengajarGender)} ${args.pengajarName},`,
    ``,
    `Mengingatkan konfirmasi halaqah *${args.slotLabel}* yang batasnya ${args.batasKonfirmasi}.`,
    `Bila tidak dikonfirmasi, slot akan ditawarkan ke pengajar berikutnya.`,
    ``,
    args.konfirmasiUrl,
  ].join('\n');
}

/**
 * Undangan peserta. Tautannya ke halaman /undangan/<token>, bukan tautan grup
 * mentah — supaya tautan grup tidak tersebar liar, pembukaannya bisa dicatat
 * tanpa API WhatsApp, dan tautan grup dapat diganti tanpa mengubah undangan.
 */
export function tplUndanganPeserta(args: {
  namaPeserta: string;
  namaHalaqah: string;
  slotLabel: string;
  pengajarName: string;
  tanggalMulai: string;
  undanganUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${args.namaPeserta},`,
    ``,
    `Alhamdulillah, Anda terdaftar di halaqah HITS:`,
    `• Halaqah: ${args.namaHalaqah}`,
    `• Jadwal: ${args.slotLabel}`,
    `• Pengajar: ${args.pengajarName}`,
    `• Mulai: ${args.tanggalMulai}`,
    ``,
    `Silakan bergabung ke grup kelas melalui tautan berikut:`,
    args.undanganUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Ajakan ke pengajar untuk mengisi slot yang antreannya menumpuk. */
export function tplButuhPengajarSlot(args: {
  pengajarName: string;
  pengajarGender: Gender;
  slotLabel: string;
  jumlahAntre: number;
  formUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${salutation(args.pengajarGender)} ${args.pengajarName},`,
    ``,
    `Slot *${args.slotLabel}* sudah ditunggu ${args.jumlahAntre} pendaftar, tetapi belum ada pengajar yang tersedia.`,
    `Bila Ustadz/Ustadzah berkenan mengambil slot ini, silakan perbarui ketersediaan di:`,
    args.formUrl,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

/** Pengingat menyegarkan ketersediaan sebelum statusnya dinonaktifkan. */
/**
 * Pemberitahuan saat isian ketersediaan dihapus karena yang bersangkutan tidak
 * termasuk daftar pengajar batch ini. Nadanya menjelaskan, bukan menuduh —
 * biasanya orangnya mengisi dengan iktikad baik karena menunya memang terbuka.
 */
export function tplAnulirKetersediaan(args: {
  pengajarName: string;
  pengajarGender: Gender;
  periodeNama: string;
  slotLabel: string[];
}): string {
  return [
    `Assalamu'alaikum ${salutation(args.pengajarGender)} ${args.pengajarName},`,
    ``,
    `Mohon maaf, isian ketersediaan mengajar Anda untuk ${args.periodeNama} kami hapus`,
    `karena nama Anda belum termasuk daftar pengajar batch ini.`,
    ...(args.slotLabel.length > 0
      ? [``, `Slot yang sempat terisi:`, ...args.slotLabel.map((l) => `• ${l}`)]
      : []),
    ``,
    `Bila seharusnya ikut mengajar batch ini, silakan kabari kami agar nama Anda dimasukkan`,
    `ke daftar dan pengisiannya dibuka kembali.`,
    ``,
    `Jazakumullahu khairan.`,
  ].join('\n');
}

export function tplSegarkanKetersediaan(args: {
  pengajarName: string;
  pengajarGender: Gender;
  batas: string;
  formUrl: string;
}): string {
  return [
    `Assalamu'alaikum ${salutation(args.pengajarGender)} ${args.pengajarName},`,
    ``,
    `Data ketersediaan mengajar Anda perlu disegarkan sebelum ${args.batas}.`,
    `Bila tidak diperbarui, ketersediaan Anda akan dinonaktifkan sementara dan tidak ikut pembagian halaqah.`,
    ``,
    args.formUrl,
    ``,
    `Cukup buka tautannya dan tekan simpan bila tidak ada perubahan.`,
  ].join('\n');
}
