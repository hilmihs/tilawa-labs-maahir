'use server';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildWaMeUrl, tplReminderKajianAdab } from '@/lib/whatsapp';
import { revalidatePath } from 'next/cache';

/** Set reminder untuk (ketua, tanggal). Resend TAK reset reminder_sent_at (pola F3). */
export async function remindKajianKetua(input: { ketuaWa: string; tanggal: string; namaKetua: string | null; tanggalWib: string }) {
  await requireKoordinatorKetuaKelas();
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from('hits_kajian_presensi')
    .select('id, reminder_sent_at, status')
    .eq('ketua_wa', input.ketuaWa).eq('tanggal', input.tanggal).maybeSingle();

  if (existing?.status) return { ok: false, error: 'Sudah ada status; tak perlu reminder.' };

  if (!existing) {
    const { error: insErr } = await supabaseAdmin.from('hits_kajian_presensi')
      .insert({ ketua_wa: input.ketuaWa, tanggal: input.tanggal, status: null, reminder_sent_at: nowIso });
    // 23505 = unique violation (race: caller lain sudah set reminder) → aman lanjut
    if (insErr && (insErr as { code?: string }).code !== '23505') return { ok: false, error: insErr.message };
  } else if (!existing.reminder_sent_at) {
    const { error: updErr } = await supabaseAdmin.from('hits_kajian_presensi')
      .update({ reminder_sent_at: nowIso }).eq('id', existing.id);
    if (updErr) return { ok: false, error: updErr.message };
  }
  // resend: reminder_sent_at sudah ada → biarkan (countdown tak reset)

  const link = buildWaMeUrl(input.ketuaWa, tplReminderKajianAdab({ namaKetua: input.namaKetua, tanggalWib: input.tanggalWib }));
  revalidatePath('/observasi/koordinator/kajian');
  return { ok: true, waLink: link };
}

export async function setKajianLibur(tanggal: string, keterangan: string) {
  await requireKoordinatorKetuaKelas();
  const { error } = await supabaseAdmin
    .from('hits_kajian_libur').upsert({ tanggal, keterangan }, { onConflict: 'tanggal' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/observasi/koordinator/kajian');
  return { ok: true };
}

export async function hapusKajianLibur(tanggal: string) {
  await requireKoordinatorKetuaKelas();
  const { error } = await supabaseAdmin.from('hits_kajian_libur').delete().eq('tanggal', tanggal);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/observasi/koordinator/kajian');
  return { ok: true };
}
