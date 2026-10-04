/**
 * Penjaga bersama untuk membuka sesi evaluasi yang sudah 'terkirim'.
 *
 * Dua jalur memakainya: /api/evaluasi/sesi/buka-kunci (buka saja, nilai utuh)
 * dan /api/evaluasi/nilai/reset (buka + kosongkan). Aturannya sama dan harus
 * tetap sama: selama masih ada rapot AKTIF yang bersumber dari sesi ini,
 * membukanya ditolak — dokumen ber-QR yang sudah beredar tak boleh diam-diam
 * berbeda dengan isi sistem. Cabut rapotnya dulu.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { jenisRapotDariSesi, type Jenis } from '@/lib/evaluasi';

/** Nama peserta untuk pesan galat: tiga dulu, sisanya diringkas. */
function ringkasNama(nama: string[]): string {
  if (nama.length <= 3) return nama.join(', ');
  return `${nama.slice(0, 3).join(', ')} dan ${nama.length - 3} lainnya`;
}

export interface RapotPenghalang {
  pesan: string;
  jumlah: number;
}

/**
 * `null` bila sesi boleh dibuka. Selain itu: pesan siap tampil yang menyebut
 * nama peserta pemilik rapot aktif.
 */
export async function rapotAktifPenghalangBuka(
  halaqahId: string,
  jenis: Jenis,
  nomorSesi: number
): Promise<RapotPenghalang | null> {
  const jenisRapot = jenisRapotDariSesi(jenis, nomorSesi);
  const { data: rapotAktif } = await supabaseAdmin
    .from('evaluasi_rapot')
    .select('id, peserta_id, jenis_rapot')
    .eq('halaqah_id', halaqahId)
    .eq('status', 'aktif')
    .in('jenis_rapot', jenisRapot);

  const rapotRows = (rapotAktif ?? []) as { peserta_id: string; jenis_rapot: string }[];
  if (rapotRows.length === 0) return null;

  const { data: pesertaRows } = await supabaseAdmin
    .from('eval_peserta')
    .select('id, nama')
    .in('id', rapotRows.map((r) => r.peserta_id));
  const namaById = new Map((pesertaRows ?? []).map((p) => [p.id as string, p.nama as string]));
  const nama = rapotRows.map((r) => namaById.get(r.peserta_id) ?? 'peserta');

  return {
    pesan: `Rapot masih aktif untuk ${ringkasNama(nama)}. Cabut rapotnya dulu, baru sesi ini bisa dibuka.`,
    jumlah: rapotRows.length,
  };
}
