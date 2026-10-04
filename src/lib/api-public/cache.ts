// cache.ts — cache respons di memori (LRU by insertion), rate limit, burst cap, inflight limiter.
//
// Desain: state in-memory sengaja. `next-maahir` jalan sebagai SATU proses systemd di
// satu VPS (bukan cluster/multi-instance) → tak perlu Redis; counter & cache akurat.
// Respons per-key (cacheKey ikut scopes) → JANGAN pasang shared/CDN cache (nginx
// proxy_cache) di depan /api/v1: keyed URL akan membocorkan data antar-key. `Cache-Control:
// private` sudah mencegah proxy manapun menyimpannya. Kalau kelak scale-out >1 proses,
// pindahkan cache+rate+burst ke store bersama (Redis/Upstash).
import { apiEnv } from './env';

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY = 1 * 1024 * 1024;

interface Entry { value: unknown; at: number; ttlMs: number; bytes: number }
const store = new Map<string, Entry>();
let totalBytes = 0;

function sizeOf(v: unknown): number {
  try { return JSON.stringify(v).length; } catch { return MAX_ENTRY + 1; }
}

export function __resetCache(): void { store.clear(); totalBytes = 0; }

export function getCached(key: string): { value: unknown; umurDetik: number } | null {
  const e = store.get(key);
  if (!e) return null;
  const age = Date.now() - e.at;
  if (age > e.ttlMs) { store.delete(key); totalBytes -= e.bytes; return null; }
  return { value: e.value, umurDetik: Math.floor(age / 1000) };
}

export function setCached(key: string, value: unknown, ttlSec: number): void {
  const override = apiEnv('PUBLIC_API_CACHE_TTL');
  const ttl = override !== undefined ? Number(override) : ttlSec;
  if (ttl <= 0) return;
  const bytes = sizeOf(value);
  if (bytes > MAX_ENTRY) return;
  const prev = store.get(key);
  if (prev) totalBytes -= prev.bytes;
  while (totalBytes + bytes > MAX_BYTES && store.size) {
    const oldest = store.keys().next().value as string;
    totalBytes -= store.get(oldest)!.bytes;
    store.delete(oldest);
  }
  store.set(key, { value, at: Date.now(), ttlMs: ttl * 1000, bytes });
  totalBytes += bytes;
}

// --- rate limit per key, jendela 60s ---
const hits = new Map<string, number[]>();
export function __resetRate(): void { hits.clear(); }
export function checkRateLimit(key: string, perMin: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter(t => now - t < 60_000);
  if (arr.length >= perMin) { hits.set(key, arr); return false; }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

// --- burst cap per key, jendela 1s (tutup spike sub-detik yang lolos rate/menit) ---
const burst = new Map<string, number[]>();
export function __resetBurst(): void { burst.clear(); }
export function checkBurst(key: string, perSec: number): boolean {
  const now = Date.now();
  const arr = (burst.get(key) ?? []).filter(t => now - t < 1_000);
  if (arr.length >= perSec) { burst.set(key, arr); return false; }
  arr.push(now);
  burst.set(key, arr);
  return true;
}

// --- inflight limiter ---
let inflight = 0;
const waiters: (() => void)[] = [];
export async function acquireInflight<T>(fn: () => Promise<T>, max: number, timeoutMs: number): Promise<T> {
  if (inflight >= max) {
    const got = await new Promise<boolean>(resolve => {
      const t = setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); resolve(false); }, timeoutMs);
      const w = () => { clearTimeout(t); resolve(true); };
      waiters.push(w);
    });
    if (!got) { const e = new Error('inflight_timeout'); (e as any).code = 'rate_limited'; throw e; }
  }
  inflight++;
  try { return await fn(); }
  finally { inflight--; const next = waiters.shift(); if (next) next(); }
}
