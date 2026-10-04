import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { identitasPendaftar } from '@/lib/ketersediaan-pendaftar';

/**
 * Satu formulir pendaftaran melayani lebih dari satu periode: pendaftar yang sama
 * boleh mulai September atau Oktober. Tiap periode menyimpan salinan barisnya
 * sendiri, jadi yang mencegah satu orang mendapat dua halaqah adalah identitasnya
 * (nomor + nama), bukan id baris.
 *
 * Dihitung saat dibaca, tidak ditulis ke periode lain: membatalkan usulan di satu
 * periode otomatis mengembalikan orangnya ke antrean periode lain.
 *
 * Hanya periode AKTIF yang RENTANG TANGGALNYA BERIRISAN dengan periode ini yang
 * dihitung. Orang yang dapat halaqah di batch Januari dan sudah lulus boleh
 * mendaftar lagi untuk Oktober — tanpa batas ini ia tersaring selamanya.
 *
 * @returns identitas → nama periode tempat ia sudah dialokasikan
 */
export async function identitasTerpakaiLintasPeriode(periodeId: string): Promise<Map<string, string>> {
  const { data: periodeRows } = await supabaseAdmin
    .from('ks_periode')
    .select('id, nama, mulai, selesai, aktif');
  const semua = (periodeRows ?? []) as { id: string; nama: string; mulai: string; selesai: string; aktif: boolean }[];
  const ini = semua.find((p) => p.id === periodeId);
  const out = new Map<string, string>();
  if (!ini) return out;

  const beririsan = semua.filter((p) => p.id !== periodeId && p.aktif && periodeBeririsan(p, ini));
  if (beririsan.length === 0) return out;
  const namaPeriode = new Map(beririsan.map((p) => [p.id, p.nama]));

  const { data } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('wa_normal, nama, periode_id')
    .in('periode_id', [...namaPeriode.keys()])
    .eq('status', 'dialokasikan');

  for (const r of (data ?? []) as { wa_normal: string | null; nama: string; periode_id: string }[]) {
    const id = identitasPendaftar(r.wa_normal, r.nama);
    if (id && !out.has(id)) out.set(id, namaPeriode.get(r.periode_id) ?? 'periode lain');
  }
  return out;
}

/** Dua rentang tanggal (YYYY-MM-DD, inklusif) beririsan. */
export function periodeBeririsan(
  a: { mulai: string; selesai: string },
  b: { mulai: string; selesai: string }
): boolean {
  return a.mulai.slice(0, 10) <= b.selesai.slice(0, 10) && a.selesai.slice(0, 10) >= b.mulai.slice(0, 10);
}
