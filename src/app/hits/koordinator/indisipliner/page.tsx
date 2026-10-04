import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import {
  getIndisiplinerRekap,
  type IndisiplinerInsiden,
  type IndisiplinerStatus,
} from '@/lib/hits-rekap';
import { GenderNavSelect } from '@/components/GenderNavSelect';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { buildWaMeUrl } from '@/lib/whatsapp';
import { Icon } from '@/components/icons';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = '2026-01';

const BADGE_LABEL: Record<string, string> = {
  KMT: 'Kelas Mulai Terlambat (>5 menit)',
  KBLA: 'Kelas Berakhir Lebih Awal',
  JKG: 'Jadwal Kelas Ganti',
  TL: 'Tidak memberikan latihan',
};

const STATUS_LABEL: Record<IndisiplinerStatus, string> = {
  belum_ditabayyun: 'Belum ditabayyun',
  nunggu_alasan: 'Nunggu alasan pengajar',
  pending: 'Pending koordinator',
  diputus: 'Diputus',
};

function statusStyle(s: IndisiplinerStatus) {
  if (s === 'diputus') return { bg: 'var(--hijau-tint)', bd: 'var(--hijau-line)', ink: 'var(--hijau-ink)' };
  if (s === 'belum_ditabayyun') return { bg: 'var(--surface-3)', bd: 'var(--line)', ink: 'var(--muted)' };
  return { bg: 'var(--kuning-tint)', bd: 'var(--kuning-line)', ink: 'var(--kuning-ink)' };
}

function badgeStyle(b: string) {
  if (b === 'TL') return { bg: 'var(--merah-tint)', bd: 'var(--merah-line)', ink: 'var(--merah-ink)' };
  return { bg: 'var(--kuning-tint)', bd: 'var(--kuning-line)', ink: 'var(--kuning-ink)' };
}

function udzurCell(i: IndisiplinerInsiden) {
  if (i.status !== 'diputus' || i.isUdzurSyari === null) return <span className="t-small" style={{ color: 'var(--muted)' }}>—</span>;
  return i.isUdzurSyari ? (
    <span className="badge" style={{ background: 'var(--hijau-tint)', borderColor: 'var(--hijau-line)', color: 'var(--hijau-ink)' }}>✅ Diterima</span>
  ) : (
    <span className="badge" style={{ background: 'var(--merah-tint)', borderColor: 'var(--merah-line)', color: 'var(--merah-ink)' }}>❌ Tolak</span>
  );
}

export default async function IndisiplinerRekapPage({
  searchParams,
}: {
  searchParams: { month?: string; gender?: string };
}) {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;
  const genderFilter: Gender | undefined =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : undefined;

  const { insiden, summary } = await getIndisiplinerRekap(month, { gender: genderFilter });

  // Kelompokkan per halaqah (urut nama).
  const byHalaqah = new Map<string, { name: string; pengajar: string | null; ketua: string | null; ketuaWa: string | null; rows: IndisiplinerInsiden[] }>();
  for (const i of insiden) {
    let g = byHalaqah.get(i.halaqahId);
    if (!g) {
      g = { name: i.halaqahName, pengajar: i.pengajarNama, ketua: i.ketuaNama, ketuaWa: i.ketuaWa, rows: [] };
      byHalaqah.set(i.halaqahId, g);
    }
    g.rows.push(i);
  }
  const groups = [...byHalaqah.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  const waText = (halaqah: string) =>
    `Assalamu'alaikum. Terkait laporan indisipliner di halaqah ${halaqah} bulan ${month}, mohon konfirmasinya. Syukron.`;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">H</span> Indisipliner &amp; Tabayyun</div>
            <Link href="/hits/koordinator" className="back">{Icon.shield(12)} Kembali</Link>
          </div>

          <div className="section-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div>
              <h1 className="t-h1" style={{ marginBottom: 4 }}>Rekap Indisipliner</h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Laporan KMT / KBLA / JKG / TL beserta hasil tabayyun &amp; putusan udzur syar&apos;i.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
              <GenderNavSelect value={genderFilter ?? ''} />
            </div>
          </div>

          {/* Ringkasan */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
            <Stat label="Total insiden" value={summary.total} />
            <Stat label="Belum ditabayyun" value={summary.belumDitabayyun} tone={summary.belumDitabayyun ? 'warn' : undefined} />
            <Stat label="Diputus" value={summary.diputus} />
            <Stat label="Udzur diterima" value={summary.pctUdzurDiterima == null ? '—' : `${summary.udzurDiterima} (${summary.pctUdzurDiterima}%)`} tone="ok" />
            <Stat label="Udzur ditolak" value={summary.udzurTolak} tone={summary.udzurTolak ? 'bad' : undefined} />
            <Stat label="KMT / KBLA / JKG / TL" value={`${summary.byBadge.KMT} / ${summary.byBadge.KBLA} / ${summary.byBadge.JKG} / ${summary.byBadge.TL}`} />
          </div>

          {groups.length === 0 ? (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center' }}>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Tak ada insiden indisipliner pada periode ini. Alhamdulillah.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {groups.map(([id, g]) => (
                <div key={id} className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <Link href={`/hits/koordinator/halaqah/${id}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>{g.name}</Link>
                      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
                        Pengajar: {g.pengajar ?? '—'} · Ketua: {g.ketua ?? 'belum ditunjuk'} · {g.rows.length} insiden
                      </div>
                    </div>
                    {g.ketuaWa && (
                      <a href={buildWaMeUrl(g.ketuaWa, waText(g.name))} target="_blank" rel="noopener" className="btn btn-wa btn-xs" style={{ whiteSpace: 'nowrap' }}>
                        {Icon.wa(12)} WA Ketua
                      </a>
                    )}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="k-table">
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Prt</th>
                          <th>Pelanggaran</th>
                          <th>Keterangan ketua</th>
                          <th>Alasan pengajar</th>
                          <th>Status</th>
                          <th>Udzur?</th>
                          <th>Alasan putusan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((i) => {
                          const ss = statusStyle(i.status);
                          return (
                            <tr key={i.keteranganId}>
                              <td className="t-small" style={{ whiteSpace: 'nowrap' }}>{i.tanggal}</td>
                              <td className="t-mono">{i.pertemuanNo}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {i.pelanggaran.map((b) => {
                                    const bs = badgeStyle(b);
                                    return (
                                      <span key={b} className="badge" title={BADGE_LABEL[b] ?? b} style={{ background: bs.bg, borderColor: bs.bd, color: bs.ink }}>{b}</span>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="t-small" style={{ color: 'var(--muted-2)', maxWidth: 200 }}>{i.catatan?.trim() || '—'}</td>
                              <td className="t-small" style={{ color: 'var(--muted-2)', maxWidth: 200 }}>
                                {i.dariIzin && (
                                  <div style={{ marginBottom: 2 }}>
                                    <span
                                      className="badge"
                                      title="Alasan dari izin yang dikirim pengajar lewat Shakwa sebelum kelas — tabayyun susulan tak diperlukan."
                                      style={{ background: 'var(--hijau-tint)', borderColor: 'var(--hijau-line)', color: 'var(--hijau-ink)' }}
                                    >
                                      Izin pra-kelas
                                    </span>
                                  </div>
                                )}
                                {i.alasanPengajar ?? '—'}
                              </td>
                              <td><span className="badge" style={{ background: ss.bg, borderColor: ss.bd, color: ss.ink }}>{STATUS_LABEL[i.status]}</span></td>
                              <td style={{ whiteSpace: 'nowrap' }}>{udzurCell(i)}</td>
                              <td className="t-small" style={{ color: 'var(--muted-2)', maxWidth: 220 }}>{i.keputusanCatatan ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'bad' }) {
  const ink =
    tone === 'ok' ? 'var(--hijau-ink)' : tone === 'bad' ? 'var(--merah-ink)' : tone === 'warn' ? 'var(--kuning-ink)' : 'var(--ink)';
  return (
    <div className="card-flat" style={{ padding: '10px 14px', minWidth: 120 }}>
      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: ink }}>{value}</div>
    </div>
  );
}
