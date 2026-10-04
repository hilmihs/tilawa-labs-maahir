import { requireOneOfRoles } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MatrixTrendChart } from '@/components/charts/MatrixTrendChart';
import { MatrixRadarChart } from '@/components/charts/MatrixRadarChart';
import { computeRiskPengajar, levelColor, levelLabel } from '@/lib/risk';
import { NotesPanel } from '@/components/NotesPanel';
import {
  INDIKATOR_BY_KATEGORI,
  KATEGORI_LABEL as KATEGORI_NAMA,
  KATEGORI_ORDER,
  INDIKATOR,
  type IndikatorKey,
} from '@/lib/matrix-indicators';
import { todayJakartaISO } from '@/lib/hits-observasi';
import type { Gender } from '@/types/db';

interface NoteRow {
  id: string;
  author_role: string;
  author_id: string;
  body: string;
  visibility: string;
  created_at: string;
}

export const dynamic = 'force-dynamic';

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(2);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 10);
}

function scoreColor(value: number | null | undefined, standar: number): string {
  if (value === null || value === undefined) return 'var(--muted-2)';
  if (value >= standar) return 'var(--hijau-ink)';
  if (value >= standar - 1) return 'var(--kuning-ink)';
  return 'var(--merah-ink)';
}

const KATEGORI_LABEL: Record<string, { label: string; color: string }> = {
  kedisiplinan_waktu: { label: 'Disiplin Waktu', color: 'var(--merah-ink)' },
  komitmen_jadwal: { label: 'Komitmen Jadwal', color: 'var(--merah-ink)' },
  tanggung_jawab: { label: 'Tanggung Jawab', color: 'var(--merah-ink)' },
  kepatuhan_sop: { label: 'Kepatuhan SOP', color: 'var(--merah-ink)' },
};

const SCORE_COLS_DETAIL =
  'skor_bacaan, skor_tajwid, skor_kehadiran_maahir, skor_kehadiran_tibyan, skor_metode_pengajaran, skor_kepatuhan_silabus, skor_manajemen_halaqah, skor_evaluasi_penguasaan, skor_kedisiplinan_waktu, skor_komitmen_jadwal, skor_tanggung_jawab, skor_kepatuhan_sop';

const KONDISI_LABEL: Record<string, { label: string; badge: string }> = {
  KBBS: { label: 'KBBS — Kelas Berlangsung Baik', badge: 'badge-hijau' },
  KMT: { label: 'KMT — Kelas Mulai Terlambat', badge: 'badge-kuning' },
  JKG: { label: 'JKG — Jadwal Kelas Ganti', badge: 'badge-kuning' },
  KBLA: { label: 'KBLA — Kelas Bermasalah/Libur Adhoc', badge: 'badge-kuning' },
  LIBUR: { label: 'LIBUR', badge: 'badge-neutral' },
};

function currentYearMonth(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

export default async function PengajarDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { bulan?: string; gender?: string; tampilan?: string };
}) {
  const session = await requireOneOfRoles(['koordinator', 'syaikh']);
  // Catatan koordinator bersifat internal antar-koordinator; syaikh membaca
  // halaman ini untuk skornya, bukan untuk catatan itu.
  const bolehCatatan = session.role === 'koordinator';
  const gender: Gender =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : session.gender;

  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, whatsapp_number, kelompok_id, is_ketua, active, last_login_at')
    .eq('id', params.id)
    .eq('gender', gender)
    .maybeSingle();

  if (!pengajar) notFound();

  const { data: kelompok } = pengajar.kelompok_id
    ? await supabaseAdmin
        .from('kelompok_pengajar')
        .select('name')
        .eq('id', pengajar.kelompok_id)
        .maybeSingle()
    : { data: null };

  const { data: kelasList } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id')
    .eq('pengajar_id', params.id)
    .eq('active', true);
  const kelasIds = (kelasList ?? []).map((k) => k.id);

  const [
    { data: matrixHistory },
    { data: teguranList },
    { data: penilaianMasyaikh },
    { data: penilaianPedagogis },
    { data: observasiList },
  ] = await Promise.all([
    supabaseAdmin
      .from('matrix_rekap')
      .select(
        'year_month, rata_rata_hard_skill, rata_rata_pedagogis, rata_rata_soft_skill, rata_rata_keseluruhan, ranking, total_teguran_bulan, total_teguran_kumulatif, finalized_at'
      )
      .eq('pengajar_id', params.id)
      .order('year_month', { ascending: false })
      .limit(6),
    supabaseAdmin
      .from('teguran')
      .select('id, year_month, category, nomor_teguran, keterangan, issued_by_role, created_at')
      .eq('pengajar_id', params.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('penilaian_masyaikh')
      .select(
        'year_month, skor_bacaan, keterangan_bacaan, assessor_role, updated_at'
      )
      .eq('pengajar_id', params.id)
      .order('year_month', { ascending: false })
      .limit(6),
    supabaseAdmin
      .from('penilaian_pedagogis')
      .select(
        'year_month, skor_metode_pengajaran, keterangan_metode, skor_kepatuhan_silabus, keterangan_silabus, skor_manajemen_halaqah, keterangan_halaqah, skor_evaluasi_penguasaan, keterangan_evaluasi, skor_kepatuhan_sop, keterangan_sop, catatan_umum, updated_at'
      )
      .eq('pengajar_id', params.id)
      .order('year_month', { ascending: false })
      .limit(6),
    kelasIds.length
      ? supabaseAdmin
          .from('hits_keterangan_harian')
          .select('id, halaqah_id, tanggal, kondisi, catatan')
          .in('halaqah_id', kelasIds)
          // Baris pra-generate untuk pertemuan yang belum terjadi jangan
          // menyembul di puncak daftar (urut tanggal desc).
          .lte('tanggal', todayJakartaISO())
          .order('tanggal', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as Array<{ id: string; halaqah_id: string; tanggal: string; kondisi: string; catatan: string | null }> }),
  ]);

  const totalTeguranKum = matrixHistory?.[0]?.total_teguran_kumulatif ?? teguranList?.length ?? 0;
  const stepsUntilNonaktif = Math.max(0, 4 - totalTeguranKum);

  const risk = await computeRiskPengajar(params.id);

  // Bulan terpilih → radar chart + rincian per indikator.
  const monthSel =
    searchParams.bulan && /^\d{4}-\d{2}$/.test(searchParams.bulan)
      ? searchParams.bulan
      : matrixHistory?.[0]?.year_month ?? currentYearMonth();

  const { data: matrixCurrent } = await supabaseAdmin
    .from('matrix_rekap')
    .select(SCORE_COLS_DETAIL)
    .eq('pengajar_id', params.id)
    .eq('year_month', monthSel)
    .maybeSingle();
  const mc = matrixCurrent as Record<string, unknown> | null;

  const masyaikhSel = (penilaianMasyaikh ?? []).find((p) => p.year_month === monthSel) as
    | { keterangan_bacaan?: string | null }
    | undefined;
  const pedagogisSel = (penilaianPedagogis ?? []).find((p) => p.year_month === monthSel) as
    | Record<string, string | null>
    | undefined;
  const keteranganOf: Partial<Record<IndikatorKey, string | null>> = {
    skor_bacaan: masyaikhSel?.keterangan_bacaan ?? null,
    skor_kepatuhan_silabus: pedagogisSel?.keterangan_silabus ?? null,
    // Manajemen Halaqah kini gabungan metode + halaqah → keterangannya juga
    // digabung supaya catatan lama tak hilang dari tampilan.
    skor_manajemen_halaqah: [pedagogisSel?.keterangan_halaqah, pedagogisSel?.keterangan_metode]
      .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      .join(' · ') || null,
    skor_evaluasi_penguasaan: pedagogisSel?.keterangan_evaluasi ?? null,
    skor_kepatuhan_sop: pedagogisSel?.keterangan_sop ?? null,
  };

  const skorOf = (k: IndikatorKey): number | null => {
    const v = mc?.[k];
    return v === null || v === undefined ? null : Number(v);
  };
  const radarData = INDIKATOR.map((ind) => ({ indikator: ind.short, skor: skorOf(ind.key), standar: ind.standar }));

  // Kembali ke tampilan asal (blok / tabel), bukan selalu ke tabel.
  const tampilanAsal = searchParams.tampilan === 'blok' ? 'blok' : 'tabel';
  const kembaliHref = `/matrix/koordinator?bulan=${monthSel}&gender=${gender}&tampilan=${tampilanAsal}`;

  // Notes: tampilkan peer notes + own private notes
  const sessionAuthorId = session.role === 'koordinator' ? session.koordinator_id : null;
  const { data: notesRaw } = bolehCatatan
    ? await supabaseAdmin
        .from('koordinator_notes')
        .select('id, author_role, author_id, body, visibility, created_at')
        .eq('target_type', 'pengajar')
        .eq('target_id', params.id)
        .or(`visibility.eq.peer,and(visibility.eq.private,author_id.eq.${sessionAuthorId})`)
        .order('created_at', { ascending: false })
        .limit(20)
    : { data: [] };

  const authorIds = Array.from(new Set((notesRaw ?? []).map((n) => n.author_id)));
  const authorMap = new Map<string, string>();
  if (authorIds.length) {
    const tables = ['koordinator_ketua_kelas', 'koordinator', 'syaikh'];
    for (const t of tables) {
      const { data } = await supabaseAdmin.from(t).select('id, name').in('id', authorIds);
      for (const r of data ?? []) authorMap.set(r.id, r.name);
    }
  }

  const notes = ((notesRaw ?? []) as NoteRow[]).map((n) => ({
    id: n.id,
    author_role: n.author_role,
    author_name: authorMap.get(n.author_id),
    body: n.body,
    visibility: n.visibility,
    created_at: n.created_at,
    isMine: n.author_id === sessionAuthorId,
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> Pengajar
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href={kembaliHref} className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>
                {Icon.back(12)} Matrix
              </Link>
              <LogoutButton />
            </div>
          </div>

          {/* Header */}
          <div className="card-flat" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h1 className="t-h1" style={{ marginBottom: 4 }}>{pengajar.name}</h1>
                <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                  {kelompok?.name ?? '—'} · {pengajar.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
                  {pengajar.is_ketua && ' · Ketua Kelompok'}
                </p>
                <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
                  Login terakhir: {pengajar.last_login_at ? new Date(pengajar.last_login_at).toLocaleDateString('id-ID') : '—'}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {!pengajar.active && <span className="badge badge-merah"><span className="dot" /> Nonaktif</span>}
                {pengajar.active && totalTeguranKum >= 3 && (
                  <span className="badge badge-merah"><span className="dot" /> {stepsUntilNonaktif} teguran lagi → nonaktif</span>
                )}
                {pengajar.active && totalTeguranKum > 0 && totalTeguranKum < 3 && (
                  <span className="badge badge-kuning"><span className="dot" /> {totalTeguranKum} teguran kumulatif</span>
                )}
                {pengajar.active && totalTeguranKum === 0 && (
                  <span className="badge badge-hijau"><span className="dot" /> Tanpa teguran</span>
                )}
              </div>
            </div>
          </div>

          {/* Profil kompetensi — spider chart + rincian per indikator */}
          <div className="card-flat" style={{ padding: 18, marginBottom: 24, borderRadius: 'var(--r-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <h2 className="t-h2" style={{ margin: 0 }}>Profil Kompetensi</h2>
              <span className="t-small" style={{ color: 'var(--muted-2)' }}>Bulan {monthSel}</span>
            </div>
            {mc ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 20, alignItems: 'start' }} className="matrix-profil-grid">
                <div>
                  <MatrixRadarChart data={radarData} height={300} />
                  <p className="t-tiny" style={{ color: 'var(--muted-2)', textAlign: 'center', marginTop: 4 }}>
                    Garis putus-putus = standar · area = skor pengajar
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {/* Kategori tengah bernama 'inspeksi', bukan 'pedagogis'.
                      Dulu di sini ada cast `as Kategori[]` yang menyembunyikan
                      salah tulis itu dari tsc — halaman 500 untuk tiap pengajar
                      yang punya baris matrix di bulan terpilih. Tanpa cast,
                      salah tulis berikutnya ketahuan saat typecheck. */}
                  {KATEGORI_ORDER.map((kat) => (
                    <div key={kat} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: 12 }}>
                      <div className="t-tiny" style={{ marginBottom: 8, color: 'var(--ink-2)' }}>{KATEGORI_NAMA[kat]}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {INDIKATOR_BY_KATEGORI[kat].map((ind) => {
                          const v = skorOf(ind.key);
                          const ket = keteranganOf[ind.key];
                          return (
                            <div key={ind.key}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                                <span className="t-small" style={{ fontWeight: 600 }}>{ind.label}</span>
                                <span className="t-mono" style={{ fontWeight: 700, color: scoreColor(v, ind.standar) }}>
                                  {v ?? '—'}<span style={{ color: 'var(--muted-2)', fontWeight: 400, fontSize: 11 }}>/{ind.standar}</span>
                                </span>
                              </div>
                              <div className="t-tiny" style={{ color: 'var(--muted-2)', lineHeight: 1.35 }}>{ind.deskripsi}</div>
                              {ket && (
                                <div className="t-tiny" style={{ color: 'var(--ink-2)', fontStyle: 'italic', marginTop: 2 }}>“{ket}”</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="t-small" style={{ color: 'var(--muted)' }}>Belum ada data matrix untuk bulan {monthSel}.</p>
            )}
            {pedagogisSel?.catatan_umum && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                <div className="t-tiny" style={{ color: 'var(--ink-2)', marginBottom: 4 }}>CATATAN UMUM KETUA KELOMPOK — BULAN {monthSel}</div>
                <p className="t-small" style={{ margin: 0, color: 'var(--ink-2)', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>“{pedagogisSel.catatan_umum}”</p>
              </div>
            )}
          </div>

          {/* Notes panel — koordinator saja */}
          {bolehCatatan && <NotesPanel targetType="pengajar" targetId={params.id} notes={notes} />}

          {/* Risk breakdown */}
          <h2 className="t-h2" style={{ marginBottom: 10 }}>Risk Profile</h2>
          <div className="card-flat" style={{ padding: 16, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              <div>
                <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>Risk score</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: levelColor(risk.level) }}>
                  {risk.score} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>/ 100 — {levelLabel(risk.level)}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {risk.factors.map((f) => (
                <div key={f.name} style={{ padding: 10, borderRadius: 8, background: 'var(--surface-2)' }}>
                  <div className="t-small" style={{ fontWeight: 600 }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{f.detail}</div>
                  <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${(f.points / f.weight) * 100}%`,
                        height: '100%',
                        background: f.points >= f.weight * 0.75
                          ? 'var(--merah)'
                          : f.points >= f.weight * 0.5
                          ? 'var(--kuning)'
                          : f.points > 0
                          ? 'var(--accent)'
                          : 'var(--hijau)',
                      }}
                    />
                  </div>
                  <div className="t-tiny" style={{ marginTop: 4, color: 'var(--muted-2)' }}>
                    {f.points} / {f.weight} pts
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trend chart */}
          {matrixHistory && matrixHistory.length > 1 && (
            <>
              <h2 className="t-h2" style={{ marginBottom: 10 }}>Trend 6 Bulan</h2>
              <div className="card-flat" style={{ padding: 16, marginBottom: 24 }}>
                <MatrixTrendChart data={matrixHistory.map((m) => ({
                  year_month: m.year_month,
                  rata_rata_hard_skill: m.rata_rata_hard_skill != null ? Number(m.rata_rata_hard_skill) : null,
                  rata_rata_pedagogis: m.rata_rata_pedagogis != null ? Number(m.rata_rata_pedagogis) : null,
                  rata_rata_soft_skill: m.rata_rata_soft_skill != null ? Number(m.rata_rata_soft_skill) : null,
                  rata_rata_keseluruhan: m.rata_rata_keseluruhan != null ? Number(m.rata_rata_keseluruhan) : null,
                }))} />
              </div>
            </>
          )}

          {/* Matrix history */}
          <h2 className="t-h2" style={{ marginBottom: 10 }}>Riwayat Matrix Bulanan</h2>
          {matrixHistory && matrixHistory.length > 0 ? (
            <div className="card-flat" style={{ padding: 0, overflowX: 'auto', marginBottom: 24 }}>
              <table className="t-mono tbl-cards" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Bulan</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Hard</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Ped.</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Soft</th>
                    <th style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'right' }}>Rata²</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Ranking</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Teguran</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixHistory.map((m, i) => (
                    <tr key={m.year_month} style={{ borderTop: '1px solid var(--line)', background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                      <td className="tbl-cardhead" style={{ padding: '10px 12px', fontWeight: 600 }}>{m.year_month}</td>
                      <td data-label="Hard" style={{ padding: '10px 8px', textAlign: 'right', color: scoreColor(Number(m.rata_rata_hard_skill), 3) }}>{fmtNum(m.rata_rata_hard_skill)}</td>
                      <td data-label="Pedagogis" style={{ padding: '10px 8px', textAlign: 'right', color: scoreColor(Number(m.rata_rata_pedagogis), 4) }}>{fmtNum(m.rata_rata_pedagogis)}</td>
                      <td data-label="Soft" style={{ padding: '10px 8px', textAlign: 'right', color: scoreColor(Number(m.rata_rata_soft_skill), 4) }}>{fmtNum(m.rata_rata_soft_skill)}</td>
                      <td data-label="Rata²" style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: scoreColor(Number(m.rata_rata_keseluruhan), 3.5) }}>{fmtNum(m.rata_rata_keseluruhan)}</td>
                      <td data-label="Ranking" style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--muted)' }}>{m.ranking ?? '—'}</td>
                      <td data-label="Teguran" style={{ padding: '10px 8px', textAlign: 'right' }}>{m.total_teguran_bulan} / {m.total_teguran_kumulatif}</td>
                      <td data-label="Status" style={{ padding: '10px 8px', textAlign: 'center' }}>
                        {m.finalized_at ? <span className="badge badge-hijau"><span className="dot" />Final</span> : <span className="badge badge-kuning"><span className="dot" />Draft</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center', marginBottom: 24 }}>
              <p className="t-small" style={{ color: 'var(--muted)' }}>Belum ada rekap matrix.</p>
            </div>
          )}

          {/* Penilaian Masyaikh (bacaan) */}
          <h2 className="t-h2" style={{ marginBottom: 10 }}>Penilaian Masyaikh — Bacaan</h2>
          {penilaianMasyaikh && penilaianMasyaikh.length > 0 ? (
            <div className="card-flat" style={{ padding: 0, overflowX: 'auto', marginBottom: 24 }}>
              <table className="t-mono tbl-cards" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Bulan</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Bacaan (≥3)</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Assessor</th>
                  </tr>
                </thead>
                <tbody>
                  {penilaianMasyaikh.map((p, i) => (
                    <tr key={p.year_month} style={{ borderTop: '1px solid var(--line)', background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                      <td className="tbl-cardhead" style={{ padding: '10px 12px', fontWeight: 600 }}>{p.year_month}</td>
                      <td data-label="Bacaan (≥3)" style={{ padding: '10px 8px', textAlign: 'right', color: scoreColor(p.skor_bacaan, 3) }}>{p.skor_bacaan ?? '—'}</td>
                      <td data-label="Assessor" style={{ padding: '10px 12px', color: 'var(--muted)' }}>{p.assessor_role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center', marginBottom: 24 }}>
              <p className="t-small" style={{ color: 'var(--muted)' }}>Belum ada penilaian masyaikh.</p>
            </div>
          )}

          {/* Penilaian Pedagogis */}
          <h2 className="t-h2" style={{ marginBottom: 10 }}>Penilaian Pedagogis (≥4)</h2>
          {penilaianPedagogis && penilaianPedagogis.length > 0 ? (
            <div className="card-flat" style={{ padding: 0, overflowX: 'auto', marginBottom: 24 }}>
              <table className="t-mono tbl-cards" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Bulan</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Metode</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Silabus</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Manajemen</th>
                    <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Evaluasi</th>
                  </tr>
                </thead>
                <tbody>
                  {penilaianPedagogis.map((p, i) => (
                    <tr key={p.year_month} style={{ borderTop: '1px solid var(--line)', background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                      <td className="tbl-cardhead" style={{ padding: '10px 12px', fontWeight: 600 }}>{p.year_month}</td>
                      <td data-label="Metode" style={{ padding: '10px 8px', textAlign: 'right', color: scoreColor(p.skor_metode_pengajaran, 4) }}>{p.skor_metode_pengajaran ?? '—'}</td>
                      <td data-label="Silabus" style={{ padding: '10px 8px', textAlign: 'right', color: scoreColor(p.skor_kepatuhan_silabus, 4) }}>{p.skor_kepatuhan_silabus ?? '—'}</td>
                      <td data-label="Manajemen" style={{ padding: '10px 8px', textAlign: 'right', color: scoreColor(p.skor_manajemen_halaqah, 4) }}>{p.skor_manajemen_halaqah ?? '—'}</td>
                      <td data-label="Evaluasi" style={{ padding: '10px 8px', textAlign: 'right', color: scoreColor(p.skor_evaluasi_penguasaan, 4) }}>{p.skor_evaluasi_penguasaan ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center', marginBottom: 24 }}>
              <p className="t-small" style={{ color: 'var(--muted)' }}>Belum ada penilaian pedagogis.</p>
            </div>
          )}

          {/* Teguran timeline */}
          <h2 className="t-h2" style={{ marginBottom: 10 }}>Riwayat Teguran (20 terakhir)</h2>
          {teguranList && teguranList.length > 0 ? (
            <div style={{ marginBottom: 24 }}>
              {teguranList.map((t) => {
                const cat = KATEGORI_LABEL[t.category] ?? { label: t.category, color: 'var(--ink-2)' };
                return (
                  <div key={t.id} className="card-flat" style={{ padding: '12px 16px', marginBottom: 8, borderLeft: '3px solid var(--merah)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, color: cat.color }}>
                        #{t.nomor_teguran} — {cat.label}
                      </div>
                      <div className="t-small" style={{ color: 'var(--muted-2)' }}>{fmtDate(t.created_at)} · {t.year_month}</div>
                    </div>
                    {t.keterangan && <p className="t-small" style={{ color: 'var(--ink-2)' }}>{t.keterangan}</p>}
                    <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>Oleh: {t.issued_by_role}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center', marginBottom: 24 }}>
              <p className="t-small" style={{ color: 'var(--muted)' }}>Tidak ada teguran tercatat. ✓</p>
            </div>
          )}

          {/* Observasi recent (filter by pengajar via kelas_hits) */}
          <h2 className="t-h2" style={{ marginBottom: 10 }}>Observasi Kelas (20 terakhir)</h2>
          {observasiList && observasiList.length > 0 ? (
            <div style={{ marginBottom: 24 }}>
              {observasiList.slice(0, 20).map((o) => {
                const kondisi = KONDISI_LABEL[o.kondisi as string] ?? { label: o.kondisi as string, badge: 'badge-neutral' };
                return (
                  <div key={o.id} className="card-flat" style={{ padding: '10px 14px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{o.tanggal}</div>
                        {o.catatan && <p className="t-small" style={{ color: 'var(--muted)', marginTop: 4 }}>{o.catatan}</p>}
                      </div>
                      <span className={`badge ${kondisi.badge}`}><span className="dot" />{kondisi.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center', marginBottom: 24 }}>
              <p className="t-small" style={{ color: 'var(--muted)' }}>Belum ada observasi tercatat.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
