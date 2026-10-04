'use server';
// Penetapan & pembatalan keputusan mengulang (0075).
//
// Kelayakan DIHITUNG ULANG di sini, tidak dipercayakan ke apa pun yang dikirim
// klien: tombolnya memang hanya muncul untuk peserta yang tidak lulus PB, tapi
// action ini bisa dipanggil langsung dengan peserta_id apa pun. Yang dikirim
// klien hanyalah id peserta dan pilihan track.
import { revalidatePath } from 'next/cache';
import { requireOneOfRoles } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { UJIAN_PB_SESI, nilaiAkhirTrackOf } from '@/lib/evaluasi';
import { bolehDiputuskan, isKeputusan } from '@/lib/evaluasi-keputusan';

const RUTE = '/evaluasi/koordinator/peserta';

/**
 * Penjaga bersama: hanya role `koordinator` penuh yang boleh menetapkan.
 * `koordinator_ketua_kelas` ikut MELIHAT halaman ini (ia memantau halaqah yang
 * sama), tapi keputusan pengulangan bukan wewenangnya — dan barisnya pun tak ada
 * di tabel `koordinator`, sehingga `ditetapkan_oleh` tak bisa diisi jujur.
 *
 * TIDAK mengunci gender, dan itu disengaja — beda dari shakwa, rekap halaqah,
 * dan halaman detail yang semuanya mengunci. Penempatan ulang angkatan
 * berikutnya diputuskan koordinator sebagai satu majelis, bukan per gender,
 * jadi mengunci di sini hanya memaksa satu daftar dikerjakan dua akun. Yang
 * menetapkan tetap tercatat di `ditetapkan_oleh`.
 */
async function guard(): Promise<{ koordinatorId: string }> {
  const s = await requireOneOfRoles(['koordinator']);
  return { koordinatorId: s.koordinator_id };
}

/**
 * Nilai akhir PB peserta, dihitung dari sumber yang sama dengan halaman rekap.
 * Mengembalikan null bila pesertanya tak ada.
 */
async function kelayakan(pesertaId: string): Promise<{ nilaiPb: number | null } | null> {
  const { data: peserta } = await supabaseAdmin
    .from('eval_peserta')
    .select('id, halaqah_id')
    .eq('id', pesertaId)
    .maybeSingle();
  if (!peserta?.halaqah_id) return null;

  const { data: halaqah } = await supabaseAdmin
    .from('eval_halaqah')
    .select('id, batch_id')
    .eq('id', peserta.halaqah_id as string)
    .maybeSingle();
  if (!halaqah) return null;

  let terpisah = false;
  if (halaqah.batch_id) {
    const { data: batch } = await supabaseAdmin
      .from('eval_batch')
      .select('rapot_ujian_terpisah')
      .eq('id', halaqah.batch_id as string)
      .maybeSingle();
    terpisah = !!batch?.rapot_ujian_terpisah;
  }

  const { data: sesiRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, jenis, nomor_sesi, dihapus')
    .eq('halaqah_id', halaqah.id as string);
  const sesi = ((sesiRaw ?? []) as Array<{
    id: string; jenis: string; nomor_sesi: number; dihapus: boolean;
  }>).filter((s) => !s.dihapus);
  const meta = new Map(sesi.map((s) => [s.id, s]));

  const { data: nilaiRaw } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select('sesi_id, peserta_id, skor, done, hadir')
    .eq('peserta_id', pesertaId);
  const nilai = (nilaiRaw ?? []) as Array<{
    sesi_id: string; skor: number; done: boolean; hadir: boolean;
  }>;

  const berkalaPb: number[] = [];
  let ujianPb: number | null = null;
  for (const n of nilai) {
    if (!n.done || n.hadir === false) continue;
    const m = meta.get(n.sesi_id);
    if (!m) continue;
    const skor = Number(n.skor) || 0;
    if (m.jenis === 'pb') berkalaPb.push(skor);
    else if (m.jenis === 'ujian' && m.nomor_sesi === UJIAN_PB_SESI) ujianPb = skor;
  }

  const pb = nilaiAkhirTrackOf('pb', berkalaPb, ujianPb, { ujianSaja: terpisah });
  return { nilaiPb: pb.nilai };
}

export async function tetapkanKeputusan(pesertaId: string, keputusan: string) {
  const { koordinatorId } = await guard();
  if (!isKeputusan(keputusan)) throw new Error('Keputusan tidak dikenali.');

  const k = await kelayakan(pesertaId);
  if (!k) throw new Error('Peserta tidak ditemukan.');
  if (!bolehDiputuskan({ nilaiPb: k.nilaiPb })) {
    throw new Error('Peserta ini tidak sedang dinyatakan mengulang.');
  }

  await supabaseAdmin
    .from('eval_keputusan_mengulang')
    .upsert(
      {
        peserta_id: pesertaId,
        keputusan,
        ditetapkan_oleh: koordinatorId,
        ditetapkan_at: new Date().toISOString(),
      },
      { onConflict: 'peserta_id' }
    );

  revalidatePath(RUTE);
}

export async function batalkanKeputusan(pesertaId: string) {
  await guard();

  const k = await kelayakan(pesertaId);
  if (!k) throw new Error('Peserta tidak ditemukan.');
  // Sengaja TANPA penjaga `bolehDiputuskan`: keputusan yang jadi basi karena
  // nilainya berubah menjadi lulus justru yang paling perlu bisa dibatalkan.

  await supabaseAdmin
    .from('eval_keputusan_mengulang')
    .delete()
    .eq('peserta_id', pesertaId);

  revalidatePath(RUTE);
}
