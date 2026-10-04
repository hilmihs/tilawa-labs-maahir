'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
import { validateKlaimMenit } from '@/lib/hits-tabayyun';

export type Res = { ok?: boolean; error?: string };

// Rate limit sederhana per token, in-memory (cukup: satu instance systemd,
// tujuannya menahan spam form, bukan pertahanan DDoS).
const HITS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 10;

function rateLimited(token: string, nowMs: number): boolean {
  const prev = (HITS.get(token) ?? []).filter((t) => nowMs - t < WINDOW_MS);
  prev.push(nowMs);
  HITS.set(token, prev);
  return prev.length > MAX_PER_WINDOW;
}

export async function submitKlarifikasiPublik(token: string, fd: FormData): Promise<Res> {
  if (!token) return { error: 'Tautan tidak valid.' };
  if (rateLimited(token, Date.now())) {
    return { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' };
  }

  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select('id, status, halaqah_id')
    .eq('akses_token', token)
    .maybeSingle();
  if (!tab) return { error: 'Tautan tidak valid.' };
  if (tab.status === 'decided') return { error: 'Tabayyun ini sudah diputuskan koordinator.' };

  const alasan = String(fd.get('alasan_pengajar') ?? '').trim();
  if (!alasan) return { error: 'Alasan wajib diisi.' };

  const { saldo } = await computeHutangForHalaqah(tab.halaqah_id as string);
  const klaim = validateKlaimMenit(String(fd.get('bayar_menit_klaim') ?? ''), saldo);
  if ('error' in klaim) return { error: klaim.error };

  const catatan = String(fd.get('bayar_catatan') ?? '').trim();

  const { error } = await supabaseAdmin
    .from('hits_tabayyun')
    .update({
      alasan_pengajar: alasan,
      alasan_submitted_at: new Date().toISOString(),
      bayar_menit_klaim: saldo > 0 ? klaim.menit : null,
      bayar_catatan: saldo > 0 && catatan ? catatan : null,
      status: 'awaiting_reason',
    })
    .eq('id', tab.id);
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  revalidatePath(`/tabayyun/${token}`);
  return { ok: true };
}
