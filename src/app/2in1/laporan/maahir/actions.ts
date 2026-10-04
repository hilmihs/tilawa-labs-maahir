'use server';

import { revalidatePath } from 'next/cache';
import { requireOneOfRoles } from '@/lib/session';
import { addLaporanNote, deleteLaporanNote, updateLaporanNote } from '@/lib/laporan-note';

export type NoteResult = { ok?: boolean; error?: string };

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function createNote(_prev: NoteResult | undefined, fd: FormData): Promise<NoteResult> {
  await requireOneOfRoles(['koordinator', 'syaikh']);
  const month = String(fd.get('month') ?? '');
  const teks = String(fd.get('teks') ?? '');
  if (!MONTH_RE.test(month)) return { error: 'Bulan tidak valid.' };
  const res = await addLaporanNote(month, teks);
  if (res.error) return { error: res.error };
  revalidatePath('/2in1/laporan/maahir');
  return { ok: true };
}

export async function editNote(_prev: NoteResult | undefined, fd: FormData): Promise<NoteResult> {
  await requireOneOfRoles(['koordinator', 'syaikh']);
  const id = String(fd.get('id') ?? '');
  const teks = String(fd.get('teks') ?? '');
  if (!id) return { error: 'Catatan tidak ditemukan.' };
  const res = await updateLaporanNote(id, teks);
  if (res.error) return { error: res.error };
  revalidatePath('/2in1/laporan/maahir');
  return { ok: true };
}

export async function removeNote(_prev: NoteResult | undefined, fd: FormData): Promise<NoteResult> {
  await requireOneOfRoles(['koordinator', 'syaikh']);
  const id = String(fd.get('id') ?? '');
  if (!id) return { error: 'Catatan tidak ditemukan.' };
  const res = await deleteLaporanNote(id);
  if (res.error) return { error: res.error };
  revalidatePath('/2in1/laporan/maahir');
  return { ok: true };
}
