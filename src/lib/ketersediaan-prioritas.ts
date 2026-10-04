import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsPrioritasPreset } from '@/types/db';

/**
 * Urutan prioritas pengajar untuk alokasi slot.
 *
 * Dua sumber, dipilih koordinator saat menjalankan alokasi:
 *
 *   matrix → ranking Matrix Skill Guru pada bulan tertentu (`matrix_rekap`).
 *            Dibaca dari rekap tersimpan, bukan dihitung ulang: perhitungan
 *            matrix mahal dan sudah punya jalur penyegarannya sendiri.
 *   manual → urutan yang disusun koordinator dan disimpan untuk dipakai ulang.
 *
 * Keduanya menghasilkan hal yang sama: peta pengajar_id → nomor urut, kecil
 * lebih didahulukan. Pengajar yang tidak ada dalam sumber tetap ikut alokasi,
 * hanya ditaruh di belakang — supaya pengajar baru tanpa riwayat matrix tidak
 * terbuang diam-diam, yang justru menyalahi kaidah "semua kebagian dulu".
 */

export interface Urutan {
  /** pengajar_id → nomor urut (1 = paling didahulukan). */
  peringkat: Map<string, number>;
  /** Nomor urut untuk pengajar yang tidak tercantum di sumber. */
  peringkatSisa: number;
  keterangan: string;
}

export async function listPreset(gender?: Gender): Promise<KsPrioritasPreset[]> {
  let q = supabaseAdmin.from('ks_prioritas_preset').select('*');
  if (gender) q = q.eq('gender', gender);
  const { data } = await q.order('created_at', { ascending: false });
  return (data ?? []) as KsPrioritasPreset[];
}

/** Peringkat dari rekap Matrix Skill Guru sebuah bulan. */
export async function urutanDariMatrix(bulan: string, gender: Gender): Promise<Urutan> {
  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('id')
    .eq('gender', gender)
    .eq('active', true);
  const milikGender = new Set(((pengajar ?? []) as { id: string }[]).map((p) => p.id));

  const { data } = await supabaseAdmin
    .from('matrix_rekap')
    .select('pengajar_id, ranking, rata_rata_keseluruhan')
    .eq('year_month', bulan);

  const baris = ((data ?? []) as {
    pengajar_id: string;
    ranking: number | null;
    rata_rata_keseluruhan: number | null;
  }[])
    .filter((r) => milikGender.has(r.pengajar_id))
    // Ranking tersimpan dihitung lintas gender, jadi nomornya berlubang setelah
    // disaring. Diurutkan ulang di sini supaya 1,2,3 rapat tanpa celah.
    .sort((a, b) => {
      const ra = a.ranking ?? Number.MAX_SAFE_INTEGER;
      const rb = b.ranking ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return (b.rata_rata_keseluruhan ?? 0) - (a.rata_rata_keseluruhan ?? 0);
    });

  const peringkat = new Map<string, number>();
  baris.forEach((r, i) => peringkat.set(r.pengajar_id, i + 1));

  return {
    peringkat,
    peringkatSisa: baris.length + 1,
    keterangan: `Ranking Matrix Skill Guru bulan ${bulan} (${baris.length} pengajar)`,
  };
}

/** Peringkat dari preset urutan manual. */
export async function urutanDariPreset(presetId: string): Promise<Urutan> {
  const { data } = await supabaseAdmin
    .from('ks_prioritas_urutan')
    .select('pengajar_id, urutan')
    .eq('preset_id', presetId)
    .order('urutan', { ascending: true });

  const peringkat = new Map<string, number>();
  ((data ?? []) as { pengajar_id: string; urutan: number }[]).forEach((r, i) => {
    peringkat.set(r.pengajar_id, i + 1);
  });

  return {
    peringkat,
    peringkatSisa: peringkat.size + 1,
    keterangan: `Preset urutan manual (${peringkat.size} pengajar)`,
  };
}

export async function urutanUntuk(preset: KsPrioritasPreset): Promise<Urutan> {
  return preset.tipe === 'matrix' && preset.matrix_bulan
    ? urutanDariMatrix(preset.matrix_bulan, preset.gender)
    : urutanDariPreset(preset.id);
}

/**
 * Urutan cadangan bila koordinator belum memilih preset apa pun: siapa yang
 * lebih dahulu mengisi form, dia lebih dahulu. Ini persis aturan pemutus seri
 * di dokumen konsep ("jika skor sama, pengisi form lebih awal didahulukan"),
 * jadi memakainya sebagai bawaan tidak memperkenalkan aturan baru.
 */
export async function urutanDariWaktuIsi(periodeId: string, gender: Gender): Promise<Urutan> {
  const { data } = await supabaseAdmin
    .from('ks_pengisian')
    .select('pengajar_id, submitted_at, pengajar:pengajar_id(gender)')
    .eq('periode_id', periodeId)
    .order('submitted_at', { ascending: true });

  const peringkat = new Map<string, number>();
  let n = 0;
  for (const r of (data ?? []) as {
    pengajar_id: string;
    submitted_at: string | null;
    pengajar?: { gender: Gender } | null;
  }[]) {
    if (r.pengajar?.gender !== gender) continue;
    if (!r.submitted_at) continue;
    peringkat.set(r.pengajar_id, ++n);
  }

  return {
    peringkat,
    peringkatSisa: n + 1,
    keterangan: `Urutan waktu pengisian form (${n} pengajar)`,
  };
}

export function peringkatDari(urutan: Urutan, pengajarId: string): number {
  return urutan.peringkat.get(pengajarId) ?? urutan.peringkatSisa;
}
