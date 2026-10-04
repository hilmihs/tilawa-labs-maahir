import 'server-only';

// Cache snapshot Rekap Pertemuan dari Dashboard Edu (hilmihs).
//
// Satu berkas JSON per periode 16–15 di
//   ${STORAGE_DIR}/cache/rekap-pertemuan/<YYYY-MM>.json   (YYYY-MM = bulan AKHIR)
// Halaman TIDAK menembak hilmihs tiap dibuka: data disinkron beberapa kali
// sehari (timer → POST /api/kehadiran/pertemuan/sync), disegarkan malas di
// latar bila > STALE_MS, dan bisa diminta manual (dijeda global + per orang).
//
// Tanpa migrasi DB. Nomor WA tak pernah disimpan — hanya sidik HMAC
// (SESSION_SECRET); ganti secret ⇒ sidikKunci beda ⇒ wajib sinkron ulang.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { storageDir } from '@/lib/pg-storage';
import { normalizeWhatsApp } from '@/lib/whatsapp';
import { periodePengajarRange } from '@/lib/periode-pengajar';
import { fetchLaporanGuru, fetchProgramSlugMap, normalisasiLaporan } from '@/lib/hilmihs/report';
import {
  COOLDOWN_MANUAL_MS,
  BACKOFF_GAGAL_MS,
  MIN_JARAK_CRON_MS,
  hariIniWib,
  hashKunci,
  normalisasiNama,
  periodePertemuanOptions,
  periodeYangDisinkron,
  perluSinkron,
  pilihHalaqahGuru,
  statusData,
  type HalaqahPertemuan,
  type HasilSinkron,
  type KeputusanSinkron,
  type SnapshotPertemuan,
} from '@/lib/rekap-pertemuan';

const RE_BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;
const TUNGGU_AWAL_MS = 12_000;
const TUNGGU_MANUAL_MS = 25_000;
const MAKS_MANUAL_PER_JAM = 3;

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length > 0 ? s : null;
}

function sidikDari(s: string): string {
  return hashKunci('rekap-pertemuan', s).slice(0, 8);
}

function dirCache(): string {
  return join(storageDir(), 'cache', 'rekap-pertemuan');
}

function berkas(month: string): string {
  if (!RE_BULAN.test(month)) throw new Error('periode tidak valid');
  return join(dirCache(), `${month}.json`);
}

/** Pesan galat pendek & aman: tanpa URL, token, atau deret angka panjang (nomor). */
function sanitasi(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/bearer\s+\S+/gi, 'Bearer [disembunyikan]')
    .replace(/\d{8,}/g, '[angka]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'galat tak dikenal';
}

// ── Baca / tulis berkas ──────────────────────────────────────────────────

const cacheMemori = new Map<string, { mtimeMs: number; data: SnapshotPertemuan }>();

function bentukSah(x: unknown, month: string): x is SnapshotPertemuan {
  const s = x as SnapshotPertemuan | null;
  return !!s && s.versi === 1 && s.periode === month && Array.isArray(s.guru);
}

/** Snapshot periode `month`, atau null bila belum ada / rusak / SESSION_SECRET kosong. */
export async function bacaSnapshot(month: string): Promise<SnapshotPertemuan | null> {
  if (!RE_BULAN.test(month) || !secret()) return null;
  const f = berkas(month);
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(f)).mtimeMs;
  } catch {
    cacheMemori.delete(month);
    return null;
  }
  const c = cacheMemori.get(month);
  if (c && c.mtimeMs === mtimeMs) return c.data;
  try {
    const data: unknown = JSON.parse(await readFile(f, 'utf8'));
    if (!bentukSah(data, month)) {
      console.warn(`[rekap-pertemuan] snapshot ${month} berbentuk tak dikenal, diabaikan`);
      return null;
    }
    cacheMemori.set(month, { mtimeMs, data });
    return data;
  } catch (e) {
    console.warn(`[rekap-pertemuan] snapshot ${month} tak terbaca: ${sanitasi(e)}`);
    return null;
  }
}

/** Tulis atomik: .tmp lalu rename. */
async function tulisSnapshot(month: string, data: SnapshotPertemuan): Promise<void> {
  const f = berkas(month);
  await mkdir(dirCache(), { recursive: true });
  const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(data), 'utf8');
    await rename(tmp, f);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
  try {
    cacheMemori.set(month, { mtimeMs: (await stat(f)).mtimeMs, data });
  } catch {
    cacheMemori.delete(month);
  }
}

// ── Sinkron ──────────────────────────────────────────────────────────────

const sedangJalan = new Map<string, Promise<HasilSinkron>>();

function hasilLewati(month: string, k: KeputusanSinkron): HasilSinkron {
  const dilewati: HasilSinkron['dilewati'] =
    k === 'beku' ? 'beku' : k === 'backoff' ? 'backoff' : 'segar';
  return { periode: month, ok: true, dilewati, durasiMs: 0 };
}

async function jalankanSinkron(month: string, sec: string): Promise<HasilSinkron> {
  const mulai = Date.now();
  const nowIso = new Date(mulai).toISOString();
  const { start, end } = periodePengajarRange(month);
  const sidik = sidikDari(sec);
  const lama = await bacaSnapshot(month);
  try {
    const [laporan, slugMap] = await Promise.all([
      fetchLaporanGuru(start, end),
      fetchProgramSlugMap(),
    ]);
    const guru = normalisasiLaporan(laporan.teachers, slugMap, sec);
    // Hulu sesekali menjawab kosong; jangan timpa data yang sudah ada dengan nol.
    if (guru.length === 0 && (lama?.guru.length ?? 0) > 0) {
      throw new Error('Dashboard Edu mengembalikan 0 guru; data lama dipertahankan');
    }
    const jumlahHalaqah = guru.reduce((n, g) => n + g.halaqah.length, 0);
    const jumlahPertemuan = guru.reduce(
      (n, g) => n + g.halaqah.reduce((m, h) => m + h.pertemuan.length, 0), 0);
    await tulisSnapshot(month, {
      versi: 1,
      periode: month,
      start,
      end,
      sidikKunci: sidik,
      syncedAt: nowIso,
      sumberGeneratedAt: laporan.generatedAt,
      lastAttemptAt: nowIso,
      lastError: null,
      guru,
    });
    const durasiMs = Date.now() - mulai;
    console.info(
      `[rekap-pertemuan] sinkron ${month}: ${guru.length} guru, ${jumlahHalaqah} halaqah, ` +
      `${jumlahPertemuan} pertemuan, ${durasiMs} ms`,
    );
    return {
      periode: month, ok: true, jumlahGuru: guru.length, jumlahHalaqah, jumlahPertemuan, durasiMs,
    };
  } catch (e) {
    const pesan = sanitasi(e);
    const durasiMs = Date.now() - mulai;
    console.warn(`[rekap-pertemuan] sinkron ${month} gagal (${durasiMs} ms): ${pesan}`);
    // Data lama (guru/syncedAt) dipertahankan; hanya catat percobaan gagal.
    const catat: SnapshotPertemuan = lama
      ? { ...lama, lastAttemptAt: nowIso, lastError: pesan }
      : {
        versi: 1, periode: month, start, end, sidikKunci: sidik,
        syncedAt: null, sumberGeneratedAt: null,
        lastAttemptAt: nowIso, lastError: pesan, guru: [],
      };
    try {
      await tulisSnapshot(month, catat);
    } catch (e2) {
      console.warn(`[rekap-pertemuan] gagal mencatat galat ${month}: ${sanitasi(e2)}`);
    }
    return { periode: month, ok: false, durasiMs, error: pesan };
  }
}

/** Single-flight per periode: pemanggil serentak berbagi satu tarikan. */
function mulaiSinkron(month: string, sec: string): Promise<HasilSinkron> {
  const ada = sedangJalan.get(month);
  if (ada) return ada;
  const p = jalankanSinkron(month, sec).finally(() => {
    if (sedangJalan.get(month) === p) sedangJalan.delete(month);
  });
  sedangJalan.set(month, p);
  return p;
}

/**
 * Sinkron satu periode. Tanpa `paksa`, dilewati bila perluSinkron ≠ 'ya'.
 * `paksa` melompati segar/beku/backoff — tapi tetap berbagi tarikan yang sedang jalan.
 * Melempar bila periode tak valid atau SESSION_SECRET kosong.
 */
export async function sinkronPeriode(
  month: string,
  opts?: { paksa?: boolean },
): Promise<HasilSinkron> {
  if (!RE_BULAN.test(month)) throw new Error('periode tidak valid');
  const sec = secret();
  if (!sec) throw new Error('SESSION_SECRET wajib di-set (sidik kunci rekap pertemuan)');
  if (!opts?.paksa && !sedangJalan.has(month)) {
    const k = perluSinkron(await bacaSnapshot(month), month, new Date(), { sidikKunci: sidikDari(sec) });
    if (k !== 'ya') return hasilLewati(month, k);
  }
  return mulaiSinkron(month, sec);
}

/**
 * Dipanggil timer (beberapa kali sehari). Periode berjalan + periode lalu
 * selama BEKU_SETELAH_HARI hari setelah tanggal 15. Berurutan, tak serentak —
 * hormati beban hulu.
 */
export async function sinkronTerjadwal(now: Date = new Date()): Promise<HasilSinkron[]> {
  const sec = secret();
  if (!sec) throw new Error('SESSION_SECRET wajib di-set (sidik kunci rekap pertemuan)');
  const sidik = sidikDari(sec);
  const hasil: HasilSinkron[] = [];
  for (const m of periodeYangDisinkron(hariIniWib(now))) {
    if (sedangJalan.has(m)) {
      hasil.push({ periode: m, ok: true, dilewati: 'sedang-berjalan', durasiMs: 0 });
      continue;
    }
    const k = perluSinkron(await bacaSnapshot(m), m, now, { maxAgeMs: MIN_JARAK_CRON_MS, sidikKunci: sidik });
    // Keputusan sudah diambil dengan ambang cron (30 mnt) — jangan dinilai ulang
    // dengan STALE_MS (3 jam), jadi langsung paksa.
    hasil.push(k === 'ya' ? await sinkronPeriode(m, { paksa: true }) : hasilLewati(m, k));
  }
  return hasil;
}

/**
 * Snapshot untuk ditampilkan. Bila perlu disegarkan:
 * - ada data sukses (sidik cocok) → segarkan di LATAR, kembalikan data lama;
 * - belum ada → tunggu paling lama `tungguMs`, lalu baca apa pun yang ada.
 */
export async function pastikanSnapshot(
  month: string,
  opts?: { tungguMs?: number },
): Promise<SnapshotPertemuan | null> {
  const sec = secret();
  if (!sec || !RE_BULAN.test(month)) return null;
  const sidik = sidikDari(sec);
  const snap = await bacaSnapshot(month);
  if (perluSinkron(snap, month, new Date(), { sidikKunci: sidik }) !== 'ya') return snap;

  const p = mulaiSinkron(month, sec);
  p.catch(() => {});
  if (snap?.syncedAt && snap.sidikKunci === sidik) return snap;

  const tunggu = Math.max(0, opts?.tungguMs ?? TUNGGU_AWAL_MS);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    p.catch(() => undefined),
    new Promise<void>((r) => { timer = setTimeout(r, tunggu); }),
  ]);
  if (timer) clearTimeout(timer);
  return bacaSnapshot(month);
}

// ── Perbarui manual ──────────────────────────────────────────────────────

/** pelaku (di-hash) → cap waktu permintaan dalam 1 jam terakhir. Memori saja. */
const jejakManual = new Map<string, number[]>();

function kunciPelaku(pelaku: string): string {
  return createHash('sha256').update(`rekap-pertemuan:${pelaku}`).digest('hex').slice(0, 24);
}

function bolehManual(pelaku: string, nowMs: number): boolean {
  const k = kunciPelaku(pelaku);
  const baru = (jejakManual.get(k) ?? []).filter((t) => nowMs - t < 3600_000);
  if (jejakManual.size > 5000) {
    for (const [kk, v] of jejakManual) if (v.every((t) => nowMs - t >= 3600_000)) jejakManual.delete(kk);
  }
  if (baru.length >= MAKS_MANUAL_PER_JAM) {
    jejakManual.set(k, baru);
    return false;
  }
  baru.push(nowMs);
  jejakManual.set(k, baru);
  return true;
}

export async function mintaSinkronManual(
  month: string,
  pelaku: string,
): Promise<{ ok: boolean; pesan: string; syncedAt: string | null }> {
  const sah = periodePertemuanOptions(hariIniWib()).some((o) => o.value === month);
  if (!sah) return { ok: false, pesan: 'Periode tidak valid.', syncedAt: null };
  const sec = secret();
  if (!sec) return { ok: false, pesan: 'Pembaruan belum bisa dilakukan (konfigurasi server).', syncedAt: null };

  const nowMs = Date.now();
  const snap = await bacaSnapshot(month);
  const terakhir = snap?.syncedAt ? Date.parse(snap.syncedAt) : NaN;
  if (Number.isFinite(terakhir) && nowMs - terakhir < COOLDOWN_MANUAL_MS && snap?.sidikKunci === sidikDari(sec)) {
    return {
      ok: false,
      pesan: 'Data baru saja diperbarui, coba lagi beberapa menit lagi.',
      syncedAt: snap?.syncedAt ?? null,
    };
  }

  // Percobaan gagal yang masih baru → jangan tambah beban ke Dashboard Edu.
  const coba = snap?.lastAttemptAt ? Date.parse(snap.lastAttemptAt) : NaN;
  if (
    snap?.lastError &&
    Number.isFinite(coba) &&
    (!Number.isFinite(terakhir) || coba > terakhir) &&
    nowMs - coba < BACKOFF_GAGAL_MS
  ) {
    return {
      ok: false,
      pesan: 'Dashboard Edu sedang bermasalah. Data terakhir tetap ditampilkan — coba lagi sebentar lagi.',
      syncedAt: snap?.syncedAt ?? null,
    };
  }

  // Ikut menunggu tarikan yang sudah jalan tanpa memakan jatah.
  const sudahJalan = sedangJalan.has(month);
  if (!sudahJalan && !bolehManual(pelaku, nowMs)) {
    return {
      ok: false,
      pesan: 'Batas pembaruan tercapai (3 kali per jam). Silakan coba lagi nanti.',
      syncedAt: snap?.syncedAt ?? null,
    };
  }

  const p = mulaiSinkron(month, sec);
  p.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hasil = await Promise.race([
    p.catch((e): HasilSinkron => ({ periode: month, ok: false, durasiMs: 0, error: sanitasi(e) })),
    new Promise<null>((r) => { timer = setTimeout(() => r(null), TUNGGU_MANUAL_MS); }),
  ]);
  if (timer) clearTimeout(timer);
  const kini = await bacaSnapshot(month);
  const syncedAt = kini?.syncedAt ?? null;

  if (hasil === null) {
    return {
      ok: true,
      pesan: 'Pembaruan masih berjalan. Muat ulang halaman ini sebentar lagi.',
      syncedAt,
    };
  }
  if (!hasil.ok) {
    return {
      ok: false,
      pesan: 'Gagal mengambil data dari Dashboard Edu. Data terakhir tetap ditampilkan.',
      syncedAt,
    };
  }
  return { ok: true, pesan: 'Data berhasil diperbarui.', syncedAt };
}

// ── Pembacaan per pengajar ───────────────────────────────────────────────

export type HasilHilmihs = {
  status: 'segar' | 'basi' | 'kosong';
  syncedAt: string | null;
  gagalTerakhir: boolean;
  dicocokkan: boolean;
  halaqah: HalaqahPertemuan[];
};

/**
 * Halaqah Dashboard Edu milik satu pengajar pada periode `month`.
 * `kunciMentah`: 'wa:<nomor>' (di-hash di sini) atau override 'nm:<slug>:<nama>'.
 * `namaAkun`: nama akun aplikasi ini — cadangan untuk guru hulu tanpa nomor.
 */
export async function getPertemuanHilmihsUntuk(
  id: { kunciMentah: string[]; namaAkun: string[] },
  month: string,
): Promise<HasilHilmihs> {
  const sec = secret();
  if (!sec) {
    return { status: 'kosong', syncedAt: null, gagalTerakhir: false, dicocokkan: false, halaqah: [] };
  }

  const kunciHash = new Set<string>();
  const namaEksplisit = new Set<string>();
  for (const raw of id.kunciMentah) {
    const k = String(raw ?? '').trim();
    if (k.startsWith('wa:')) {
      const digit = k.slice(3).replace(/[^\d]/g, '');
      if (digit.length >= 6) kunciHash.add(hashKunci(`wa:${normalizeWhatsApp(digit)}`, sec));
    } else if (k.startsWith('nm:')) {
      // 'nm:<slug>:<nama>' — nama = semua setelah titik dua kedua (boleh memuat ':').
      const sisa = k.slice(3);
      const i = sisa.indexOf(':');
      const nama = (i >= 0 ? sisa.slice(i + 1) : sisa).trim();
      const n = nama ? normalisasiNama(nama) : '';
      if (n) namaEksplisit.add(n);
    }
  }
  const namaAkun = new Set<string>();
  for (const n of id.namaAkun) {
    const norm = n ? normalisasiNama(n) : '';
    if (norm) namaAkun.add(norm);
  }

  const snap = await pastikanSnapshot(month);
  const { halaqah, dicocokkan } = pilihHalaqahGuru(snap?.guru ?? [], kunciHash, namaEksplisit, namaAkun);
  return {
    status: statusData(snap, new Date()),
    syncedAt: snap?.syncedAt ?? null,
    gagalTerakhir: !!snap?.lastError && (snap.lastAttemptAt ?? '') > (snap.syncedAt ?? ''),
    dicocokkan,
    halaqah,
  };
}
