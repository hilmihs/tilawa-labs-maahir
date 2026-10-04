import { supabaseAdmin, AUDIO_BUCKET } from './supabase-admin';
import type { JenisRekaman } from '@/types/db';

// Catatan ekstensi: semua jalur rekaman berakhiran `.webm` apa pun isinya
// (Safari/iOS merekam MP4, sebagian peramban Ogg). Ekstensi itu sengaja TIDAK
// diubah — nilai `audio_url` lama di DB menunjuk jalur ini. Tipe sebenarnya
// ditebak dari magic bytes saat disajikan (`sniffAudioMime` di pg-storage.ts,
// dipakai /api/audio), jadi jangan mengandalkan ekstensi untuk menentukan format.
export function audioObjectPath(args: {
  pesertaId: string;
  weekStart: string;
  jenis: JenisRekaman;
}): string {
  return `${args.pesertaId}/${args.weekStart}/${args.jenis}.webm`;
}

export async function uploadAudio(args: {
  pesertaId: string;
  weekStart: string;
  jenis: JenisRekaman;
  blob: Blob | Buffer;
  contentType?: string;
}): Promise<string> {
  const path = audioObjectPath(args);
  const { error } = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .upload(path, args.blob as Blob, {
      upsert: true,
      contentType: args.contentType ?? 'audio/webm',
    });
  if (error) throw error;
  return path;
}

export async function signedAudioUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw error ?? new Error('Gagal membuat signed URL audio');
  return data.signedUrl;
}

export function audioObjectPathMusyrif(args: {
  musyrifId: string;
  weekStart: string;
  jenis: JenisRekaman;
}): string {
  return `musyrif/${args.musyrifId}/${args.weekStart}/${args.jenis}.webm`;
}

export async function uploadAudioMusyrif(args: {
  musyrifId: string;
  weekStart: string;
  jenis: JenisRekaman;
  blob: Blob | Buffer;
  contentType?: string;
}): Promise<string> {
  const path = audioObjectPathMusyrif(args);
  const { error } = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .upload(path, args.blob as Blob, {
      upsert: true,
      contentType: args.contentType ?? 'audio/webm',
    });
  if (error) throw error;
  return path;
}

// Rekaman ujian dipisah dari setoran cycle: `ujian/<periode>/<peserta>/<jenis>.webm`.
export function audioObjectPathUjian(args: {
  periodeId: string;
  pesertaId: string;
  jenis: JenisRekaman;
}): string {
  return `ujian/${args.periodeId}/${args.pesertaId}/${args.jenis}.webm`;
}

export async function uploadAudioUjian(args: {
  periodeId: string;
  pesertaId: string;
  jenis: JenisRekaman;
  blob: Blob | Buffer;
  contentType?: string;
}): Promise<string> {
  const path = audioObjectPathUjian(args);
  const { error } = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .upload(path, args.blob as Blob, {
      upsert: true,
      contentType: args.contentType ?? 'audio/webm',
    });
  if (error) throw error;
  return path;
}

export async function ensureAudioBucket(): Promise<void> {
  const { data, error } = await supabaseAdmin.storage.getBucket(AUDIO_BUCKET);
  if (data) return;
  if (error && !/not.found|does not exist/i.test(error.message)) throw error;
  const { error: createErr } = await supabaseAdmin.storage.createBucket(
    AUDIO_BUCKET,
    { public: false }
  );
  if (createErr) throw createErr;
}
