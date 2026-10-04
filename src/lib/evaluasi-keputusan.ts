// Keputusan koordinator: peserta yang tidak lulus mengulang di KELAS mana (0075).
//
// Yang diulang adalah kelasnya — Kelas QN atau Kelas PB — bukan "evaluasi"-nya.
// Karena itu labelnya tetap "Kelas QN"/"Kelas PB" dan TIDAK diambil dari
// `eval_config.nama_qn`/`nama_pb`: kolom itu menamai instrumen penilaian
// ("Evaluasi QN", "Evaluasi Qiroah"), bukan kelas tempat santri belajar.
//
// Kelulusan level ditentukan Rapot PB saja; Rapot QN prasyarat yang nilainya
// tidak menggugurkan. Karena itu KANDIDAT keputusan adalah peserta ber-nilai
// akhir PB di bawah ambang — bukan siapa pun yang QN-nya rendah. Penjaga itu
// hidup di `bolehDiputuskan` supaya halaman, server action, dan uji memakai
// definisi yang sama; menaruhnya di UI saja berarti tombol yang tak tampil masih
// bisa ditembak lewat request langsung.
//
// Modul ini sengaja TIDAK 'server-only' dan TIDAK menyentuh DB: `bolehDiputuskan`
// dan `NAMA_KELAS` dipakai komponen klien juga, dan satu import `supabaseAdmin`
// di sini cukup untuk menyeret `pg` ke bundel browser — build gagal dengan
// "Can't resolve 'fs'". Pemuat DB-nya ada di `evaluasi-keputusan-db.ts`.
import { AMBANG_LULUS_AKHIR } from '@/lib/evaluasi';
import type { Track } from '@/lib/evaluasi';

/** Kelas tempat peserta mengulang. Tidak ada nilai "belum diputuskan" — itu
 *  diwakili ketiadaan baris, supaya "belum ditinjau" tak bisa tersimpan sebagai
 *  sebuah keputusan. */
export type Keputusan = Track;
export const KEPUTUSAN: readonly Keputusan[] = ['qn', 'pb'] as const;

/** Nama kelas pengulangan. Tetap, bukan dari eval_config — lihat catatan atas. */
export const NAMA_KELAS: Record<Keputusan, string> = {
  qn: 'Kelas QN',
  pb: 'Kelas PB',
};

export function isKeputusan(v: unknown): v is Keputusan {
  return v === 'qn' || v === 'pb';
}

/**
 * Bentuk minimal baris peserta yang cukup untuk memutuskan kelayakan. Sengaja
 * bukan `BarisPeserta` penuh: server action hanya punya nilai akhir PB hasil
 * hitung ulang, bukan seluruh baris tabel.
 */
export interface KelayakanKeputusan {
  /** Nilai akhir Rapot PB. null = komponen belum lengkap. */
  nilaiPb: number | null;
}

/**
 * Boleh diberi keputusan mengulang? Hanya peserta yang nilai akhir PB-nya sudah
 * sah DAN di bawah ambang. Nilai PB yang belum lengkap bukan "tidak lulus" —
 * memutuskan pengulangan atas dasar komponen yang belum utuh berarti memvonis
 * peserta yang penilaiannya memang belum selesai.
 */
export function bolehDiputuskan(k: KelayakanKeputusan): boolean {
  return k.nilaiPb != null && k.nilaiPb < AMBANG_LULUS_AKHIR;
}

/** Label keputusan untuk layar dan lembar rapot. */
export function labelKeputusan(k: Keputusan): string {
  return NAMA_KELAS[k];
}
