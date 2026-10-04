import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getTibyanView, TIBYAN_TARGET_PERSEN } from '@/lib/tibyan-rekap';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/icons';
import { TibyanKpiCards } from '@/components/tibyan/TibyanKpiCards';
import { TibyanRankingBar } from '@/components/tibyan/TibyanRankingBar';
import { TibyanTrendChart } from '@/components/tibyan/TibyanTrendChart';
import { TibyanDistributionDonut } from '@/components/tibyan/TibyanDistributionDonut';
import { TibyanAttentionList } from '@/components/tibyan/TibyanAttentionList';
import { TibyanHeatmap } from '@/components/tibyan/TibyanHeatmap';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7);

type SP = { month?: string; gender?: string };

const GENDER_TABS: Array<{ key: string; label: string }> = [
  { key: 'semua', label: 'Semua' },
  { key: 'ikhwan', label: 'Ikhwan' },
  { key: 'akhwat', label: 'Akhwat' },
];

export default async function KoordinatorKehadiranTibyanPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  if (!accesses.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran')) {
    redirect('/2in1/koordinator/login');
  }

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;
  const genderParam =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat' ? searchParams.gender : undefined;

  const view = await getTibyanView(month, { gender: genderParam });
  const monthOptions = monthOptionsSince(ANCHOR_MONTH);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Kehadiran At-Tibyan
          </div>
          <Link href="/2in1/koordinator/kehadiran" className="back">
            {Icon.back(12)} Kehadiran Maahir
          </Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ marginBottom: 12, alignItems: 'center' }}>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Rekap kehadiran kajian At-Tibyan (Sabtu) per kelas
            </p>
            <MonthNavSelect options={monthOptions} value={month} />
          </div>

          {/* Filter gender */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {GENDER_TABS.map((t) => {
              const active = (t.key === 'semua' && !genderParam) || t.key === genderParam;
              const params = new URLSearchParams();
              params.set('month', month);
              if (t.key !== 'semua') params.set('gender', t.key);
              return (
                <Link
                  key={t.key}
                  href={`?${params.toString()}`}
                  className={active ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}
                  style={{ textDecoration: 'none', fontSize: 12 }}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>

          <TibyanKpiCards kpi={view.kpi} target={TIBYAN_TARGET_PERSEN} />

          {/* Baris chart */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div className="card" style={{ padding: 14 }}>
              <SectionHeader title="Ranking kelas" style={{ marginBottom: 10 }} />
              <TibyanRankingBar rows={view.ranking} />
            </div>
            <div className="card" style={{ padding: 14 }}>
              <SectionHeader title="Tren per-Sabtu" style={{ marginBottom: 10 }} />
              <TibyanTrendChart data={view.trend} />
            </div>
            <div className="card" style={{ padding: 14 }}>
              <SectionHeader title="Distribusi status" style={{ marginBottom: 10 }} />
              <TibyanDistributionDonut data={view.distribusi} />
            </div>
          </div>

          {/* Perlu perhatian */}
          <div style={{ marginBottom: 24 }}>
            <SectionHeader title="Perlu perhatian" style={{ marginBottom: 10 }} />
            <TibyanAttentionList perhatian={view.perhatian} target={TIBYAN_TARGET_PERSEN} />
          </div>

          {/* Heatmap per kelas */}
          <SectionHeader title="Detail per kelas" style={{ marginBottom: 12 }} />
          <TibyanHeatmap kelasList={view.perKelas} />
        </div>
      </div>
    </main>
  );
}
