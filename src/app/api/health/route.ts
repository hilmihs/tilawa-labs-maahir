import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

// Health/diagnostic endpoint. TIDAK meng-import session/supabase agar tetap
// jalan meski modul tsb crash karena env hilang. Hanya laporkan PRESENCE env
// (boolean), bukan nilainya. Aman dibuka publik.
//
// Dibungkus try/catch + runtime nodejs eksplisit supaya TIDAK PERNAH 500 —
// kalau ada error, kembalikan detailnya sebagai JSON untuk diagnosa.
//
// Probe storage (opsional, ter-gate token): `?probe=<ADMIN_API_TOKEN>` → coba
// tulis+hapus file di ${STORAGE_DIR}/${bucket} sebagai proses service. Dipakai
// mendiagnosa kenapa upload audio gagal (permission/ownership/disk).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenOk(given: string): boolean {
  const expected = process.env.ADMIN_API_TOKEN ?? '';
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function storageProbe(): Promise<Record<string, unknown>> {
  const root = process.env.STORAGE_DIR ?? '';
  const bucket = process.env.SUPABASE_AUDIO_BUCKET ?? 'setoran-audio';
  const dir = join(root, bucket);
  const file = join(dir, `.health-probe-${process.pid}`);
  const out: Record<string, unknown> = { dir };
  try {
    out.uid = typeof process.getuid === 'function' ? process.getuid() : null;
    out.gid = typeof process.getgid === 'function' ? process.getgid() : null;
  } catch {}
  try {
    await mkdir(dir, { recursive: true });
    out.mkdir = 'ok';
    await writeFile(file, 'ok');
    out.write = 'ok';
    await unlink(file);
    out.unlink = 'ok';
    out.writable = true;
  } catch (e: any) {
    out.writable = false;
    out.error = e?.message ?? String(e);
    out.code = e?.code ?? null; // EACCES / ENOSPC / ENOENT dsb
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const ss = process.env.SESSION_SECRET ?? '';
    const probeToken = req.nextUrl.searchParams.get('probe') ?? '';
    const storage = probeToken && tokenOk(probeToken) ? await storageProbe() : undefined;
    return NextResponse.json({
      ok: true,
      time: new Date().toISOString(),
      env: {
        SESSION_SECRET_set: ss.length > 0,
        SESSION_SECRET_len_ok: ss.length >= 32,
        DATABASE_URL_set: !!process.env.DATABASE_URL,
        STORAGE_DIR: process.env.STORAGE_DIR ?? null,
        SUPABASE_AUDIO_BUCKET: process.env.SUPABASE_AUDIO_BUCKET ?? null,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
        NODE_ENV: process.env.NODE_ENV ?? null,
      },
      ...(storage ? { storage } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 }
    );
  }
}
