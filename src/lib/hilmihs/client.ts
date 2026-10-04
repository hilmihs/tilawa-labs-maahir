// Klien HTTP API agent dashboard.example.org. Server-only (baca AGENT_TOKEN).
// Read-only GET, envelope + meta.truncated, paginasi offset, 413 = kecilkan limit.
import { apiEnv } from '@/lib/api-public/env';
import type {
  ProgramsResponse, Envelope, SrcPengajar, SrcHalaqah, SrcPeserta,
} from './types';

const BASE = 'https://dashboard.example.org/api/agent';

function token(): string {
  const t = apiEnv('AGENT_TOKEN');
  if (!t || t.length < 24) throw new Error('AGENT_TOKEN belum di-set / terlalu pendek');
  return t;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: 'no-store',
  });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error(`hilmihs ${path}: respons non-JSON (${res.status})`); }
  if (!res.ok) {
    const err = (data as { error?: string })?.error ?? res.statusText;
    throw new Error(`hilmihs ${path}: ${res.status} ${err}`);
  }
  return data as T;
}

export async function getPrograms(): Promise<ProgramsResponse> {
  return get<ProgramsResponse>('programs');
}

export async function getPengajar(slug: string): Promise<SrcPengajar[]> {
  const r = await get<Envelope<SrcPengajar>>(`${slug}/pengajar`);
  return (r.rows as SrcPengajar[]) ?? [];
}

export async function getHalaqah(slug: string): Promise<SrcHalaqah[]> {
  const r = await get<Envelope<SrcHalaqah>>(`${slug}/halaqah`);
  return (r.rows as SrcHalaqah[]) ?? [];
}

/** Paginasi peserta via offset sampai habis (meta.truncated.rows = total). */
export async function getPeserta(slug: string, pageSize = 300): Promise<SrcPeserta[]> {
  const out: SrcPeserta[] = [];
  let offset = 0;
  // ceiling per-route 500; 300 aman < 512KB.
  for (let guard = 0; guard < 100; guard++) {
    const r = await get<Envelope<SrcPeserta>>(`${slug}/peserta?limit=${pageSize}&offset=${offset}`);
    const rows = (r.rows as SrcPeserta[]) ?? [];
    out.push(...rows);
    const total = r.meta?.truncated?.rows ?? out.length;
    offset += rows.length;
    if (rows.length === 0 || out.length >= total) break;
  }
  return out;
}

/** Slug program tilawah_api saja (buang berkah/mabni). */
export async function tilawahSlugs(): Promise<string[]> {
  const { programs } = await getPrograms();
  return programs.filter((p) => p.dataSourceType === 'tilawah_api').map((p) => p.slug);
}
