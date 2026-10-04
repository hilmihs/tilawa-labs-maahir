import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import type { Gender } from '@/types/db';

/**
 * Pilihan "Program" & "Halaqah" di formulir Shakwa — dari data nyata, bukan
 * daftar tetap. Sumbernya:
 *  - program aktif `eval_batch` + halaqahnya `eval_halaqah` (mirror hilmihs;
 *    mencakup HITS Reguler, Safar, Nurul Iman, HKM, RBI, DPQ, Tahsin LAZ, …),
 *  - Kelas Maahir (`program_kelas`; bagi pengajar: `kelas_hits` yang ia ampu),
 *  - "Lainnya" untuk aduan yang tak terkait program mana pun.
 *
 * Id halaqah diberi awalan sumbernya (`eh:` eval_halaqah, `pk:` program_kelas,
 * `kh:` kelas_hits) supaya validasi server tahu tabel mana yang dicek.
 */

export const PROGRAM_MAAHIR = 'maahir';
export const PROGRAM_LAINNYA = 'lainnya';
/** Nilai halaqah untuk aduan yang menyangkut program secara umum. */
export const HALAQAH_UMUM = 'umum';

export type HalaqahOpsi = { id: string; nama: string; gender: Gender | null };
export type ProgramOpsi = { id: string; nama: string; halaqah: HalaqahOpsi[] };

const urutNama = (a: { nama: string }, b: { nama: string }) =>
  a.nama.localeCompare(b.nama, 'id', { numeric: true });

async function programEval(filterPengajar?: string): Promise<ProgramOpsi[]> {
  const [{ data: batches }, halaqahRes] = await Promise.all([
    supabaseAdmin.from('eval_batch').select('id, nama').eq('aktif', true),
    filterPengajar
      ? supabaseAdmin.from('eval_halaqah').select('id, nama, gender, batch_id').eq('pengajar_id', filterPengajar)
      : supabaseAdmin.from('eval_halaqah').select('id, nama, gender, batch_id'),
  ]);
  const perBatch = new Map<string, HalaqahOpsi[]>();
  for (const h of (halaqahRes.data ?? []) as Array<{ id: string; nama: string; gender: Gender | null; batch_id: string | null }>) {
    if (!h.batch_id) continue;
    const list = perBatch.get(h.batch_id) ?? [];
    list.push({ id: `eh:${h.id}`, nama: h.nama, gender: h.gender ?? null });
    perBatch.set(h.batch_id, list);
  }
  return ((batches ?? []) as Array<{ id: string; nama: string }>)
    .map((b) => ({ id: b.id, nama: b.nama, halaqah: (perBatch.get(b.id) ?? []).sort(urutNama) }))
    // Untuk pengajar: hanya program yang benar-benar punya halaqah miliknya.
    .filter((p) => !filterPengajar || p.halaqah.length > 0)
    .sort(urutNama);
}

async function programMaahirUmum(): Promise<ProgramOpsi> {
  const { data } = await supabaseAdmin.from('program_kelas').select('id, name, gender');
  const halaqah = ((data ?? []) as Array<{ id: string; name: string; gender: Gender | null }>)
    .map((k) => ({ id: `pk:${k.id}`, nama: k.name, gender: k.gender ?? null }))
    .sort(urutNama);
  return { id: PROGRAM_MAAHIR, nama: 'Kelas Maahir', halaqah };
}

/** Semua program aktif (untuk pengirim umum), plus Kelas Maahir. */
export async function daftarProgramShakwa(): Promise<ProgramOpsi[]> {
  const [evalProg, maahir] = await Promise.all([programEval(), programMaahirUmum()]);
  return [...evalProg, maahir];
}

/** Program & halaqah yang diajar pengajar ini — pilihan utama bila ia login. */
export async function programPengajarShakwa(pengajarId: string): Promise<ProgramOpsi[]> {
  const evalId = await evalPengajarIdFor(pengajarId);
  const [evalProg, { data: kelas }] = await Promise.all([
    evalId ? programEval(evalId) : Promise.resolve([] as ProgramOpsi[]),
    supabaseAdmin.from('kelas_hits').select('id, name, gender').eq('pengajar_id', pengajarId),
  ]);
  const kelasMaahir = ((kelas ?? []) as Array<{ id: string; name: string; gender: Gender | null }>)
    .map((k) => ({ id: `kh:${k.id}`, nama: k.name, gender: k.gender ?? null }))
    .sort(urutNama);
  return kelasMaahir.length
    ? [...evalProg, { id: PROGRAM_MAAHIR, nama: 'Kelas Maahir', halaqah: kelasMaahir }]
    : evalProg;
}

/**
 * Validasi pilihan di server & bentuk label yang disimpan di `shakwa.halaqoh`:
 * "Program · Halaqah", atau "Program" saja bila aduannya umum.
 */
export async function labelProgramHalaqah(
  programId: string,
  halaqahId: string
): Promise<{ label: string } | { error: string }> {
  if (!programId) return { error: 'Program wajib dipilih.' };
  if (programId === PROGRAM_LAINNYA) return { label: 'Lainnya' };

  let programNama: string;
  if (programId === PROGRAM_MAAHIR) {
    programNama = 'Kelas Maahir';
  } else {
    const { data } = await supabaseAdmin
      .from('eval_batch')
      .select('nama')
      .eq('id', programId)
      .eq('aktif', true)
      .maybeSingle();
    if (!data) return { error: 'Program tidak dikenal. Muat ulang halaman lalu pilih lagi.' };
    programNama = data.nama as string;
  }

  if (!halaqahId) return { error: 'Halaqah wajib dipilih — atau pilih "tidak terkait halaqah tertentu".' };
  if (halaqahId === HALAQAH_UMUM) return { label: programNama };

  const [sumber, ...rest] = halaqahId.split(':');
  const id = rest.join(':');
  let halaqahNama: string | null = null;
  if (sumber === 'eh' && programId !== PROGRAM_MAAHIR) {
    const { data } = await supabaseAdmin
      .from('eval_halaqah')
      .select('nama')
      .eq('id', id)
      .eq('batch_id', programId)
      .maybeSingle();
    halaqahNama = (data?.nama as string | undefined) ?? null;
  } else if (sumber === 'pk' && programId === PROGRAM_MAAHIR) {
    const { data } = await supabaseAdmin.from('program_kelas').select('name').eq('id', id).maybeSingle();
    halaqahNama = (data?.name as string | undefined) ?? null;
  } else if (sumber === 'kh' && programId === PROGRAM_MAAHIR) {
    const { data } = await supabaseAdmin.from('kelas_hits').select('name').eq('id', id).maybeSingle();
    halaqahNama = (data?.name as string | undefined) ?? null;
  }
  if (!halaqahNama) return { error: 'Halaqah tidak cocok dengan program yang dipilih. Pilih lagi.' };
  return { label: `${programNama} · ${halaqahNama}` };
}
