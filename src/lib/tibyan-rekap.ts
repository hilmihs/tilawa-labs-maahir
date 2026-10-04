import { getMaahirRekap, type RekapKelas } from './maahir-rekap';

// View kehadiran At-Tibyan (kajian Sabtu) per kelas + insight turunan.
// Semua angka berbasis rekap At-Tibyan-only (getMaahirRekap program:'at_tibyan').

export const TIBYAN_TARGET_PERSEN = 80; // di bawah ini → "perlu perhatian"

export interface TibyanKpi {
  overallPersen: number | null;
  totalSesi: number; // jumlah tanggal Sabtu berbeda yang sudah terisi
  totalAnggota: number;
  kelasDiBawahTarget: number;
}

export interface TibyanRankRow {
  kelasId: string;
  kelasName: string;
  gender: 'ikhwan' | 'akhwat';
  persen: number | null;
  anggota: number;
}

export interface TibyanTrendPoint {
  tanggal: string; // YYYY-MM-DD (Sabtu)
  persen: number | null;
}

export interface TibyanDistribusi {
  H: number;
  I: number;
  S: number;
  A: number;
  T: number;
}

export interface TibyanAnggotaFlag {
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: 'ikhwan' | 'akhwat';
  whatsappNumber: string | null;
  persen: number | null;
  alphaBeruntun: number;
}

export interface TibyanView {
  perKelas: RekapKelas[];
  kpi: TibyanKpi;
  ranking: TibyanRankRow[];
  trend: TibyanTrendPoint[];
  distribusi: TibyanDistribusi;
  perhatian: {
    anggota: TibyanAnggotaFlag[];
    kelas: Array<{ kelasName: string; gender: 'ikhwan' | 'akhwat'; persen: number | null }>;
  };
}

function pct(hadir: number, terisi: number): number | null {
  return terisi > 0 ? Math.round((hadir / terisi) * 100) : null;
}

// %hadir level-kelas dari totals per-anggota: (ΣH+ΣT)/Σ(pertemuan terisi − sakit).
// Sakit = udzur, dikeluarkan dari penyebut (konsisten dgn maahir-rekap).
function kelasStats(k: RekapKelas): { ht: number; filled: number } {
  let ht = 0;
  let filled = 0;
  for (const a of k.anggota) {
    const t = a.totals;
    ht += t.H + t.T;
    filled += t.H + t.I + t.A + t.T;
  }
  return { ht, filled };
}

// Run terpanjang 'A' berurutan pada pertemuan terurut tanggal.
function longestAlphaRun(k: RekapKelas, anggotaId: string): number {
  const a = k.anggota.find((x) => x.anggotaId === anggotaId);
  if (!a) return 0;
  let best = 0;
  let cur = 0;
  for (const p of k.pertemuan) {
    if (a.perPertemuan[p.id] === 'A') {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}

export async function getTibyanView(
  month: string,
  opts?: { gender?: 'ikhwan' | 'akhwat' }
): Promise<TibyanView> {
  const perKelas = await getMaahirRekap(month, { gender: opts?.gender, program: 'at_tibyan' });

  // KPI + distribusi + ranking
  let htAll = 0;
  let filledAll = 0;
  let totalAnggota = 0;
  const distribusi: TibyanDistribusi = { H: 0, I: 0, S: 0, A: 0, T: 0 };
  const tanggalSet = new Set<string>();
  const ranking: TibyanRankRow[] = [];

  for (const k of perKelas) {
    const { ht, filled } = kelasStats(k);
    htAll += ht;
    filledAll += filled;
    totalAnggota += k.anggota.length;
    for (const a of k.anggota) {
      distribusi.H += a.totals.H;
      distribusi.I += a.totals.I;
      distribusi.S += a.totals.S;
      distribusi.A += a.totals.A;
      distribusi.T += a.totals.T;
    }
    for (const p of k.pertemuan) tanggalSet.add(p.tanggal);
    ranking.push({
      kelasId: k.kelasId,
      kelasName: k.kelasName,
      gender: k.gender,
      persen: pct(ht, filled),
      anggota: k.anggota.length,
    });
  }

  ranking.sort((a, b) => (b.persen ?? -1) - (a.persen ?? -1));

  const kelasDiBawahTarget = ranking.filter(
    (r) => r.persen !== null && r.persen < TIBYAN_TARGET_PERSEN
  ).length;

  const kpi: TibyanKpi = {
    overallPersen: pct(htAll, filledAll),
    totalSesi: tanggalSet.size,
    totalAnggota,
    kelasDiBawahTarget,
  };

  // Trend per tanggal Sabtu (agregat semua kelas).
  const byTanggal = new Map<string, { ht: number; filled: number }>();
  for (const k of perKelas) {
    for (const p of k.pertemuan) {
      const acc = byTanggal.get(p.tanggal) ?? { ht: 0, filled: 0 };
      for (const a of k.anggota) {
        const code = a.perPertemuan[p.id];
        if (!code || code === '-') continue;
        acc.filled += 1;
        if (code === 'H' || code === 'T') acc.ht += 1;
      }
      byTanggal.set(p.tanggal, acc);
    }
  }
  const trend: TibyanTrendPoint[] = [...byTanggal.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([tanggal, v]) => ({ tanggal, persen: pct(v.ht, v.filled) }));

  // Perlu perhatian
  const anggotaFlags: TibyanAnggotaFlag[] = [];
  for (const k of perKelas) {
    for (const a of k.anggota) {
      const alphaBeruntun = longestAlphaRun(k, a.anggotaId);
      const low = a.persenHadir !== null && a.persenHadir < TIBYAN_TARGET_PERSEN;
      if (low || alphaBeruntun >= 2) {
        anggotaFlags.push({
          anggotaId: a.anggotaId,
          name: a.name,
          kelasName: k.kelasName,
          gender: k.gender,
          whatsappNumber: a.whatsappNumber,
          persen: a.persenHadir,
          alphaBeruntun,
        });
      }
    }
  }
  // Urut: paling parah dulu (alpha beruntun ↓, lalu %hadir ↑).
  anggotaFlags.sort(
    (a, b) => b.alphaBeruntun - a.alphaBeruntun || (a.persen ?? 101) - (b.persen ?? 101)
  );

  const kelasFlags = ranking
    .filter((r) => r.persen !== null && r.persen < TIBYAN_TARGET_PERSEN)
    .map((r) => ({ kelasName: r.kelasName, gender: r.gender, persen: r.persen }));

  return {
    perKelas,
    kpi,
    ranking,
    trend,
    distribusi,
    perhatian: { anggota: anggotaFlags, kelas: kelasFlags },
  };
}
