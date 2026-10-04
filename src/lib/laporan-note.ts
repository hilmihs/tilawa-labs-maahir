// Catatan bebas Laporan Bulanan Maahir — diisi koordinator, tampil di halaman
// laporan dan ikut ter-export ke Excel.

import { supabaseAdmin } from '@/lib/supabase-admin';

export type LaporanNote = {
  id: string;
  month: string; // 'YYYY-MM'
  teks: string;
  urutan: number;
};

export async function getLaporanNotes(month: string): Promise<LaporanNote[]> {
  const { data } = await supabaseAdmin
    .from('laporan_maahir_note')
    .select('id, month, teks, urutan')
    .eq('month', month)
    .order('urutan')
    .order('created_at');
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    month: r.month as string,
    teks: r.teks as string,
    urutan: (r.urutan as number) ?? 0,
  }));
}

export async function addLaporanNote(month: string, teks: string): Promise<{ error?: string }> {
  const t = teks.trim();
  if (!t) return { error: 'Catatan kosong.' };
  const existing = await getLaporanNotes(month);
  const urutan = existing.length ? Math.max(...existing.map((n) => n.urutan)) + 1 : 0;
  const { error } = await supabaseAdmin
    .from('laporan_maahir_note')
    .insert({ month, teks: t, urutan });
  return error ? { error: error.message } : {};
}

export async function updateLaporanNote(id: string, teks: string): Promise<{ error?: string }> {
  const t = teks.trim();
  if (!t) return { error: 'Catatan kosong.' };
  const { error } = await supabaseAdmin
    .from('laporan_maahir_note')
    .update({ teks: t, updated_at: new Date().toISOString() })
    .eq('id', id);
  return error ? { error: error.message } : {};
}

export async function deleteLaporanNote(id: string): Promise<{ error?: string }> {
  const { error } = await supabaseAdmin.from('laporan_maahir_note').delete().eq('id', id);
  return error ? { error: error.message } : {};
}
