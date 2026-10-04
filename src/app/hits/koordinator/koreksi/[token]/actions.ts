'use server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { applyKoreksiItem, validateKoreksiItems } from '@/lib/hits-koreksi';
import { logAudit } from '@/lib/audit';
import { buildWaMeUrl, tplKoreksiPertemuanInfo } from '@/lib/whatsapp';

export type DecideKoreksiResult = { ok?: boolean; error?: string; ketuaWaUrl?: string };

export async function decideKoreksi(token: string, decisions: { itemId: string; approve: boolean }[]): Promise<DecideKoreksiResult> {
  const koor = await requireKoordinatorKetuaKelas();
  const { data: header } = await supabaseAdmin
    .from('hits_pertemuan_koreksi')
    .select('id, halaqah_id, requested_by_name, requested_by_wa, status, hits_halaqah:halaqah_id(name, gender)')
    .eq('token', token).maybeSingle();
  if (!header) return { error: 'Pengajuan tidak ditemukan.' };
  if (header.status !== 'pending') return { error: 'Pengajuan ini sudah diputuskan.' };
  const h = header.hits_halaqah as unknown as { name: string; gender: string | null } | null;
  if (h?.gender && h.gender !== koor.gender) return { error: 'Bukan gender Anda.' };

  const { data: items } = await supabaseAdmin
    .from('hits_pertemuan_koreksi_item')
    .select('id, jenis, level, pertemuan_no, tanggal, status')
    .eq('koreksi_id', header.id);

  const byId = new Map((items ?? []).map((it) => [it.id, it]));

  // Validasi SEBELUM menyentuh data: nomor pertemuan yang diminta bisa saja sudah
  // terpakai sejak pengajuan dibuat. Gagal di sini = tak ada yang berubah.
  const akanDisetujui = decisions
    .filter((d) => d.approve)
    .map((d) => byId.get(d.itemId))
    .filter((it): it is NonNullable<typeof it> => !!it && it.status === 'pending');
  const vErr = await validateKoreksiItems(header.halaqah_id, akanDisetujui);
  if (vErr) return { error: vErr };

  let disetujui = 0, ditolak = 0;
  for (const d of decisions) {
    const it = byId.get(d.itemId);
    if (!it || it.status !== 'pending') continue;
    if (d.approve) {
      const res = await applyKoreksiItem(header.halaqah_id, { jenis: it.jenis, level: it.level, pertemuan_no: it.pertemuan_no, tanggal: it.tanggal }, { role: 'koordinator_ketua_kelas', id: koor.koordinator_kk_id });
      // Pengajuan sengaja dibiarkan pending supaya koordinator bisa ulangi;
      // item yang terlanjur sukses sudah 'approved' dan akan dilewati.
      if (!res.ok) return { error: res.error };
      await supabaseAdmin.from('hits_pertemuan_koreksi_item').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', it.id);
      disetujui++;
    } else {
      await supabaseAdmin.from('hits_pertemuan_koreksi_item').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', it.id);
      ditolak++;
    }
  }

  await supabaseAdmin.from('hits_pertemuan_koreksi').update({ status: 'selesai', decided_by_role: 'koordinator_ketua_kelas', decided_by_id: koor.koordinator_kk_id, decided_at: new Date().toISOString() }).eq('id', header.id);
  await logAudit({ actor: koor, action: 'hits.koreksi.decide', targetTable: 'hits_pertemuan_koreksi', targetId: header.id, detail: { disetujui, ditolak } });

  let ketuaWaUrl: string | undefined;
  if (header.requested_by_wa) {
    ketuaWaUrl = buildWaMeUrl(header.requested_by_wa, tplKoreksiPertemuanInfo({ ketuaName: header.requested_by_name, halaqahName: h?.name ?? 'halaqah', disetujui, ditolak }));
  }
  return { ok: true, ketuaWaUrl };
}
