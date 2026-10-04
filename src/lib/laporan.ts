/**
 * Aggregator laporan bulanan.
 *
 * Aturan cutoff bulan:
 *   Sebuah cycle (2-pekan, Senin–Minggu+1pekan) masuk ke bulan X jika
 *   `cycle_end (= cycle_start + 13 hari)` jatuh di bulan X.
 *
 * Contoh:
 *   - cycle 18 Mei – 31 Mei  → end di Mei  → masuk Mei
 *   - cycle 1 Juni – 14 Juni → end di Juni → masuk Juni
 *   - cycle 29 Juni – 12 Juli → end di Juli → masuk Juli (spillover ke bulan berikutnya)
 *
 * Skala 0–4 untuk Matrix Skill Tajwid:
 *   per rekaman: hijau=4, kuning=2.5, merah=1
 *   per peserta: avg semua rekaman bernilai pada cycle-cycle bulan ini.
 *   bucket:
 *     0 = tidak ada rekaman bernilai sama sekali bulan ini
 *     1 = avg < 1.75
 *     2 = 1.75 ≤ avg < 2.5
 *     3 = 2.5  ≤ avg < 3.25
 *     4 = avg ≥ 3.25
 *
 * Spreadsheet Matrix menampilkan kolom Avg (1 desimal) + kolom Bucket
 * supaya threshold bisa dikalibrasi.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  cyclesInMonth,
  CYCLE_LENGTH_DAYS,
  MONTHLY_SWITCH,
  CYCLE_ANCHOR,
  cycleStartOf,
  cycleEndOf,
} from '@/lib/week';
import {
  JENIS_REKAMAN,
  type Gender,
  type JenisRekaman,
  type NilaiRekaman,
} from '@/types/db';

const NILAI_SCORE: Record<NilaiRekaman, number> = {
  hijau: 4,
  kuning: 2.5,
  merah: 1,
};

export const NILAI_SCORE_MAP = NILAI_SCORE;

export interface MonthlyReport {
  bulan: string; // "Juni 2026"
  year: number;
  month: number; // 1-12
  gender: Gender;
  cycles: string[]; // cycle_start ISO untuk semua cycle yang masuk bulan ini
  totalPeserta: number;
  jumlahPesertaSetor: number;
  jumlahPesertaTidakSetor: number;
  persentaseSetor: number; // %
  persentaseTidakSetor: number; // %
  pesertaTidakSetor: Array<{
    id: string;
    name: string;
    kelas: string;
    jumlahDilewatkan: number; // dari total cycle bulan ini
  }>;
  nilaiPerJenis: Record<JenisRekaman, {
    total: number;
    hijau: number;
    kuning: number;
    merah: number;
    persenHijau: number;
    persenKuning: number;
    persenMerah: number;
  }>;
  keaktifanMusyrif: Array<{
    id: string;
    name: string;
    totalRekamanPeserta: number;
    dicek: number;
    persentaseDicek: number;
  }>;
  matrixSkill: Array<{
    id: string;
    name: string;
    kelas: string;
    cycleSetor: number;
    cycleTotal: number;
    avg: number; // 0 jika tidak ada nilai
    bucket: 0 | 1 | 2 | 3 | 4;
  }>;
}

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/**
 * Cycle-cycle yang berakhir di bulan tertentu.
 *
 * Dulu dihitung ulang di sini dengan langkah 14 hari. Sejak barnamij 2in1
 * jadi bulanan (28 → 27), panjang cycle tidak lagi tetap, jadi aturannya
 * dipusatkan di `@/lib/week` supaya tidak ada dua versi yang bisa berbeda.
 */
export { cyclesInMonth };

export function bucketFromAvg(avg: number, hasData: boolean): 0 | 1 | 2 | 3 | 4 {
  if (!hasData) return 0;
  if (avg < 1.75) return 1;
  if (avg < 2.5) return 2;
  if (avg < 3.25) return 3;
  return 4;
}

export async function generateMonthlyReport(
  year: number,
  month: number,
  gender: Gender
): Promise<MonthlyReport> {
  const cycles = cyclesInMonth(year, month);

  // ----- ambil peserta gender ini (aktif) + kelas -----
  const { data: kelasList } = await supabaseAdmin
    .from('kelas')
    .select('id, name, musyrif:musyrif_id(id, name)')
    .eq('gender', gender);
  const kelasById = new Map(
    (kelasList ?? []).map((k) => [
      k.id,
      k as unknown as { id: string; name: string; musyrif: { id: string; name: string } },
    ])
  );

  const { data: pesertaList } = await supabaseAdmin
    .from('peserta')
    .select('id, name, kelas_id')
    .eq('gender', gender)
    .eq('active', true)
    .order('name');
  const peserta = pesertaList ?? [];

  // ----- ambil setoran di cycle-cycle ini -----
  const pesertaIds = peserta.map((p) => p.id);
  const { data: setoranList } =
    pesertaIds.length === 0 || cycles.length === 0
      ? { data: [] as Array<{ id: string; peserta_id: string; week_start: string; status: string }> }
      : await supabaseAdmin
          .from('setoran')
          .select('id, peserta_id, week_start, status')
          .in('peserta_id', pesertaIds)
          .in('week_start', cycles);
  const setorByPeserta = new Map<string, Array<{ id: string; status: string; week_start: string }>>();
  for (const st of setoranList ?? []) {
    const arr = setorByPeserta.get(st.peserta_id) ?? [];
    arr.push({ id: st.id, status: st.status, week_start: st.week_start });
    setorByPeserta.set(st.peserta_id, arr);
  }

  const setoranIds = (setoranList ?? []).map((s) => s.id);
  const { data: rekamanList } =
    setoranIds.length === 0
      ? { data: [] as Array<{ setoran_id: string; jenis: string; nilai: string | null; checked_at: string | null }> }
      : await supabaseAdmin
          .from('rekaman')
          .select('setoran_id, jenis, nilai, checked_at')
          .in('setoran_id', setoranIds);
  const rekamanBySetoran = new Map<string, Array<{ jenis: JenisRekaman; nilai: NilaiRekaman | null; checked: boolean }>>();
  for (const r of rekamanList ?? []) {
    const arr = rekamanBySetoran.get(r.setoran_id) ?? [];
    arr.push({
      jenis: r.jenis as JenisRekaman,
      nilai: r.nilai as NilaiRekaman | null,
      checked: r.checked_at !== null,
    });
    rekamanBySetoran.set(r.setoran_id, arr);
  }

  // ----- hitung per peserta -----
  let jumlahPesertaSetor = 0;
  const pesertaTidakSetor: MonthlyReport['pesertaTidakSetor'] = [];
  const matrixSkill: MonthlyReport['matrixSkill'] = [];

  for (const p of peserta) {
    const setoranListP = setorByPeserta.get(p.id) ?? [];
    const cycleSetor = setoranListP.length;
    if (cycleSetor > 0) jumlahPesertaSetor++;
    else {
      pesertaTidakSetor.push({
        id: p.id,
        name: p.name,
        kelas: kelasById.get(p.kelas_id)?.name ?? '-',
        jumlahDilewatkan: cycles.length,
      });
    }

    // avg numerik untuk matrix skill
    let scoreSum = 0;
    let scoreCount = 0;
    for (const st of setoranListP) {
      const recs = rekamanBySetoran.get(st.id) ?? [];
      for (const r of recs) {
        if (r.nilai) {
          scoreSum += NILAI_SCORE[r.nilai];
          scoreCount++;
        }
      }
    }
    const avg = scoreCount > 0 ? scoreSum / scoreCount : 0;
    const bucket = bucketFromAvg(avg, scoreCount > 0);
    matrixSkill.push({
      id: p.id,
      name: p.name,
      kelas: kelasById.get(p.kelas_id)?.name ?? '-',
      cycleSetor,
      cycleTotal: cycles.length,
      avg: Math.round(avg * 10) / 10,
      bucket,
    });
  }

  // List peserta yang setor tapi tidak penuh: berapa cycle yang dilewatkan
  for (const p of peserta) {
    if (pesertaTidakSetor.find((x) => x.id === p.id)) continue;
    const setoranListP = setorByPeserta.get(p.id) ?? [];
    if (setoranListP.length < cycles.length) {
      pesertaTidakSetor.push({
        id: p.id,
        name: p.name,
        kelas: kelasById.get(p.kelas_id)?.name ?? '-',
        jumlahDilewatkan: cycles.length - setoranListP.length,
      });
    }
  }
  // Sort: paling banyak dilewatkan dulu
  pesertaTidakSetor.sort((a, b) => b.jumlahDilewatkan - a.jumlahDilewatkan);

  const jumlahPesertaTidakSetor = peserta.length - jumlahPesertaSetor;
  const persentaseSetor = peserta.length
    ? Math.round((jumlahPesertaSetor / peserta.length) * 1000) / 10
    : 0;
  const persentaseTidakSetor = peserta.length
    ? Math.round((jumlahPesertaTidakSetor / peserta.length) * 1000) / 10
    : 0;

  // ----- breakdown nilai per jenis -----
  const nilaiPerJenis = {} as MonthlyReport['nilaiPerJenis'];
  for (const j of JENIS_REKAMAN) {
    nilaiPerJenis[j] = { total: 0, hijau: 0, kuning: 0, merah: 0, persenHijau: 0, persenKuning: 0, persenMerah: 0 };
  }
  for (const recs of rekamanBySetoran.values()) {
    for (const r of recs) {
      if (!r.nilai) continue;
      nilaiPerJenis[r.jenis].total++;
      nilaiPerJenis[r.jenis][r.nilai]++;
    }
  }
  for (const j of JENIS_REKAMAN) {
    const t = nilaiPerJenis[j].total;
    if (t > 0) {
      nilaiPerJenis[j].persenHijau = Math.round((nilaiPerJenis[j].hijau / t) * 1000) / 10;
      nilaiPerJenis[j].persenKuning = Math.round((nilaiPerJenis[j].kuning / t) * 1000) / 10;
      nilaiPerJenis[j].persenMerah = Math.round((nilaiPerJenis[j].merah / t) * 1000) / 10;
    }
  }

  // ----- keaktifan musyrif -----
  const musyrifMap = new Map<string, { id: string; name: string }>();
  for (const k of kelasList ?? []) {
    const m = (k as unknown as { musyrif: { id: string; name: string } }).musyrif;
    if (m?.id) musyrifMap.set(m.id, m);
  }
  // mapping peserta → musyrif via kelas
  const pesertaToMusyrif = new Map<string, string>();
  for (const p of peserta) {
    const k = kelasById.get(p.kelas_id);
    if (k?.musyrif?.id) pesertaToMusyrif.set(p.id, k.musyrif.id);
  }
  const musyrifCounter = new Map<string, { total: number; dicek: number }>();
  for (const m of musyrifMap.values()) {
    musyrifCounter.set(m.id, { total: 0, dicek: 0 });
  }
  for (const st of setoranList ?? []) {
    const mId = pesertaToMusyrif.get(st.peserta_id);
    if (!mId) continue;
    const recs = rekamanBySetoran.get(st.id) ?? [];
    for (const r of recs) {
      const c = musyrifCounter.get(mId)!;
      c.total++;
      if (r.checked) c.dicek++;
    }
  }
  const keaktifanMusyrif = Array.from(musyrifMap.values()).map((m) => {
    const c = musyrifCounter.get(m.id)!;
    const persentaseDicek = c.total
      ? Math.round((c.dicek / c.total) * 1000) / 10
      : 0;
    return {
      id: m.id,
      name: m.name,
      totalRekamanPeserta: c.total,
      dicek: c.dicek,
      persentaseDicek,
    };
  });
  keaktifanMusyrif.sort((a, b) => b.persentaseDicek - a.persentaseDicek);

  return {
    bulan: `${BULAN_ID[month - 1]} ${year}`,
    year,
    month,
    gender,
    cycles,
    totalPeserta: peserta.length,
    jumlahPesertaSetor,
    jumlahPesertaTidakSetor,
    persentaseSetor,
    persentaseTidakSetor,
    pesertaTidakSetor,
    nilaiPerJenis,
    keaktifanMusyrif,
    matrixSkill,
  };
}

export function bulanLabel(year: number, month: number): string {
  return `${BULAN_ID[month - 1]} ${year}`;
}

// Re-export konstanta cycle untuk audit / debug. `MONTHLY_SWITCH` ikut karena
// sejak tanggal itu panjang cycle tidak lagi 14 hari.
export { CYCLE_LENGTH_DAYS, CYCLE_ANCHOR, MONTHLY_SWITCH };
