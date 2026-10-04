// Rekap satu sesi evaluasi: SATU tabel semua peserta beserta rincian lahn-nya.
//
// Layar Ringkasan hanya memuat skor per peserta; lembar rapot A4 memuat satu
// peserta per halaman. Pengajar yang ingin melihat "siapa salah apa" dalam satu
// sesi harus membuka peserta satu per satu. Modul ini menyusun tabelnya —
// dipakai layar RekapSesi (cetak/PDF) dan unduhan XLSX (`/api/evaluasi/rekap`).
//
// Murni: tak menyentuh DB, supaya bisa diuji (`scripts/test-evaluasi-rekap-sesi.ts`)
// dan dipakai di klien (state `work` yang masih hidup) maupun server (baris
// `evaluasi_nilai` yang sudah tersimpan).
import {
  ALL_LAHN, JALIY, KHAFIY, AMBANG, scoreOf, tierOf, emptyCounts,
  type Jenis, type LahnCounts,
} from '@/lib/evaluasi';

export interface RekapPesertaInput {
  id: string;
  nama: string;
}

/** Nilai satu peserta di satu sesi — bentuk minimum yang dibutuhkan rekap. */
export interface RekapNilaiInput {
  counts: LahnCounts;
  hadir: boolean;
  done: boolean;
  catatan: string;
}

export interface BarisRekap {
  id: string;
  nama: string;
  /** 'hadir' = dinilai, 'belum' = hadir tapi belum dinilai, 'absen' = tidak hadir. */
  status: 'hadir' | 'belum' | 'absen';
  counts: LahnCounts;
  jaliy: number;
  khafiy: number;
  /** null bila tidak dinilai (absen/belum). */
  skor: number | null;
  tier: string | null;
  catatan: string;
}

export interface RekapSesi {
  baris: BarisRekap[];
  /** Ringkasan hanya dari peserta yang dinilai. */
  dinilai: number;
  absen: number;
  belum: number;
  rata: number | null;
  standar: number;
  bawah: number;
  /** Total kesalahan per kunci lahn (kolom paling bawah tabel). */
  totalCounts: LahnCounts;
}

/** Kolom rincian dalam urutan tampil: 4 jaliy, lalu 7 khafiy. */
export const KOLOM_REKAP = ALL_LAHN;
export const KOLOM_JALIY = JALIY;
export const KOLOM_KHAFIY = KHAFIY;

/** Label pendek kolom untuk kepala tabel yang sempit ("Huruf", "Idgham Mimi"). */
export function labelPendek(label: string): string {
  return label.replace(/^JK\.\s*/i, '').replace(/^J\.\s*/i, '');
}

export function labelSesi(
  jenis: Jenis,
  nomor: number,
  namaTrack: (t: 'qn' | 'pb') => string,
): string {
  if (jenis === 'ujian') return nomor === 1 ? `Ujian ${namaTrack('qn')}` : nomor === 2 ? `Ujian ${namaTrack('pb')}` : `Ujian ${nomor}`;
  return `${namaTrack(jenis)} — Sesi ${nomor}`;
}

/**
 * Susun tabel rekap satu sesi. `nilai` boleh tak memuat semua peserta: yang
 * tak ada dianggap hadir tapi belum dinilai (sama seperti `defaultWork` di
 * layar pengajar), bukan absen — absen adalah keputusan eksplisit pengajar.
 */
export function susunRekapSesi(
  peserta: RekapPesertaInput[],
  nilai: Map<string, RekapNilaiInput> | Record<string, RekapNilaiInput>,
  ambang: number = AMBANG,
): RekapSesi {
  const ambil = (id: string): RekapNilaiInput | undefined =>
    nilai instanceof Map ? nilai.get(id) : nilai[id];

  const totalCounts = emptyCounts();
  const baris: BarisRekap[] = peserta.map((p) => {
    const n = ambil(p.id);
    const counts = n?.counts ?? emptyCounts();
    const status: BarisRekap['status'] = !n || n.hadir ? (n?.done ? 'hadir' : 'belum') : 'absen';
    const sc = scoreOf(counts);
    if (status === 'hadir') for (const d of ALL_LAHN) totalCounts[d.key] += counts[d.key] || 0;
    return {
      id: p.id,
      nama: p.nama,
      status,
      counts,
      jaliy: sc.jaliyCount,
      khafiy: sc.khafiyCount,
      skor: status === 'hadir' ? sc.skor : null,
      tier: status === 'hadir' ? tierOf(sc.skor).label : null,
      catatan: n?.catatan?.trim() ?? '',
    };
  });

  const skorList = baris.filter((b) => b.skor != null).map((b) => b.skor as number);
  const rata = skorList.length
    ? Math.round(skorList.reduce((a, b) => a + b, 0) / skorList.length)
    : null;
  return {
    baris,
    dinilai: skorList.length,
    absen: baris.filter((b) => b.status === 'absen').length,
    belum: baris.filter((b) => b.status === 'belum').length,
    rata,
    standar: skorList.filter((x) => x >= ambang).length,
    bawah: skorList.filter((x) => x < ambang).length,
    totalCounts,
  };
}
