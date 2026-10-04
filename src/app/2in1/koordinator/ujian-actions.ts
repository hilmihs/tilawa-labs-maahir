'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import { validasiPeriode } from '@/lib/ujian';
import type { KoordinatorSession } from '@/types/db';

export type JadwalUjianResult = { ok?: boolean; error?: string };

async function sesiKoordinator(): Promise<KoordinatorSession | null> {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  return (accesses.find((a) => a.role === 'koordinator') as KoordinatorSession | undefined) ?? null;
}

function segarkan() {
  revalidatePath('/2in1/koordinator');
  revalidatePath('/2in1/musyrif/ujian');
  revalidatePath('/2in1/peserta/ujian');
}

/** Tambah periode baru (tanpa `id`) atau ubah nama/tanggal periode yang ada. */
export async function simpanJadwalUjian(_prev: JadwalUjianResult | undefined, fd: FormData): Promise<JadwalUjianResult> {
  const koor = await sesiKoordinator();
  if (!koor) return { error: 'Akses ditolak.' };

  const id = String(fd.get('id') ?? '').trim();
  const input = {
    nama: String(fd.get('nama') ?? '').trim().slice(0, 120),
    mulai: String(fd.get('mulai') ?? ''),
    selesai: String(fd.get('selesai') ?? ''),
  };
  const salah = validasiPeriode(input);
  if (salah) return { error: salah };

  // Rentang ujian tidak boleh bertumpuk — peserta hanya boleh punya satu ujian aktif.
  const { data: lain } = await supabaseAdmin
    .from('ujian_periode')
    .select('id, nama, mulai, selesai')
    .lte('mulai', input.selesai)
    .gte('selesai', input.mulai);
  const tumpuk = (lain ?? []).find((p) => p.id !== id);
  if (tumpuk) return { error: `Bertumpuk dengan ${tumpuk.nama}.` };

  const now = new Date().toISOString();
  if (id) {
    const { error } = await supabaseAdmin
      .from('ujian_periode')
      .update({ ...input, updated_at: now })
      .eq('id', id);
    if (error) return { error: `Gagal menyimpan: ${error.message}` };
  } else {
    const { error } = await supabaseAdmin.from('ujian_periode').insert(input);
    if (error) return { error: `Gagal menyimpan: ${error.message}` };
  }

  await logAudit({
    actor: koor,
    action: id ? 'ujian_periode.ubah' : 'ujian_periode.tambah',
    targetTable: 'ujian_periode',
    targetId: id || null,
    detail: input,
  });
  segarkan();
  return { ok: true };
}

/** Hapus periode — hanya bila belum ada satu pun data ujian di dalamnya. */
export async function hapusJadwalUjian(_prev: JadwalUjianResult | undefined, fd: FormData): Promise<JadwalUjianResult> {
  const koor = await sesiKoordinator();
  if (!koor) return { error: 'Akses ditolak.' };
  const id = String(fd.get('id') ?? '');
  if (!id) return { error: 'Periode tidak dikenal.' };

  const { data: terpakai } = await supabaseAdmin.from('ujian').select('id').eq('periode_id', id).limit(1);
  if ((terpakai ?? []).length > 0) {
    return { error: 'Periode sudah berisi data ujian peserta, tidak bisa dihapus. Ubah tanggalnya saja.' };
  }
  const { error } = await supabaseAdmin.from('ujian_periode').delete().eq('id', id);
  if (error) return { error: `Gagal menghapus: ${error.message}` };

  await logAudit({ actor: koor, action: 'ujian_periode.hapus', targetTable: 'ujian_periode', targetId: id });
  segarkan();
  return { ok: true };
}
