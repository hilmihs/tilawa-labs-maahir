// Pemutihan massal: satu aksi koordinator memutihkan seluruh anggota beberapa
// kelas sekaligus untuk satu periode bulan (window 28–27).
//
// Batch punya identitas sendiri supaya aksi yang salah bisa dicabut sekali klik
// — tanpa itu, membatalkan pemutihan 12 kelas berarti mencabut ratusan baris
// satu per satu. Pembatalan memakai `dibatalkan_pada` yang sudah dipakai
// pemutihan per-orang, jadi Pendataan SP dan laporan bulanan ikut benar tanpa
// kode tambahan.
//
// Modul ini sengaja terpisah dari `maahir-pemutihan.ts`: yang itu urusan satu
// baris, yang ini urusan sekumpulan baris beserta jejaknya.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { periodeStartDate, periodeEndDate } from '@/lib/periode-laporan';
import type { Gender } from '@/types/db';

export type PemutihanBatch = {
  id: string;
  month: string;
  alasan: string | null;
  /** Snapshot id kelas yang dicentang saat batch dibuat. */
  kelasIds: string[];
  jumlahPeserta: number;
  dibuatOleh: string | null;
  createdAt: string;
  dibatalkanPada: string | null;
  dibatalkanOleh: string | null;
};

const COLS =
  'id, month, alasan, kelas_ids, jumlah_peserta, dibuat_oleh, created_at, dibatalkan_pada, dibatalkan_oleh';

function mapRow(r: Record<string, unknown>): PemutihanBatch {
  const raw = r.kelas_ids;
  // pg mengembalikan jsonb sebagai array; pg-shim lama bisa memberi string.
  const kelasIds = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === 'string'
      ? (JSON.parse(raw) as string[])
      : [];
  return {
    id: r.id as string,
    month: r.month as string,
    alasan: (r.alasan as string | null) ?? null,
    kelasIds,
    jumlahPeserta: Number(r.jumlah_peserta ?? 0),
    dibuatOleh: (r.dibuat_oleh as string | null) ?? null,
    createdAt: r.created_at as string,
    dibatalkanPada: (r.dibatalkan_pada as string | null) ?? null,
    dibatalkanOleh: (r.dibatalkan_oleh as string | null) ?? null,
  };
}

/** Riwayat batch — termasuk yang sudah dibatalkan, terbaru dulu. */
export async function getBatches(month?: string): Promise<PemutihanBatch[]> {
  let q = supabaseAdmin.from('maahir_pemutihan_batch').select(COLS);
  if (month) q = q.eq('month', month);
  const { data } = await q;
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map(mapRow)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export type KelasPilihan = {
  id: string;
  name: string;
  gender: Gender;
  /** Anggota yang akan kena bila kelas ini dicentang, untuk periode terpilih. */
  jumlahAnggota: number;
};

/**
 * Kelas beserta jumlah anggota yang relevan untuk periode `month` — dipakai
 * mengisi daftar centang. Anggota yang keanggotaannya tak bersinggungan dengan
 * periode itu (sudah keluar sebelum periode mulai, atau baru masuk sesudahnya)
 * tak ikut dihitung supaya angka di layar sama dengan yang benar-benar diputihkan.
 */
export async function getKelasPilihan(month: string): Promise<KelasPilihan[]> {
  const { data: kelasRows } = await supabaseAdmin
    .from('program_kelas')
    .select('id, name, gender')
    .order('gender')
    .order('name');
  const kelasList = (kelasRows ?? []) as Array<{ id: string; name: string; gender: Gender }>;
  if (!kelasList.length) return [];

  const anggota = await anggotaPeriode(
    month,
    kelasList.map((k) => k.id)
  );
  const jumlahByKelas = new Map<string, number>();
  for (const a of anggota) {
    jumlahByKelas.set(a.kelasId, (jumlahByKelas.get(a.kelasId) ?? 0) + 1);
  }
  return kelasList.map((k) => ({
    id: k.id,
    name: k.name,
    gender: k.gender,
    jumlahAnggota: jumlahByKelas.get(k.id) ?? 0,
  }));
}

type AnggotaRingkas = { id: string; kelasId: string };

/**
 * Anggota aktif yang rentang keanggotaannya bersinggungan dengan periode
 * `month`. Peserta yang sudah keluar sebelum periode dimulai — atau baru
 * bergabung setelah periode berakhir — tak ikut diputihkan.
 */
async function anggotaPeriode(month: string, kelasIds: string[]): Promise<AnggotaRingkas[]> {
  if (!kelasIds.length) return [];
  const mulai = periodeStartDate(month);
  const akhir = periodeEndDate(month);
  const { data } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, mulai_tanggal, selesai_tanggal')
    .in('program_kelas_id', kelasIds)
    .eq('active', true);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((a) => {
      const m = (a.mulai_tanggal as string | null) ?? null;
      const s = (a.selesai_tanggal as string | null) ?? null;
      if (m && m > akhir) return false;
      if (s && s < mulai) return false;
      return true;
    })
    .map((a) => ({ id: a.id as string, kelasId: a.program_kelas_id as string }));
}

export type BuatBatchHasil = {
  batchId?: string;
  /** Baris pemutihan yang benar-benar dibuat. */
  dibuat: number;
  /** Peserta yang sudah punya pemutihan sebulan-penuh aktif — dilewati. */
  dilewati: number;
  error?: string;
};

/**
 * Putihkan seluruh anggota kelas terpilih untuk satu periode bulan.
 *
 * Peserta yang sudah punya pemutihan sebulan-penuh aktif DILEWATI, bukan
 * ditimpa: alasan yang ditulis koordinator sebelumnya tak boleh hilang diam-diam,
 * dan pembatalan batch nanti hanya boleh mencabut baris yang benar-benar dibuat
 * batch ini.
 */
export async function buatBatch(opts: {
  month: string;
  kelasIds: string[];
  alasan: string | null;
  oleh: string | null;
}): Promise<BuatBatchHasil> {
  const { month, kelasIds, alasan, oleh } = opts;
  if (!/^\d{4}-\d{2}$/.test(month)) return { dibuat: 0, dilewati: 0, error: 'Periode tidak sah.' };
  if (!kelasIds.length) return { dibuat: 0, dilewati: 0, error: 'Belum ada kelas yang dipilih.' };

  // Tolak id kelas yang tak dikenal, jangan diam-diam mengabaikannya — kalau
  // separuh pilihan hilang, koordinator berhak tahu sebelum ratusan baris dibuat.
  const { data: kelasAda } = await supabaseAdmin
    .from('program_kelas')
    .select('id')
    .in('id', kelasIds);
  if ((kelasAda ?? []).length !== kelasIds.length) {
    return { dibuat: 0, dilewati: 0, error: 'Ada kelas yang tidak dikenal.' };
  }

  const anggota = await anggotaPeriode(month, kelasIds);
  if (!anggota.length) {
    return { dibuat: 0, dilewati: 0, error: 'Tak ada anggota pada kelas terpilih untuk periode ini.' };
  }

  const { data: sudahRows } = await supabaseAdmin
    .from('maahir_pemutihan')
    .select('anggota_id')
    .eq('month', month)
    .is('tanggal', null)
    .is('dibatalkan_pada', null)
    .in(
      'anggota_id',
      anggota.map((a) => a.id)
    );
  const sudah = new Set((sudahRows ?? []).map((r) => r.anggota_id as string));
  const sasaran = anggota.filter((a) => !sudah.has(a.id));
  const dilewati = anggota.length - sasaran.length;
  if (!sasaran.length) {
    return { dibuat: 0, dilewati, error: 'Semua peserta pada kelas terpilih sudah diputihkan.' };
  }

  const { data: batchRow, error: batchErr } = await supabaseAdmin
    .from('maahir_pemutihan_batch')
    .insert({
      month,
      alasan,
      kelas_ids: kelasIds,
      jumlah_peserta: 0,
      dibuat_oleh: oleh,
    })
    .select('id')
    .maybeSingle();
  if (batchErr || !batchRow?.id) {
    return { dibuat: 0, dilewati, error: batchErr?.message ?? 'Gagal membuat batch.' };
  }
  const batchId = batchRow.id as string;

  const { error: insErr } = await supabaseAdmin.from('maahir_pemutihan').insert(
    sasaran.map((a) => ({
      anggota_id: a.id,
      month,
      tanggal: null,
      alasan,
      dibuat_oleh: oleh,
      batch_id: batchId,
    }))
  );
  if (insErr) {
    // Jangan tinggalkan batch yatim yang mengklaim pemutihan yang tak pernah ada.
    await supabaseAdmin
      .from('maahir_pemutihan_batch')
      .update({ dibatalkan_pada: new Date().toISOString(), dibatalkan_oleh: oleh })
      .eq('id', batchId);
    return { dibuat: 0, dilewati, error: insErr.message };
  }

  await supabaseAdmin
    .from('maahir_pemutihan_batch')
    .update({ jumlah_peserta: sasaran.length })
    .eq('id', batchId);

  return { batchId, dibuat: sasaran.length, dilewati };
}

/**
 * Batalkan satu batch beserta seluruh baris pemutihannya. Barisnya tak dihapus
 * — hanya ditandai, supaya Pendataan SP tetap menyimpan jejak siapa pernah
 * diputihkan, oleh siapa, dan kapan dicabut.
 */
export async function batalkanBatch(id: string, oleh: string | null): Promise<{ error?: string }> {
  const pada = new Date().toISOString();
  const { error: barisErr } = await supabaseAdmin
    .from('maahir_pemutihan')
    .update({ dibatalkan_pada: pada, dibatalkan_oleh: oleh })
    .eq('batch_id', id)
    .is('dibatalkan_pada', null);
  if (barisErr) return { error: barisErr.message };

  const { error } = await supabaseAdmin
    .from('maahir_pemutihan_batch')
    .update({ dibatalkan_pada: pada, dibatalkan_oleh: oleh })
    .eq('id', id)
    .is('dibatalkan_pada', null);
  return error ? { error: error.message } : {};
}
