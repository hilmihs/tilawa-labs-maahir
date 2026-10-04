import { Fragment } from 'react';
import Link from 'next/link';
import { requireKoordinator } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Icon, Initials } from '@/components/icons';
import { LogoutButton } from '@/components/LogoutButton';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { buildWaMeUrl, tplReminderKetuaKelompokTugas } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

const PEDAGOGIS_START = '2026-06';
// skor_metode_pengajaran dilebur ke skor_manajemen_halaqah (lihat matrix-compute).
const PED_FIELDS = ['skor_kepatuhan_silabus', 'skor_manajemen_halaqah', 'skor_evaluasi_penguasaan'] as const;

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}
function monthLabelOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function monthOptions(): Array<{ value: string; label: string }> {
  const cur = currentYearMonth();
  const [sy, sm] = PEDAGOGIS_START.split('-').map(Number);
  const [ny, nm] = cur.split('-').map(Number);
  const out: Array<{ value: string; label: string }> = [];
  let y = sy, m = sm;
  while (y < ny || (y === ny && m <= nm)) {
    const value = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ value, label: monthLabelOf(value) });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out.reverse();
}

type PengajarRow = { id: string; name: string; gender: Gender; kelompok_id: string; is_ketua: boolean; whatsapp_number: string };

export default async function KoordinatorPedagogisPage({ searchParams }: { searchParams: { month?: string } }) {
  await requireKoordinator();

  const cur = currentYearMonth();
  const ym = searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : cur;

  const { data: kelompokRaw } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name, gender')
    .order('name');
  // "Belum Ada Kelompok (...)" adalah bucket penampung pengajar yang belum
  // diorganisir ke kelompok nyata — bukan halaqah beneran, jadi dikecualikan
  // dari penilaian pedagogis (tidak punya ketua kelompok untuk menilai).
  const kelompokList = (kelompokRaw ?? []).filter((k) => !k.name.startsWith('Belum Ada Kelompok'));

  const { data: pengajarRaw } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, kelompok_id, is_ketua, whatsapp_number')
    .eq('active', true)
    .order('name');
  const pengajarList = (pengajarRaw ?? []) as PengajarRow[];
  const pengajarIds = pengajarList.map((p) => p.id);

  const { data: penilaianRaw } = await supabaseAdmin
    .from('penilaian_pedagogis')
    .select('pengajar_id, skor_metode_pengajaran, skor_kepatuhan_silabus, skor_manajemen_halaqah, skor_evaluasi_penguasaan, skor_kepatuhan_sop, catatan_umum')
    .eq('year_month', ym)
    .in('pengajar_id', pengajarIds.length ? pengajarIds : ['00000000-0000-0000-0000-000000000000']);
  const avgByPengajar = new Map<string, number | null>();
  const scoresByPengajar = new Map<string, Record<string, string | number | null>>();
  for (const p of penilaianRaw ?? []) {
    scoresByPengajar.set(p.pengajar_id, p as Record<string, string | number | null>);
    const raw = p as Record<string, number | null>;
    const scores = PED_FIELDS.map((f) =>
      // Manajemen Halaqah dinilai sebagai gabungan metode lama + halaqah.
      f === 'skor_manajemen_halaqah'
        ? mergeHalaqah(raw.skor_metode_pengajaran ?? null, raw.skor_manajemen_halaqah ?? null)
        : raw[f]
    ).filter((x): x is number => x !== null && x !== undefined);
    avgByPengajar.set(p.pengajar_id, scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null);
  }

  // Per kelompok
  const groups = (kelompokList ?? []).map((kel) => {
    const anggota = pengajarList.filter((p) => p.kelompok_id === kel.id);
    const ketua = anggota.find((p) => p.is_ketua) ?? null;
    const dinilai = anggota.filter((p) => !p.is_ketua && avgByPengajar.has(p.id));
    const totalAnggota = anggota.filter((p) => !p.is_ketua).length;
    const belum = totalAnggota - dinilai.length;
    let reminderUrl: string | null = null;
    if (ketua && belum > 0) {
      reminderUrl = buildWaMeUrl(
        ketua.whatsapp_number,
        tplReminderKetuaKelompokTugas({
          ketuaName: ketua.name,
          ketuaGender: ketua.gender,
          tugasPending: [`Penilaian pedagogis ${monthLabelOf(ym)}: ${belum} anggota belum dinilai`],
          dashboardUrl: absUrl('/kehadiran/ketua-kelompok/penilaian'),
        })
      );
    }
    return { kel, ketua, anggota, totalAnggota, dinilaiCount: dinilai.length, belum, reminderUrl };
  });

  const totalAnggotaAll = groups.reduce((a, g) => a + g.totalAnggota, 0);
  const totalDinilai = groups.reduce((a, g) => a + g.dinilaiCount, 0);

  const ikhwanGroups = groups.filter((g) => g.kel.gender === 'ikhwan');
  const akhwatGroups = groups.filter((g) => g.kel.gender === 'akhwat');

  // Ketua kelompok — dinilai oleh KOORDINATOR (via /2in1/koordinator/penilaian-ketua),
  // bukan di flow kelompok. Ditampilkan di tabel khusus terpisah.
  const ketuaRows = groups
    .filter((g) => g.ketua)
    .map((g) => ({ p: g.ketua as PengajarRow, kelompokName: g.kel.name, gender: g.kel.gender }));
  const ketuaIkhwan = ketuaRows.filter((r) => r.gender === 'ikhwan');
  const ketuaAkhwat = ketuaRows.filter((r) => r.gender === 'akhwat');
  const ketuaDinilai = ketuaRows.filter((r) => avgByPengajar.has(r.p.id)).length;

  const renderGroupCard = (g: (typeof groups)[number]) => {
    const lengkap = g.totalAnggota > 0 && g.belum === 0;
    return (
      <div key={g.kel.id} className="card-flat" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{g.kel.name}</div>
            <div className="t-small" style={{ color: 'var(--muted)' }}>
              Ketua: {g.ketua?.name ?? '— belum ada ketua'}
            </div>
          </div>
          <span className={`badge ${lengkap ? 'badge-hijau' : 'badge-merah'}`} style={{ fontSize: 11 }}>
            <span className="dot" />{g.dinilaiCount}/{g.totalAnggota} dinilai
          </span>
          {g.reminderUrl && (
            <a href={g.reminderUrl} target="_blank" rel="noopener" className="act-btn wa" style={{ textDecoration: 'none' }}>
              {Icon.wa(11)} Ingatkan ketua
            </a>
          )}
        </div>

        {/* anggota — tabel rinci per aspek. Ketua kelompok TIDAK di sini —
            penilaiannya (oleh koordinator) tampil di section "Ketua Kelompok". */}
        {g.totalAnggota === 0 ? (
          <div className="t-small" style={{ color: 'var(--muted-2)', marginTop: 10 }}>Tidak ada anggota.</div>
        ) : (
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="k-table tbl-cards">
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }}>Pengajar</th>
                  <th style={{ textAlign: 'center' }}>Silabus</th>
                  <th style={{ textAlign: 'center' }}>Manajemen Halaqah</th>
                  <th style={{ textAlign: 'center' }}>Evaluasi</th>
                  <th style={{ textAlign: 'center', color: 'var(--muted-2)' }}>SOP</th>
                  <th style={{ textAlign: 'center' }}>Rata²</th>
                </tr>
              </thead>
              <tbody>
                {g.anggota.filter((p) => !p.is_ketua).map((p) => {
                  const sc = scoresByPengajar.get(p.id);
                  const avg = avgByPengajar.get(p.id);
                  const num = (k: string) => (sc?.[k] as number | null) ?? null;
                  // Manajemen Halaqah = rata-rata nilai metode lama + halaqah.
                  const halaqah = mergeHalaqah(num('skor_metode_pengajaran'), num('skor_manajemen_halaqah'));
                  const catatan = (sc?.catatan_umum as string | null) ?? null;
                  return (
                    <Fragment key={p.id}>
                      <tr>
                        <td className="tbl-cardhead">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}><Initials name={p.name} /></div>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                          </div>
                        </td>
                        <ScoreCell v={num('skor_kepatuhan_silabus')} label="Silabus" />
                        <ScoreCell v={halaqah} label="Manajemen Halaqah" />
                        <ScoreCell v={num('skor_evaluasi_penguasaan')} label="Evaluasi" />
                        <ScoreCell v={num('skor_kepatuhan_sop')} muted label="SOP" />
                        <td data-label="Rata²" style={{ textAlign: 'center' }}>
                          {avg != null ? (
                            <span style={{ fontSize: 14, fontWeight: 800, color: avg >= 3 ? 'var(--hijau-ink)' : avg >= 2 ? 'var(--kuning-ink)' : 'var(--merah-ink)' }}>{avg.toFixed(1)}</span>
                          ) : (
                            <span className="badge badge-merah" style={{ fontSize: 10 }}><span className="dot" />belum</span>
                          )}
                        </td>
                      </tr>
                      {catatan && (
                        <tr className="cat-row">
                          <td colSpan={7} style={{ padding: '2px 8px 8px 40px', color: 'var(--ink-2)', fontSize: 12, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                            📝 {catatan}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderKetuaTable = (rows: typeof ketuaRows) => (
    <div className="card-flat" style={{ padding: 14 }}>
      <div className="table-scroll">
        <table className="k-table tbl-cards">
          <thead>
            <tr>
              <th style={{ minWidth: 130 }}>Ketua Kelompok</th>
              <th style={{ minWidth: 110 }}>Kelompok</th>
              <th style={{ textAlign: 'center' }}>Silabus</th>
              <th style={{ textAlign: 'center' }}>Manajemen Halaqah</th>
              <th style={{ textAlign: 'center' }}>Evaluasi</th>
              <th style={{ textAlign: 'center', color: 'var(--muted-2)' }}>SOP</th>
              <th style={{ textAlign: 'center' }}>Rata²</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, kelompokName }) => {
              const sc = scoresByPengajar.get(p.id);
              const avg = avgByPengajar.get(p.id);
              const num = (k: string) => (sc?.[k] as number | null) ?? null;
              // Manajemen Halaqah = rata-rata nilai metode lama + halaqah.
              const halaqah = mergeHalaqah(num('skor_metode_pengajaran'), num('skor_manajemen_halaqah'));
              const catatan = (sc?.catatan_umum as string | null) ?? null;
              return (
                <Fragment key={p.id}>
                  <tr>
                    <td className="tbl-cardhead">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}><Initials name={p.name} /></div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                      </div>
                    </td>
                    <td data-label="Kelompok" className="t-small" style={{ color: 'var(--muted)' }}>{kelompokName}</td>
                    <ScoreCell v={num('skor_kepatuhan_silabus')} label="Silabus" />
                    <ScoreCell v={halaqah} label="Manajemen Halaqah" />
                    <ScoreCell v={num('skor_evaluasi_penguasaan')} label="Evaluasi" />
                    <ScoreCell v={num('skor_kepatuhan_sop')} muted label="SOP" />
                    <td data-label="Rata²" style={{ textAlign: 'center' }}>
                      {avg != null ? (
                        <span style={{ fontSize: 14, fontWeight: 800, color: avg >= 3 ? 'var(--hijau-ink)' : avg >= 2 ? 'var(--kuning-ink)' : 'var(--merah-ink)' }}>{avg.toFixed(1)}</span>
                      ) : (
                        <span className="badge badge-merah" style={{ fontSize: 10 }}><span className="dot" />belum</span>
                      )}
                    </td>
                  </tr>
                  {catatan && (
                    <tr className="cat-row">
                      <td colSpan={8} style={{ padding: '2px 8px 8px 40px', color: 'var(--ink-2)', fontSize: 12, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                        📝 {catatan}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="dash-header">
        <div className="grp">
          <Link href="/2in1/koordinator" className="wordmark"><span className="mark">M</span>Maahir</Link>
          <span style={{ width: 1, height: 16, background: 'var(--forest-line)' }} />
          <span className="t-small" style={{ color: 'var(--forest-soft)', fontWeight: 500 }}>Inspeksi Guru</span>
        </div>
        <div className="grp">
          <Link href="/2in1/koordinator" className="btn btn-sm btn-ghost" style={{ height: 32, padding: '0 12px', textDecoration: 'none' }}>← Dashboard</Link>
          <LogoutButton />
        </div>
      </div>

      <div className="dash-body" style={{ maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="t-h1" style={{ fontSize: 22, marginBottom: 4 }}>Inspeksi — {monthLabelOf(ym)}</h1>
            <p className="t-small">Pantau pengisian penilaian oleh ketua kelompok · {totalDinilai}/{totalAnggotaAll} pengajar dinilai</p>
          </div>
          <MonthNavSelect options={monthOptions()} value={ym} />
        </div>

        {/* Per kelompok — dipisah Ikhwan / Akhwat */}
        {groups.length === 0 && <p className="t-small">Belum ada kelompok pengajar.</p>}

        {ikhwanGroups.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="t-tiny" style={{ color: 'var(--emas-ink)', marginTop: 4 }}>
              IKHWAN · {ikhwanGroups.reduce((a, g) => a + g.dinilaiCount, 0)}/{ikhwanGroups.reduce((a, g) => a + g.totalAnggota, 0)} dinilai
            </div>
            {ikhwanGroups.map(renderGroupCard)}
          </section>
        )}

        {akhwatGroups.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <div className="t-tiny" style={{ color: 'var(--emas-ink)', marginTop: 4 }}>
              AKHWAT · {akhwatGroups.reduce((a, g) => a + g.dinilaiCount, 0)}/{akhwatGroups.reduce((a, g) => a + g.totalAnggota, 0)} dinilai
            </div>
            {akhwatGroups.map(renderGroupCard)}
          </section>
        )}

        {/* Tabel khusus penilaian KETUA KELOMPOK (dinilai koordinator) */}
        {ketuaRows.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
            <div>
              <h2 className="t-h2" style={{ fontSize: 18, margin: '0 0 2px' }}>Penilaian Ketua Kelompok</h2>
              <p className="t-small" style={{ color: 'var(--muted-2)', margin: 0 }}>
                Dinilai koordinator via{' '}
                <Link href="/2in1/koordinator/penilaian-ketua" style={{ color: 'var(--emas-ink)', fontWeight: 700 }}>
                  Nilai Ketua Kelompok →
                </Link>{' '}
                · {ketuaDinilai}/{ketuaRows.length} ketua dinilai
              </p>
            </div>
            {ketuaIkhwan.length > 0 && (
              <>
                <div className="t-tiny" style={{ color: 'var(--emas-ink)', marginTop: 4 }}>IKHWAN</div>
                {renderKetuaTable(ketuaIkhwan)}
              </>
            )}
            {ketuaAkhwat.length > 0 && (
              <>
                <div className="t-tiny" style={{ color: 'var(--emas-ink)', marginTop: 4 }}>AKHWAT</div>
                {renderKetuaTable(ketuaAkhwat)}
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

/** Gabungan "Metode Pengajaran Modul" + "Manajemen Halaqah" — rata-rata nilai
 *  yang ada; null diabaikan supaya baris lama yang cuma punya salah satu tetap
 *  tampil apa adanya. Sama dengan perhitungan di matrix-compute. */
function mergeHalaqah(metode: number | null, halaqah: number | null): number | null {
  const ada = [metode, halaqah].filter((v): v is number => v !== null);
  if (ada.length === 0) return null;
  return ada.reduce((a, b) => a + b, 0) / ada.length;
}

function ScoreCell({ v, muted, label }: { v: number | null; muted?: boolean; label?: string }) {
  if (v === null || v === undefined) {
    return <td data-label={label} style={{ textAlign: 'center', color: 'var(--muted-2)' }}>—</td>;
  }
  const color = v >= 3 ? 'var(--hijau-ink)' : v >= 2 ? 'var(--kuning-ink)' : 'var(--merah-ink)';
  return (
    <td data-label={label} style={{ textAlign: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color, opacity: muted ? 0.85 : 1 }}>{v}</span>
    </td>
  );
}
