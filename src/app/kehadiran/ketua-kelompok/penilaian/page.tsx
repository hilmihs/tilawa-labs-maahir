import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import type { PengajarSession } from '@/types/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PenilaianPedagogisForm } from './PenilaianPedagogisForm';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { KelompokNavSelect } from '@/components/KelompokNavSelect';
import { monthOptionsSince } from '@/lib/month';

export const dynamic = 'force-dynamic';

const PED_FIELDS = [
  'skor_metode_pengajaran',
  'skor_kepatuhan_silabus',
  'skor_manajemen_halaqah',
  'skor_evaluasi_penguasaan',
] as const;

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}
function monthLabelOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
// Geser `ym` mundur n bulan (YYYY-MM).
function ymMinus(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
// N bulan terakhir s/d `endYm` (inklusif), urut lama→baru.
function lastMonths(endYm: string, n: number): string[] {
  const [ey, em] = endYm.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export default async function PenilaianPedagogisPage({
  searchParams,
}: {
  searchParams: { month?: string; kelompok?: string };
}) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const ketua = accesses.find((a) => a.role === 'pengajar' && a.is_ketua) as PengajarSession | undefined;
  const isKoordinator = accesses.some((a) => a.role === 'koordinator');
  // Ketua kelompok = editor (kelompoknya sendiri). Koordinator = spectator
  // (baca-saja, bisa pilih kelompok mana pun).
  if (!ketua && !isKoordinator) redirect('/');
  const spectator = !ketua;

  const cur = currentYearMonth();
  const ym = searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : cur;
  // Bulan lampau tetap bisa diisi (parity dgn penilaian bacaan): 12 bulan terakhir.
  const monthOptions = monthOptionsSince(ymMinus(cur, 11));
  const overviewMonths = lastMonths(cur, 6);

  // Pilih kelompok: editor terkunci ke kelompoknya; spectator pilih dari semua.
  let kelompokId: string | null = ketua?.kelompok_id ?? null;
  let kelompokOptions: Array<{ value: string; label: string }> = [];
  if (spectator) {
    const { data: allKelompok } = await supabaseAdmin
      .from('kelompok_pengajar')
      .select('id, name')
      .order('name');
    // "Belum Ada Kelompok (...)" = bucket pengajar belum terorganisir, bukan
    // halaqah nyata — tidak relevan untuk penilaian pedagogis.
    kelompokOptions = (allKelompok ?? [])
      .filter((k) => !k.name.startsWith('Belum Ada Kelompok'))
      .map((k) => ({ value: k.id, label: k.name }));
    const wanted = searchParams.kelompok;
    kelompokId = wanted && kelompokOptions.some((k) => k.value === wanted)
      ? wanted
      : (kelompokOptions[0]?.value ?? null);
  }

  const { data: members } = kelompokId
    ? await supabaseAdmin
        .from('pengajar')
        .select('id, name, is_ketua')
        .eq('kelompok_id', kelompokId)
        .eq('active', true)
        .order('name')
    : { data: [] };

  const anggota = (members ?? []).filter((m) => !m.is_ketua);
  const memberIds = anggota.map((m) => m.id);
  const noId = ['00000000-0000-0000-0000-000000000000'];

  // Penilaian bulan terpilih (untuk form edit)
  const { data: existing } = await supabaseAdmin
    .from('penilaian_pedagogis')
    .select('pengajar_id, skor_metode_pengajaran, keterangan_metode, skor_kepatuhan_silabus, keterangan_silabus, skor_manajemen_halaqah, keterangan_halaqah, skor_evaluasi_penguasaan, keterangan_evaluasi, skor_kepatuhan_sop, keterangan_sop, catatan_umum')
    .eq('year_month', ym)
    .in('pengajar_id', memberIds.length ? memberIds : noId);
  const existingMap = new Map((existing ?? []).map((e) => [e.pengajar_id, e]));

  // Riwayat bulan-ke-bulan (avg 4 aspek pedagogis)
  const { data: history } = await supabaseAdmin
    .from('penilaian_pedagogis')
    .select('pengajar_id, year_month, skor_metode_pengajaran, skor_kepatuhan_silabus, skor_manajemen_halaqah, skor_evaluasi_penguasaan')
    .in('year_month', overviewMonths.length ? overviewMonths : ['0000-00'])
    .in('pengajar_id', memberIds.length ? memberIds : noId);
  const avgByMemberMonth = new Map<string, number | null>();
  for (const h of history ?? []) {
    const scores = PED_FIELDS.map((f) => (h as Record<string, number | null>)[f]).filter((s): s is number => s !== null && s !== undefined);
    const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    avgByMemberMonth.set(`${h.pengajar_id}:${h.year_month}`, avg);
  }

  const membersWithPenilaian = anggota.map((m) => ({
    id: m.id,
    name: m.name,
    penilaian: existingMap.get(m.id) ?? null,
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <Link href={spectator ? '/' : '/kehadiran/ketua-kelompok'} className="btn btn-sm btn-ghost" style={{ textDecoration: 'none' }}>←</Link>
            <div style={{ flex: 1 }}>
              <h1 className="t-h1" style={{ margin: 0 }}>Penilaian Pedagogis</h1>
              <p className="t-small" style={{ margin: 0, color: 'var(--muted-2)' }}>
                {spectator ? 'Skala 0–4 · mode pantau (baca-saja) · pilih kelompok' : 'Skala 0–4 · auto-simpan · anggota kelompok Anda'}
              </p>
            </div>
            {spectator && kelompokOptions.length > 0 && (
              <KelompokNavSelect options={kelompokOptions} value={kelompokId ?? ''} />
            )}
            <MonthNavSelect options={monthOptions} value={ym} />
          </div>

          {membersWithPenilaian.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada anggota kelompok.</p>
          ) : (
            <>
              <div className="t-tiny" style={{ marginBottom: 8 }}>{spectator ? 'LIHAT' : 'EDIT'} {monthLabelOf(ym).toUpperCase()}</div>
              {/* key = bulan+kelompok → form RE-MOUNT saat ganti bulan/kelompok, supaya
                  state (skor) reset dari data bulan terpilih. Tanpa ini, ganti bulan
                  (soft nav) tak reset useState → skor basi tersimpan ke bulan baru. */}
              <PenilaianPedagogisForm key={`${ym}:${kelompokId ?? 'none'}`} members={membersWithPenilaian} yearMonth={ym} readOnly={spectator} />

              {/* Riwayat bulan-ke-bulan */}
              <div style={{ marginTop: 28 }}>
                <div className="t-tiny" style={{ marginBottom: 8 }}>KONDISI ANGGOTA — RATA² PEDAGOGIS PER BULAN</div>
                <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="table-scroll">
                    <table className="k-table">
                      <thead>
                        <tr>
                          <th style={{ minWidth: 140 }}>Anggota</th>
                          {overviewMonths.map((mo) => (
                            <th key={mo} style={{ textAlign: 'center' }}>
                              {new Date(Date.UTC(Number(mo.split('-')[0]), Number(mo.split('-')[1]) - 1, 1)).toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' })}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {anggota.map((m) => (
                          <tr key={m.id}>
                            <td style={{ fontWeight: 600 }}>{m.name}</td>
                            {overviewMonths.map((mo) => {
                              const v = avgByMemberMonth.get(`${m.id}:${mo}`);
                              return (
                                <td key={mo} style={{ textAlign: 'center' }}>
                                  {v != null ? (
                                    <span style={{ fontWeight: 700, color: v >= 3 ? 'var(--hijau-ink)' : v >= 2 ? 'var(--kuning-ink)' : 'var(--merah-ink)' }}>{v.toFixed(1)}</span>
                                  ) : (
                                    <span style={{ color: 'var(--muted-2)' }}>—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
