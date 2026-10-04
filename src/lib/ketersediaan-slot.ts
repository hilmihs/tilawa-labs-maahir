import type { KsHariIdx, KsMode, KsPitaUmur } from '@/types/db';

/**
 * Normalisasi slot waktu HITS.
 *
 * Alasan modul ini ada: teks slot TIDAK dapat diperbandingkan apa adanya.
 * Pada berkas nyata yang beredar sudah bercampur —
 *   "Selasa & Jum'at 16.00 - 17.30 WIB"   (titik, apostrof lurus)
 *   "Selasa & Jumat 16:00 - 17:30 WIB"    (titik dua, tanpa apostrof)
 *   "Selasa & Kamis 10.00 -11.30 WIB"     (spasi pincang)
 * dan `hits_halaqah.jadwal_raw` masih membawa awalan mode: "Online Sabtu & Ahad …".
 *
 * Karena itu semua perbandingan dilakukan pada bentuk kanonik: indeks hari
 * (0 = Senin … 6 = Ahad) + jam sebagai menit sejak tengah malam. Indeks hari
 * sengaja sejajar dengan `int_days` milik /api/days CMS tilawah, sehingga usulan
 * pemetaan day_id bisa dihitung alih-alih ditebak dari teks.
 */

/** 0 = Senin … 6 = Ahad. Sama dengan `int_days` CMS tilawah. */
export const HARI_URUT = ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu', 'Ahad'] as const;

const HARI_ALIAS: Record<string, KsHariIdx> = {
  senin: 0,
  selasa: 1,
  rabu: 2,
  kamis: 3,
  jumat: 4,
  juma: 4, // "Jum'a" setelah apostrof dibuang oleh penulisan yang aneh
  jum: 4,
  sabtu: 5,
  ahad: 6,
  minggu: 6,
};

/**
 * Apostrof lengkung → apostrof lurus. Google Form dan ponsel mengganti "'"
 * dengan ’ (U+2019), ‘ (U+2018), atau ʼ (U+02BC) secara otomatis; tanpa
 * penyeragaman ini "Jum’at" tidak dikenali pemindai hari dan Jumat hilang
 * diam-diam dari slot.
 */
export function apostrofLurus(s: string): string {
  return s.replace(/[\u2019\u2018\u02BC`´]/g, "'");
}

/** Buang apostrof/titik/tanda baca, rapatkan spasi, huruf kecil. */
function bersih(s: string): string {
  return apostrofLurus(s)
    .normalize('NFKD')
    .replace(/'/g, '')
    .replace(/[^a-zA-Z]+/g, '')
    .toLowerCase();
}

/** "Jum'at" | "JUMAT" | "jum at" → 4. null bila bukan nama hari. */
export function hariKeIdx(nama: string): KsHariIdx | null {
  const k = bersih(nama);
  if (!k) return null;
  if (k in HARI_ALIAS) return HARI_ALIAS[k];
  // Toleransi ejaan panjang: "jumaat", "jummat".
  if (k.startsWith('jum')) return 4;
  if (k.startsWith('ahad') || k.startsWith('minggu')) return 6;
  return null;
}

export function idxKeHari(i: KsHariIdx): string {
  return HARI_URUT[i];
}

/**
 * Ambil daftar indeks hari dari sekumpulan nama, terurut & unik.
 * Nama yang tak dikenali diabaikan diam-diam — pemanggil membandingkan panjang
 * masukan dan keluaran bila perlu tahu ada yang gagal.
 */
export function hariKeIdxSet(nama: readonly string[]): KsHariIdx[] {
  const out = new Set<KsHariIdx>();
  for (const n of nama) {
    const i = hariKeIdx(n);
    if (i !== null) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** "06:00" | "6.00" | "0600" → menit sejak tengah malam. null bila tak terbaca. */
export function jamKeMenit(teks: string): number | null {
  const t = teks.trim();
  const m = t.match(/^(\d{1,2})\s*[.:]\s*(\d{2})/) ?? t.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const jam = Number(m[1]);
  const menit = Number(m[2]);
  if (!Number.isFinite(jam) || !Number.isFinite(menit)) return null;
  if (jam > 23 || menit > 59) return null;
  return jam * 60 + menit;
}

export function menitKeJam(menit: number): string {
  const h = Math.floor(menit / 60);
  const m = menit % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "06:00:00" (time Postgres) atau "06:00" → menit. */
export function timeKeMenit(t: string | null | undefined): number | null {
  if (!t) return null;
  return jamKeMenit(t);
}

/** Satu hari belajar dan jamnya. Jam "HH:MM". */
export interface SesiSlot {
  hari_idx: KsHariIdx;
  mulai: string;
  selesai: string;
}

export interface SlotTerurai {
  hari: string[];
  /** Gabungan semua hari, terurut. */
  hari_idx: KsHariIdx[];
  /** Jam hari pertama. Untuk kelas dua waktu, jam hari lain ada di `sesi`. */
  waktu_mulai: string;
  waktu_selesai: string;
  /** Jam per hari, terurut menurut hari. Kelas biasa: semua harinya berjam sama. */
  sesi: SesiSlot[];
  /** Hari-harinya berjam berbeda, mis. "Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30". */
  duaWaktu: boolean;
  mode: KsMode | null;
  /** Teks lokasi yang menempel pada pilihan offline, bila ada. */
  lokasi: string | null;
  /** Label yang sudah dirapikan, siap disimpan & ditampilkan. */
  label: string;
}

/** Pola satu rentang jam, mis. "06:00 - 07:30" atau "10.00 -11.30". */
const POLA_RENTANG = /(\d{1,2}\s*[.:]\s*\d{2})\s*[-–—]\s*(\d{1,2}\s*[.:]\s*\d{2})/g;

/**
 * Nama hari di mana pun dalam sepotong teks, berurut kemunculan.
 *
 * Memindai nama, bukan memotong pemisah, karena pilihan offline di Google Form
 * menyelipkan lokasi sebelum harinya:
 *   "Offline di Masjid Al Kautsar Matraman Jakarta Timur Selasa & Kamis 16.00 - 17.30 WIB"
 * Memotong pada "&" akan menjadikan "…Jakarta Timur Selasa" satu potongan yang
 * tak dikenali, sehingga Selasa hilang dan slotnya terbaca Kamis saja.
 */
function pindaiHari(teks: string): { idx: KsHariIdx[]; posisiAwal: number } {
  const pola = /\b(senin|selasa|rabu|kamis|jum'?\s?at|jumat|sabtu|ahad|minggu)\b/gi;
  teks = apostrofLurus(teks);
  const out: KsHariIdx[] = [];
  let posisiAwal = -1;
  for (const m of teks.matchAll(pola)) {
    const i = hariKeIdx(m[1]);
    if (i === null) continue;
    if (posisiAwal < 0) posisiAwal = m.index ?? 0;
    if (!out.includes(i)) out.push(i);
  }
  return { idx: out.sort((a, b) => a - b), posisiAwal };
}

/**
 * Urai satu teks jadwal menjadi bentuk kanonik.
 *
 * Menerima bentuk yang beredar, termasuk pilihan Google Form yang menempelkan
 * lokasi:
 *   "Senin & Rabu 06:00 - 07:30 WIB"
 *   "Online Selasa & Jum'at 06:00 - 07:30 WIB"          ← hits_halaqah.jadwal_raw
 *   "Offline di Pejaten Senin & Rabu 16:30 - 18:00 WIB" ← pilihan form pendaftaran
 *
 * Kelas dua waktu juga diterima, asal setiap rentang jam didahului harinya
 * sendiri dan harinya tidak berulang:
 *   "Offline Matraman Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30"
 * Hasilnya satu slot dengan jam per hari di `sesi`. Rentang jam yang tidak
 * punya hari sendiri ("Senin 06.00 - 07.30 / 16.00 - 17.30") tetap ditolak —
 * menebaknya akan menaruh kelas pada jam yang salah.
 *
 * Mengembalikan null bila hari atau jam tidak dapat dibaca.
 */
export function uraikanSlot(teks: string): SlotTerurai | null {
  if (!teks) return null;
  let sisa = apostrofLurus(teks).trim();

  let mode: KsMode | null = null;
  const modeMatch = sisa.match(/^\s*(online|offline|hybrid)\b/i);
  if (modeMatch) {
    const m = modeMatch[1].toLowerCase();
    mode = m === 'offline' ? 'offline' : 'online';
    sisa = sisa.slice(modeMatch[0].length).trim();
  }

  const rentang = [...sisa.matchAll(POLA_RENTANG)];
  if (rentang.length === 0) return null;

  // Setiap rentang jam memiliki hari yang tertulis di antara rentang sebelumnya
  // dan dirinya. Kelas biasa hanya punya satu potongan.
  const potongan: { hari: KsHariIdx[]; mulai: number; selesai: number }[] = [];
  let posisiLokasi = -1;
  let dari = 0;
  for (const m of rentang) {
    const ujung = m.index ?? 0;
    const { idx, posisiAwal } = pindaiHari(sisa.slice(dari, ujung));
    if (idx.length === 0) return null;
    if (potongan.length === 0) posisiLokasi = posisiAwal;
    const mulai = jamKeMenit(m[1]);
    const selesai = jamKeMenit(m[2]);
    if (mulai === null || selesai === null || selesai <= mulai) return null;
    potongan.push({ hari: idx, mulai, selesai });
    dari = ujung + m[0].length;
  }

  const sesi: SesiSlot[] = [];
  for (const pt of potongan) {
    for (const h of pt.hari) {
      if (sesi.some((x) => x.hari_idx === h)) return null; // hari yang sama dua jam — bukan satu kelas
      sesi.push({ hari_idx: h, mulai: menitKeJam(pt.mulai), selesai: menitKeJam(pt.selesai) });
    }
  }
  sesi.sort((a, b) => a.hari_idx - b.hari_idx);

  // Teks sebelum nama hari pertama adalah lokasi, bila ada. "di Pejaten" → "Pejaten".
  const depan = posisiLokasi > 0 ? sisa.slice(0, posisiLokasi).trim() : '';
  const lokasi = depan.replace(/^di\s+/i, '').trim() || null;

  const hari_idx = sesi.map((x) => x.hari_idx);
  return {
    hari: hari_idx.map(idxKeHari),
    hari_idx,
    waktu_mulai: sesi[0].mulai,
    waktu_selesai: sesi[0].selesai,
    sesi,
    duaWaktu: !seragam(sesi),
    mode,
    lokasi,
    label: labelSesi(sesi),
  };
}

function seragam(sesi: readonly SesiSlot[]): boolean {
  return sesi.every((x) => x.mulai === sesi[0].mulai && x.selesai === sesi[0].selesai);
}

/**
 * Label baku dari jam per hari. Hari berjam sama dikelompokkan:
 *   "Senin & Rabu 06:00 - 07:30 WIB"
 *   "Rabu 16:00 - 17:30 & Sabtu 13:00 - 14:30 WIB"
 * Label ini dibaca ulang oleh `uraikanSlot`, jadi bentuknya harus tetap terurai.
 */
export function labelSesi(sesi: readonly SesiSlot[]): string {
  const kelompok: { hari: KsHariIdx[]; mulai: string; selesai: string }[] = [];
  for (const x of [...sesi].sort((a, b) => a.hari_idx - b.hari_idx)) {
    const ada = kelompok.find((k) => k.mulai === x.mulai && k.selesai === x.selesai);
    if (ada) ada.hari.push(x.hari_idx);
    else kelompok.push({ hari: [x.hari_idx], mulai: x.mulai, selesai: x.selesai });
  }
  return `${kelompok.map((k) => `${k.hari.map(idxKeHari).join(' & ')} ${k.mulai} - ${k.selesai}`).join(' & ')} WIB`;
}

/**
 * Jam per hari sebuah baris ks_slot. Kolom `waktu_mulai/selesai` hanya menyimpan
 * satu jam, jadi kelas dua waktu dibaca dari labelnya — label selalu ditulis
 * sistem lewat `labelSesi`, bukan diketik bebas.
 */
export function sesiDariSlot(slot: {
  label: string;
  hari_idx: readonly KsHariIdx[];
  waktu_mulai: string;
  waktu_selesai: string;
}): SesiSlot[] {
  const urai = uraikanSlot(slot.label);
  if (urai?.duaWaktu && samaHari(urai.hari_idx, slot.hari_idx)) return urai.sesi;
  const mulai = timeKeMenit(slot.waktu_mulai);
  const selesai = timeKeMenit(slot.waktu_selesai);
  if (mulai === null || selesai === null) return [];
  return [...slot.hari_idx]
    .sort((a, b) => a - b)
    .map((h) => ({ hari_idx: h, mulai: menitKeJam(mulai), selesai: menitKeJam(selesai) }));
}

function samaHari(a: readonly number[], b: readonly number[]): boolean {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * Kunci pencocokan jadwal: hari dan jam mulai tiap hari. Jam selesai sengaja
 * tidak ikut — ejaan pilihan formulir dan xlsx kadang berbeda semenit di ujung.
 */
export function kunciJadwal(sesi: readonly SesiSlot[]): string {
  return [...sesi]
    .sort((a, b) => a.hari_idx - b.hari_idx)
    .map((x) => `${x.hari_idx}@${x.mulai.slice(0, 5)}`)
    .join(',');
}

/**
 * Kunci satu jam master periode: kelompok, mode, jam per hari — dan untuk kelas
 * OFFLINE juga lokasinya. Tanpa lokasi, kelas Pejaten dan Matraman pada hari dan
 * jam yang sama melebur jadi satu jam: pendaftar Matraman diantrekan ke kelas
 * Pejaten dan pengajarnya dihitung bersama. Lokasi dilewatkan `lokasiBaku`
 * supaya ejaan formulir dan xlsx yang berbeda tetap satu kunci.
 *
 * Satu-satunya pembentuk kunci ini — dipakai penambah jam dari formulir,
 * impor xlsx, dan pandangan gabungan, sehingga ketiganya tidak bisa berbeda.
 */
export function kunciJamMaster(
  kelompok: string,
  mode: string,
  sesi: readonly SesiSlot[],
  lokasi: string | null | undefined
): string {
  const dasar = `${kelompok}|${mode}|${kunciJadwal(sesi)}`;
  return mode === 'offline' ? `${dasar}|${lokasiBaku(lokasi)}` : dasar;
}

/**
 * Susun label baku dari bentuk kanonik. Dipakai saat koordinator membuat slot
 * lewat borang, supaya label di master tidak pernah lahir dengan ejaan liar.
 */
export function susunLabel(hari_idx: readonly KsHariIdx[], mulai: string, selesai: string): string {
  const urut = [...new Set(hari_idx)].sort((a, b) => a - b);
  const m = jamKeMenit(mulai);
  const s = jamKeMenit(selesai);
  const jamTeks = m !== null && s !== null ? `${menitKeJam(m)} - ${menitKeJam(s)}` : `${mulai} - ${selesai}`;
  return `${urut.map(idxKeHari).join(' & ')} ${jamTeks} WIB`;
}

// ── Lokasi offline ────────────────────────────────────────────────────────

/**
 * Nama baku lokasi offline HITS. Sumbernya menulis tempat yang sama dengan
 * cara berbeda — formulir "Masjid Al Kautsar Matraman Jakarta Timur", xlsx
 * "Masjid Al-Kautsar Matraman", baris offline di sheet online hanya "Offline" —
 * sehingga dashboard memecah satu lokasi menjadi beberapa.
 *
 * Offline tanpa keterangan tempat = Pejaten (ditegaskan koordinator 16 Sep 2026).
 */
export function lokasiBaku(teks: string | null | undefined): string {
  const t = (teks ?? '').trim();
  if (/kautsar|matraman/i.test(t)) return 'Masjid Al-Kautsar Matraman';
  if (!t || /pejaten/i.test(t) || /^offline$/i.test(t)) return 'Pejaten';
  return t;
}

// ── Bentrok ────────────────────────────────────────────────────────────────

export interface RentangJadwal {
  hari_idx: readonly KsHariIdx[];
  /** Menit sejak tengah malam. */
  mulai: number;
  selesai: number;
}

/**
 * Dua jadwal bentrok bila harinya beririsan DAN jamnya bertumpang tindih.
 * Sentuhan ujung tidak dihitung bentrok: kelas 06:00–07:30 dan 07:30–09:00
 * boleh dipegang orang yang sama.
 */
export function bentrok(a: RentangJadwal, b: RentangJadwal): boolean {
  const irisan = a.hari_idx.some((h) => b.hari_idx.includes(h));
  if (!irisan) return false;
  return a.mulai < b.selesai && a.selesai > b.mulai;
}

/** Ubah jam per hari menjadi rentang bentrok; hari berjam sama digabung. */
export function rentangDariSesi(sesi: readonly SesiSlot[]): RentangJadwal[] {
  const out: { hari_idx: KsHariIdx[]; mulai: number; selesai: number }[] = [];
  for (const x of sesi) {
    const mulai = jamKeMenit(x.mulai);
    const selesai = jamKeMenit(x.selesai);
    if (mulai === null || selesai === null) continue;
    const ada = out.find((r) => r.mulai === mulai && r.selesai === selesai);
    if (ada) ada.hari_idx.push(x.hari_idx);
    else out.push({ hari_idx: [x.hari_idx], mulai, selesai });
  }
  return out;
}

/**
 * Rentang bentrok dari baris ks_slot. Kelas biasa menghasilkan satu rentang,
 * kelas dua waktu satu rentang per jam. Kosong bila jamnya tak terbaca.
 */
export function rentangDariSlot(slot: {
  label: string;
  hari_idx: KsHariIdx[];
  waktu_mulai: string;
  waktu_selesai: string;
}): RentangJadwal[] {
  return rentangDariSesi(sesiDariSlot(slot));
}

/** Apakah salah satu rentang `a` bentrok dengan salah satu rentang `b`. */
export function bentrokSalahSatu(a: readonly RentangJadwal[], b: readonly RentangJadwal[]): boolean {
  return a.some((x) => b.some((y) => bentrok(x, y)));
}

/**
 * Bentuk RentangJadwal dari baris hits_halaqah.
 *
 * Kolomnya sering tidak lengkap: sebagian halaqah lama hanya punya `jadwal_raw`
 * berisi "Selasa & Jum'at" tanpa jam sama sekali (baris observasi). Urutan
 * usaha: kolom terurai dulu, lalu jatuh ke penguraian `jadwal_raw`.
 * Kelas dua waktu hanya dapat dikenali dari `jadwal_raw`: kolom terurai hanya
 * menyimpan satu jam. Karena itu `jadwal_raw` berjam ganda didahulukan.
 * Mengembalikan larik kosong bila jam tetap tak diketahui — halaqah tanpa jam
 * tidak boleh mengunci slot mana pun, karena tak ada dasar menyatakan bentrok.
 */
export function rentangDariHalaqah(h: {
  jadwal_hari: string[] | null;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  jadwal_raw: string | null;
}): RentangJadwal[] {
  const urai = h.jadwal_raw ? uraikanSlot(h.jadwal_raw) : null;
  if (urai?.duaWaktu) return rentangDariSesi(urai.sesi);
  const mulai = timeKeMenit(h.waktu_mulai);
  const selesai = timeKeMenit(h.waktu_selesai);
  const idx = hariKeIdxSet(h.jadwal_hari ?? []);
  if (idx.length > 0 && mulai !== null && selesai !== null && selesai > mulai) {
    return [{ hari_idx: idx, mulai, selesai }];
  }
  return urai ? rentangDariSesi(urai.sesi) : [];
}

/**
 * Apakah sebuah halaqah masih menempati jamnya pada tanggal acuan (YYYY-MM-DD).
 *
 * Tanpa tanggal selesai atau tanpa acuan dianggap masih — mengunci jam yang
 * ternyata kosong lebih murah daripada membuka jam yang ternyata masih terisi.
 */
export function masihBerjalanPada(selesai: string | null, acuan: string | null): boolean {
  if (!selesai || !acuan) return true;
  return selesai.slice(0, 10) >= acuan.slice(0, 10);
}

/**
 * Tanggal kaldik terakhir yang benar-benar dipakai sebuah program halaqah HITS.
 *
 * Satu batch punya kaldik per level (QN lalu PB), tetapi tidak semua halaqah
 * memakai keduanya: Dasar menjalani QN lalu PB, sedangkan Lanjutan menjalani
 * PB di atas tanggal kaldik QN (lihat PROGRAM_STAGE_DEFS di hits-pertemuan.ts).
 * Mengambil tanggal terbesar satu batch membuat Lanjutan Juni 2026 tampak
 * berjalan sampai Desember padahal selesai September.
 *
 * `tahap` = daftar kaldik yang dipakai program; null bila tak satu pun kaldiknya ada.
 */
export function selesaiMenurutTahap(
  tahap: readonly { kaldikLevel: string; kaldikFallback?: string }[],
  akhirPerLevel: ReadonlyMap<string, string>
): string | null {
  let akhir: string | null = null;
  for (const t of tahap) {
    const tgl = akhirPerLevel.get(t.kaldikLevel) ?? (t.kaldikFallback ? akhirPerLevel.get(t.kaldikFallback) : undefined);
    if (tgl && (!akhir || tgl > akhir)) akhir = tgl;
  }
  return akhir;
}

// ── Pita umur ──────────────────────────────────────────────────────────────

/**
 * Umur dalam tahun penuh pada tanggal acuan. Acuan diberikan pemanggil
 * (bukan Date.now di dalam) supaya hasil rekap dapat diulang dan diuji.
 */
export function hitungUmur(tanggalLahir: string, acuan: Date): number | null {
  const lahir = new Date(`${tanggalLahir.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(lahir.getTime())) return null;
  let umur = acuan.getUTCFullYear() - lahir.getUTCFullYear();
  const bulan = acuan.getUTCMonth() - lahir.getUTCMonth();
  if (bulan < 0 || (bulan === 0 && acuan.getUTCDate() < lahir.getUTCDate())) umur -= 1;
  return umur;
}

/**
 * Dua kelompok saja. Lima pita lama membuat kelompok jarang genap 12 orang:
 * pada data 16 Sep 2026 ikhwan hanya membentuk 11 halaqah dengan lima pita,
 * 19 dengan dua pita, dari pengajar dan pendaftar yang sama.
 */
export function pitaUmur(umur: number): KsPitaUmur {
  return umur <= 45 ? '<=45' : '46+';
}
