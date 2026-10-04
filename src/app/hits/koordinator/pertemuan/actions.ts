'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { logAudit } from '@/lib/audit';

export type OverrideResult = { ok?: boolean; error?: string };

export async function setPertemuanOverride(
  _prev: OverrideResult | undefined,
  fd: FormData
): Promise<OverrideResult> {
  const session = await requireKoordinatorKetuaKelas();

  const halaqahId = String(fd.get('halaqah_id') ?? '');
  const level = String(fd.get('level') ?? '');
  const pertemuanNo = Number(fd.get('pertemuan_no'));
  const tanggal = String(fd.get('tanggal') ?? '');
  const isSkipped = String(fd.get('is_skipped') ?? 'false') === 'true';
  const note = String(fd.get('note') ?? '').trim() || null;

  if (!halaqahId || !Number.isFinite(pertemuanNo) || pertemuanNo < 1) {
    return { error: 'Data pertemuan tidak valid.' };
  }
  if (level !== 'qoidah_nuroniyyah' && level !== 'perbaikan_bacaan') return { error: 'Tahap tidak valid.' };
  if (!isSkipped && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return { error: 'Tanggal override wajib diisi (atau tandai skip).' };
  }

  const { error } = await supabaseAdmin
    .from('hits_kaldik_pertemuan')
    .upsert(
      {
        halaqah_id: halaqahId,
        level,
        pertemuan_no: pertemuanNo,
        tanggal: isSkipped && !tanggal ? '1970-01-01' : tanggal,
        is_skipped: isSkipped,
        note,
        set_by_role: 'koordinator_ketua_kelas',
        set_by_id: session.koordinator_kk_id,
      },
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    );
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'hits.pertemuan.override',
    targetTable: 'hits_kaldik_pertemuan',
    targetId: null,
    detail: { halaqah_id: halaqahId, pertemuan_no: pertemuanNo, tanggal, is_skipped: isSkipped },
  });

  revalidatePath('/hits/koordinator/pertemuan');
  revalidatePath('/hits/koordinator');
  return { ok: true };
}

export async function clearPertemuanOverride(
  _prev: OverrideResult | undefined,
  fd: FormData
): Promise<OverrideResult> {
  const session = await requireKoordinatorKetuaKelas();
  const halaqahId = String(fd.get('halaqah_id') ?? '');
  const level = String(fd.get('level') ?? '');
  const pertemuanNo = Number(fd.get('pertemuan_no'));
  if (!halaqahId || !level || !Number.isFinite(pertemuanNo)) return { error: 'Data tidak valid.' };

  const { error } = await supabaseAdmin
    .from('hits_kaldik_pertemuan')
    .delete()
    .eq('halaqah_id', halaqahId)
    .eq('level', level)
    .eq('pertemuan_no', pertemuanNo);
  if (error) return { error: `Gagal menghapus: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'hits.pertemuan.override.clear',
    targetTable: 'hits_kaldik_pertemuan',
    targetId: null,
    detail: { halaqah_id: halaqahId, pertemuan_no: pertemuanNo },
  });

  revalidatePath('/hits/koordinator/pertemuan');
  revalidatePath('/hits/koordinator');
  return { ok: true };
}
