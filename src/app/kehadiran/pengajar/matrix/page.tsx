import Link from 'next/link';
import { requirePengajar } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  INDIKATOR,
  INDIKATOR_BY_KATEGORI,
  KATEGORI_LABEL,
  KATEGORI_ORDER,
  KATEGORI_STANDAR,
  KATEGORI_RATA_KEY,
  STANDAR_KESELURUHAN,
  scoreColor,
} from '@/lib/matrix-indicators';
import { MatrixRadarChart } from '@/components/charts/MatrixRadarChart';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { Icon } from '@/components/icons';
import type { MatrixRekap } from '@/types/db';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = '2026-01';
// Urutan kategori dipakai bersama halaman matrix lain — lihat matrix-indicators.

function fmt(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : v.toFixed(1);
}

export default async function PengajarMatrixPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await requirePengajar();

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;

  const { data: m } = await supabaseAdmin
    .from('matrix_rekap')
    .select('*')
    .eq('pengajar_id', session.pengajar_id)
    .eq('year_month', month)
    .maybeSingle();
  const matrix = m as MatrixRekap | null;

  const overall = matrix?.rata_rata_keseluruhan ?? null;

  // Spider chart 12 indikator. MatrixRadarChart menolak render bila indikator
  // terisi < 5 (bentuknya menyesatkan), jadi hitung juga di sini untuk memilih
  // teks pengganti daripada membiarkan kartunya kosong.
  const radarData = INDIKATOR.map((ind) => {
    const v = matrix?.[ind.key];
    return {
      indikator: ind.short,
      skor: v === null || v === undefined ? null : Number(v),
      standar: ind.standar,
    };
  });
  const terisi = radarData.filter((d) => d.skor !== null).length;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Matrix Saya</div>
            <Link href="/kehadiran/pengajar" className="back">{Icon.shield(12)} Kembali</Link>
          </div>

          <div className="section-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div>
              <h1 className="t-h1" style={{ marginBottom: 2 }}>{session.name}</h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>Nilai kompetensi bulan ini</p>
            </div>
            <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
          </div>

          {!matrix ? (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center' }}>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Nilai matrix bulan ini belum tersedia. Nilai dihitung berkala oleh koordinator —
                coba cek lagi nanti atau hubungi koordinator.
              </p>
            </div>
          ) : (
            <>
              {/* Nilai keseluruhan */}
              <div className="card-flat" style={{ padding: 18, marginBottom: 16, textAlign: 'center' }}>
                <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 4 }}>
                  Nilai Keseluruhan (skala 0–4)
                </div>
                <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: scoreColor(overall, STANDAR_KESELURUHAN) }}>
                  {fmt(overall)}
                </div>
                <div className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
                  Standar ≥ {STANDAR_KESELURUHAN.toFixed(2)}
                  {matrix.ranking != null && <> · Peringkat #{matrix.ranking}</>}
                </div>
                {matrix.total_teguran_bulan > 0 && (
                  <div className="t-tiny" style={{ color: 'var(--merah-ink)', marginTop: 4 }}>
                    Teguran bulan ini: {matrix.total_teguran_bulan} · kumulatif {matrix.total_teguran_kumulatif}
                  </div>
                )}
              </div>

              {/* Profil kompetensi — spider chart 12 indikator */}
              <div className="card-flat" style={{ padding: 16, marginBottom: 16 }}>
                <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8, textAlign: 'center' }}>
                  Profil Kompetensi
                </div>
                {terisi >= 5 ? (
                  <>
                    <MatrixRadarChart data={radarData} height={280} />
                    <p className="t-tiny" style={{ color: 'var(--muted-2)', textAlign: 'center', marginTop: 4 }}>
                      Garis putus-putus = standar · area = nilai kamu
                    </p>
                  </>
                ) : (
                  <p className="t-small" style={{ color: 'var(--muted-2)', textAlign: 'center', margin: 0 }}>
                    Grafik muncul bila minimal 5 indikator sudah dinilai (sekarang {terisi}).
                  </p>
                )}
              </div>

              {/* Per kategori — klik untuk rincian */}
              <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
                Ketuk tiap kategori untuk lihat rincian penilaiannya.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {KATEGORI_ORDER.map((kat) => {
                  const rata = matrix[KATEGORI_RATA_KEY[kat]] as number | null;
                  const stdKat = KATEGORI_STANDAR[kat];
                  const indikator = INDIKATOR_BY_KATEGORI[kat];
                  return (
                    <details key={kat} className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                      <summary
                        style={{
                          cursor: 'pointer',
                          listStyle: 'none',
                          padding: '12px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{KATEGORI_LABEL[kat]}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 20, fontWeight: 700, color: scoreColor(rata, stdKat) }}>{fmt(rata)}</span>
                          <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>/ std {stdKat}</span>
                        </span>
                      </summary>
                      <div style={{ borderTop: '1px solid var(--line)' }}>
                        <table className="k-table">
                          <thead>
                            <tr>
                              <th>Indikator</th>
                              <th style={{ textAlign: 'right' }}>Nilai</th>
                              <th style={{ textAlign: 'right' }}>Std</th>
                            </tr>
                          </thead>
                          <tbody>
                            {indikator.map((ind) => {
                              const v = matrix[ind.key] as number | null;
                              return (
                                <tr key={ind.key}>
                                  <td>
                                    <div style={{ fontSize: 13 }}>{ind.label}</div>
                                    <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>{ind.deskripsi}</div>
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: 700, color: scoreColor(v, ind.standar) }}>{v ?? '—'}</td>
                                  <td style={{ textAlign: 'right', color: 'var(--muted-2)' }}>{ind.standar}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  );
                })}
              </div>

              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 14 }}>
                Hijau = memenuhi standar · Kuning = mendekati · Merah = di bawah standar. Nilai bersumber
                dari penilaian masyaikh, kehadiran, observasi, dan penilaian pedagogis.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
