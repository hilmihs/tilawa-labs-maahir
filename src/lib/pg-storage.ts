/**
 * pg-storage.ts — pengganti Supabase Storage berbasis filesystem lokal.
 *
 * Menyediakan subset API `supabase.storage` yang dipakai aplikasi:
 *   client.from(bucket).upload/download/createSignedUrl/remove/list
 *   client.getBucket / client.createBucket
 *
 * File disimpan di  ${STORAGE_DIR}/${bucket}/${path}.
 * Signed URL = /api/audio/<bucket>/<path>?exp=<unix>&sig=<hmac>, ditandatangani
 * HMAC-SHA256 dgn SESSION_SECRET; diverifikasi route src/app/api/audio.
 *
 * ENV: STORAGE_DIR (default <cwd>/storage), SESSION_SECRET (wajib utk signed URL).
 */
import { createHmac } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function storageDir(): string {
  return process.env.STORAGE_DIR ?? join(process.cwd(), 'storage');
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET wajib di-set (untuk signed audio URL)');
  return s;
}

export function signAudio(fullPath: string, exp: number): string {
  return createHmac('sha256', secret())
    .update(`${fullPath}:${exp}`)
    .digest('base64url');
}

export function verifyAudio(fullPath: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = signAudio(fullPath, exp);
  // Bandingkan panjang-tetap sederhana.
  return sig.length === expected.length && sig === expected;
}

/**
 * Tebak Content-Type audio dari magic bytes kepala berkas.
 *
 * Nama berkas rekaman selalu `<jenis>.webm` (lihat storage.ts), padahal isinya
 * bergantung peramban perekam: Safari/iOS menghasilkan MP4, sebagian Firefox
 * Ogg, unggahan manual bisa MP3/WAV. Menyajikan MP4 sebagai `audio/webm`
 * membuat <audio> di iOS menolak memutarnya. Jadi tipe ditentukan dari isi,
 * bukan dari ekstensi. `null` = tidak dikenali → pemanggil jatuh ke ekstensi.
 *
 * Cukup 12 byte pertama.
 */
export function sniffAudioMime(head: Uint8Array): string | null {
  const b = head;
  const n = b.length;
  const ascii = (off: number, s: string) =>
    n >= off + s.length && [...s].every((ch, i) => b[off + i] === ch.charCodeAt(0));

  // WebM / Matroska (EBML header).
  if (n >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  // ISO-BMFF (MP4/M4A/3GP): kotak 'ftyp' di offset 4.
  if (ascii(4, 'ftyp')) return 'audio/mp4';
  if (ascii(0, 'OggS')) return 'audio/ogg';
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'audio/wav';
  if (ascii(0, 'fLaC')) return 'audio/flac';
  if (ascii(0, 'ID3')) return 'audio/mpeg';
  if (n >= 2 && b[0] === 0xff) {
    // AAC ADTS: sync 12 bit + layer '00' (FFF1 / FFF9).
    if ((b[1] & 0xf6) === 0xf0) return 'audio/aac';
    // MP3 frame sync: 11 bit set, layer ≠ '00'.
    if ((b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0) return 'audio/mpeg';
  }
  return null;
}

type StoreErr = { message: string } | null;
type Bucket = ReturnType<typeof bucketApi>;

async function toBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  // Blob (punya arrayBuffer)
  if (body && typeof (body as any).arrayBuffer === 'function') {
    return Buffer.from(await (body as Blob).arrayBuffer());
  }
  if (typeof body === 'string') return Buffer.from(body);
  throw new Error('pg-storage: tipe body upload tak didukung');
}

function bucketApi(bucket: string) {
  const base = join(storageDir(), bucket);
  return {
    async upload(
      path: string,
      body: unknown,
      _opts?: { upsert?: boolean; contentType?: string }
    ): Promise<{ data: { path: string } | null; error: StoreErr }> {
      try {
        const dest = join(base, path);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, await toBuffer(body));
        return { data: { path }, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message ?? String(e) } };
      }
    },
    async download(path: string): Promise<{ data: Blob | null; error: StoreErr }> {
      try {
        const buf = await readFile(join(base, path));
        return { data: new Blob([buf]), error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message ?? String(e) } };
      }
    },
    async createSignedUrl(
      path: string,
      expiresInSeconds: number
    ): Promise<{ data: { signedUrl: string } | null; error: StoreErr }> {
      try {
        const full = `${bucket}/${path}`;
        const exp = Math.floor(Date.now() / 1000) + (expiresInSeconds || 3600);
        const sig = signAudio(full, exp);
        const encoded = full.split('/').map(encodeURIComponent).join('/');
        return { data: { signedUrl: `/api/audio/${encoded}?exp=${exp}&sig=${sig}` }, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message ?? String(e) } };
      }
    },
    async remove(paths: string[]): Promise<{ data: { name: string }[] | null; error: StoreErr }> {
      try {
        const removed: { name: string }[] = [];
        for (const p of paths) {
          try {
            await unlink(join(base, p));
            removed.push({ name: p });
          } catch {
            /* file tak ada → abaikan (mirror perilaku Supabase yg tak fatal) */
          }
        }
        return { data: removed, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message ?? String(e) } };
      }
    },
    async list(
      prefix = '',
      _opts?: { limit?: number; offset?: number }
    ): Promise<{ data: { name: string; id: string | null; metadata: { size: number } | null }[] | null; error: StoreErr }> {
      try {
        const dir = join(base, prefix);
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
        const out = [];
        for (const e of entries) {
          if (e.isDirectory()) out.push({ name: e.name, id: null, metadata: null });
          else {
            const s = await stat(join(dir, e.name));
            out.push({ name: e.name, id: e.name, metadata: { size: s.size } });
          }
        }
        return { data: out, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message ?? String(e) } };
      }
    },
  };
}

export function createFsStorage() {
  const buckets = new Map<string, Bucket>();
  return {
    from(bucket: string): Bucket {
      if (!buckets.has(bucket)) buckets.set(bucket, bucketApi(bucket));
      return buckets.get(bucket)!;
    },
    async getBucket(bucket: string): Promise<{ data: { name: string } | null; error: StoreErr }> {
      try {
        await stat(join(storageDir(), bucket));
        return { data: { name: bucket }, error: null };
      } catch {
        return { data: null, error: { message: 'Bucket not found' } };
      }
    },
    async createBucket(
      bucket: string,
      _opts?: { public?: boolean }
    ): Promise<{ data: { name: string } | null; error: StoreErr }> {
      try {
        await mkdir(join(storageDir(), bucket), { recursive: true });
        return { data: { name: bucket }, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message ?? String(e) } };
      }
    },
  };
}
