'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKetuaKelas } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import type { KondisiKelas, StatusLatihan } from '@/types/db';

export type ObservasiResult = {
  ok?: boolean;
  error?: string;
};

export async function submitObservasi(
  _prev: ObservasiResult | undefined,
  formData: FormData
): Promise<ObservasiResult> {
  const session = await requireKetuaKelas();

  const tanggal = String(formData.get('tanggal') ?? '');
  const kondisi = String(formData.get('kondisi') ?? '') as KondisiKelas;
  const latihanDiberikan = formData.get('latihan_mandiri_diberikan') === 'true';
  const statusLatihan = formData.get('status_latihan_val') as StatusLatihan | null;
  const semuaSiswaSelesai = formData.get('semua_siswa_selesai_latihan') === 'true';
  const catatan = String(formData.get('catatan') ?? '').trim() || null;

  if (!tanggal || !kondisi) {
    return { error: 'Tanggal dan kondisi wajib diisi.' };
  }

  const validKondisi: KondisiKelas[] = ['KBBS', 'KMT', 'JKG', 'KBLA', 'LIBUR'];
  if (!validKondisi.includes(kondisi)) {
    return { error: 'Kondisi tidak valid.' };
  }

  const insertData: Record<string, unknown> = {
    kelas_hits_id: session.kelas_hits_id,
    ketua_kelas_id: session.ketua_kelas_id,
    tanggal,
    kondisi,
    pengajar_on_cam: null,
    latihan_mandiri_diberikan: kondisi === 'LIBUR' ? null : latihanDiberikan,
    status_latihan_val: kondisi === 'LIBUR' ? null : (latihanDiberikan ? statusLatihan : null),
    semua_siswa_selesai_latihan: kondisi === 'LIBUR' ? null : (latihanDiberikan ? semuaSiswaSelesai : null),
    catatan,
  };

  const { error: upsertErr } = await supabaseAdmin
    .from('observasi_kelas')
    .upsert(insertData, { onConflict: 'kelas_hits_id,tanggal' });

  if (upsertErr) {
    return { error: `Gagal simpan: ${upsertErr.message}` };
  }

  await logAudit({
    actor: session,
    action: 'observasi.submit',
    targetTable: 'observasi_kelas',
    targetId: null,
    detail: { kelas_hits_id: session.kelas_hits_id, tanggal, kondisi },
  });

  if (kondisi !== 'KBBS' && kondisi !== 'LIBUR') {
    const { data: obs } = await supabaseAdmin
      .from('observasi_kelas')
      .select('id')
      .eq('kelas_hits_id', session.kelas_hits_id)
      .eq('tanggal', tanggal)
      .maybeSingle();

    if (obs) {
      const { data: kelas } = await supabaseAdmin
        .from('kelas_hits')
        .select('pengajar_id')
        .eq('id', session.kelas_hits_id)
        .maybeSingle();

      if (kelas) {
        const { data: existingTabayyun } = await supabaseAdmin
          .from('tabayyun')
          .select('id')
          .eq('observasi_id', obs.id)
          .maybeSingle();

        if (!existingTabayyun) {
          const { data: koorKK } = await supabaseAdmin
            .from('koordinator_ketua_kelas')
            .select('id')
            .limit(1)
            .maybeSingle();

          if (koorKK) {
            const deadline = new Date();
            deadline.setHours(deadline.getHours() + 48);

            await supabaseAdmin.from('tabayyun').insert({
              observasi_id: obs.id,
              pengajar_id: kelas.pengajar_id,
              koordinator_kk_id: koorKK.id,
              status: 'pending',
              deadline_at: deadline.toISOString(),
            });
          }
        }
      }
    }
  }

  return { ok: true };
}
