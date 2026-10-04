'use server';

import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  JENIS_REKAMAN,
  JENIS_REKAMAN_LABEL,
  type NilaiRekaman,
} from '@/types/db';
import { buildWaMeUrl, tplSyaikhFeedbackToMusyrif } from '@/lib/whatsapp';

const VALID_NILAI: NilaiRekaman[] = ['hijau', 'kuning', 'merah'];

export type CekResult =
  | { ok: true; waUrl: string }
  | { ok?: false; error: string };

export async function submitCekSyaikh(
  _prev: CekResult | undefined,
  formData: FormData
): Promise<CekResult> {
  const s = await getSession();
  if (!s.session || s.session.role !== 'syaikh') {
    return { error: 'Anda harus login sebagai Syaikh/Ustadzah.' };
  }
  const syaikhId = s.session.syaikh_id;
  const syaikhGender = s.session.gender;
  const setoranId = String(formData.get('setoran_id') ?? '');
  if (!setoranId) return { error: 'setoran_id wajib.' };

  const { data: setoran } = await supabaseAdmin
    .from('setoran_musyrif')
    .select(
      'id, status, musyrif:musyrif_id(id, name, gender, whatsapp_number)'
    )
    .eq('id', setoranId)
    .maybeSingle();
  if (!setoran) return { error: 'Setoran tidak ditemukan.' };
  const musyrif = setoran.musyrif as unknown as {
    id: string;
    name: string;
    gender: 'ikhwan' | 'akhwat';
    whatsapp_number: string;
  };
  if (musyrif.gender !== syaikhGender) {
    return { error: 'Setoran ini bukan untuk gender Anda.' };
  }

  const nilaiSummaryParts: string[] = [];
  const masukanParts: string[] = [];
  const checkedAt = new Date().toISOString();

  for (const jenis of JENIS_REKAMAN) {
    const nilaiRaw = String(formData.get(`nilai_${jenis}`) ?? '');
    const masukan = String(formData.get(`masukan_${jenis}`) ?? '').trim();
    if (!VALID_NILAI.includes(nilaiRaw as NilaiRekaman)) {
      return { error: `Nilai ${JENIS_REKAMAN_LABEL[jenis]} wajib dipilih.` };
    }
    const nilai = nilaiRaw as NilaiRekaman;
    const { error: uErr } = await supabaseAdmin
      .from('rekaman_musyrif')
      .update({
        nilai,
        masukan: masukan || null,
        checked_at: checkedAt,
      })
      .eq('setoran_musyrif_id', setoranId)
      .eq('jenis', jenis);
    if (uErr) return { error: `Gagal simpan ${jenis}: ${uErr.message}` };

    nilaiSummaryParts.push(`${JENIS_REKAMAN_LABEL[jenis]}: ${capitalize(nilai)}`);
    if (masukan) masukanParts.push(`• ${JENIS_REKAMAN_LABEL[jenis]}: ${masukan}`);
  }

  const { error: sErr } = await supabaseAdmin
    .from('setoran_musyrif')
    .update({
      status: 'checked',
      checked_by_syaikh_id: syaikhId,
    })
    .eq('id', setoranId);
  if (sErr) return { error: `Gagal update status: ${sErr.message}` };

  const waText = tplSyaikhFeedbackToMusyrif({
    musyrifName: musyrif.name,
    musyrifGender: musyrif.gender,
    nilaiSummary: nilaiSummaryParts.join('\n'),
    masukanGabungan: masukanParts.length
      ? masukanParts.join('\n')
      : '(tidak ada catatan tambahan)',
  });
  const waUrl = buildWaMeUrl(musyrif.whatsapp_number, waText);

  return { ok: true, waUrl };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
