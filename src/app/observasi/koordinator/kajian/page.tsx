import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { isSuperadmin } from '@/lib/admin-guard';
import { todayJakarta } from '@/lib/maahir-presensi';
import { loadKajianRows, loadKajianLibur, loadKetuaWaList } from '@/lib/hits-kajian-db';
import {
  computeKajianRekap, deriveKajianState, sundaysInRange, monthsInRange, monthBounds,
  KAJIAN_GHOSTING_DAYS, type KajianRow,
} from '@/lib/hits-kajian';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { StatCard } from '@/components/ui/StatCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { KajianTindakPanel, type TindakItem } from './KajianTindakPanel';
import { KajianLiburPanel } from './KajianLiburPanel';
import { KajianRekapPanel, type KajianRekapRow } from './KajianRekapPanel';

export const dynamic = 'force-dynamic';
const MS_PER_DAY = 86_400_000;

function tanggalWib(d: string): string {
  return new Date(`${d}T12:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

function labelBulan(ym: string): string {
  return new Date(`${ym}-01T12:00:00+07:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

type SP = { gender?: string; bulan?: string };

export default async function KajianKoordinatorPage({ searchParams }: { searchParams: SP }) {
  const session = await requireKoordinatorKetuaKelas();
  const today = todayJakarta();

  // Superadmin boleh lintas-gender via ?gender=; koordinator biasa terkunci ke gender-nya.
  const superadmin = await isSuperadmin();
  const viewGender =
    superadmin && (searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat')
      ? searchParams.gender
      : session.gender;
  const nowIso = new Date().toISOString();
  const cutoffTindak = new Date(new Date(`${today}T00:00:00+07:00`).getTime() - 21 * 86_400_000)
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  const ketua = await loadKetuaWaList(viewGender);
  const waList = ketua.map((k) => k.ketua_wa);
  const metaByWa = new Map(ketua.map((k) => [k.ketua_wa, k]));
  const namaByWa = new Map(ketua.map((k) => [k.ketua_wa, k.nama]));

  const liburRows = await loadKajianLibur();
  const liburSet = new Set(liburRows.map((l) => l.tanggal));

  const anchorRows = await loadKajianRows('2000-01-01');
  const anchor = anchorRows.length
    ? anchorRows.reduce((min, r) => (r.tanggal < min ? r.tanggal : min), anchorRows[0].tanggal)
    : today;

  const rows: KajianRow[] = anchorRows;

  // Filter bulan untuk REKAP saja; panel "Perlu Ditindak" tetap lintas-periode.
  const bulanOptions = monthsInRange(anchor, today).map((v) => ({ value: v, label: labelBulan(v) }));
  const bulan =
    searchParams.bulan && bulanOptions.some((o) => o.value === searchParams.bulan)
      ? searchParams.bulan
      : null;
  const periode = bulan ? monthBounds(bulan) : null;
  // Clamp ke anchor: bulan pertama bisa mulai sebelum sesi pertama ada.
  const rekapStart = periode ? (periode.start > anchor ? periode.start : anchor) : anchor;
  const rekap = computeKajianRekap(rows, liburSet, waList, rekapStart, today, nowIso, periode?.end);
  const totalSesi = rekap[0]?.totalSesi ?? 0;
  // Sesi yang benar-benar sudah lewat harinya. computeKajianRekap ikut menghitung
  // sesi hari-ini sejak 00:00, jadi tanpa ini badge "belum pernah lapor" menuduh
  // semua ketua pada Ahad pagi sebelum kajian mulai.
  const sesiLewat = sundaysInRange(rekapStart, periode?.end && periode.end < today ? periode.end : today)
    .filter((d) => !liburSet.has(d) && d < today).length;
  const sumBelum = rekap.reduce((s, r) => s + r.belumIsi, 0);
  const sumAlpa = rekap.reduce((s, r) => s + r.alpa, 0);

  // Ratakan untuk client component: Map tak boleh menyeberang boundary React Flight.
  const rekapRows: KajianRekapRow[] = rekap.map((r) => {
    const m = metaByWa.get(r.ketua_wa);
    return {
      ketuaWa: r.ketua_wa,
      nama: m?.nama ?? '(ketua)',
      halaqah: (m?.halaqah ?? []).join(', '),
      hadir: r.hadir, terlambat: r.terlambat, izin: r.izin, sakit: r.sakit,
      alpa: r.alpa, belumIsi: r.belumIsi, totalSesi: r.totalSesi, persen: r.persen,
    };
  });

  const sesi = sundaysInRange(anchor, today).filter((d) => !liburSet.has(d));
  const byKey = new Map(rows.map((r) => [`${r.ketua_wa}|${r.tanggal}`, r]));
  const tindak: TindakItem[] = [];
  for (const wa of waList) {
    for (const tgl of sesi) {
      const row = byKey.get(`${wa}|${tgl}`) ?? null;
      const st = deriveKajianState(row, tgl, today, nowIso);
      const recentOrReminded = tgl >= cutoffTindak || Boolean(row?.reminder_sent_at);
      if ((st === 'belum-isi' || st === 'alpa') && recentOrReminded) {
        let sisaHari: number | null = null;
        if (st === 'belum-isi' && row?.reminder_sent_at) {
          const deadline = new Date(row.reminder_sent_at).getTime() + KAJIAN_GHOSTING_DAYS * MS_PER_DAY;
          sisaHari = Math.max(0, Math.ceil((deadline - new Date(nowIso).getTime()) / MS_PER_DAY));
        }
        tindak.push({ ketuaWa: wa, namaKetua: namaByWa.get(wa) ?? '(ketua)', tanggal: tgl, tanggalWib: tanggalWib(tgl), state: st, sisaHari });
      }
    }
  }
  tindak.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>

          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Kajian Adab</div>
            <Link href="/observasi/koordinator" className="back">{Icon.back(12)} Kembali</Link>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>Presensi Kajian Adab</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: superadmin ? 8 : 14 }}>
            {session.name} — {viewGender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} — {today}
          </p>

          {superadmin && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <a
                href={`?gender=ikhwan${bulan ? `&bulan=${bulan}` : ''}`}
                className={`btn btn-sm ${viewGender === 'ikhwan' ? '' : 'btn-ghost'}`}
                style={{ textDecoration: 'none' }}
                aria-current={viewGender === 'ikhwan' ? 'page' : undefined}
              >
                Ikhwan
              </a>
              <a
                href={`?gender=akhwat${bulan ? `&bulan=${bulan}` : ''}`}
                className={`btn btn-sm ${viewGender === 'akhwat' ? '' : 'btn-ghost'}`}
                style={{ textDecoration: 'none' }}
                aria-current={viewGender === 'akhwat' ? 'page' : undefined}
              >
                Akhwat
              </a>
            </div>
          )}

          <div className="matrix-stat-grid" style={{ marginBottom: 6 }}>
            <StatCard mono value={totalSesi} label="Sesi" sub={bulan ? labelBulan(bulan) : 'semua periode'} />
            <StatCard mono value={waList.length} label="Ketua kelas aktif" />
            <StatCard
              mono value={sumBelum} label="Belum dilapor" sub="slot sesi"
              valueColor={sumBelum > 0 ? 'var(--kuning-ink)' : undefined}
              dotColor="var(--kuning)"
            />
            <StatCard
              mono value={sumAlpa} label="Alpa" sub="slot sesi"
              valueColor={sumAlpa > 0 ? 'var(--merah-ink)' : undefined}
              dotColor="var(--merah)"
            />
          </div>

          <SectionHeader
            as="h2"
            title="Rekap per Ketua"
            right={`${totalSesi} sesi · ${waList.length} ketua`}
            style={{ marginTop: 18 }}
          />
          <KajianRekapPanel
            rows={rekapRows}
            totalSesi={totalSesi}
            sesiLewat={sesiLewat}
            bulan={bulan}
            bulanOptions={bulanOptions}
            genderParam={superadmin ? viewGender : ''}
          />

          <SectionHeader
            as="h2"
            title="Perlu Ditindak"
            right={<span className="badge badge-neutral"><span className="dot" />tak ikut filter periode</span>}
          />
          <KajianTindakPanel items={tindak} />

          <details style={{ marginTop: 18 }}>
            <summary className="t-tiny" style={{ cursor: 'pointer' }}>Libur Kajian</summary>
            <div style={{ marginTop: 10 }}>
              <KajianLiburPanel libur={liburRows} />
            </div>
          </details>

        </div>
      </div>
    </main>
  );
}
