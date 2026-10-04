// Query sisi server untuk blok ranking Matrix Skill Guru. Dipisah dari
// `matrix-blok.ts` supaya file itu tetap aman diimpor komponen client.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { anggotaAktifPada, todayJakarta } from '@/lib/anggota-periode';
import {
  blokDariJenis,
  isMatrixBlok,
  jenisKelasMaahir,
  type JenisKelasMaahir,
  type MatrixBlok,
} from '@/lib/matrix-blok';
import type { Gender } from '@/types/db';

/**
 * Tanggal acuan keanggotaan untuk satu bulan matrix: akhir bulan itu, tapi tak
 * pernah melewati hari ini. Bulan berjalan memakai hari ini (kalau tidak,
 * seseorang yang keluar kelas pertengahan bulan tetap terhitung), bulan lampau
 * memakai akhir bulannya supaya bloknya tak berubah oleh mutasi setelahnya.
 */
export function acuanTanggalBlok(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const akhirBulan = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const kini = todayJakarta();
  return akhirBulan < kini ? akhirBulan : kini;
}

/**
 * Blok tiap pengajar, di-link ke `program_kelas_anggota` lewat nomor WA —
 * sama seperti sumber kehadiran di `matrix-compute.ts`. Pengajar tanpa WA
 * yang cocok masuk blok 'tanpa_kelas'.
 */
export async function getBlokPengajar(
  pengajar: ReadonlyArray<{ id: string; whatsapp_number: string | null }>,
  pada: string
): Promise<Map<string, MatrixBlok>> {
  const hasil = new Map<string, MatrixBlok>();
  if (!pengajar.length) return hasil;

  const { data: kelasList } = await supabaseAdmin.from('program_kelas').select('id, name');
  const jenisKelas = new Map<string, JenisKelasMaahir>(
    (kelasList ?? []).map((k) => [k.id as string, jenisKelasMaahir(k.name as string)])
  );

  const { data: anggotaList } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('program_kelas_id, whatsapp_number, mulai_tanggal, selesai_tanggal')
    .eq('active', true);

  const jenisByWa = new Map<string, Set<JenisKelasMaahir>>();
  for (const a of anggotaList ?? []) {
    const wa = a.whatsapp_number as string | null;
    if (!wa) continue;
    if (!anggotaAktifPada(a, pada)) continue;
    const jenis = jenisKelas.get(a.program_kelas_id as string);
    if (!jenis) continue;
    const set = jenisByWa.get(wa) ?? new Set<JenisKelasMaahir>();
    set.add(jenis);
    jenisByWa.set(wa, set);
  }

  const kosong = new Set<JenisKelasMaahir>();
  for (const pg of pengajar) {
    const set = pg.whatsapp_number ? jenisByWa.get(pg.whatsapp_number) : undefined;
    hasil.set(pg.id, blokDariJenis(set ?? kosong));
  }
  return hasil;
}

/**
 * Blok akhwat — DIBACA dari `pengajar.matrix_blok`, bukan diturunkan dari
 * kelas. Alasannya di `matrix-blok.ts`: nama kelas akhwat tak memisahkan
 * Tahfidz dari Alumni/Talaqqi, dan kategori Takhashush & Koordinator tak punya
 * padanan kelas. Nilai yang tak dikenal (atau NULL) tak dimasukkan ke peta,
 * jadi orangnya jatuh ke blok 'tanpa_kelas' di tampilan.
 */
export async function getBlokTersimpan(
  pengajarIds: readonly string[]
): Promise<Map<string, MatrixBlok>> {
  const hasil = new Map<string, MatrixBlok>();
  if (!pengajarIds.length) return hasil;

  const { data } = await supabaseAdmin
    .from('pengajar')
    .select('id, matrix_blok')
    .in('id', [...pengajarIds]);

  for (const row of data ?? []) {
    const b = row.matrix_blok;
    if (isMatrixBlok(b)) hasil.set(row.id as string, b);
  }
  return hasil;
}

/**
 * Satu pintu untuk kedua gender: ikhwan diturunkan dari kelas, akhwat dibaca
 * dari kolom. Dipakai halaman matrix & unduhan XLSX supaya keduanya tak pernah
 * memakai aturan yang berbeda.
 */
export async function getBlokMatrix(
  pengajar: ReadonlyArray<{ id: string; gender: Gender; whatsapp_number: string | null }>,
  yearMonth: string
): Promise<Map<string, MatrixBlok>> {
  const ikhwan = pengajar.filter((p) => p.gender === 'ikhwan');
  const akhwat = pengajar.filter((p) => p.gender === 'akhwat');

  const [dariKelas, tersimpan] = await Promise.all([
    ikhwan.length
      ? getBlokPengajar(ikhwan, acuanTanggalBlok(yearMonth))
      : new Map<string, MatrixBlok>(),
    getBlokTersimpan(akhwat.map((p) => p.id)),
  ]);

  return new Map([...dariKelas, ...tersimpan]);
}
