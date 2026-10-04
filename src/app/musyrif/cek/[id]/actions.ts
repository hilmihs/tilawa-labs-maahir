'use server';

import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  JENIS_REKAMAN,
  JENIS_REKAMAN_LABEL,
  type NilaiRekaman,
} from '@/types/db';
import { buildWaMeUrl, tplMusyrifFeedbackToPeserta } from '@/lib/whatsapp';

const VALID_NILAI: NilaiRekaman[] = ['hijau', 'kuning', 'merah'];

export type CekResult =
  | { ok: true; waUrl: string }
  | { ok?: false; error: string };

export async function submitCek(
  _prev: CekResult | undefined,
  formData: FormData
): Promise<CekResult> {
  const s = await getSession();
  if (!s.session || s.session.role !== 'musyrif') {
    return { error: 'Anda harus login sebagai musyrif.' };
  }
  const musyrifId = s.session.musyrif_id;
  const setoranId = String(formData.get('setoran_id') ?? '');
  if (!setoranId) return { error: 'setoran_id wajib.' };

  const { data: setoran } = await supabaseAdmin
    .from('setoran')
    .select(
      'id, status, peserta:peserta_id(id, name, gender, whatsapp_number, kelas:kelas_id(id, name, musyrif_id))'
    )
    .eq('id', setoranId)
    .maybeSingle();
  if (!setoran) return { error: 'Setoran tidak ditemukan.' };
  const peserta = setoran.peserta as unknown as {
    id: string;
    name: string;
    gender: 'ikhwan' | 'akhwat';
    whatsapp_number: string;
    kelas: { id: string; name: string; musyrif_id: string };
  };
  if (peserta.kelas.musyrif_id !== musyrifId) {
    return { error: 'Setoran ini bukan dari kelas Anda.' };
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
      .from('rekaman')
      .update({
        nilai,
        masukan: masukan || null,
        checked_at: checkedAt,
      })
      .eq('setoran_id', setoranId)
      .eq('jenis', jenis);
    if (uErr) return { error: `Gagal simpan ${jenis}: ${uErr.message}` };

    nilaiSummaryParts.push(`${JENIS_REKAMAN_LABEL[jenis]}: ${capitalize(nilai)}`);
    if (masukan) masukanParts.push(`• ${JENIS_REKAMAN_LABEL[jenis]}: ${masukan}`);
  }

  const { error: sErr } = await supabaseAdmin
    .from('setoran')
    .update({
      status: 'checked',
      checked_by_musyrif_id: musyrifId,
    })
    .eq('id', setoranId);
  if (sErr) return { error: `Gagal update status: ${sErr.message}` };

  const waText = tplMusyrifFeedbackToPeserta({
    pesertaName: peserta.name,
    pesertaGender: peserta.gender,
    nilaiSummary: nilaiSummaryParts.join('\n'),
    masukanGabungan: masukanParts.length ? masukanParts.join('\n') : '(tidak ada catatan tambahan)',
  });
  const waUrl = buildWaMeUrl(peserta.whatsapp_number, waText);

  return { ok: true, waUrl };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
