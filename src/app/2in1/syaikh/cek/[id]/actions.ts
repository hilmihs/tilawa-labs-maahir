'use server';

import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  JENIS_REKAMAN_LABEL,
  type JenisRekaman,
  type NilaiRekaman,
  type SyaikhSession,
} from '@/types/db';
import { buildWaMeUrl, tplSyaikhFeedbackToMusyrif } from '@/lib/whatsapp';
import { logAudit } from '@/lib/audit';
import { hitungKelengkapan } from '../../../musyrif/cek/kelengkapan';
import type { CekResult } from '../../../musyrif/cek/CekSetoranForm';

const VALID_NILAI: NilaiRekaman[] = ['hijau', 'kuning', 'merah'];

export async function submitCekSyaikh(
  _prev: CekResult | undefined,
  formData: FormData
): Promise<CekResult> {
  const s = await getSession();
  // Cari akses syaikh di SELURUH role, bukan cuma role yang sedang aktif —
  // pemegang banyak role (syaikh + koordinator + pengajar) tetap boleh menilai.
  const akses = (s.accesses ?? (s.session ? [s.session] : [])).find(
    (a) => a.role === 'syaikh'
  ) as SyaikhSession | undefined;
  if (!akses) {
    return { error: 'Anda harus login sebagai Syaikh/Ustadzah.' };
  }
  const syaikhId = akses.syaikh_id;
  const syaikhGender = akses.gender;
  const setoranId = String(formData.get('setoran_id') ?? '');
  if (!setoranId) return { error: 'setoran_id wajib.' };

  const { data: setoran, error: gErr } = await supabaseAdmin
    .from('setoran_musyrif')
    .select(
      'id, status, week_start, musyrif:musyrif_id(id, name, gender, whatsapp_number)'
    )
    .eq('id', setoranId)
    .maybeSingle();
  if (gErr) return { error: `Gagal membaca setoran: ${gErr.message}` };
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

  if (setoran.status === 'checked') {
    return { error: 'Setoran ini sudah dicek. Muat ulang halaman.' };
  }

  // Hanya jenis yang punya baris rekaman yang dinilai; jenis yang belum
  // disetor dilewati — bukan diberi nilai yang UPDATE-nya kena 0 baris.
  const { data: rekamanRows, error: rErr } = await supabaseAdmin
    .from('rekaman_musyrif')
    .select('jenis')
    .eq('setoran_musyrif_id', setoranId);
  if (rErr) return { error: `Gagal membaca rekaman: ${rErr.message}` };
  const lengkap = hitungKelengkapan(
    setoran.week_start,
    (rekamanRows ?? []).map((r) => r.jenis as string)
  );
  if (lengkap.ada.length === 0) {
    return { error: 'Belum ada rekaman yang disetor — tidak ada yang bisa dinilai.' };
  }

  // Validasi semua dulu, baru tulis.
  const isian: { jenis: JenisRekaman; nilai: NilaiRekaman; masukan: string }[] = [];
  for (const jenis of lengkap.ada) {
    const nilaiRaw = String(formData.get(`nilai_${jenis}`) ?? '');
    const masukan = String(formData.get(`masukan_${jenis}`) ?? '').trim();
    if (!VALID_NILAI.includes(nilaiRaw as NilaiRekaman)) {
      return { error: `Nilai ${JENIS_REKAMAN_LABEL[jenis]} wajib dipilih.` };
    }
    isian.push({ jenis, nilai: nilaiRaw as NilaiRekaman, masukan });
  }

  const nilaiSummaryParts: string[] = [];
  const masukanParts: string[] = [];
  const checkedAt = new Date().toISOString();

  for (const { jenis, nilai, masukan } of isian) {
    const { data: diubah, error: uErr } = await supabaseAdmin
      .from('rekaman_musyrif')
      .update({
        nilai,
        masukan: masukan || null,
        checked_at: checkedAt,
      })
      .eq('setoran_musyrif_id', setoranId)
      .eq('jenis', jenis)
      .select('id');
    if (uErr) {
      return { error: `Gagal simpan nilai ${JENIS_REKAMAN_LABEL[jenis]}: ${uErr.message}` };
    }
    if (!diubah || diubah.length === 0) {
      return {
        error: `Rekaman ${JENIS_REKAMAN_LABEL[jenis]} tidak ditemukan saat menyimpan nilai. Muat ulang halaman lalu coba lagi.`,
      };
    }

    nilaiSummaryParts.push(`${JENIS_REKAMAN_LABEL[jenis]}: ${capitalize(nilai)}`);
    if (masukan) masukanParts.push(`• ${JENIS_REKAMAN_LABEL[jenis]}: ${masukan}`);
  }
  for (const jenis of lengkap.kurang) {
    nilaiSummaryParts.push(`${JENIS_REKAMAN_LABEL[jenis]}: Belum disetor`);
  }

  const { data: statusDiubah, error: sErr } = await supabaseAdmin
    .from('setoran_musyrif')
    .update({
      status: 'checked',
      checked_by_syaikh_id: syaikhId,
    })
    .eq('id', setoranId)
    .select('id');
  if (sErr) return { error: `Gagal update status: ${sErr.message}` };
  if (!statusDiubah || statusDiubah.length === 0) {
    return { error: 'Setoran tidak ditemukan saat menyimpan status. Muat ulang halaman.' };
  }

  const waText = tplSyaikhFeedbackToMusyrif({
    musyrifName: musyrif.name,
    musyrifGender: musyrif.gender,
    nilaiSummary: nilaiSummaryParts.join('\n'),
    masukanGabungan: masukanParts.length
      ? masukanParts.join('\n')
      : '(tidak ada catatan tambahan)',
  });
  const waUrl = buildWaMeUrl(musyrif.whatsapp_number, waText);

  await logAudit({
    // Akses syaikh yang benar-benar dipakai menilai, bukan role aktif di sesi.
    actor: akses,
    action: 'cek.submit_syaikh',
    targetTable: 'setoran_musyrif',
    targetId: setoranId,
    detail: {
      musyrif_id: musyrif.id,
      nilai_summary: nilaiSummaryParts.join(' | '),
      belum_disetor: lengkap.kurang,
    },
  });

  return { ok: true, waUrl };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
