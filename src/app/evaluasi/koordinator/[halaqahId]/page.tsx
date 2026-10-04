import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOneOfRoles } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ALL_LAHN, AMBANG, columnsToCounts, initials, tierOf, nilaiAkhirTrackOf, UJIAN_QN_SESI, UJIAN_PB_SESI } from '@/lib/evaluasi';
import { PrintButton } from '@/components/PrintButton';
import RekapNilaiAkhir from './RekapNilaiAkhir';

export const dynamic = 'force-dynamic';

interface NilaiRow extends Record<string, unknown> {
  sesi_id: string;
  peserta_id: string;
  skor: number;
  done: boolean;
  hadir: boolean;
}

const TOP_N = 5;

export default async function KoordinatorHalaqahPage({
  params,
}: {
  params: { halaqahId: string };
}) {
  // Rekap dibuka juga untuk koordinator ketua kelas — mereka memantau halaqah
  // yang sama; pengaturan tetap milik koordinator.
  const session = await requireOneOfRoles(['koordinator', 'koordinator_ketua_kelas']);
  const gender = session.gender;

  // id eval_halaqah selalu memuat ':' ("dpq:180"), dan App Router menyerahkan
  // segmen rute dalam bentuk ter-encode ("dpq%3A180") tanpa pernah men-decode-nya.
  // Tanpa decode di sini, setiap tombol Detail berujung 404.
  const halaqahId = decodeURIComponent(params.halaqahId);

  const { data: halaqah } = await supabaseAdmin
    .from('eval_halaqah')
    .select('id, nama, gender, mustawa, level, pengajar_id, batch_id')
    .eq('id', halaqahId)
    .maybeSingle();

  if (!halaqah || halaqah.gender !== gender) notFound();

  // Skema penilaian batch (0058). Batch HITS Januari: nilai akhir murni skor ujian,
  // tanpa bobot evaluasi berkala.
  let terpisah = false;
  if (halaqah.batch_id) {
    const { data: batchRow } = await supabaseAdmin
      .from('eval_batch')
      .select('rapot_ujian_terpisah')
      .eq('id', halaqah.batch_id as string)
      .maybeSingle();
    terpisah = !!batchRow?.rapot_ujian_terpisah;
  }

  const noId = ['00000000-0000-0000-0000-000000000000'];

  // Pengajar.
  let pengajar = '—';
  if (halaqah.pengajar_id) {
    const { data: p } = await supabaseAdmin
      .from('eval_pengajar')
      .select('nama')
      .eq('id', halaqah.pengajar_id as string)
      .maybeSingle();
    pengajar = (p?.nama as string) ?? '—';
  }

  // Peserta aktif.
  const { data: pesertaRaw } = await supabaseAdmin
    .from('eval_peserta')
    .select('id, nama, urutan')
    .eq('halaqah_id', halaqah.id as string)
    .eq('aktif', true)
    .order('urutan', { ascending: true });
  const pesertaList = pesertaRaw ?? [];

  // Sesi QN berjalan (nomor_sesi terbesar).
  const { data: sesiRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, nomor_sesi')
    .eq('halaqah_id', halaqah.id as string)
    .eq('jenis', 'qn');
  const sesiRows = (sesiRaw ?? []) as { id: string; nomor_sesi: number }[];
  const currentSesi = sesiRows.reduce<{ id: string; nomor_sesi: number } | null>(
    (best, s) => (!best || s.nomor_sesi > best.nomor_sesi ? s : best),
    null
  );

  // Nilai sesi berjalan.
  const { data: nilaiRaw } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select(
      'sesi_id, peserta_id, skor, done, hadir, ' +
        'jk_huruf, jk_harakat, jk_mad, jk_tasydid, kh_izhar, kh_idgham_bighunnah, kh_idgham_bilaghunnah, kh_idgham_mimi, kh_iqlab, kh_ikhfa_hakiki, kh_ikhfa_syafawi'
    )
    .in('sesi_id', currentSesi ? [currentSesi.id] : noId);
  const nilaiRows = (nilaiRaw ?? []) as NilaiRow[];
  const nilaiByPeserta = new Map(nilaiRows.map((n) => [n.peserta_id, n]));

  // Peserta list dengan tier & skor.
  const peserta = pesertaList.map((p) => {
    const n = nilaiByPeserta.get(p.id as string);
    const done = !!n?.done && n?.hadir !== false;
    const skor = done ? Number(n?.skor) || 0 : null;
    const tier = skor != null ? tierOf(skor) : null;
    return {
      id: p.id as string,
      nama: p.nama as string,
      initial: initials(p.nama as string),
      skor,
      skorColor: tier ? tier.color : 'var(--muted-2)',
      tierLabel: tier ? tier.label : 'Belum dinilai',
    };
  });

  // Rekap nilai akhir (berkala + ujian) semua peserta.
  const { data: allSesiRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, jenis, nomor_sesi, dihapus')
    .eq('halaqah_id', halaqah.id as string);
  const allSesi = ((allSesiRaw ?? []) as { id: string; jenis: string; nomor_sesi: number; dihapus: boolean }[]).filter(
    (s) => !s.dihapus
  );
  const sesiMeta = new Map(allSesi.map((s) => [s.id, s]));
  const { data: allNilaiRaw } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select('sesi_id, peserta_id, skor, done, hadir')
    .in('sesi_id', allSesi.length ? allSesi.map((s) => s.id) : noId);
  const allNilai = (allNilaiRaw ?? []) as { sesi_id: string; peserta_id: string; skor: number; done: boolean; hadir: boolean }[];
  const rekapRows = pesertaList.map((p) => {
    // Selaras dgn rapot resmi: hanya sesi done & hadir yang dihitung.
    const mine = allNilai.filter((n) => n.peserta_id === (p.id as string) && n.done && n.hadir !== false);
    // Sumbu rapot dirotasi (0062): akumulasi dipecah per track, bukan digabung.
    const berkalaQn: number[] = [];
    const berkalaPb: number[] = [];
    let ujianQn: number | null = null;
    let ujianPb: number | null = null;
    for (const n of mine) {
      const m = sesiMeta.get(n.sesi_id);
      if (!m) continue;
      const skor = Number(n.skor) || 0;
      if (m.jenis === 'qn') berkalaQn.push(skor);
      else if (m.jenis === 'pb') berkalaPb.push(skor);
      else if (m.jenis === 'ujian' && m.nomor_sesi === UJIAN_QN_SESI) ujianQn = skor;
      else if (m.jenis === 'ujian' && m.nomor_sesi === UJIAN_PB_SESI) ujianPb = skor;
    }
    // `terpisah` (batch rapot_ujian_terpisah) berlaku untuk KEDUA track.
    const qn = nilaiAkhirTrackOf('qn', berkalaQn, ujianQn, { ujianSaja: terpisah });
    const pb = nilaiAkhirTrackOf('pb', berkalaPb, ujianPb, { ujianSaja: terpisah });
    return { nama: p.nama as string, qn, pb };
  });

  // Distribusi jenis kesalahan (baris done).
  const lahnSum = new Array(ALL_LAHN.length).fill(0);
  let bermasalah = 0;
  for (const n of nilaiRows) {
    if (!n.done || n.hadir === false) continue;
    if ((Number(n.skor) || 0) < AMBANG) bermasalah += 1;
    const counts = columnsToCounts(n);
    ALL_LAHN.forEach((d, i) => {
      lahnSum[i] += counts[d.key] || 0;
    });
  }
  const totalErrors = lahnSum.reduce((a, b) => a + b, 0);

  const sorted = ALL_LAHN.map((d, i) => ({ label: d.label, count: lahnSum[i] }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  const distribusi: { label: string; pct: number }[] = [];
  if (totalErrors > 0) {
    const top = sorted.slice(0, TOP_N);
    const rest = sorted.slice(TOP_N).reduce((a, x) => a + x.count, 0);
    for (const x of top) {
      distribusi.push({ label: x.label, pct: Math.round((x.count / totalErrors) * 100) });
    }
    if (rest > 0) distribusi.push({ label: 'Lainnya', pct: Math.round((rest / totalErrors) * 100) });
  }

  const topLahn = sorted.length > 0 ? sorted[0].label : '—';
  const catatanMasalah = `${bermasalah} peserta di bawah ambang standar (${AMBANG}). Kesalahan terbanyak: ${topLahn}. Pertimbangkan sesi remedial.`;

  const level = (halaqah.level as string | null) ?? null;
  const mustawa = halaqah.mustawa as number | null;
  const genderLabel = gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat';
  const levelText = level ?? (mustawa != null ? `Mustawa ${mustawa}` : null);
  const sub = levelText ? `${genderLabel} · ${levelText}` : genderLabel;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="eval-print-wrap" style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 40px' }}>
        <Link
          href="/evaluasi/koordinator"
          className="btn btn-ghost btn-sm no-print"
          style={{ height: 34, padding: '0 12px', fontSize: 12, textDecoration: 'none', marginBottom: 14 }}
        >
          ← Semua halaqah
        </Link>

        {/* Header */}
        <div
          className="kop-fitur"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 18,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {halaqah.nama as string}{' '}
              <span className="t-small" style={{ fontSize: 14, fontWeight: 500 }}>· {sub}</span>
            </div>
            <div className="t-small" style={{ marginTop: 2 }}>
              Pengajar: {pengajar}
            </div>
          </div>
          <div className="no-print" style={{ marginLeft: 'auto' }}>
            <PrintButton label="Unduh laporan" />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <RekapNilaiAkhir halaqahNama={halaqah.nama as string} rows={rekapRows} terpisah={terpisah} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* Daftar peserta */}
          <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '12px 14px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--ink-2)',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--line)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Peserta
            </div>
            {peserta.length === 0 ? (
              <div className="t-small" style={{ padding: '14px' }}>
                Belum ada peserta aktif.
              </div>
            ) : (
              peserta.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <div
                    className="avatar"
                    style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0 }}
                  >
                    {p.initial}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {p.nama}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{p.tierLabel}</span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: p.skorColor,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 26,
                      textAlign: 'right',
                    }}
                  >
                    {p.skor == null ? '—' : p.skor}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Distribusi + catatan */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card-flat" style={{ padding: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--ink-2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 12,
                }}
              >
                Distribusi jenis kesalahan
              </div>
              {distribusi.length === 0 ? (
                <div className="t-small" style={{ margin: 0 }}>
                  Belum ada data kesalahan tercatat.
                </div>
              ) : (
                distribusi.map((d) => (
                  <div key={d.label} style={{ marginBottom: 9 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{d.label}</span>
                      <span style={{ color: 'var(--muted)' }}>{d.pct}%</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: 'var(--line)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{ height: '100%', background: 'oklch(0.58 0.09 165)', width: `${d.pct}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
            <div
              style={{
                background: 'oklch(0.96 0.03 25)',
                border: '1px solid oklch(0.86 0.07 25)',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'oklch(0.46 0.14 25)',
                  marginBottom: 4,
                }}
              >
                Perlu perhatian
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'oklch(0.46 0.14 25)',
                  opacity: 0.85,
                  lineHeight: 1.5,
                }}
              >
                {catatanMasalah}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
