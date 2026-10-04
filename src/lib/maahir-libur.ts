// Libur kelas Maahir (diatur Koordinator 2in1). Tanggal libur dikecualikan
// dari presensi yang diharapkan. Baris dengan program_kelas_id NULL = berlaku
// untuk semua kelas Maahir.

import { supabaseAdmin } from '@/lib/supabase-admin';

export type LiburRow = {
  id: string;
  program_kelas_id: string | null;
  tanggal_mulai: string; // YYYY-MM-DD
  tanggal_selesai: string;
  keterangan: string | null;
  created_at: string;
};

/** Semua tanggal (YYYY-MM-DD) antara [start, end] inklusif. */
function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const [ay, am, ad] = start.split('-').map(Number);
  const [ty, tm, td] = end.split('-').map(Number);
  let cur = Date.UTC(ay, am - 1, ad);
  const last = Date.UTC(ty, tm - 1, td);
  const DAY = 86400000;
  while (cur <= last) {
    const dt = new Date(cur);
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
        dt.getUTCDate()
      ).padStart(2, '0')}`
    );
    cur += DAY;
  }
  return out;
}

/**
 * Set tanggal libur (YYYY-MM-DD) untuk satu kelas pada rentang [start, end].
 * Menggabung baris kelas spesifik + baris global (program_kelas_id NULL).
 */
export async function getLiburDates(
  kelasId: string,
  start: string,
  end: string
): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('program_kelas_libur')
    .select('program_kelas_id, tanggal_mulai, tanggal_selesai')
    .or(`program_kelas_id.eq.${kelasId},program_kelas_id.is.null`)
    .lte('tanggal_mulai', end)
    .gte('tanggal_selesai', start);

  const set = new Set<string>();
  for (const r of data ?? []) {
    const from = r.tanggal_mulai > start ? r.tanggal_mulai : start;
    const to = r.tanggal_selesai < end ? r.tanggal_selesai : end;
    for (const d of eachDate(from, to)) set.add(d);
  }
  return set;
}

/** Set tanggal libur untuk banyak kelas sekaligus → Map<kelasId, Set<tanggal>>. */
export async function getLiburDatesForKelas(
  kelasIds: string[],
  start: string,
  end: string
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  for (const id of kelasIds) result.set(id, new Set());
  if (kelasIds.length === 0) return result;

  const { data } = await supabaseAdmin
    .from('program_kelas_libur')
    .select('program_kelas_id, tanggal_mulai, tanggal_selesai')
    .or(`program_kelas_id.in.(${kelasIds.join(',')}),program_kelas_id.is.null`)
    .lte('tanggal_mulai', end)
    .gte('tanggal_selesai', start);

  for (const r of data ?? []) {
    const from = r.tanggal_mulai > start ? r.tanggal_mulai : start;
    const to = r.tanggal_selesai < end ? r.tanggal_selesai : end;
    const dates = eachDate(from, to);
    // Baris global (NULL) berlaku ke semua kelas yang diminta.
    const targets = r.program_kelas_id ? [r.program_kelas_id] : kelasIds;
    for (const kid of targets) {
      const s = result.get(kid);
      if (!s) continue;
      for (const d of dates) s.add(d);
    }
  }
  return result;
}
