// Target setoran hafalan peserta Takhassus — diisi koordinator, dipakai Laporan
// Bulanan untuk menghitung persentase capaian.
//
// Target disimpan sebagai HALAMAN PER BULAN, satu angka bulat per periode
// laporan (window 28–27). Penyebut capaian adalah angka itu sendiri: tidak
// dikalikan jumlah sesi, tidak dipotong sakit, tidak dipotong libur. Peserta
// dituntut menyelesaikan sekian halaman dalam sebulan, bagaimanapun ia membagi
// hari-harinya — dan koordinator ingin angka yang ia setel muncul apa adanya di
// laporan. Yang tetap membatalkan target: pemutihan sebulan penuh, dan periode
// yang seluruhnya di luar masa keanggotaan peserta (lihat `laporan-maahir.ts`).
//
// Dua bentuk, dibedakan kolom `anggota_id`:
//   anggota_id = NULL  → default seluruh kelas
//   anggota_id terisi  → koreksi satu peserta, menang atas default kelasnya
//
// Perubahan target TIDAK meng-update baris: koordinator menambah versi baru
// dengan `berlaku_mulai` lain. Periode yang sudah dilaporkan tetap memakai
// target yang berlaku saat itu, dan riwayat perubahannya terbaca dari tabelnya
// sendiri.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { periodeBerjalan, periodeStartDate } from '@/lib/periode-laporan';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tanggal berlaku yang boleh dipakai peserta & ketua kelas: awal periode
 * berjalan (window 28–27).
 *
 * Target dipasang oleh pihak yang juga dinilai olehnya, jadi tanggal berlakunya
 * dikunci ke depan — tanpa itu, menurunkan target di akhir bulan akan
 * memperbaiki capaian bulan yang sudah berjalan. Koordinator tetap bebas
 * memilih tanggal, termasuk mundur, lewat halaman /koordinator/target-setoran.
 */
export function berlakuPeriodeBerjalan(): string {
  return periodeStartDate(periodeBerjalan());
}

/** Batas atas kewajaran — menahan salah ketik (mis. 800 alih-alih 80). */
const MAX_HALAMAN_PER_BULAN = 400;

export type SetoranTarget = {
  id: string;
  programKelasId: string;
  /** null = default seluruh kelas. */
  anggotaId: string | null;
  halamanPerBulan: number;
  berlakuMulai: string; // 'YYYY-MM-DD'
  catatan: string | null;
  dibuatOleh: string | null;
  createdAt: string;
};

const COLS =
  'id, program_kelas_id, anggota_id, halaman_per_bulan, berlaku_mulai, catatan, dibuat_oleh, created_at';

function mapRow(r: Record<string, unknown>): SetoranTarget {
  return {
    id: r.id as string,
    programKelasId: r.program_kelas_id as string,
    anggotaId: (r.anggota_id as string | null) ?? null,
    // numeric → number lewat type parser di pg-core.ts; String() jaga-jaga bila
    // suatu saat parser itu hilang, supaya tak diam-diam jadi penggabungan teks.
    halamanPerBulan: Number(r.halaman_per_bulan),
    berlakuMulai: r.berlaku_mulai as string,
    catatan: (r.catatan as string | null) ?? null,
    dibuatOleh: (r.dibuat_oleh as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Semua versi target untuk kelas-kelas ini, urut `berlaku_mulai` menaik. */
export async function getSetoranTargets(kelasIds: string[]): Promise<SetoranTarget[]> {
  if (kelasIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('maahir_setoran_target')
    .select(COLS)
    .in('program_kelas_id', kelasIds);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map(mapRow)
    .sort((a, b) => (a.berlakuMulai < b.berlakuMulai ? -1 : a.berlakuMulai > b.berlakuMulai ? 1 : 0));
}

/**
 * Resolver murni: berapa halaman/bulan yang berlaku untuk seorang peserta pada
 * satu tanggal. Koreksi peserta menang atas default kelas; di antara versi,
 * yang `berlaku_mulai <= tanggal` dan paling akhir yang dipakai.
 *
 * Tetap per-tanggal meski satuannya bulanan: `berlaku_mulai` boleh jatuh di
 * tengah periode, jadi pemanggil harus memutuskan sendiri tanggal mana yang
 * mewakili periodenya (`laporan-maahir.ts` memakai sesi terakhir yang ditagih).
 *
 * null = belum diatur. Pemanggil harus memperlakukannya sebagai "tak ada
 * target", bukan nol — laporan menampilkan '—' alih-alih 0%.
 */
export function targetResolver(
  rows: SetoranTarget[]
): (kelasId: string, anggotaId: string, tanggal: string) => number | null {
  const perOrang = new Map<string, SetoranTarget[]>();
  const perKelas = new Map<string, SetoranTarget[]>();
  for (const r of rows) {
    const bucket = r.anggotaId ? perOrang : perKelas;
    const key = r.anggotaId ? `${r.programKelasId}|${r.anggotaId}` : r.programKelasId;
    const arr = bucket.get(key) ?? [];
    arr.push(r);
    bucket.set(key, arr);
  }
  // getSetoranTargets sudah mengurutkan menaik; urutkan lagi supaya resolver
  // tetap benar bila dipanggil dengan larik yang disusun pemanggil lain.
  const menaik = (a: SetoranTarget, b: SetoranTarget) =>
    a.berlakuMulai < b.berlakuMulai ? -1 : a.berlakuMulai > b.berlakuMulai ? 1 : 0;
  for (const arr of perOrang.values()) arr.sort(menaik);
  for (const arr of perKelas.values()) arr.sort(menaik);

  const berlaku = (arr: SetoranTarget[] | undefined, tanggal: string): number | null => {
    if (!arr) return null;
    let hit: SetoranTarget | null = null;
    for (const r of arr) {
      if (r.berlakuMulai > tanggal) break;
      hit = r;
    }
    return hit ? hit.halamanPerBulan : null;
  };

  return (kelasId, anggotaId, tanggal) => {
    const koreksi = berlaku(perOrang.get(`${kelasId}|${anggotaId}`), tanggal);
    if (koreksi !== null) return koreksi;
    return berlaku(perKelas.get(kelasId), tanggal);
  };
}

/**
 * Simpan satu versi target. Indeks uniknya memakai NULLS NOT DISTINCT yang tak
 * bisa disetir `ON CONFLICT` lewat pg-shim, jadi baris yang sudah ada dicari
 * dulu lalu diperbarui — pola yang sama dipakai `simpanSatu` di
 * `maahir-pemutihan.ts`.
 */
export async function simpanTarget(input: {
  programKelasId: string;
  anggotaId: string | null;
  halamanPerBulan: number;
  berlakuMulai: string;
  catatan: string | null;
  dibuatOleh: string | null;
}): Promise<{ error?: string }> {
  const { programKelasId, anggotaId, halamanPerBulan, berlakuMulai, catatan, dibuatOleh } = input;

  if (!Number.isFinite(halamanPerBulan) || halamanPerBulan <= 0) {
    return { error: 'Target harus lebih dari 0 halaman/bulan.' };
  }
  if (halamanPerBulan > MAX_HALAMAN_PER_BULAN) {
    return { error: `Target di atas ${MAX_HALAMAN_PER_BULAN} halaman/bulan — periksa lagi angkanya.` };
  }
  if (!DATE_RE.test(berlakuMulai)) return { error: 'Tanggal berlaku tidak sah.' };

  const { data: kelas } = await supabaseAdmin
    .from('program_kelas')
    .select('id')
    .eq('id', programKelasId)
    .maybeSingle();
  if (!kelas?.id) return { error: 'Kelas tidak dikenal.' };

  if (anggotaId) {
    // Koreksi hanya boleh menempel pada peserta kelas itu sendiri; kalau tidak,
    // targetnya tak akan pernah terpakai dan diam-diam jadi baris mati.
    const { data: anggota } = await supabaseAdmin
      .from('program_kelas_anggota')
      .select('id, program_kelas_id')
      .eq('id', anggotaId)
      .maybeSingle();
    if (!anggota?.id) return { error: 'Peserta tidak dikenal.' };
    if ((anggota.program_kelas_id as string) !== programKelasId) {
      return { error: 'Peserta itu bukan anggota kelas tersebut.' };
    }
  }

  let cari = supabaseAdmin
    .from('maahir_setoran_target')
    .select('id')
    .eq('program_kelas_id', programKelasId)
    .eq('berlaku_mulai', berlakuMulai);
  cari = anggotaId === null ? cari.is('anggota_id', null) : cari.eq('anggota_id', anggotaId);
  const { data: ada } = await cari.maybeSingle();

  if (ada?.id) {
    const { error } = await supabaseAdmin
      .from('maahir_setoran_target')
      .update({ halaman_per_bulan: halamanPerBulan, catatan, dibuat_oleh: dibuatOleh })
      .eq('id', ada.id as string);
    return error ? { error: error.message } : {};
  }

  const { error } = await supabaseAdmin.from('maahir_setoran_target').insert({
    program_kelas_id: programKelasId,
    anggota_id: anggotaId,
    halaman_per_bulan: halamanPerBulan,
    berlaku_mulai: berlakuMulai,
    catatan,
    dibuat_oleh: dibuatOleh,
  });
  return error ? { error: error.message } : {};
}

/**
 * Hapus satu versi. Beda dari pemutihan, target dihapus betulan: ia bukan
 * catatan tindakan atas seseorang, hanya angka acuan — dan versi yang salah
 * ketik lebih baik lenyap daripada mengotori riwayat.
 */
export async function hapusTarget(id: string): Promise<{ error?: string }> {
  if (!id) return { error: 'Target tidak ditemukan.' };
  const { error } = await supabaseAdmin.from('maahir_setoran_target').delete().eq('id', id);
  return error ? { error: error.message } : {};
}
