// Lampiran formulir Shakwa (foto modul, tangkapan layar aplikasi, bukti transfer).
// Pola sama dengan src/lib/storage.ts: simpan path objek di DB, URL bertanda
// tangan dibuat saat koordinator membukanya — berkasnya tak pernah publik.

import { supabaseAdmin } from './supabase-admin';
import { MAX_LAMPIRAN_BYTES, LAMPIRAN_MIME } from './shakwa';

export const SHAKWA_BUCKET = process.env.SHAKWA_BUCKET ?? 'shakwa';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export function shakwaObjectPath(shakwaId: string, index: number, mime: string): string {
  return `${shakwaId}/${index}.${EXT_BY_MIME[mime] ?? 'bin'}`;
}

export async function ensureShakwaBucket(): Promise<void> {
  const { data, error } = await supabaseAdmin.storage.getBucket(SHAKWA_BUCKET);
  if (data) return;
  if (error && !/not.found|does not exist/i.test(error.message)) throw error;
  const { error: createErr } = await supabaseAdmin.storage.createBucket(SHAKWA_BUCKET, {
    public: false,
  });
  if (createErr) throw createErr;
}

/** Tolak berkas yang terlalu besar atau bertipe tak didukung. */
export function validasiLampiran(file: File): string | null {
  if (!LAMPIRAN_MIME.includes(file.type)) {
    return `Tipe berkas "${file.type || 'tak dikenal'}" tidak didukung. Gunakan JPG/PNG/WEBP/PDF.`;
  }
  if (file.size > MAX_LAMPIRAN_BYTES) {
    return `Ukuran ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 5 MB.`;
  }
  return null;
}

/** Unggah satu lampiran; kembalikan path objeknya. */
export async function uploadLampiran(args: {
  shakwaId: string;
  index: number;
  file: File;
}): Promise<string> {
  const path = shakwaObjectPath(args.shakwaId, args.index, args.file.type);
  await ensureShakwaBucket();
  const buf = Buffer.from(await args.file.arrayBuffer());
  const { error } = await supabaseAdmin.storage
    .from(SHAKWA_BUCKET)
    .upload(path, buf, { upsert: true, contentType: args.file.type });
  if (error) throw error;
  return path;
}

export async function signedLampiranUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(SHAKWA_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw error ?? new Error('Gagal membuat URL lampiran');
  return data.signedUrl;
}

/** Versi aman untuk dipakai render daftar: gagal → null, bukan melempar. */
export async function signedLampiranUrls(paths: string[]): Promise<Array<{ path: string; url: string | null }>> {
  return Promise.all(
    paths.map(async (p) => {
      try {
        return { path: p, url: await signedLampiranUrl(p) };
      } catch {
        return { path: p, url: null };
      }
    })
  );
}
