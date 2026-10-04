import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { pilihPeriode, todayJakarta } from '@/lib/ujian';
import type { JenisRekaman, PredikatUjian, StatusSetoran, UjianPeriode } from '@/types/db';

const NIHIL = '00000000-0000-0000-0000-000000000000';

export type UjianRingkas = {
  id: string;
  peserta_id: string;
  status: StatusSetoran;
  submitted_at: string | null;
  checked_at: string | null;
  alasan_belum: string | null;
  alasan_updated_at: string | null;
};

export type RekamanUjianRingkas = {
  ujian_id: string;
  jenis: JenisRekaman;
  audio_url: string | null;
  duration_seconds: number | null;
  predikat: PredikatUjian | null;
  masukan: string | null;
};

export async function muatPeriodeUjian(): Promise<UjianPeriode[]> {
  const { data } = await supabaseAdmin
    .from('ujian_periode')
    .select('id, nama, mulai, selesai, created_at, updated_at')
    .order('mulai', { ascending: true });
  return ((data ?? []) as UjianPeriode[]).map((p) => ({
    ...p,
    mulai: String(p.mulai).slice(0, 10),
    selesai: String(p.selesai).slice(0, 10),
  }));
}

/** Periode terpilih lewat `?ujian=<id>`, jika tidak ada pakai pilihPeriode(). */
export async function muatPeriodeTerpilih(id?: string | null): Promise<{
  semua: UjianPeriode[];
  periode: UjianPeriode | null;
  today: string;
}> {
  const semua = await muatPeriodeUjian();
  const today = todayJakarta();
  const periode = (id && semua.find((p) => p.id === id)) || pilihPeriode(semua, today);
  return { semua, periode, today };
}

/** Status ujian + rekaman per peserta untuk satu periode. */
export async function muatUjianPeserta(
  periodeId: string,
  pesertaIds: string[]
): Promise<Map<string, { ujian: UjianRingkas; rekaman: RekamanUjianRingkas[] }>> {
  const hasil = new Map<string, { ujian: UjianRingkas; rekaman: RekamanUjianRingkas[] }>();
  if (pesertaIds.length === 0) return hasil;

  const { data: ujianRows } = await supabaseAdmin
    .from('ujian')
    .select('id, peserta_id, status, submitted_at, checked_at, alasan_belum, alasan_updated_at')
    .eq('periode_id', periodeId)
    .in('peserta_id', pesertaIds);
  const ujianList = (ujianRows ?? []) as UjianRingkas[];

  const ids = ujianList.map((u) => u.id);
  const { data: rekRows } = await supabaseAdmin
    .from('rekaman_ujian')
    .select('ujian_id, jenis, audio_url, duration_seconds, predikat, masukan')
    .in('ujian_id', ids.length ? ids : [NIHIL]);
  const rekByUjian = new Map<string, RekamanUjianRingkas[]>();
  for (const r of (rekRows ?? []) as RekamanUjianRingkas[]) {
    const arr = rekByUjian.get(r.ujian_id) ?? [];
    arr.push(r);
    rekByUjian.set(r.ujian_id, arr);
  }

  for (const u of ujianList) {
    hasil.set(u.peserta_id, { ujian: u, rekaman: rekByUjian.get(u.id) ?? [] });
  }
  return hasil;
}
