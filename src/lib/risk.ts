import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskFactor {
  name: string;
  weight: number;
  points: number;
  detail: string;
}

export interface RiskResult {
  score: number; // 0-100
  level: RiskLevel;
  factors: RiskFactor[];
}

function previousYearMonth(offset: number): string {
  const now = new Date();
  now.setMonth(now.getMonth() - offset);
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

/**
 * On-demand risk computation untuk satu pengajar. Pakai React cache supaya
 * pengajar yang sama tidak ulang-query dalam satu request.
 *
 * Faktor & bobot (batch-native HITS — tanpa checkin):
 *   1. Teguran kumulatif (40pt) dari hits_teguran. 0→0, 1→10, 2→25, 3+→40.
 *   2. Trend matrix turun (20pt). rata_rata_keseluruhan bulan ini < bulan lalu.
 *   3. Tabayyun bukan-udzur 3 bulan terakhir (20pt) dari hits_tabayyun. 0→0, 1→10, 2+→20.
 *   4. Matrix rata-rata bulan terakhir < 3.0 (20pt).
 *
 * Level: <30 low, 30-60 medium, >60 high.
 */
export const computeRiskPengajar = cache(async (pengajarId: string): Promise<RiskResult> => {
  const threeMonthsAgo = previousYearMonth(3);

  const [
    { data: matrixSnaps },
    { count: teguranKum },
    { data: tabayyunRecent },
  ] = await Promise.all([
    supabaseAdmin
      .from('matrix_rekap')
      .select('rata_rata_keseluruhan, year_month')
      .eq('pengajar_id', pengajarId)
      .order('year_month', { ascending: false })
      .limit(2),
    supabaseAdmin
      .from('hits_teguran')
      .select('id', { count: 'exact', head: true })
      .eq('pengajar_id', pengajarId),
    supabaseAdmin
      .from('hits_tabayyun')
      .select('is_udzur_syari, decided_at, status')
      .eq('pengajar_id', pengajarId)
      .eq('status', 'decided')
      .gte('decided_at', `${threeMonthsAgo}-01`),
  ]);

  const mNow = matrixSnaps?.[0];
  const mPrev = matrixSnaps?.[1];
  const teguranCount = teguranKum ?? 0;
  const rataMatrix = mNow?.rata_rata_keseluruhan != null ? Number(mNow.rata_rata_keseluruhan) : null;
  const rataPrev = mPrev?.rata_rata_keseluruhan != null ? Number(mPrev.rata_rata_keseluruhan) : null;

  // Factor 1: teguran
  const teguranPts = teguranCount === 0 ? 0 : teguranCount === 1 ? 10 : teguranCount === 2 ? 25 : 40;

  // Factor 2: trend matrix bulan-ke-bulan (delta dinormalisasi ke skala 0-1 atas 4)
  let kehadiranPts = 0;
  let kehadiranDetail = 'tidak ada data';
  if (rataMatrix != null && rataPrev != null) {
    const delta = (rataMatrix - rataPrev) / 4;
    if (delta < -0.15) kehadiranPts = 20;
    else if (delta < -0.05) kehadiranPts = 10;
    kehadiranDetail = `matrix ${rataMatrix.toFixed(2)} vs bulan lalu ${rataPrev.toFixed(2)}`;
  }

  // Factor 3: tabayyun bukan udzur
  const bukanUdzur = (tabayyunRecent ?? []).filter((t) => t.is_udzur_syari === false).length;
  const tabPts = bukanUdzur === 0 ? 0 : bukanUdzur === 1 ? 10 : 20;

  // Factor 4: matrix di bawah standar
  let matrixPts = 0;
  if (rataMatrix != null && rataMatrix < 3.0) matrixPts = 20;
  else if (rataMatrix != null && rataMatrix < 3.5) matrixPts = 10;

  const factors: RiskFactor[] = [
    {
      name: 'Teguran kumulatif',
      weight: 40,
      points: teguranPts,
      detail: `${teguranCount} teguran (${teguranCount >= 3 ? 'kritis — sisa ' + Math.max(0, 4 - teguranCount) + ' lagi → nonaktif' : 'aman'})`,
    },
    { name: 'Trend matrix', weight: 20, points: kehadiranPts, detail: kehadiranDetail },
    {
      name: 'Tabayyun bukan udzur',
      weight: 20,
      points: tabPts,
      detail: `${bukanUdzur} kejadian dalam 3 bulan terakhir`,
    },
    {
      name: 'Rata-rata matrix',
      weight: 20,
      points: matrixPts,
      detail: rataMatrix != null ? `${rataMatrix.toFixed(2)} / 4` : 'belum ada data',
    },
  ];

  const score = factors.reduce((s, f) => s + f.points, 0);
  const level: RiskLevel = score < 30 ? 'low' : score < 60 ? 'medium' : 'high';

  return { score, level, factors };
});

export function levelColor(level: RiskLevel): string {
  if (level === 'high') return 'var(--merah-ink)';
  if (level === 'medium') return 'var(--kuning-ink)';
  return 'var(--hijau-ink)';
}

export function levelLabel(level: RiskLevel): string {
  if (level === 'high') return 'Tinggi';
  if (level === 'medium') return 'Sedang';
  return 'Rendah';
}
