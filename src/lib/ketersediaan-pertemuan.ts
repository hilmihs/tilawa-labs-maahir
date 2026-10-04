import type { KsHariIdx, KsLibur, KsPeriode } from '@/types/db';

/**
 * Tanggal pertemuan sebuah halaqah.
 *
 * Halaqah yang dikirim ke CMS tilawah tanpa pertemuan tidak dapat dipakai —
 * presensi di sana bergantung pada baris pertemuan. Pembacaan produksi
 * 1 September 2026 menunjukkan tiap halaqah HITS Reguler punya 22 pertemuan
 * bernama `P1`..`P22`, jatuh persis pada hari slotnya, berturut-turut tanpa
 * melompati apa pun:
 *
 *   halaqah #947, slot Senin & Rabu 20:00–21:30
 *   2026-07-27 (Sen) · 07-29 (Rab) · 08-03 · 08-05 · … · 10-05 · 10-07
 *
 * Karena itu polanya cukup diturunkan dari tanggal mulai + hari slot + jumlah;
 * tidak dibutuhkan sumber kalender akademik terpisah. Libur nasional memang
 * tidak dilompati — sama seperti data yang sudah ada di sana — dan penyesuaian
 * semacam itu dilakukan koordinator langsung di CMS.
 */

/** JS `getUTCDay()` memakai 0 = Minggu; indeks kita 0 = Senin. */
function idxHari(d: Date): KsHariIdx {
  return (((d.getUTCDay() + 6) % 7) as KsHariIdx);
}

/**
 * Daftar tanggal `YYYY-MM-DD`, dimulai pada `mulai` (ikut dihitung bila harinya
 * cocok), sebanyak `jumlah` pertemuan.
 *
 * Mengembalikan larik kosong bila masukannya tidak masuk akal, bukan menebak:
 * hari kosong berarti tidak ada hari yang bisa dijadwalkan sama sekali.
 */
export function tanggalPertemuan(
  mulai: string,
  hariIdx: readonly KsHariIdx[],
  jumlah: number,
  /** Tanggal merah, Ramadhan, dan libur lain yang dilompati. */
  libur: readonly KsLibur[] = []
): string[] {
  if (jumlah <= 0 || hariIdx.length === 0) return [];
  const awal = new Date(`${mulai.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(awal.getTime())) return [];

  const hari = new Set(hariIdx);
  const out: string[] = [];
  const kursor = new Date(awal);

  // Penjaga: 7 hari per pertemuan sudah jauh lebih dari cukup walau slotnya
  // hanya sekali sepekan, ditambah panjang semua libur. Mencegah perulangan tak
  // berujung bila ada masukan aneh.
  const batasHari = jumlah * 7 + 14 + libur.reduce((n, l) => n + lamaHari(l), 0);
  for (let i = 0; i < batasHari && out.length < jumlah; i++) {
    const t = kursor.toISOString().slice(0, 10);
    if (hari.has(idxHari(kursor)) && !sedangLibur(t, libur)) out.push(t);
    kursor.setUTCDate(kursor.getUTCDate() + 1);
  }
  return out;
}

function sedangLibur(tanggal: string, libur: readonly KsLibur[]): boolean {
  return libur.some((l) => tanggal >= l.mulai && tanggal <= l.selesai);
}

function lamaHari(l: KsLibur): number {
  const a = Date.parse(`${l.mulai}T00:00:00Z`);
  const b = Date.parse(`${l.selesai}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) || b < a ? 0 : Math.round((b - a) / 86_400_000) + 1;
}

/** "08/02/2027" | "2027-02-08" | "8-2-2027" → "2027-02-08". null bila bukan tanggal sah. */
function bacaTanggalLibur(t: string): string | null {
  let y: number, m: number, d: number;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  const hasil = new Date(Date.UTC(y, m - 1, d));
  if (hasil.getUTCFullYear() !== y || hasil.getUTCMonth() !== m - 1 || hasil.getUTCDate() !== d) return null;
  return hasil.toISOString().slice(0, 10);
}

/**
 * Urai daftar libur yang diketik koordinator, satu libur per baris:
 *   25/12/2026 Natal
 *   08/02/2027 - 23/03/2027 Ramadhan + 2 pekan
 * Pemisah rentang boleh "-", "–", "s.d.", "sd", atau "sampai". Baris kosong
 * dilewati; baris yang tak terbaca dilaporkan, tidak ditebak.
 */
export function uraiLibur(teks: string): { libur: KsLibur[]; galat: string[] } {
  const libur: KsLibur[] = [];
  const galat: string[] = [];
  const TGL = String.raw`(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})`;
  const pola = new RegExp(`^${TGL}(?:\\s*(?:-|–|—|s\\.?\\s*d\\.?|sampai)\\s*${TGL})?\\s*(.*)$`, 'i');
  for (const mentah of teks.split(/\r?\n/)) {
    const baris = mentah.trim();
    if (!baris) continue;
    const m = baris.match(pola);
    const mulai = m ? bacaTanggalLibur(m[1]) : null;
    const selesai = m ? (m[2] ? bacaTanggalLibur(m[2]) : mulai) : null;
    if (!m || !mulai || !selesai) {
      galat.push(`"${baris}" — tanggal tidak terbaca`);
      continue;
    }
    if (selesai < mulai) {
      galat.push(`"${baris}" — tanggal selesai sebelum tanggal mulai`);
      continue;
    }
    libur.push({ mulai, selesai, keterangan: m[3].trim() });
  }
  libur.sort((a, b) => a.mulai.localeCompare(b.mulai));
  return { libur, galat };
}

/** Kebalikan `uraiLibur`, untuk mengisi kotak teks. */
export function teksLibur(libur: readonly KsLibur[]): string {
  const dmy = (t: string) => `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
  return libur
    .map((l) => `${dmy(l.mulai)}${l.selesai !== l.mulai ? ` - ${dmy(l.selesai)}` : ''}${l.keterangan ? ` ${l.keterangan}` : ''}`)
    .join('\n');
}

/**
 * Jam pertemuan pada sebuah tanggal. Kelas dua waktu ("Rabu 16:00 - 17:30 &
 * Sabtu 13:00 - 14:30") berjam beda per hari, jadi jamnya dipilih dari hari
 * tanggal itu. null bila tanggal itu bukan hari belajar kelasnya.
 */
export function jamPadaTanggal(
  tanggal: string,
  sesi: readonly { hari_idx: KsHariIdx; mulai: string; selesai: string }[]
): { mulai: string; selesai: string } | null {
  const d = new Date(`${tanggal.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const s = sesi.find((x) => x.hari_idx === idxHari(d));
  return s ? { mulai: s.mulai, selesai: s.selesai } : null;
}

/** Nama pertemuan mengikuti kebiasaan yang sudah ada di CMS: P1, P2, … */
export function namaPertemuan(urutan: number): string {
  return `P${urutan}`;
}

/**
 * Susun `start_session_date` / `end_session_date` sesuai format CMS
 * (`YYYY-MM-DD HH:MM:SS`, waktu lokal tanpa zona).
 *
 * CMS menolak bila `end_session_date` tidak lebih besar dari `start_session_date`
 * — itulah 400 "The end session date field must be a date after start session
 * date." yang muncul bila jamnya kembar.
 */
export function rentangPertemuan(
  tanggal: string,
  waktuMulai: string,
  waktuSelesai: string
): { mulai: string; selesai: string } | null {
  const jam = (t: string) => t.slice(0, 8).padEnd(8, ':00').slice(0, 8);
  const m = `${tanggal} ${jam(waktuMulai)}`;
  const s = `${tanggal} ${jam(waktuSelesai)}`;
  if (s <= m) return null;
  return { mulai: m, selesai: s };
}

/**
 * Jumlah pertemuan yang dibuat di CMS tilawah untuk satu halaqah.
 * HITS Dasar dan Lanjutan berbeda panjangnya (50 dan 26 per keputusan 16 Sep
 * 2026), jadi angkanya dipilih dari jenjang usulan, bukan satu angka periode.
 * "Alumni HITS" sudah dilebur ke Lanjutan oleh `bacaLevel`.
 */
export function jumlahPertemuanUntuk(
  periode: Pick<KsPeriode, 'jumlah_pertemuan_dasar' | 'jumlah_pertemuan_lanjutan'>,
  level: string
): number {
  return /lanjut/i.test(level) ? periode.jumlah_pertemuan_lanjutan : periode.jumlah_pertemuan_dasar;
}

/**
 * Tanggal pertemuan terakhir sebuah halaqah menurut levelnya — sampai kapan jam
 * pengajarnya benar-benar terpakai.
 *
 * HITS Dasar (50 pertemuan) dan HITS Lanjutan (26 pertemuan) dalam satu periode
 * mulai bersamaan tetapi selesai terpaut berbulan-bulan: dengan libur Ramadhan,
 * Dasar yang mulai 19 Okt 2026 selesai ±Juni, Lanjutan ±Januari. Mengunci jam
 * pengajar Lanjutan sampai akhir periode membuang jamnya selama lima bulan.
 *
 * Jatuh ke `periode.selesai` bila jumlah pertemuan 0 (dibuat manual di CMS) atau
 * tanggal tidak dapat dihitung — lebih baik mengunci terlalu lama daripada membuka
 * jam yang ternyata masih terisi.
 */
export function perkiraanSelesaiHalaqah(args: {
  mulai: string | null;
  hari_idx: readonly KsHariIdx[];
  level: string | null;
  periode: Pick<KsPeriode, 'mulai' | 'selesai' | 'jumlah_pertemuan_dasar' | 'jumlah_pertemuan_lanjutan'> & {
    libur?: readonly KsLibur[] | null;
  };
}): string {
  const jumlah = jumlahPertemuanUntuk(args.periode, args.level ?? '');
  if (jumlah <= 0) return args.periode.selesai;
  const tanggal = tanggalPertemuan(args.mulai ?? args.periode.mulai, args.hari_idx, jumlah, args.periode.libur ?? []);
  return tanggal.length === jumlah ? tanggal[tanggal.length - 1] : args.periode.selesai;
}
