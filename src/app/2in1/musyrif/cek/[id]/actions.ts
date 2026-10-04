'use server';

import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  JENIS_REKAMAN_LABEL,
  type JenisRekaman,
  type MusyrifSession,
  type NilaiRekaman,
} from '@/types/db';
import { buildWaMeUrl, tplMusyrifFeedbackToPeserta } from '@/lib/whatsapp';
import { logAudit } from '@/lib/audit';
import { hitungKelengkapan } from '../kelengkapan';
import type { CekResult } from '../CekSetoranForm';

const VALID_NILAI: NilaiRekaman[] = ['hijau', 'kuning', 'merah'];

export async function submitCek(
  _prev: CekResult | undefined,
  formData: FormData
): Promise<CekResult> {
  const s = await getSession();
  // Cari akses musyrif di SELURUH role, bukan cuma role aktif — pemegang
  // banyak role tetap boleh menilai (sama seperti halaman syaikh).
  const akses = (s.accesses ?? (s.session ? [s.session] : [])).find(
    (a) => a.role === 'musyrif'
  ) as MusyrifSession | undefined;
  if (!akses) {
    return { error: 'Anda harus login sebagai musyrif.' };
  }
  const musyrifId = akses.musyrif_id;
  const setoranId = String(formData.get('setoran_id') ?? '');
  if (!setoranId) return { error: 'setoran_id wajib.' };

  const { data: setoran, error: gErr } = await supabaseAdmin
    .from('setoran')
    .select(
      'id, status, week_start, peserta:peserta_id(id, name, gender, whatsapp_number, kelas:kelas_id(id, name, musyrif_id))'
    )
    .eq('id', setoranId)
    .maybeSingle();
  if (gErr) return { error: `Gagal membaca setoran: ${gErr.message}` };
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
  if (setoran.status === 'checked') {
    return { error: 'Setoran ini sudah dicek. Muat ulang halaman.' };
  }

  // Hanya jenis yang punya baris rekaman yang dinilai. Jenis yang belum
  // disetor dilewati — bukan diberi nilai yang UPDATE-nya kena 0 baris.
  const { data: rekamanRows, error: rErr } = await supabaseAdmin
    .from('rekaman')
    .select('jenis')
    .eq('setoran_id', setoranId);
  if (rErr) return { error: `Gagal membaca rekaman: ${rErr.message}` };
  const lengkap = hitungKelengkapan(
    setoran.week_start,
    (rekamanRows ?? []).map((r) => r.jenis as string)
  );
  if (lengkap.ada.length === 0) {
    return { error: 'Belum ada rekaman yang disetor — tidak ada yang bisa dinilai.' };
  }

  // Validasi semua dulu, baru tulis — supaya tidak ada nilai yang tersimpan
  // separuh bila satu jenis ternyata belum dipilih.
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
      .from('rekaman')
      .update({
        nilai,
        masukan: masukan || null,
        checked_at: checkedAt,
      })
      .eq('setoran_id', setoranId)
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
  if (lengkap.kurang.length > 0 && !lengkap.lewatBatas) {
    nilaiSummaryParts.push(
      '',
      `${lengkap.kurangLabel} masih bisa disetor sampai ${lengkap.batasLabel}.`
    );
  }

  const { data: statusDiubah, error: sErr } = await supabaseAdmin
    .from('setoran')
    .update({
      status: 'checked',
      checked_by_musyrif_id: musyrifId,
    })
    .eq('id', setoranId)
    .select('id');
  if (sErr) return { error: `Gagal update status: ${sErr.message}` };
  if (!statusDiubah || statusDiubah.length === 0) {
    return { error: 'Setoran tidak ditemukan saat menyimpan status. Muat ulang halaman.' };
  }

  // Peserta bisa saja menambah rekaman di sela pembacaan tadi dan UPDATE
  // status barusan. Rekaman baru itu belum bernilai — kembalikan ke antrean
  // supaya tidak terkunci sebagai 'checked' tanpa nilai.
  const { data: belumDinilai, error: bErr } = await supabaseAdmin
    .from('rekaman')
    .select('jenis')
    .eq('setoran_id', setoranId)
    .is('nilai', null);
  if (bErr) return { error: `Gagal memeriksa ulang rekaman: ${bErr.message}` };
  if (belumDinilai && belumDinilai.length > 0) {
    const { error: kErr } = await supabaseAdmin
      .from('setoran')
      .update({ status: 'submitted' })
      .eq('id', setoranId);
    if (kErr) return { error: `Gagal mengembalikan status: ${kErr.message}` };
    return {
      error:
        'Peserta baru saja menambah rekaman. Nilai yang sudah dipilih tersimpan — muat ulang halaman lalu nilai rekaman yang baru.',
    };
  }

  const waText = tplMusyrifFeedbackToPeserta({
    pesertaName: peserta.name,
    pesertaGender: peserta.gender,
    nilaiSummary: nilaiSummaryParts.join('\n'),
    masukanGabungan: masukanParts.length ? masukanParts.join('\n') : '(tidak ada catatan tambahan)',
  });
  const waUrl = buildWaMeUrl(peserta.whatsapp_number, waText);

  await logAudit({
    actor: akses,
    action: 'cek.submit_musyrif',
    targetTable: 'setoran',
    targetId: setoranId,
    detail: {
      peserta_id: peserta.id,
      nilai_summary: nilaiSummaryParts.filter(Boolean).join(' | '),
      belum_disetor: lengkap.kurang,
    },
  });

  return { ok: true, waUrl };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
