// Rekap Pertemuan Pengajar — inti MURNI (tanpa DB, tanpa next/*, tanpa
// 'server-only') supaya bisa diuji langsung oleh `npm run test-rekap-pertemuan`.
//
// Periode memakai jendela 16–15 yang sama dengan check-in pengajar Maahir
// (`periode-pengajar.ts`): kunci periode = bulan AKHIR ('2026-10' = 16 Sep –
// 15 Okt 2026). Sumber data: Dashboard Edu (hilmihs, disinkron beberapa kali
// sehari ke berkas snapshot) + check-in Kelas Maahir dari aplikasi ini.
//
// JANGAN impor modul ini dari berkas 'use client' — ia memakai node:crypto.

import { createHmac } from 'node:crypto';
import {
  periodePengajarLabel,
  periodePengajarOf,
  periodePengajarRange,
} from '@/lib/periode-pengajar';

// ── Tipe ─────────────────────────────────────────────────────────────────

export type SumberPertemuan = 'dashboard-edu' | 'maahir';
export type AlasanBerhalangan = 'sakit' | 'izin' | 'badal' | 'lain';

export type PertemuanItem = {
  /** 'j:<jadwalId>' (hilmihs) | 'm:<kelasId>:<tanggal>' (maahir); kunci dedup. */
  id: string;
  /** YYYY-MM-DD (WIB). */
  tanggal: string;
  /** Pertemuan ke-. */
  urutan: number | null;
  /** hilmihs done / maahir check-in hadir. */
  selesai: boolean;
  /** hilmihs confStatus / maahir izin|sakit ⇒ tidak_mengajar. */
  konfirmasi: 'mengajar' | 'tidak_mengajar' | null;
  /** Hanya bila konfirmasi === 'tidak_mengajar'. */
  alasan: AlasanBerhalangan | null;
};

/** Disimpan di berkas snapshot. */
export type HalaqahSnapshot = {
  programNama: string;
  programSlug: string | null;
  halaqahNama: string;
  sebagaiBadal: boolean;
  guruUtama: string | null;
  /** hashKunci('wa:'+normalizeWhatsApp(guruPhone)) atau null — nomor mentah tak pernah disimpan. */
  kunci: string | null;
  pertemuan: PertemuanItem[];
};

export type GuruSnapshot = {
  nama: string;
  namaNorm: string;
  /** Kunci halaqah (non-null) yang berbeda. */
  kunci: string[];
  halaqah: HalaqahSnapshot[];
};

export type SnapshotPertemuan = {
  versi: 1;
  /** 'YYYY-MM' = bulan AKHIR periode (konvensi periodePengajarOf). */
  periode: string;
  start: string;
  end: string;
  /** hashKunci('rekap-pertemuan', secret).slice(0,8); beda ⇒ perlu sinkron ulang. */
  sidikKunci: string;
  /** ISO, sinkron SUKSES terakhir. */
  syncedAt: string | null;
  /** meta.generatedAt dari hulu. */
  sumberGeneratedAt: string | null;
  lastAttemptAt: string | null;
  /** Pendek, tersanitasi, ≤200 karakter — tak pernah memuat token/nomor. */
  lastError: string | null;
  guru: GuruSnapshot[];
};

/** Bentuk yang dipakai halaman, dari kedua sumber. */
export type HalaqahPertemuan = {
  sumber: SumberPertemuan;
  /** slug | 'nama:'+programNama | 'maahir'. */
  programKey: string;
  programNama: string;
  halaqahNama: string;
  sebagaiBadal: boolean;
  guruUtama: string | null;
  cocokLewat: 'wa' | 'nama' | 'akun-maahir';
  /** Mis. '/kehadiran/pengajar-maahir'. */
  tautan?: string;
  pertemuan: PertemuanItem[];
};

export type ProgramPertemuan = {
  sumber: SumberPertemuan;
  programKey: string;
  programNama: string;
  halaqah: HalaqahPertemuan[];
};

export type RingkasanPertemuan = {
  /** Semua jadwal dalam periode (= ideal hulu). */
  terjadwal: number;
  /** selesai === true (termasuk keanehan hulu: done=true bertanggal depan). */
  selesai: number;
  /** !selesai && konfirmasi === 'mengajar'. */
  dikonfirmasiMengajar: number;
  /** !selesai && konfirmasi === 'tidak_mengajar'. */
  berhalangan: number;
  /** !selesai && konfirmasi === null && tanggal < hariIni. */
  terlewat: number;
  /** !selesai && konfirmasi === null && tanggal >= hariIni (hari ini = akan datang). */
  akanDatang: number;
  /** tanggal < hariIni, ditambah item selesai bertanggal >= hariIni. */
  jatuhTempo: number;
};

export type StatusPertemuan = 'selesai' | 'dikonfirmasi' | 'berhalangan' | 'terlewat' | 'akan_datang';

export type HasilSinkron = {
  periode: string;
  ok: boolean;
  dilewati?: 'segar' | 'beku' | 'backoff' | 'sedang-berjalan';
  jumlahGuru?: number;
  jumlahHalaqah?: number;
  jumlahPertemuan?: number;
  durasiMs: number;
  error?: string;
};

export type KeputusanSinkron = 'ya' | 'tidak' | 'backoff' | 'beku';

// ── Konstanta ────────────────────────────────────────────────────────────

/** Ambang segar-malas: halaman memicu sinkron latar bila data lebih tua. */
export const STALE_MS = 3 * 3600_000;
/** Tampilkan peringatan "data basi". */
export const BASI_MS = 8 * 3600_000;
/** Cron melewati periode yang baru disinkron lebih dekat dari ini. */
export const MIN_JARAK_CRON_MS = 30 * 60_000;
/**
 * Jeda global tombol "Perbarui" — dihitung dari sinkron sukses terakhir.
 * Sengaja longgar: timer terjadwal 4×/hari + segar-malas 3 jam sudah menjaga
 * data; tombol hanya untuk "baru saja mengisi presensi, mau lihat hasilnya".
 */
export const COOLDOWN_MANUAL_MS = 30 * 60_000;
/** Jeda setelah percobaan gagal. */
export const BACKOFF_GAGAL_MS = 15 * 60_000;
/** Periode dibekukan setelah tersinkron > end + N hari. */
export const BEKU_SETELAH_HARI = 3;
/** Opsi periode: berjalan + N ke belakang. */
export const JUMLAH_PERIODE_MUNDUR = 5;

// ── Tanggal & periode ────────────────────────────────────────────────────

/** Tanggal hari ini (WIB) 'YYYY-MM-DD'. */
export function hariIniWib(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/** '2026-01', -1 → '2025-12'. */
export function geserPeriode(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function tambahHari(tanggal: string, n: number): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Periode berjalan + JUMLAH_PERIODE_MUNDUR ke belakang, terbaru dulu. */
export function periodePertemuanOptions(hariIni: string): { value: string; label: string }[] {
  const kini = periodePengajarOf(hariIni);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i <= JUMLAH_PERIODE_MUNDUR; i++) {
    const value = geserPeriode(kini, -i);
    out.push({ value, label: periodePengajarLabel(value) });
  }
  return out;
}

/** `month` bila termasuk opsi; selain itu periode berjalan. */
export function periodeValid(month: string | null | undefined, hariIni: string): string {
  if (typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    if (periodePertemuanOptions(hariIni).some((o) => o.value === month)) return month;
  }
  return periodePengajarOf(hariIni);
}

/**
 * Periode yang disinkron terjadwal: periode berjalan, ditambah periode lalu
 * selama tanggal 16..(15+BEKU_SETELAH_HARI) — supaya input susulan pengajar
 * untuk tanggal 13–15 masih tertangkap sebelum periode lalu dibekukan.
 */
export function periodeYangDisinkron(hariIni: string): string[] {
  const kini = periodePengajarOf(hariIni);
  const tgl = Number(hariIni.slice(8, 10));
  if (tgl >= 16 && tgl <= 15 + BEKU_SETELAH_HARI) return [kini, geserPeriode(kini, -1)];
  return [kini];
}

/** Periode sudah beku: hari ini melewati end + BEKU_SETELAH_HARI. */
export function periodeBeku(month: string, hariIni: string): boolean {
  const { end } = periodePengajarRange(month);
  return hariIni > tambahHari(end, BEKU_SETELAH_HARI);
}

// ── Keputusan sinkron & status data ──────────────────────────────────────

function ms(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

export function perluSinkron(
  s: Pick<SnapshotPertemuan, 'periode' | 'syncedAt' | 'lastAttemptAt' | 'sidikKunci'> | null,
  month: string,
  now: Date,
  opts?: { maxAgeMs?: number; sidikKunci?: string },
): KeputusanSinkron {
  const nowMs = now.getTime();
  const coba = ms(s?.lastAttemptAt);
  const dalamBackoff = Number.isFinite(coba) && nowMs - coba < BACKOFF_GAGAL_MS;

  const sinkron = ms(s?.syncedAt);
  const sidikBeda = !!opts?.sidikKunci && !!s && s.sidikKunci !== opts.sidikKunci;
  if (!s || s.periode !== month || !Number.isFinite(sinkron) || sidikBeda) {
    return dalamBackoff ? 'backoff' : 'ya';
  }

  const { end } = periodePengajarRange(month);
  const batasBeku = tambahHari(end, BEKU_SETELAH_HARI);
  if (periodeBeku(month, hariIniWib(now)) && hariIniWib(new Date(sinkron)) > batasBeku) {
    return 'beku';
  }

  if (nowMs - sinkron > (opts?.maxAgeMs ?? STALE_MS)) {
    // Percobaan gagal yang lebih baru dari sukses terakhir → tunggu jeda dulu.
    if (Number.isFinite(coba) && coba > sinkron && dalamBackoff) return 'backoff';
    return 'ya';
  }
  return 'tidak';
}

/** kosong = belum pernah sinkron sukses. */
export function statusData(s: SnapshotPertemuan | null, now: Date): 'segar' | 'basi' | 'kosong' {
  const sinkron = ms(s?.syncedAt);
  if (!s || !Number.isFinite(sinkron)) return 'kosong';
  return now.getTime() - sinkron > BASI_MS ? 'basi' : 'segar';
}

// ── Kunci & nama ─────────────────────────────────────────────────────────

/** HMAC-SHA256 hex, 32 karakter pertama. Nomor mentah tak pernah disimpan. */
export function hashKunci(raw: string, secret: string): string {
  return createHmac('sha256', secret).update(raw).digest('hex').slice(0, 32);
}

const GELAR = new Set([
  'ust', 'ustd', 'ustdz', 'ustadz', 'ustadzah', 'ustaz', 'ustazah', 'ustadzh',
  'al', 'syaikh', 'syekh', 'syeikh', 'kh', 'dr', 'lc', 'ma',
  'spd', 'spdi', 'sag', 'mpd', 'hj', 'h',
]);

/**
 * Normalisasi nama untuk pencocokan cadangan: NFKD tanpa diakritik, huruf
 * kecil, apostrof/titik/non-alfanumerik jadi spasi, gelar dibuang.
 * 'Ustadzah Siti Nur'aini, S.Pd.I' → 'siti nur aini'.
 */
export function normalisasiNama(s: string): string {
  let t = (s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
  // Gelar akademik bertitik ('S.Pd.I', 'S. Ag', 'M.Pd', 'M.A.') dirapatkan dulu
  // supaya ikut terbuang sebagai satu token.
  t = t.replace(
    /(^|[^a-z0-9])([sm])\.\s?(pd|ag|a)(\.\s?i)?\.?(?=[^a-z0-9]|$)/g,
    (_all, pre: string, a: string, b: string, c: string | undefined) =>
      `${pre} ${a}${b}${c ? 'i' : ''} `,
  );
  t = t.replace(/[^a-z0-9]+/g, ' ');
  return t
    .split(' ')
    .filter((tok) => tok && !GELAR.has(tok))
    .join(' ');
}

// ── Status & ringkasan ───────────────────────────────────────────────────

export function statusItem(it: PertemuanItem, hariIni: string): StatusPertemuan {
  // Guru yang mengonfirmasi tidak mengajar (izin/sakit/badal) tetap berhalangan
  // walau CMS menandai pertemuannya selesai — yang mengajar adalah badalnya.
  if (it.konfirmasi === 'tidak_mengajar') return 'berhalangan';
  if (it.selesai) return 'selesai';
  if (it.konfirmasi === 'mengajar') return 'dikonfirmasi';
  return it.tanggal < hariIni ? 'terlewat' : 'akan_datang';
}

export function hitungRingkasan(items: PertemuanItem[], hariIni: string): RingkasanPertemuan {
  const r: RingkasanPertemuan = {
    terjadwal: 0, selesai: 0, dikonfirmasiMengajar: 0, berhalangan: 0,
    terlewat: 0, akanDatang: 0, jatuhTempo: 0,
  };
  for (const it of items) {
    r.terjadwal++;
    if (it.tanggal < hariIni || it.selesai) r.jatuhTempo++;
    switch (statusItem(it, hariIni)) {
      case 'selesai': r.selesai++; break;
      case 'dikonfirmasi': r.dikonfirmasiMengajar++; break;
      case 'berhalangan': r.berhalangan++; break;
      case 'terlewat': r.terlewat++; break;
      case 'akan_datang': r.akanDatang++; break;
    }
  }
  return r;
}

export function nadaRingkasan(r: RingkasanPertemuan): 'hijau' | 'kuning' | 'merah' | 'netral' {
  if (r.terjadwal === 0) return 'netral';
  if (r.terlewat === 0) return 'hijau';
  if (r.terlewat === 1) return 'kuning';
  return 'merah';
}

// ── Pencocokan guru ──────────────────────────────────────────────────────

function keHalaqahPertemuan(h: HalaqahSnapshot, cocokLewat: HalaqahPertemuan['cocokLewat']): HalaqahPertemuan {
  return {
    sumber: 'dashboard-edu',
    programKey: h.programSlug ?? `nama:${h.programNama}`,
    programNama: h.programNama,
    halaqahNama: h.halaqahNama,
    sebagaiBadal: h.sebagaiBadal,
    guruUtama: h.guruUtama,
    cocokLewat,
    pertemuan: h.pertemuan,
  };
}

/** Kunci banding nama: spasi diabaikan, supaya 'Rafi Qonita Lestari' = 'Nurlayla'. */
const rapat = (namaNorm: string): string => namaNorm.replace(/ /g, '');

/**
 * Pilih halaqah milik pengajar dari snapshot:
 *  1. guru yang salah satu kuncinya ada di `kunciHash` ⇒ SEMUA halaqahnya
 *     (termasuk baris tanpa nomor, mis. Mabni) — cocokLewat 'wa';
 *  2. guru yang namaNorm-nya disebut eksplisit (override 'nm:') ⇒ 'nama';
 *  3. guru tanpa kunci sama sekali, namaNorm sama dengan nama akun, dan nama
 *     itu unik di snapshot ⇒ 'nama'. Tetap dipakai walau 1–2 sudah cocok:
 *     hulu mengelompokkan guru per NAMA, jadi program tanpa nomor (HKM, Mabni)
 *     yang ejaan namanya beda dari baris HITS-nya muncul sebagai guru terpisah.
 * Nama dibandingkan tanpa spasi (lihat `rapat`).
 */
export function pilihHalaqahGuru(
  guru: GuruSnapshot[],
  kunciHash: Set<string>,
  namaEksplisit: Set<string>,
  namaAkun: Set<string>,
): { halaqah: HalaqahPertemuan[]; dicocokkan: boolean } {
  const eksplisit = new Set(Array.from(namaEksplisit, rapat));
  const akun = new Set(Array.from(namaAkun, rapat));
  const cocok = new Map<GuruSnapshot, HalaqahPertemuan['cocokLewat']>();
  for (const g of guru) {
    if (g.kunci.some((k) => kunciHash.has(k))) cocok.set(g, 'wa');
    else if (g.namaNorm && eksplisit.has(rapat(g.namaNorm))) cocok.set(g, 'nama');
  }
  if (akun.size > 0) {
    const hitung = new Map<string, number>();
    for (const g of guru) hitung.set(rapat(g.namaNorm), (hitung.get(rapat(g.namaNorm)) ?? 0) + 1);
    for (const g of guru) {
      const n = rapat(g.namaNorm);
      if (n && !cocok.has(g) && akun.has(n) && g.kunci.length === 0 && hitung.get(n) === 1) {
        cocok.set(g, 'nama');
      }
    }
  }
  const halaqah: HalaqahPertemuan[] = [];
  for (const [g, lewat] of cocok) {
    for (const h of g.halaqah) {
      // Hulu mengelompokkan guru per NAMA, jadi dua guru bernama sama bisa
      // tergabung. Baris halaqah yang jelas milik nomor lain tidak ikut.
      if (lewat === 'wa' && h.kunci && !kunciHash.has(h.kunci)) continue;
      halaqah.push(keHalaqahPertemuan(h, lewat));
    }
  }
  return { halaqah, dicocokkan: cocok.size > 0 };
}

// ── Pengelompokan per program ────────────────────────────────────────────

const PERINGKAT_COCOK: Record<HalaqahPertemuan['cocokLewat'], number> = { wa: 0, 'akun-maahir': 1, nama: 2 };

function urutPertemuan(a: PertemuanItem, b: PertemuanItem): number {
  if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
  const ua = a.urutan ?? Number.MAX_SAFE_INTEGER;
  const ub = b.urutan ?? Number.MAX_SAFE_INTEGER;
  if (ua !== ub) return ua - ub;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Kelompokkan per sumber+program. Halaqah kembar (programKey, nama, badal,
 * guruUtama) digabung dan pertemuannya didedup per id. Program Dashboard Edu
 * diurut nama; Kelas Maahir selalu terakhir.
 */
export function gabungProgram(halaqah: HalaqahPertemuan[]): ProgramPertemuan[] {
  const program = new Map<string, ProgramPertemuan>();
  const gabung = new Map<string, { h: HalaqahPertemuan; ids: Set<string> }>();

  for (const h of halaqah) {
    const pk = `${h.sumber}|${h.programKey}`;
    let p = program.get(pk);
    if (!p) {
      p = { sumber: h.sumber, programKey: h.programKey, programNama: h.programNama, halaqah: [] };
      program.set(pk, p);
    }
    const hk = JSON.stringify([pk, h.halaqahNama, h.sebagaiBadal, h.guruUtama]);
    let g = gabung.get(hk);
    if (!g) {
      g = { h: { ...h, pertemuan: [] }, ids: new Set() };
      gabung.set(hk, g);
      p.halaqah.push(g.h);
    } else {
      if (PERINGKAT_COCOK[h.cocokLewat] < PERINGKAT_COCOK[g.h.cocokLewat]) g.h.cocokLewat = h.cocokLewat;
      if (!g.h.tautan && h.tautan) g.h.tautan = h.tautan;
    }
    for (const it of h.pertemuan) {
      if (g.ids.has(it.id)) continue;
      g.ids.add(it.id);
      g.h.pertemuan.push(it);
    }
  }

  const hasil = [...program.values()];
  for (const p of hasil) {
    for (const h of p.halaqah) h.pertemuan.sort(urutPertemuan);
    p.halaqah.sort((a, b) => {
      if (a.sebagaiBadal !== b.sebagaiBadal) return a.sebagaiBadal ? 1 : -1;
      const n = a.halaqahNama.localeCompare(b.halaqahNama, 'id', { numeric: true, sensitivity: 'base' });
      if (n !== 0) return n;
      return (a.guruUtama ?? '').localeCompare(b.guruUtama ?? '', 'id');
    });
  }
  hasil.sort((a, b) => {
    if (a.sumber !== b.sumber) return a.sumber === 'maahir' ? 1 : -1;
    return a.programNama.localeCompare(b.programNama, 'id', { numeric: true, sensitivity: 'base' });
  });
  return hasil;
}

export function ringkasTotal(programs: ProgramPertemuan[], hariIni: string): RingkasanPertemuan {
  return hitungRingkasan(
    programs.flatMap((p) => p.halaqah.flatMap((h) => h.pertemuan)),
    hariIni,
  );
}

export function labelAlasan(a: AlasanBerhalangan | null): string {
  switch (a) {
    case 'sakit': return 'Sakit';
    case 'izin': return 'Izin';
    case 'badal': return 'Digantikan badal';
    default: return 'Berhalangan';
  }
}
