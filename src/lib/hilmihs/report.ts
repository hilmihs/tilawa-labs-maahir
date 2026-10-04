// Sumber "Dashboard Edu" untuk Rekap Pertemuan pengajar: laporan per-guru
// `hits-regular/report?type=teacher&rows=1` — satu tarikan mencakup SEMUA
// program (HITS, DPQ, Mabni, HKM, RBI, Tahsin, …), bukan hanya hits-regular.
//
// Sengaja TANPA 'server-only' / supabase / next supaya bisa diimpor skrip tsx
// (scripts/test-rekap-pertemuan.ts). Tetap hanya dipanggil dari server karena
// membaca AGENT_TOKEN.
//
// PII: respons hulu memuat `guruPhone` (nomor WA) dan `reasonText` (alasan izin
// bebas dari WA). Keduanya DIBUANG di normalisasiLaporan — yang tersisa hanya
// sidik HMAC nomor (kunci). Jangan pernah log baris mentah.
import { apiEnv } from '@/lib/api-public/env';
import { normalizeWhatsApp } from '@/lib/whatsapp';
import {
  hashKunci,
  normalisasiNama,
  type AlasanBerhalangan,
  type GuruSnapshot,
  type HalaqahSnapshot,
  type PertemuanItem,
} from '@/lib/rekap-pertemuan';

const BASE = 'https://dashboard.example.org/api/agent';
const TIMEOUT_MS = 20_000;
const LIMIT_AWAL = 50;   // ±4,5 KB per guru untuk jendela penuh; 413 di atas 512 KB
const LIMIT_MIN = 10;
const MAKS_HALAMAN = 60;

// ── Bentuk sumber (probe live 2026-09-29) ────────────────────────────────

export type SrcPertemuanLaporan = {
  jadwalId: number;
  programId?: string | null;
  order: number | null;
  date: string;
  done: boolean;
  confStatus: string | null;
  reasonCode: string | null;
  reasonText?: string | null;
};

export type SrcHalaqahLaporan = {
  program: string;
  halaqah: string;
  real: number;
  ideal: number;
  asBadal: boolean;
  mainTeacher: string | null;
  confirmedAbsent?: number;
  taughtNotInput?: number;
  confirmedTaught?: number;
  resolved?: number;
  unsolved?: number;
  gender?: number | null;
  guruPhone: string | null;
  meetings: SrcPertemuanLaporan[];
};

export type SrcGuruLaporan = {
  pengajar: string;
  guruIds?: number[];
  totalReal?: number;
  totalIdeal?: number;
  halaqah: SrcHalaqahLaporan[];
};

export type SrcLaporanResponse = {
  teachers: SrcGuruLaporan[];
  offset?: number;
  meta?: {
    generatedAt?: string;
    caps?: { teachers?: number };
    truncated?: { teachers?: number };
  };
};

// ── HTTP ─────────────────────────────────────────────────────────────────

function token(): string {
  const t = apiEnv('AGENT_TOKEN');
  if (!t || t.length < 24) throw new Error('AGENT_TOKEN belum di-set / terlalu pendek');
  return t;
}

/** Galat yang pantas dicoba ulang sekali (hulu kosong/non-JSON/5xx/timeout). */
class GalatSementara extends Error {}
/** 413 — respons terlalu besar, kecilkan limit. */
class GalatTerlaluBesar extends Error {}

function tunda(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** GET JSON satu kali. Pesan galat tak pernah memuat URL lengkap atau token. */
async function getSekali<T>(path: string, label: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const nama = (e as { name?: string })?.name;
    if (nama === 'TimeoutError' || nama === 'AbortError') {
      throw new GalatSementara(`hilmihs ${label}: timeout ${TIMEOUT_MS / 1000} dtk`);
    }
    throw new GalatSementara(`hilmihs ${label}: gagal terhubung`);
  }
  if (res.status === 413) throw new GalatTerlaluBesar(`hilmihs ${label}: 413 respons terlalu besar`);
  const text = await res.text();
  if (res.status >= 500) throw new GalatSementara(`hilmihs ${label}: ${res.status}`);
  if (!text.trim()) throw new GalatSementara(`hilmihs ${label}: respons kosong (${res.status})`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GalatSementara(`hilmihs ${label}: respons non-JSON (${res.status})`);
  }
  if (!res.ok) {
    const err = (data as { error?: unknown })?.error;
    const pesan = typeof err === 'string' ? err.slice(0, 80) : res.statusText;
    throw new Error(`hilmihs ${label}: ${res.status} ${pesan}`);
  }
  return data as T;
}

/** Coba ulang SEKALI (jeda 1 dtk) untuk galat sementara; 413 diteruskan ke pemanggil. */
async function get<T>(path: string, label: string): Promise<T> {
  try {
    return await getSekali<T>(path, label);
  } catch (e) {
    if (!(e instanceof GalatSementara)) throw e;
    await tunda(1000);
    return getSekali<T>(path, label);
  }
}

const RE_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tarik laporan per-guru untuk rentang [start, end] (inklusif, YYYY-MM-DD),
 * seluruh halaman. `start > end` dijawab hulu dengan 200 kosong — jadi
 * divalidasi di sini supaya tak tersimpan sebagai "tidak ada jadwal".
 *
 * Dedup: jadwalId hanya unik DI DALAM satu sistem sumber — Mabni dan tilawah
 * bisa memakai angka yang sama untuk jadwal berbeda milik guru berbeda
 * (terverifikasi live: 44 tabrakan dalam satu periode). Maka dedup dilakukan
 * per guru + halaqah (menangkal halaman bergeser saat paginasi), bukan global.
 */
export async function fetchLaporanGuru(
  start: string,
  end: string,
): Promise<{ teachers: SrcGuruLaporan[]; generatedAt: string | null }> {
  if (!RE_TANGGAL.test(start) || !RE_TANGGAL.test(end)) {
    throw new Error('fetchLaporanGuru: format tanggal harus YYYY-MM-DD');
  }
  if (start > end) throw new Error('fetchLaporanGuru: start melewati end');

  const perGuru = new Map<string, SrcGuruLaporan>();
  const urutanGuru: string[] = [];
  let generatedAt: string | null = null;
  let limit = LIMIT_AWAL;
  let offset = 0;

  for (let halaman = 0; halaman < MAKS_HALAMAN; halaman++) {
    const qs = new URLSearchParams({
      type: 'teacher', start, end, rows: '1', limit: String(limit), offset: String(offset),
    });
    let r: SrcLaporanResponse;
    try {
      r = await get<SrcLaporanResponse>(`hits-regular/report?${qs}`, 'report guru');
    } catch (e) {
      if (e instanceof GalatTerlaluBesar && limit > LIMIT_MIN) {
        limit = Math.max(LIMIT_MIN, Math.floor(limit / 2));
        continue; // offset sama, limit lebih kecil
      }
      throw e;
    }
    if (!Array.isArray(r?.teachers)) throw new Error('hilmihs report guru: bentuk respons tak dikenal');
    generatedAt = r.meta?.generatedAt ?? generatedAt;

    for (const t of r.teachers) gabungGuru(perGuru, urutanGuru, t);

    const total = r.meta?.truncated?.teachers ?? offset + r.teachers.length;
    offset += r.teachers.length;
    if (r.teachers.length === 0 || offset >= total) break;
    if (halaman === MAKS_HALAMAN - 1) {
      throw new Error(`hilmihs report guru: melewati ${MAKS_HALAMAN} halaman`);
    }
  }

  return { teachers: urutanGuru.map((k) => perGuru.get(k)!), generatedAt };
}

function kunciGuru(t: SrcGuruLaporan): string {
  const ids = [...(t.guruIds ?? [])].sort((a, b) => a - b).join(',');
  return `${t.pengajar ?? ''}|${ids}`;
}

function kunciHalaqah(h: SrcHalaqahLaporan): string {
  return `${h.program}|${h.halaqah}|${h.asBadal ? 1 : 0}|${h.mainTeacher ?? ''}`;
}

/** Satukan guru yang muncul lagi (halaman bergeser) + dedup pertemuan per halaqah. */
function gabungGuru(peta: Map<string, SrcGuruLaporan>, urutan: string[], t: SrcGuruLaporan): void {
  if (!t || !Array.isArray(t.halaqah)) return;
  const k = kunciGuru(t);
  let g = peta.get(k);
  if (!g) {
    g = { pengajar: t.pengajar, guruIds: t.guruIds, halaqah: [] };
    peta.set(k, g);
    urutan.push(k);
  }
  for (const h of t.halaqah) {
    const kh = kunciHalaqah(h);
    let tujuan = g.halaqah.find((x) => kunciHalaqah(x) === kh);
    if (!tujuan) {
      tujuan = { ...h, meetings: [] };
      g.halaqah.push(tujuan);
    } else if (!tujuan.guruPhone && h.guruPhone) {
      tujuan.guruPhone = h.guruPhone;
    }
    const ada = new Set(tujuan.meetings.map((m) => m.jadwalId));
    for (const m of h.meetings ?? []) {
      if (ada.has(m.jadwalId)) continue;
      ada.add(m.jadwalId);
      tujuan.meetings.push(m);
    }
  }
}

/** Peta nama program → slug dari /programs. Gagal = peta kosong (tak fatal). */
export async function fetchProgramSlugMap(): Promise<Map<string, string>> {
  const peta = new Map<string, string>();
  try {
    const r = await get<{ programs?: { slug?: string; name?: string }[] }>('programs', 'programs');
    for (const p of r.programs ?? []) {
      if (p?.name && p?.slug && !peta.has(p.name)) peta.set(p.name, p.slug);
    }
  } catch (e) {
    console.warn('[rekap-pertemuan] /programs gagal, programKey pakai nama:', (e as Error).message);
  }
  return peta;
}

// ── Normalisasi (buang PII) ──────────────────────────────────────────────

/**
 * confStatus hulu (konfirmasi-rekap guru) yang teramati: `tidak_mengajar`,
 * `mengajar_belum_input`, `mengajar_kendala_sistem`, `diisi_koordinator`,
 * `data_tidak_sesuai`. Dipetakan eksplisit — pola /tidak/ dulu salah membaca
 * `data_tidak_sesuai` sebagai berhalangan. Nilai tak dikenal = belum terkonfirmasi.
 */
function petaKonfirmasi(s: string | null | undefined): PertemuanItem['konfirmasi'] {
  const v = String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (v === 'tidak_mengajar') return 'tidak_mengajar';
  if (v.startsWith('mengajar') || v === 'diisi_koordinator') return 'mengajar';
  return null;
}

function petaAlasan(kode: string | null | undefined): AlasanBerhalangan {
  const k = String(kode ?? '').trim().toLowerCase();
  return k === 'sakit' || k === 'izin' || k === 'badal' ? k : 'lain';
}

/** Tanggal WIB YYYY-MM-DD; sumber sudah berbentuk tanggal, tapi jaga bila datang timestamp. */
function tanggalWib(s: string): string | null {
  if (typeof s !== 'string') return null;
  if (RE_TANGGAL.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

function kunciDariTelepon(phone: string | null | undefined, secret: string): string | null {
  const digit = String(phone ?? '').replace(/[^\d]/g, '');
  if (digit.length < 6) return null;
  return hashKunci(`wa:${normalizeWhatsApp(digit)}`, secret);
}

/**
 * Laporan hulu → GuruSnapshot siap simpan. Membuang guruPhone, reasonText,
 * programId, guruIds, gender. Hanya sidik HMAC nomor (kunci) yang tersisa.
 */
export function normalisasiLaporan(
  teachers: SrcGuruLaporan[],
  slugMap: Map<string, string>,
  secret: string,
): GuruSnapshot[] {
  if (!secret) throw new Error('normalisasiLaporan: secret kosong');
  const out: GuruSnapshot[] = [];
  for (const t of teachers) {
    const nama = String(t?.pengajar ?? '').trim();
    if (!nama) continue;
    const halaqah: HalaqahSnapshot[] = [];
    const kunci = new Set<string>();
    for (const h of t.halaqah ?? []) {
      const k = kunciDariTelepon(h.guruPhone, secret);
      if (k) kunci.add(k);
      const pertemuan: PertemuanItem[] = [];
      for (const m of h.meetings ?? []) {
        const tanggal = tanggalWib(m.date);
        if (!tanggal || m.jadwalId == null) continue;
        const konfirmasi = petaKonfirmasi(m.confStatus);
        pertemuan.push({
          id: `j:${m.jadwalId}`,
          tanggal,
          urutan: typeof m.order === 'number' && Number.isFinite(m.order) ? m.order : null,
          selesai: m.done === true,
          konfirmasi,
          alasan: konfirmasi === 'tidak_mengajar' ? petaAlasan(m.reasonCode) : null,
        });
      }
      pertemuan.sort((a, b) =>
        a.tanggal.localeCompare(b.tanggal) || (a.urutan ?? 0) - (b.urutan ?? 0));
      const programNama = String(h.program ?? '').trim() || 'Program tanpa nama';
      halaqah.push({
        programNama,
        programSlug: slugMap.get(programNama) ?? null,
        halaqahNama: String(h.halaqah ?? '').trim() || 'Halaqah tanpa nama',
        sebagaiBadal: h.asBadal === true,
        guruUtama: h.mainTeacher ? String(h.mainTeacher).trim() || null : null,
        kunci: k,
        pertemuan,
      });
    }
    out.push({ nama, namaNorm: normalisasiNama(nama), kunci: [...kunci], halaqah });
  }
  return out;
}
