// Ujian hafalan 2in1 — aturan murni (tanpa DB), dipakai halaman peserta,
// musyrif, koordinator, dan scripts/test-ujian.ts.

import type { NilaiRekaman, PredikatUjian, StatusSetoran, UjianPeriode } from '@/types/db';

export const PREDIKAT_UJIAN: PredikatUjian[] = ['mumtaz', 'jayyid', 'maqbul', 'dhaif'];

export const PREDIKAT_LABEL: Record<PredikatUjian, string> = {
  mumtaz: 'Mumtaz',
  jayyid: 'Jayyid',
  maqbul: 'Maqbul',
  dhaif: 'Dha’if',
};

/** Warna tampilan: Hijau Mumtaz, Kuning Jayyid, Merah Maqbul & Dha'if. */
export const PREDIKAT_WARNA: Record<PredikatUjian, NilaiRekaman> = {
  mumtaz: 'hijau',
  jayyid: 'kuning',
  maqbul: 'merah',
  dhaif: 'merah',
};

/** Jarak antar-ujian. Dipakai untuk perkiraan jadwal berikutnya. */
export const JARAK_UJIAN_BULAN = 3;

export function isPredikat(x: unknown): x is PredikatUjian {
  return typeof x === 'string' && (PREDIKAT_UJIAN as string[]).includes(x);
}

export function todayJakarta(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

export type StatusPeriode = 'akan' | 'berlangsung' | 'selesai';

export function statusPeriode(p: Pick<UjianPeriode, 'mulai' | 'selesai'>, today: string): StatusPeriode {
  if (today < p.mulai) return 'akan';
  if (today > p.selesai) return 'selesai';
  return 'berlangsung';
}

/** Hari sebelum ujian berikutnya dimulai, saat periode lalu digeser keluar dari layar. */
const AMBANG_TAMPIL_BERIKUTNYA_HARI = 14;

/**
 * Periode yang ditampilkan secara default:
 *  1. yang sedang berlangsung;
 *  2. yang akan datang bila mulainya ≤ 14 hari lagi (atau belum pernah ada ujian);
 *  3. yang terakhir selesai — musyrif masih menilai, peserta masih ingin lihat nilai.
 */
export function pilihPeriode<T extends Pick<UjianPeriode, 'mulai' | 'selesai'>>(
  periodes: T[],
  today: string
): T | null {
  const urut = [...periodes].sort((a, b) => a.mulai.localeCompare(b.mulai));
  const jalan = urut.find((p) => statusPeriode(p, today) === 'berlangsung');
  if (jalan) return jalan;
  const lalu = urut.filter((p) => p.selesai < today).pop() ?? null;
  const depan = urut.find((p) => p.mulai > today) ?? null;
  if (depan && (!lalu || selisihHari(today, depan.mulai) <= AMBANG_TAMPIL_BERIKUTNYA_HARI)) return depan;
  return lalu ?? depan;
}

/** Periode sesudah `p` bila koordinator belum menjadwalkannya: +3 bulan, panjang sama. */
export function perkiraanBerikutnya(p: Pick<UjianPeriode, 'mulai' | 'selesai'>): { mulai: string; selesai: string } {
  const panjang = selisihHari(p.mulai, p.selesai);
  const mulai = tambahBulan(p.mulai, JARAK_UJIAN_BULAN);
  return { mulai, selesai: tambahHari(mulai, panjang) };
}

export type StatusUjianPeserta = 'belum' | 'menunggu' | 'dinilai';

/** `draft` tanpa rekaman (baris yang hanya memuat alasan musyrif) tetap "belum". */
export function statusUjianPeserta(ujian: { status: StatusSetoran } | null | undefined): StatusUjianPeserta {
  if (!ujian) return 'belum';
  if (ujian.status === 'checked') return 'dinilai';
  if (ujian.status === 'submitted') return 'menunggu';
  return 'belum';
}

export const STATUS_UJIAN_LABEL: Record<StatusUjianPeserta, string> = {
  belum: 'Belum ujian',
  menunggu: 'Menunggu dinilai',
  dinilai: 'Sudah dinilai',
};

export function validasiPeriode(input: { nama: string; mulai: string; selesai: string }): string | null {
  if (!input.nama.trim()) return 'Nama periode wajib diisi.';
  if (!isTanggal(input.mulai) || !isTanggal(input.selesai)) return 'Tanggal tidak valid.';
  if (input.selesai < input.mulai) return 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
  if (selisihHari(input.mulai, input.selesai) > 60) return 'Rentang ujian terlalu panjang (maks 60 hari).';
  return null;
}

/** "21–27 Sep 2026", "28 Sep – 4 Okt 2026", "29 Des 2026 – 4 Jan 2027". */
export function formatRentang(mulai: string, selesai: string): string {
  const a = keDate(mulai);
  const b = keDate(selesai);
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('id-ID', { ...o, timeZone: 'UTC' });
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${f(a, { day: 'numeric', month: 'short', year: 'numeric' })} – ${f(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) {
    return `${f(a, { day: 'numeric', month: 'short' })} – ${f(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${a.getUTCDate()}–${f(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function isTanggal(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = keDate(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function keDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function selisihHari(dari: string, sampai: string): number {
  return Math.round((keDate(sampai).getTime() - keDate(dari).getTime()) / 86_400_000);
}

function tambahHari(s: string, n: number): string {
  const d = keDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Tanggal akhir bulan dijepit: 30 Nov + 3 bulan = 28/29 Feb, bukan 2 Mar. */
function tambahBulan(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const total = m - 1 + n;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const akhir = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(d, akhir))).toISOString().slice(0, 10);
}
