'use server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKetuaKelas } from '@/lib/session';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplKoreksiPertemuanApproval } from '@/lib/whatsapp';
import { determineKoreksiApprover, urutanKoreksi, validateKoreksiItems, type KoreksiItemInput } from '@/lib/hits-koreksi';
import { logAudit } from '@/lib/audit';

export type SubmitKoreksiResult = { ok?: boolean; error?: string; waUrl?: string };

export async function submitKoreksi(halaqahId: string, items: KoreksiItemInput[]): Promise<SubmitKoreksiResult> {
  // Sesi ketua kelas (role 'ketua_kelas' tak ada di getSessionWa). Ambil WA dari
  // baris ketua_kelas sesi, lalu verifikasi kepemilikan halaqah (dukung peran ganda).
  const session = await requireKetuaKelas();
  if (!halaqahId || items.length === 0) return { error: 'Tidak ada item koreksi.' };

  const { data: self } = await supabaseAdmin
    .from('ketua_kelas')
    .select('whatsapp_number')
    .eq('id', session.ketua_kelas_id)
    .maybeSingle();
  const wa = self?.whatsapp_number ?? null;
  if (!wa) return { error: 'Akun ketua tidak punya nomor WA.' };

  const { data: kk } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, name, hits_halaqah_id')
    .eq('whatsapp_number', wa).eq('active', true).eq('hits_halaqah_id', halaqahId)
    .limit(1).maybeSingle();
  if (!kk) return { error: 'Anda bukan ketua halaqah ini.' };

  const { data: h } = await supabaseAdmin.from('hits_halaqah').select('name, gender').eq('id', halaqahId).maybeSingle();
  if (!h) return { error: 'Halaqah tidak ditemukan.' };

  // Nomor pertemuan pilihan ketua tak boleh menabrak yang sudah ada. Dicek lagi
  // saat koordinator Acc — cek di sini supaya salahnya ketahuan sebelum kirim WA.
  const vErr = await validateKoreksiItems(halaqahId, items);
  if (vErr) return { error: vErr };

  const gender = (h.gender as 'ikhwan' | 'akhwat') ?? 'ikhwan';
  // Giliran dihitung sebelum baris pengajuan disimpan — sisi ikhwan dipegang
  // dua koordinator dan dibagi bergantian.
  const approver = await determineKoreksiApprover(gender, await urutanKoreksi(gender));
  if (!approver) return { error: 'Tidak ada koordinator ketua kelas ber-WA untuk menyetujui.' };

  const token = crypto.randomUUID();
  const { data: header, error: hErr } = await supabaseAdmin.from('hits_pertemuan_koreksi').insert({
    halaqah_id: halaqahId, requested_by_ketua_id: kk.id, requested_by_name: kk.name, requested_by_wa: wa, token,
  }).select('id').single();
  if (hErr?.code === '23505') return { error: 'Halaqah ini sudah punya pengajuan koreksi yang menunggu keputusan koordinator.' };
  if (hErr || !header) return { error: `Gagal membuat pengajuan: ${hErr?.message ?? 'unknown'}` };

  const rows = items.map((it) => ({
    koreksi_id: header.id, jenis: it.jenis, level: it.level ?? null,
    pertemuan_no: it.pertemuan_no ?? null, tanggal: it.tanggal ?? null, catatan: it.catatan ?? null,
  }));
  const { error: iErr } = await supabaseAdmin.from('hits_pertemuan_koreksi_item').insert(rows);
  if (iErr) return { error: `Gagal menyimpan item: ${iErr.message}` };

  await logAudit({ actor: session, action: 'hits.koreksi.request', targetTable: 'hits_pertemuan_koreksi', targetId: header.id, detail: { halaqah_id: halaqahId, items: items.length } });

  const msg = tplKoreksiPertemuanApproval({
    approverName: approver.name, approverGender: (h.gender as 'ikhwan' | 'akhwat') ?? 'ikhwan',
    ketuaName: kk.name, halaqahName: h.name, jumlahItem: items.length,
    approveUrl: absUrl(`/hits/koordinator/koreksi/${token}`), loginUrl: absUrl('/'),
  });
  return { ok: true, waUrl: buildWaMeUrl(approver.wa, msg) };
}
