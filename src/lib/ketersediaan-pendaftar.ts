import 'server-only';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseCsv } from '@/lib/csv';
import type {
  Gender,
  KsHariIdx,
  KsMode,
  KsPemetaanKolom,
  KsPendaftarSumber,
  KsPeriode,
  KsPitaUmur,
  KsSlot,
} from '@/types/db';
import { hitungUmur, kunciJadwal, kunciJamMaster, lokasiBaku, pitaUmur, sesiDariSlot, uraikanSlot } from '@/lib/ketersediaan-slot';
import { listSlot } from '@/lib/ketersediaan-periode';
import { ambilCsvTerbit } from '@/lib/ketersediaan-csv-url';

/**
 * Tarik responses Google Form pendaftaran murid sebagai CSV publish-to-web.
 *
 * Pola yang sama dengan hits-sheets.ts: tanpa service account, tanpa OAuth.
 * Sheet tetap sumber kebenaran — tarikan berulang memperbarui baris yang sudah
 * ada, tidak menggandakannya.
 *
 * Pendaftaran TIDAK pernah ditutup per slot. Slot yang penuh tetap menerima,
 * dan kelebihannya menjadi antrean. Antrean itulah sinyal "slot ini butuh
 * pengajar", bukan kegagalan yang harus disembunyikan.
 */

export interface HasilTarik {
  dibaca: number;
  baru: number;
  diperbarui: number;
  valid: number;
  ditahan: number;
  /** Kiriman lama yang digantikan kiriman terbaru dari orang yang sama. */
  diganti: number;
  /** Jam yang dipilih pendaftar dan baru ditambahkan ke master periode. */
  jamBaru: number;
  /** Baris yang bahkan tidak punya kunci — tidak bisa disimpan sama sekali. */
  dilewati: number;
  peringatan: string[];
}

/** Kolom CSV yang lazim muncul, dipakai menebak pemetaan awal. */
const TEBAKAN_KOLOM: Record<keyof KsPemetaanKolom, RegExp[]> = {
  nama: [/nama\s*lengkap/i, /^nama/i, /full\s*name/i],
  // Judul kolom sungguhan bertele-tele dan tidak selalu memuat kata "usia" di
  // depan: "Tuliskan Usia Anda (Usia Minimum 15 tahun)".
  umur: [/\busia\b/i, /\bumur\b/i, /\bage\b/i],
  rekaman: [/rekam\s*suara/i, /voice\s*recorder/i, /\brekaman\b/i],
  wa: [/whatsapp/i, /\bwa\b/i, /no.*(hp|telepon|telp)/i, /phone/i],
  tanggal_lahir: [/tanggal\s*lahir/i, /tgl\s*lahir/i, /birth/i],
  gender: [/jenis\s*kelamin/i, /gender/i, /ikhwan|akhwat/i],
  level: [/level/i, /program/i, /dasar|lanjutan/i],
  // "Pilihan Jam Belajar" adalah judul yang dipakai form pendaftaran nyata —
  // tidak memuat kata "slot" maupun "jadwal" sama sekali.
  slot: [/jam\s*belajar/i, /pilihan\s*jam/i, /slot/i, /jadwal/i, /pilihan\s*kelas/i, /waktu/i],
  timestamp: [/timestamp/i, /waktu\s*(kirim|isi)/i, /^stempel/i],
};
/**
 * Tebak pemetaan kolom dari baris kepala. Hanya usulan — koordinator yang
 * mengesahkan lewat layar pemetaan, karena bentuk Google Form bisa berubah
 * kapan saja dan salah kolom berarti salah seluruh data.
 */
export function tebakPemetaan(kepala: readonly string[]): KsPemetaanKolom {
  const out: KsPemetaanKolom = {};
  for (const [kunci, pola] of Object.entries(TEBAKAN_KOLOM) as [
    keyof KsPemetaanKolom,
    RegExp[],
  ][]) {
    const ketemu = kepala.find((h) => pola.some((p) => p.test(h)));
    if (ketemu) out[kunci] = ketemu;
  }
  return out;
}

/**
 * Normalisasi nomor WhatsApp ke bentuk tanpa kode negara dan tanpa nol depan —
 * sama dengan yang dipakai berkas Jadwal KBM ("81967996363").
 * Mengembalikan null bila jelas bukan nomor.
 */
export function normalWa(mentah: string | null | undefined): string | null {
  if (!mentah) return null;
  let d = String(mentah).replace(/\D/g, '');
  if (!d) return null;
  // Awalan panggilan internasional "00" ("0062812…") harus dibuang bersama
  // 62-nya; kalau tidak, nol depan dibuang di bawah dan "62812…" tersisa utuh
  // sebagai nomor yang berbeda dari "0812…".
  if (d.startsWith('0062')) d = d.slice(4);
  else if (d.startsWith('62')) d = d.slice(2);
  // Nol depan dibuang juga SETELAH kode negara: pendaftar sering menulis
  // "62 0812…" atau "+62 (0)812…". Tanpa ini nomor yang sama menghasilkan dua
  // bentuk, dan kiriman ulang orang yang sama lolos sebagai dua pendaftar.
  d = d.replace(/^0+/, '');
  if (d.length < 9 || d.length > 14) return null;
  return d;
}

/** Nama untuk dibandingkan: huruf kecil, tanpa tanda diakritik, spasi dirapatkan. */
export function namaNormal(nama: string): string {
  return nama
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Identitas satu pendaftar: nomor WA ternormalisasi + nama ternormalisasi.
 *
 * Bukan nomor saja: satu nomor lazim dipakai sekeluarga (ibu mendaftarkan
 * anak-anaknya), dan mereka orang yang berbeda. Bukan juga kunci baris sheet:
 * kiriman ulang dari orang yang sama menghasilkan timestamp baru.
 */
export function identitasPendaftar(wa: string | null | undefined, nama: string): string | null {
  const w = normalWa(wa);
  const n = namaNormal(nama ?? '');
  if (!w || !n) return null;
  return `${w}|${n}`;
}

export type FormatTanggal = 'dmy' | 'mdy';

/**
 * Tebak format tanggal bergaris-miring dari SELURUH kolom, bukan per baris.
 *
 * Google Form mengikuti locale pemilik berkas: sheet pendaftaran HITS memakai
 * M/D/YYYY ("12/23/1999"), sementara kebiasaan Indonesia D/M/YYYY. Menebak per
 * baris mustahil — "5/6/2003" sah di kedua bacaan. Yang menentukan adalah baris
 * lain di kolom yang sama: bila ada bagian pertama > 12, kolomnya D/M; bila ada
 * bagian kedua > 12, kolomnya M/D.
 *
 * Bila kolomnya tidak menentukan apa-apa, jatuh ke `bawaan`: D/M untuk isian
 * orang (tanggal lahir — kebiasaan setempat), tetapi M/D untuk kolom Timestamp.
 * Timestamp ditulis Google sendiri menurut locale sheet, bukan diketik pendaftar,
 * dan sheet HITS ber-locale AS; pada awal bulan (tanggal ≤ 12) semua barisnya
 * ambigu, dan jatuh ke D/M menukar bulan dengan tanggal — usia antrean melenceng
 * berbulan-bulan dan urutan "kiriman terbaru" terbalik.
 */
export function deteksiFormatTanggal(
  nilai: readonly (string | null | undefined)[],
  bawaan: FormatTanggal = 'dmy'
): FormatTanggal {
  let pertamaLebih12 = false;
  let keduaLebih12 = false;
  for (const v of nilai) {
    const m = String(v ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) pertamaLebih12 = true;
    if (Number(m[2]) > 12) keduaLebih12 = true;
  }
  if (keduaLebih12 && !pertamaLebih12) return 'mdy';
  if (pertamaLebih12 && !keduaLebih12) return 'dmy';
  return bawaan;
}

/** Tanggal dari bentuk yang lazim keluar Google Form. */
export function bacaTanggal(
  mentah: string | null | undefined,
  format: FormatTanggal = 'dmy'
): string | null {
  if (!mentah) return null;
  const t = mentah.trim();
  if (!t) return null;

  // 2001-05-17
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // 17/05/2001 atau 12/23/1999 — urutannya ditentukan format kolom.
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const hari = format === 'mdy' ? b : a;
    const bulan = format === 'mdy' ? a : b;
    if (hari < 1 || hari > 31 || bulan < 1 || bulan > 12) return null;
    return `${m[3]}-${String(bulan).padStart(2, '0')}-${String(hari).padStart(2, '0')}`;
  }
  return null;
}

function bacaWaktu(
  mentah: string | null | undefined,
  format: FormatTanggal = 'dmy'
): string | null {
  if (!mentah) return null;
  const t = mentah.trim();
  if (!t) return null;
  // Google Form Indonesia: "30/08/2026 14.05.12"
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/);
  if (m) {
    const [, a, b2, th, jj, mm, dd] = m;
    const d = format === 'mdy' ? b2 : a;
    const bl = format === 'mdy' ? a : b2;
    const iso = `${th}-${bl.padStart(2, '0')}-${d.padStart(2, '0')}T${jj.padStart(2, '0')}:${mm}:${dd ?? '00'}+07:00`;
    const t2 = new Date(iso);
    if (!Number.isNaN(t2.getTime())) return t2.toISOString();
  }
  const langsung = new Date(t);
  return Number.isNaN(langsung.getTime()) ? null : langsung.toISOString();
}

function bacaGender(mentah: string | null | undefined): Gender | null {
  if (!mentah) return null;
  const t = mentah.toLowerCase();
  if (/ikhwan|laki|pria|putra|male/.test(t)) return 'ikhwan';
  if (/akhwat|perempuan|wanita|putri|female/.test(t)) return 'akhwat';
  return null;
}

/** Samakan sebutan level ke dua bentuk yang dikenal CMS tilawah. */
export function bacaLevel(mentah: string | null | undefined): string | null {
  if (!mentah) return null;
  const t = mentah.toLowerCase();
  if (/lanjut|alumni/.test(t)) return 'HITS Lanjutan';
  if (/dasar|pemula|baru/.test(t)) return 'HITS Dasar';
  return null;
}

export interface BarisMentah {
  nama: string;
  wa: string | null;
  tanggal_lahir: string | null;
  /** Usia dari kolom tersendiri; dipakai bila tanggal lahir tak terbaca. */
  umur_isian: number | null;
  gender: Gender | null;
  level: string | null;
  slot_label_raw: string | null;
  rekaman_url: string | null;
  didaftar_pada: string | null;
  kunci: string;
}

/** Ubah CSV menjadi baris mentah memakai pemetaan kolom yang berlaku. */
export function bacaCsv(csv: string, petakan: KsPemetaanKolom): { baris: BarisMentah[]; kepala: string[] } {
  const tabel = parseCsv(csv);
  if (tabel.length === 0) return { baris: [], kepala: [] };
  const kepala = tabel[0].map((h) => h.trim());
  const idx = (nama: string | undefined) => (nama ? kepala.indexOf(nama) : -1);

  const iNama = idx(petakan.nama);
  const iWa = idx(petakan.wa);
  const iLahir = idx(petakan.tanggal_lahir);
  const iGender = idx(petakan.gender);
  const iLevel = idx(petakan.level);
  const iSlot = idx(petakan.slot);
  const iWaktu = idx(petakan.timestamp);
  const iUmur = idx(petakan.umur);
  const iRekaman = idx(petakan.rekaman);

  const ambil = (baris: string[], i: number) => (i >= 0 ? (baris[i] ?? '').trim() : '');

  // Format tanggal ditentukan dari seluruh kolom sekaligus, bukan per baris:
  // "5/6/2003" sah dibaca dua arah, dan hanya baris lain yang bisa memutuskannya.
  const formatLahir = deteksiFormatTanggal(
    iLahir >= 0 ? tabel.slice(1).map((b) => b[iLahir]) : []
  );
  const formatWaktu = deteksiFormatTanggal(
    iWaktu >= 0 ? tabel.slice(1).map((b) => b[iWaktu]) : [],
    'mdy'
  );

  const baris: BarisMentah[] = [];
  for (let r = 1; r < tabel.length; r++) {
    const b = tabel[r];
    if (!b || b.every((sel) => !sel || !sel.trim())) continue;

    const wa = ambil(b, iWa);
    const waktu = ambil(b, iWaktu);
    const nama = ambil(b, iNama);
    // Kunci baris: timestamp + WA. Bila keduanya kosong, jatuh ke seluruh isi
    // baris — supaya baris rusak pun tetap punya identitas yang stabil dan
    // muncul di layar koordinator, bukan hilang diam-diam tiap tarikan.
    const bahan = waktu || wa ? `${waktu}|${wa}` : b.join('|');
    const kunci = createHash('sha1').update(bahan).digest('hex').slice(0, 32);

    baris.push({
      nama,
      wa: wa || null,
      tanggal_lahir: bacaTanggal(ambil(b, iLahir), formatLahir),
      umur_isian: (() => {
        const t = ambil(b, iUmur).replace(/\D/g, '');
        const n = t ? Number(t) : NaN;
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
      gender: bacaGender(ambil(b, iGender)),
      level: bacaLevel(ambil(b, iLevel)),
      slot_label_raw: ambil(b, iSlot) || null,
      rekaman_url: ambil(b, iRekaman) || null,
      didaftar_pada: bacaWaktu(waktu, formatWaktu),
      kunci,
    });
  }
  return { baris, kepala };
}

export interface BarisSiap {
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
  rekaman_url: string | null;
  didaftar_pada: string | null;
  status: 'valid' | 'ditahan' | 'diganti';
  alasan_ditahan: string[];
}

export interface JamBaruFormulir {
  kelompok: Gender;
  mode: KsMode;
  label: string;
  hari: string[];
  hari_idx: KsHariIdx[];
  waktu_mulai: string;
  waktu_selesai: string;
  lokasi: string | null;
}

/**
 * Satu baris per kunci baris sheet. Kunci = timestamp + WA, jadi dua baris
 * berkunci sama bisa muncul (baris tersalin di sheet, dua kiriman di detik yang
 * sama). Tanpa penyaringan ini keduanya ditulis ke baris DB yang sama berurutan
 * dan yang menang ditentukan urutan tulis, bukan waktu kirim. Yang dipertahankan:
 * `didaftar_pada` terbaru; bila sama, yang lebih bawah di sheet (ditulis kemudian).
 */
export function satuPerKunci<T extends { kunci: string; didaftar_pada: string | null }>(baris: readonly T[]): T[] {
  const pilih = new Map<string, number>();
  baris.forEach((b, i) => {
    const j = pilih.get(b.kunci);
    if (j === undefined || (b.didaftar_pada ?? '') >= (baris[j].didaftar_pada ?? '')) pilih.set(b.kunci, i);
  });
  const dipakai = new Set(pilih.values());
  return baris.filter((_, i) => dipakai.has(i));
}

export interface KirimanLain {
  didaftar_pada: string | null;
  kunci: string;
}

/**
 * Urutan kiriman lintas CSV. Waktu kirim menentukan; bila sama persis, kunci baris
 * dipakai sebagai penentu supaya kedua CSV tidak sama-sama merasa menang.
 */
export function lebihBaru(a: KirimanLain, b: KirimanLain): boolean {
  const ta = a.didaftar_pada ? new Date(a.didaftar_pada).getTime() : 0;
  const tb = b.didaftar_pada ? new Date(b.didaftar_pada).getTime() : 0;
  if (ta !== tb) return ta > tb;
  return a.kunci > b.kunci;
}

export interface OpsiKiriman {
  /** Identitas yang barisnya sudah dialokasikan — semua kiriman lainnya diganti. */
  identitasDialokasikan?: ReadonlySet<string>;
  /**
   * Kiriman terbaru tiap identitas di CSV LAIN pada periode yang sama. Satu
   * periode boleh punya banyak formulir; orang yang mengisi dua formulir tetap
   * satu antrean, diwakili kiriman terbarunya.
   */
  terbaruLain?: ReadonlyMap<string, KirimanLain>;
}

/**
 * Per baris: apakah kiriman ini sudah digantikan kiriman lain dari orang yang
 * sama. Satu orang yang mengisi formulir berkali-kali hanya diwakili kiriman
 * TERBARU — aturan yang sama dengan formulir pengajar. Nomor yang sama dengan
 * nama berbeda (sekeluarga) bukan kiriman ulang. Baris tanpa identitas tidak
 * pernah dianggap diganti.
 */
function tandaiDiganti(baris: readonly BarisMentah[], opts: OpsiKiriman): boolean[] {
  const terbaru = new Map<string, number>();
  for (let i = 0; i < baris.length; i++) {
    const id = identitasPendaftar(baris[i].wa, baris[i].nama);
    if (!id) continue;
    const j = terbaru.get(id);
    if (j === undefined || (baris[i].didaftar_pada ?? '') >= (baris[j].didaftar_pada ?? '')) {
      terbaru.set(id, i);
    }
  }
  return baris.map((b, i) => {
    const id = identitasPendaftar(b.wa, b.nama);
    if (id === null) return false;
    const lain = opts.terbaruLain?.get(id);
    return (
      Boolean(opts.identitasDialokasikan?.has(id)) ||
      terbaru.get(id) !== i ||
      (lain !== undefined && lebihBaru(lain, { didaftar_pada: b.didaftar_pada, kunci: b.kunci }))
    );
  });
}

/**
 * Jam yang dipilih pendaftar tetapi belum ada di master periode.
 *
 * Keputusan 16 Sep 2026: master jam = gabungan jam dari xlsx pengajar DAN jam dari
 * formulir pendaftar. Tanpa ini, pendaftar yang memilih jam tanpa pengajar
 * tertahan sebagai "slot tidak ada di master" — padahal justru merekalah bukti
 * jam itu butuh pengajar, dan dashboard harus menghitungnya begitu.
 *
 * Kuncinya `kunciJamMaster` — sama dengan `saring` dan impor xlsx — jadi jam yang
 * ditambahkan di sini pasti dipakai saringan. Jam yang sudah ada — termasuk yang
 * DINONAKTIFKAN koordinator — tidak dibuat lagi.
 *
 * Hanya kiriman yang masih berlaku yang melahirkan jam: orang yang mengganti
 * pilihannya lewat kiriman ulang tidak boleh meninggalkan jam yatim dari
 * pilihan lamanya di master.
 */
export function jamBaruDariFormulir(
  baris: readonly BarisMentah[],
  slots: readonly KsSlot[],
  opts: OpsiKiriman = {}
): JamBaruFormulir[] {
  const ada = new Set(slots.map((s) => kunciJamMaster(s.kelompok, s.mode, sesiDariSlot(s), s.lokasi)));
  const diganti = tandaiDiganti(baris, opts);

  const baru = new Map<string, JamBaruFormulir>();
  baris.forEach((b, i) => {
    if (diganti[i] || !b.gender || !b.slot_label_raw) return;
    const u = uraikanSlot(b.slot_label_raw);
    if (!u) return;
    const mode: KsMode = u.mode ?? 'online';
    const lokasi = mode === 'offline' ? lokasiBaku(u.lokasi) : null;
    const k = kunciJamMaster(b.gender, mode, u.sesi, lokasi);
    if (ada.has(k) || baru.has(k)) return;
    baru.set(k, {
      kelompok: b.gender,
      mode,
      label: u.label,
      hari: u.hari,
      hari_idx: u.hari_idx,
      waktu_mulai: u.waktu_mulai,
      waktu_selesai: u.waktu_selesai,
      lokasi,
    });
  });
  return [...baru.values()];
}

/**
 * Saringan mutu data.
 *
 * MENAHAN, bukan membuang: baris bermasalah tetap tersimpan dan tampil di layar
 * koordinator lengkap dengan alasannya, hanya tidak ikut dihitung sampai
 * dibereskan. Ini penting karena nomor WA menjadi email palsu akun murid di CMS
 * tilawah — satu nomor kotor merusak akun yang dibuat atas nama orang itu.
 */
export function saring(
  baris: readonly BarisMentah[],
  slots: readonly KsSlot[],
  sekarang: Date,
  opts: OpsiKiriman = {}
): BarisSiap[] {
  const slotAktif = slots.filter((s) => s.aktif);
  const perLabel = new Map<string, KsSlot[]>();
  for (const s of slotAktif) {
    const sesi = sesiDariSlot(s);
    const k = sesi.length > 0 ? kunciJadwal(sesi) : s.label.toLowerCase();
    if (!perLabel.has(k)) perLabel.set(k, []);
    perLabel.get(k)!.push(s);
  }

  const digantiPer = tandaiDiganti(baris, opts);

  const out: BarisSiap[] = [];
  for (let i = 0; i < baris.length; i++) {
    const b = baris[i];
    const alasan: string[] = [];
    const diganti = digantiPer[i];

    const wa = normalWa(b.wa);
    if (!wa) alasan.push('Nomor WhatsApp kosong atau tidak sah');

    const nama = b.nama.trim();
    if (!nama) alasan.push('Nama kosong');
    else if (nama.replace(/[^a-zA-Z]/g, '').length <= 2) alasan.push('Nama terlalu pendek atau bukan huruf');
    else if (/^\d+$/.test(nama)) alasan.push('Nama berisi angka semua');

    // Tanggal lahir sering kosong (pada data nyata hanya 616 dari 1341 baris),
    // sementara kolom usia hampir selalu terisi. Jadi tanggal lahir dipakai bila
    // ada — lebih tepat — dan usia isian menjadi penggantinya, bukan penolakan.
    let umur: number | null = null;
    let pita: KsPitaUmur | null = null;
    if (b.tanggal_lahir) umur = hitungUmur(b.tanggal_lahir, sekarang);
    if (umur === null) umur = b.umur_isian;

    if (umur === null) alasan.push('Umur tidak diketahui — tanggal lahir dan kolom usia sama-sama kosong');
    else if (umur < 5 || umur > 90) alasan.push(`Umur ${umur} tahun di luar batas wajar`);
    else pita = pitaUmur(umur);

    // Slot dicocokkan lewat bentuk kanonik, bukan teks: pilihan di Google Form
    // sering ditulis dengan ejaan yang berbeda dari master.
    let slotId: string | null = null;
    if (b.slot_label_raw === 'This choice no longer accepts responses') {
      // Kuota pilihan di Google Form habis saat baris ini dikirim. Bukan salah
      // ketik dan bukan slot hilang — alasannya harus berbeda supaya koordinator
      // tidak mencari-cari kesalahan yang tidak ada.
      alasan.push('Pilihan jam sudah penuh di form saat pendaftar mengirim');
    } else if (b.slot_label_raw) {
      const u = uraikanSlot(b.slot_label_raw);
      const kandidat = u ? (perLabel.get(kunciJadwal(u.sesi)) ?? []) : [];
      // Mode ikut menyaring bila teks pilihannya menyebutkannya. Tanpa ini
      // pendaftar "Offline … Selasa & Kamis 16.00" mendarat di slot ONLINE
      // berjam sama — kelasnya benar jamnya, salah tempatnya.
      const cocokModeSaja = u?.mode ? kandidat.filter((s) => s.mode === u.mode) : kandidat;
      // Lokasi ikut menyaring pilihan offline: Pejaten dan Matraman boleh punya
      // kelas di hari & jam yang sama. Offline tanpa tempat dibaca Pejaten oleh
      // `lokasiBaku` — sama dengan kunci jam yang dibuat `jamBaruDariFormulir`,
      // jadi jam yang baru ditambahkan untuk pilihan ini pasti ketemu di sini.
      const cocokMode =
        u?.mode === 'offline'
          ? cocokModeSaja.filter((s) => lokasiBaku(s.lokasi) === lokasiBaku(u.lokasi))
          : cocokModeSaja;
      const cocokGender = b.gender ? cocokMode.filter((s) => s.kelompok === b.gender) : cocokMode;
      const dipakai = cocokGender.length > 0 ? cocokGender : cocokMode;
      if (dipakai.length === 1) slotId = dipakai[0].id;
      else if (dipakai.length > 1) alasan.push('Slot cocok ke lebih dari satu baris master');
      else if (!u) alasan.push(`Pilihan jam tidak dapat diurai: "${b.slot_label_raw}"`);
      else alasan.push('Slot tidak ada di master atau sudah dinonaktifkan');
    } else {
      alasan.push('Slot tidak diisi');
    }

    out.push({
      sumber_row_key: b.kunci,
      nama,
      wa: b.wa,
      wa_normal: wa,
      tanggal_lahir: b.tanggal_lahir,
      umur,
      pita_umur: pita,
      gender: b.gender,
      level_pilihan: b.level,
      slot_label_raw: b.slot_label_raw,
      slot_id: slotId,
      rekaman_url: b.rekaman_url,
      didaftar_pada: b.didaftar_pada,
      status: diganti ? 'diganti' : alasan.length === 0 ? 'valid' : 'ditahan',
      alasan_ditahan: diganti ? [] : alasan,
    });
  }
  return out;
}

/**
 * Tarik satu sumber dan simpan hasilnya.
 *
 * Baris yang sudah berstatus `dialokasikan` TIDAK diturunkan lagi menjadi
 * valid/ditahan: begitu seseorang masuk usulan halaqah, perubahan di sheet tidak
 * boleh mencabutnya diam-diam. Perubahan seperti itu harus lewat koordinator.
 */
export async function tarikSumber(
  sumber: KsPendaftarSumber,
  periode: KsPeriode,
  sekarang: Date
): Promise<HasilTarik> {
  const teks = await ambilCsvTerbit(sumber.csv_url);
  return terapkanCsvSumber(sumber, periode, teks, sekarang);
}

/**
 * Terapkan isi CSV satu sumber ke periode: tambah jam baru ke master, saring,
 * lalu simpan. Dipisah dari `tarikSumber` supaya bisa diuji tanpa jaringan.
 *
 * Master jam dibaca ulang di sini, bukan dioper pemanggil: beberapa sumber
 * (ikhwan, akhwat) ditarik berurutan, dan jam yang dibuat sumber sebelumnya
 * harus terlihat oleh sumber berikutnya.
 */
export async function terapkanCsvSumber(
  sumber: KsPendaftarSumber,
  periode: KsPeriode,
  teks: string,
  sekarang: Date
): Promise<HasilTarik> {
  const hasil: HasilTarik = {
    dibaca: 0,
    baru: 0,
    diperbarui: 0,
    valid: 0,
    ditahan: 0,
    diganti: 0,
    jamBaru: 0,
    dilewati: 0,
    peringatan: [],
  };

  const { baris: barisMentah, kepala } = bacaCsv(teks, sumber.pemetaan_kolom);
  hasil.dibaca = barisMentah.length;
  if (Object.keys(sumber.pemetaan_kolom).length === 0) {
    hasil.peringatan.push(
      `Pemetaan kolom belum diisi. Kolom terbaca: ${kepala.slice(0, 12).join(' | ')}`
    );
    return hasil;
  }

  // Judul kolom yang dipetakan tetapi tidak ada di CSV: Google Form diubah
  // (pertanyaan diganti judulnya) atau sheet yang salah. Kolom itu terbaca kosong
  // untuk semua baris — harus terlihat, bukan diam-diam menahan semua orang.
  const kolomHilang = Object.entries(sumber.pemetaan_kolom)
    .filter(([, judul]) => typeof judul === 'string' && judul.trim() !== '' && !kepala.includes(judul.trim()))
    .map(([kunci, judul]) => `${kunci} ("${judul}")`);
  if (kolomHilang.length > 0) {
    hasil.peringatan.push(`Kolom yang dipetakan tidak ada di CSV: ${kolomHilang.join(', ')}. Periksa pemetaan kolom.`);
  }

  const baris = satuPerKunci(barisMentah);
  if (baris.length < barisMentah.length) {
    hasil.peringatan.push(
      `${barisMentah.length - baris.length} baris berkunci kembar (timestamp + WA sama) — hanya yang terbaru disimpan.`
    );
  }

  const { data: adaRows, error: galatAda } = await supabaseAdmin
    .from('ks_pendaftar')
    .select(
      'id, sumber_id, sumber_row_key, status, alasan_ditahan, nama, wa, wa_normal, tanggal_lahir, umur, pita_umur, gender, level_pilihan, slot_label_raw, slot_id, rekaman_url, didaftar_pada'
    )
    .eq('periode_id', periode.id);
  if (galatAda) throw new Error(`Gagal membaca pendaftar periode: ${galatAda.message}`);
  const adaList = (adaRows ?? []) as (BarisTersimpan & { id: string; sumber_id: string | null; sumber_row_key: string })[];
  const ada = new Map(adaList.map((r) => [r.sumber_row_key, r]));
  // Orang yang sudah masuk usulan: baris itulah kebenarannya (dibekukan di bawah),
  // semua kirimannya yang lain berstatus diganti.
  const identitasDialokasikan = new Set(
    adaList
      .filter((r) => r.status === 'dialokasikan')
      .map((r) => identitasPendaftar(r.wa_normal, r.nama))
      .filter((x): x is string => x !== null)
  );

  // Kiriman terbaru tiap orang di CSV lain periode ini. Baris batal tidak ikut:
  // orang yang dibatalkan boleh mendaftar lagi lewat formulir mana pun.
  const terbaruLain = new Map<string, KirimanLain & { id: string }>();
  for (const r of adaList) {
    if (r.sumber_id === sumber.id || r.status === 'batal') continue;
    const id = identitasPendaftar(r.wa_normal, r.nama);
    if (!id) continue;
    const kiriman = { id: r.id, didaftar_pada: r.didaftar_pada, kunci: r.sumber_row_key };
    const lama = terbaruLain.get(id);
    if (!lama || lebihBaru(kiriman, lama)) terbaruLain.set(id, kiriman);
  }

  const slots = await listSlot(periode.id);
  let urutan = slots.reduce((m, s) => Math.max(m, s.urutan), 0);
  for (const j of jamBaruDariFormulir(baris, slots, { identitasDialokasikan, terbaruLain })) {
    const { data: slotBaru, error } = await supabaseAdmin
      .from('ks_slot')
      .insert({ periode_id: periode.id, ...j, urutan: ++urutan })
      .select('*')
      .single();
    if (error || !slotBaru) {
      throw new Error(`Gagal menambah jam "${j.label}" ke master: ${error?.message ?? 'tanpa balasan'}`);
    }
    slots.push(slotBaru as KsSlot);
    hasil.jamBaru++;
  }

  const siap = saring(baris, slots, sekarang, { identitasDialokasikan, terbaruLain });

  const stempel = sekarang.toISOString();
  for (const b of siap) {
    const lama = ada.get(b.sumber_row_key);
    // Baris yang sudah dialokasikan atau dibatalkan dibekukan seluruhnya: kiriman
    // ke CMS tilawah memakai nama, gender, dan nomornya. Suntingan di sheet
    // sesudah itu tidak boleh mengubah akun yang sudah (atau akan) dibuat.
    if (lama && (lama.status === 'dialokasikan' || lama.status === 'batal')) {
      await tulis(
        supabaseAdmin.from('ks_pendaftar').update({ ditarik_pada: stempel }).eq('id', lama.id),
        `menandai tarikan "${lama.nama}"`
      );
      continue;
    }

    if (b.status === 'valid') hasil.valid++;
    else if (b.status === 'diganti') hasil.diganti++;
    else hasil.ditahan++;

    const data = {
      nama: b.nama,
      wa: b.wa,
      wa_normal: b.wa_normal,
      tanggal_lahir: b.tanggal_lahir,
      umur: b.umur,
      pita_umur: b.pita_umur,
      gender: b.gender,
      level_pilihan: b.level_pilihan,
      slot_label_raw: b.slot_label_raw,
      slot_id: b.slot_id,
      rekaman_url: b.rekaman_url,
      didaftar_pada: b.didaftar_pada,
      status: b.status,
      alasan_ditahan: b.alasan_ditahan,
    };

    if (lama) {
      // Hanya baris yang isinya berubah yang ditulis. Tarikan berkala membaca
      // ribuan baris yang hampir semuanya sama; menulis ulang semuanya membuat
      // updated_at tak bermakna dan tarikan lambat.
      if (samaIsi(lama, data)) continue;
      await tulis(
        supabaseAdmin
          .from('ks_pendaftar')
          .update({ ...data, ditarik_pada: stempel, updated_at: stempel })
          .eq('id', lama.id),
        `memperbarui "${b.nama}"`
      );
      hasil.diperbarui++;
    } else {
      await tulis(
        supabaseAdmin.from('ks_pendaftar').insert({
          periode_id: periode.id,
          sumber_id: sumber.id,
          sumber_row_key: b.sumber_row_key,
          ...data,
          ditarik_pada: stempel,
        }),
        `menyimpan "${b.nama}"`
      );
      hasil.baru++;
    }
  }

  // Baris CSV INI yang tak muncul lagi di tarikan ini. Kunci baris = timestamp +
  // WA, jadi kunci lama hilang bila pendaftar menyunting jawabannya, baris sheet
  // dibetulkan/dihapus, atau pemetaan kolom diubah. Dibiarkan, baris lama dan
  // baru sama-sama valid — satu orang terhitung dan dialokasikan dua kali.
  //
  // Pengaman: CSV yang tiba-tiba jauh lebih pendek (Google mengirim sheet
  // terpotong atau kosong, sheet yang salah) atau kehilangan kolom yang
  // dipetakan lebih mungkin salah tarik daripada perubahan sungguhan. Saat itu
  // tidak ada yang diturunkan, dan koordinator diberi tahu.
  const kunciIni = new Set(baris.map((b) => b.kunci));
  const milikSumber = adaList.filter((r) => r.sumber_id === sumber.id);
  const hidupSumber = milikSumber.filter((r) => r.status !== 'diganti').length;
  const basi = milikSumber.filter(
    (r) => (r.status === 'valid' || r.status === 'ditahan') && !kunciIni.has(r.sumber_row_key)
  );
  if (basi.length > 0) {
    if (baris.length < hidupSumber * 0.5) {
      hasil.peringatan.push(
        `CSV hanya berisi ${baris.length} baris, padahal sumber ini punya ${hidupSumber} pendaftar tersimpan. ` +
          `${basi.length} baris yang tak muncul TIDAK diturunkan — periksa tautan dan isi sheet.`
      );
    } else if (kolomHilang.length > 0) {
      hasil.peringatan.push(
        `${basi.length} baris yang tak muncul TIDAK diturunkan karena ada kolom yang hilang dari CSV.`
      );
    } else {
      for (const r of basi) {
        await tulis(
          supabaseAdmin
            .from('ks_pendaftar')
            .update({ status: 'diganti', alasan_ditahan: [], updated_at: stempel })
            .eq('id', r.id),
          `menurunkan baris lama "${r.nama}"`
        );
        hasil.diganti++;
      }
    }
  }

  // Arah sebaliknya: baris CSV lain yang kini kalah baru oleh CSV ini. Yang kalah
  // turun ke 'diganti' sekarang juga; yang justru menang dibereskan saat CSV-nya
  // sendiri ditarik (tarikan berkala dan "Tarik semua" selalu menarik semua CSV).
  const pemenangIni = new Map<string, KirimanLain>();
  for (const b of siap) {
    if (b.status === 'diganti') continue;
    const lama = ada.get(b.sumber_row_key);
    if (lama && (lama.status === 'dialokasikan' || lama.status === 'batal')) continue;
    const id = identitasPendaftar(b.wa_normal, b.nama);
    if (id) pemenangIni.set(id, { didaftar_pada: b.didaftar_pada, kunci: b.sumber_row_key });
  }
  for (const r of adaList) {
    if (r.sumber_id === sumber.id || (r.status !== 'valid' && r.status !== 'ditahan')) continue;
    const id = identitasPendaftar(r.wa_normal, r.nama);
    const menang = id ? pemenangIni.get(id) : undefined;
    if (!menang || !lebihBaru(menang, { didaftar_pada: r.didaftar_pada, kunci: r.sumber_row_key })) continue;
    await tulis(
      supabaseAdmin
        .from('ks_pendaftar')
        .update({ status: 'diganti', alasan_ditahan: [], updated_at: stempel })
        .eq('id', r.id),
      `menurunkan kiriman lama "${r.nama}" di CSV lain`
    );
    hasil.diganti++;
  }

  const ringkasan = `${hasil.baru} baru, ${hasil.diperbarui} diperbarui, ${hasil.ditahan} ditahan, ${hasil.diganti} diganti kiriman baru, ${hasil.jamBaru} jam baru di master`;
  await tulis(
    supabaseAdmin
      .from('ks_pendaftar_sumber')
      .update({
        terakhir_tarik: stempel,
        terakhir_status: 'ok',
        terakhir_pesan: hasil.peringatan.length > 0 ? `${ringkasan}. PERINGATAN: ${hasil.peringatan.join(' ')}` : ringkasan,
        updated_at: stempel,
      })
      .eq('id', sumber.id),
    'mencatat hasil tarikan'
  );

  return hasil;
}

/** Kolom ks_pendaftar yang ditulis tarikan CSV, sebagaimana dibaca kembali dari DB. */
interface BarisTersimpan {
  status: string;
  alasan_ditahan: string[] | null;
  nama: string;
  wa: string | null;
  wa_normal: string | null;
  tanggal_lahir: string | null;
  umur: number | null;
  pita_umur: string | null;
  gender: string | null;
  level_pilihan: string | null;
  slot_label_raw: string | null;
  slot_id: string | null;
  rekaman_url: string | null;
  didaftar_pada: string | null;
}

/**
 * Apakah isi baris DB sudah sama dengan hasil saringan. Waktu dibandingkan
 * sebagai instan (DB mengembalikan ISO yang bisa berbeda ejaan), tanggal lahir
 * sebagai 10 karakter pertama.
 */
export function samaIsi(lama: BarisTersimpan, baru: BarisTersimpan): boolean {
  const waktu = (v: string | null) => (v ? new Date(v).getTime() : null);
  const tanggal = (v: string | null) => (v ? String(v).slice(0, 10) : null);
  const teks = (v: unknown) => (v === undefined || v === null ? null : v);
  const kolom: (keyof BarisTersimpan)[] = [
    'status',
    'nama',
    'wa',
    'wa_normal',
    'umur',
    'pita_umur',
    'gender',
    'level_pilihan',
    'slot_label_raw',
    'slot_id',
    'rekaman_url',
  ];
  return (
    kolom.every((k) => teks(lama[k]) === teks(baru[k])) &&
    waktu(lama.didaftar_pada) === waktu(baru.didaftar_pada) &&
    tanggal(lama.tanggal_lahir) === tanggal(baru.tanggal_lahir) &&
    JSON.stringify(lama.alasan_ditahan ?? []) === JSON.stringify(baru.alasan_ditahan ?? [])
  );
}

/**
 * Jalankan satu tulisan dan lempar galat yang jelas bila gagal. Pemanggil
 * (`tarikBerkala`, aksi koordinator) menandai sumber 'gagal' dari galat ini;
 * tanpa pemeriksaan, tulisan yang gagal tetap dihitung berhasil.
 */
async function tulis(
  kueri: PromiseLike<{ error: { message: string } | null }>,
  apa: string
): Promise<void> {
  const { error } = await kueri;
  if (error) throw new Error(`Gagal ${apa}: ${error.message}`);
}
