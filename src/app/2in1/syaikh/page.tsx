import Link from 'next/link';
import { requireSyaikh } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { currentCycleStart, formatCycleDeadline, formatCycleRange, formatCycleRangeShort, cyclesInMonth, currentYearMonth } from '@/lib/week';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon, Initials } from '@/components/icons';
import { StatCard } from '@/components/ui/StatCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Podium } from '@/components/ui/Podium';
import {
  buildWaMeUrl,
  syaikhTitle,
  tplReminderMusyrifBelumSetor,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import type { Gender, NilaiRekaman, StatusSetoran } from '@/types/db';

export const dynamic = 'force-dynamic';

type MusyrifRow = {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
};

type SetoranMusyrifRow = {
  id: string;
  musyrif_id: string;
  status: StatusSetoran;
  submitted_at: string | null;
  checked_at: string | null;
};

export default async function SyaikhDashboard() {
  // requireSyaikh membaca SELURUH accesses, bukan cuma role yang sedang aktif.
  // Cek `s.session.role !== 'syaikh'` menendang pemegang banyak role (mis.
  // syaikh + koordinator + pengajar) ke '/' begitu role aktifnya bukan syaikh.
  const akses = await requireSyaikh();
  const syaikhId = akses.syaikh_id;
  const syaikhGender = akses.gender;
  const titel = syaikhTitle(syaikhGender);

  const cycle = currentCycleStart();
  const deadlineLabel = formatCycleDeadline(cycle);
  const { year: curYear, month: curMonth, label: monthLabel } = currentYearMonth();
  // Jumlah cycle sebulan tidak tetap sejak barnamij jadi bulanan (28 → 27).
  const monthCycles = cyclesInMonth(curYear, curMonth);

  // View cross-gender: tarik semua musyrif aktif. Aksi (cek/ingatkan)
  // tetap di-gating same-gender di UI di bawah.
  const { data: musyrifListRaw } = await supabaseAdmin
    .from('musyrif')
    .select('id, name, gender, whatsapp_number')
    .eq('active', true)
    .order('name');
  const musyrifList = (musyrifListRaw ?? []) as MusyrifRow[];

  const musyrifIds = musyrifList.map((m) => m.id);
  const { data: setoranListRaw } = await supabaseAdmin
    .from('setoran_musyrif')
    .select('id, musyrif_id, status, submitted_at, checked_at')
    .in(
      'musyrif_id',
      musyrifIds.length ? musyrifIds : ['00000000-0000-0000-0000-000000000000']
    )
    .eq('week_start', cycle);
  const setoranList = (setoranListRaw ?? []) as SetoranMusyrifRow[];
  const setoranByMusyrif = new Map(setoranList.map((st) => [st.musyrif_id, st]));

  const checkedIds = setoranList
    .filter((st) => st.status === 'checked')
    .map((st) => st.id);
  const { data: rekamanList } = await supabaseAdmin
    .from('rekaman_musyrif')
    .select('setoran_musyrif_id, nilai')
    .in(
      'setoran_musyrif_id',
      checkedIds.length ? checkedIds : ['00000000-0000-0000-0000-000000000000']
    );

  const rekamanBySetoran = new Map<string, NilaiRekaman[]>();
  for (const r of rekamanList ?? []) {
    const arr = rekamanBySetoran.get(r.setoran_musyrif_id) ?? [];
    if (r.nilai) arr.push(r.nilai as NilaiRekaman);
    rekamanBySetoran.set(r.setoran_musyrif_id, arr);
  }
  // suppress unused warning for syaikhId — kept for future audit logging
  void syaikhId;

  type StatusKey = 'belum' | 'menunggu' | 'selesai';
  type Row = {
    musyrif: MusyrifRow;
    setoran: SetoranMusyrifRow | undefined;
    rekaman: NilaiRekaman[];
    statusKey: StatusKey;
  };
  const rows: Row[] = musyrifList.map((m) => {
    const setoran = setoranByMusyrif.get(m.id);
    const rekaman = setoran ? rekamanBySetoran.get(setoran.id) ?? [] : [];
    let statusKey: StatusKey = 'belum';
    if (setoran?.status === 'submitted') statusKey = 'menunggu';
    else if (setoran?.status === 'checked') statusKey = 'selesai';
    return { musyrif: m, setoran, rekaman, statusKey };
  });

  const counters = {
    total: rows.length,
    belum: rows.filter((r) => r.statusKey === 'belum').length,
    menunggu: rows.filter((r) => r.statusKey === 'menunggu').length,
    selesai: rows.filter((r) => r.statusKey === 'selesai').length,
  };

  // Peer view: aktivitas rekan syaikh bulan ini
  const ym = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const { data: rekanSyaikh } = await supabaseAdmin
    .from('syaikh')
    .select('id, name, gender, last_login_at')
    .eq('active', true)
    .order('name');
  const rekanSyaikhIds = (rekanSyaikh ?? []).map((r) => r.id);
  const checkedByRekan = new Map<string, number>();
  if (rekanSyaikhIds.length) {
    const { data: checkedSetorans } = await supabaseAdmin
      .from('setoran_musyrif')
      .select('checked_by_syaikh_id, checked_at')
      .in('checked_by_syaikh_id', rekanSyaikhIds)
      .gte('checked_at', `${ym}-01`);
    for (const t of checkedSetorans ?? []) {
      if (t.checked_by_syaikh_id) {
        checkedByRekan.set(t.checked_by_syaikh_id, (checkedByRekan.get(t.checked_by_syaikh_id) ?? 0) + 1);
      }
    }
  }

  // Monthly peserta progress (all peserta, for ranking view)
  const { data: allKelas } = await supabaseAdmin.from('kelas').select('id, name');
  const allKelasIds = (allKelas ?? []).map((k) => k.id);
  const kelasNameById = new Map((allKelas ?? []).map((k) => [k.id, k.name]));
  const { data: allPesertaRaw } = allKelasIds.length
    ? await supabaseAdmin
        .from('peserta')
        .select('id, name, gender, kelas_id')
        .eq('active', true)
        .in('kelas_id', allKelasIds)
        .order('name')
    : { data: [] as Array<{ id: string; name: string; gender: string; kelas_id: string }> };

  const allPesertaIds = (allPesertaRaw ?? []).map((p) => p.id);
  const { data: pesertaMonthlySetoranRaw } = allPesertaIds.length
    ? await supabaseAdmin
        .from('setoran')
        .select('id, peserta_id, week_start, status')
        .in('peserta_id', allPesertaIds)
        .in('week_start', monthCycles.length ? monthCycles : ['1970-01-01'])
    : { data: [] as Array<{ id: string; peserta_id: string; week_start: string; status: string }> };

  const pesertaMonthlyMap = new Map<string, Record<string, { id: string; status: string }>>();
  for (const st of pesertaMonthlySetoranRaw ?? []) {
    const entry = pesertaMonthlyMap.get(st.peserta_id) ?? {};
    entry[st.week_start] = { id: st.id, status: st.status };
    pesertaMonthlyMap.set(st.peserta_id, entry);
  }

  const checkedPesertaMonthlyIds = (pesertaMonthlySetoranRaw ?? [])
    .filter((st) => st.status === 'checked')
    .map((st) => st.id);
  const { data: pesertaMonthlyRekamanRaw } = checkedPesertaMonthlyIds.length
    ? await supabaseAdmin
        .from('rekaman')
        .select('setoran_id, nilai')
        .in('setoran_id', checkedPesertaMonthlyIds)
    : { data: [] as Array<{ setoran_id: string; nilai: string | null }> };

  const pesertaRekamanMap = new Map<string, NilaiRekaman[]>();
  for (const r of pesertaMonthlyRekamanRaw ?? []) {
    const arr = pesertaRekamanMap.get(r.setoran_id) ?? [];
    if (r.nilai) arr.push(r.nilai as NilaiRekaman);
    pesertaRekamanMap.set(r.setoran_id, arr);
  }

  function nilaiToSkor(n: NilaiRekaman): number {
    if (n === 'hijau') return 4;
    if (n === 'kuning') return 2;
    return 0;
  }

  const pesertaMonthlyRows = (allPesertaRaw ?? [])
    .map((p) => {
      const entry = pesertaMonthlyMap.get(p.id) ?? {};
      const sel = monthCycles.map((c) => {
        const st = entry[c];
        const status: 'belum' | 'menunggu' | 'selesai' =
          !st ? 'belum' : st.status === 'checked' ? 'selesai' : st.status === 'submitted' ? 'menunggu' : 'belum';
        return { cycle: c, status, rekaman: st ? pesertaRekamanMap.get(st.id) ?? [] : [] };
      });
      const allNilai = sel.flatMap((x) => x.rekaman);
      const rataRata =
        allNilai.length > 0
          ? allNilai.reduce((acc, n) => acc + nilaiToSkor(n), 0) / allNilai.length
          : null;
      return { peserta: p, sel, rataRata };
    })
    .sort((a, b) => {
      if (a.rataRata === null && b.rataRata === null) return 0;
      if (a.rataRata === null) return 1;
      if (b.rataRata === null) return -1;
      return b.rataRata - a.rataRata;
    });

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span>Maahir
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href="/2in1/syaikh/penilaian"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px', textDecoration: 'none' }}
            >
              Penilaian
            </Link>
            <Link
              href="/matrix/koordinator?tampilan=blok"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px', textDecoration: 'none' }}
            >
              Matrix
            </Link>
            <Link
              href="/2in1/laporan"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px', textDecoration: 'none' }}
            >
              Laporan
            </Link>
            <Link
              href="/akun"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px', textDecoration: 'none' }}
            >
              Akun
            </Link>
            <LogoutButton />
          </div>
        </div>

        <div className="page">
          <div className="row" style={{ padding: '4px 0 16px' }}>
            <div
              className="avatar"
              style={{ background: 'var(--accent-tint)', color: 'var(--accent-2)' }}
            >
              <Initials name={akses.name} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{titel}</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{akses.name}</div>
            </div>
            <span className="pekan-tag">
              <span className="dot" />
              Periode {formatCycleRangeShort(cycle)}
            </span>
          </div>

          <div className="stat-grid-3" style={{ marginBottom: 14 }}>
            <StatCard value={counters.belum} label="Belum" valueColor="var(--merah-ink)" dotColor="var(--merah)" />
            <StatCard value={counters.menunggu} label="Menunggu" valueColor="var(--kuning-ink)" dotColor="var(--kuning)" />
            <StatCard value={counters.selesai} label="Selesai" valueColor="var(--hijau-ink)" dotColor="var(--hijau)" />
          </div>

          {(rekanSyaikh ?? []).length > 1 && (
            <div className="card-flat" style={{ padding: 0, overflow: 'hidden', marginTop: 14, marginBottom: 14 }}>
              <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
                <div className="t-tiny">Aktivitas Rekan Masyaikh — {ym}</div>
              </div>
              <div className="table-scroll">
              <table className="t-mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th style={{ padding: '8px 16px', fontWeight: 600 }}>Nama</th>
                    <th style={{ padding: '8px 8px', fontWeight: 600 }}>Gender</th>
                    <th style={{ padding: '8px 8px', fontWeight: 600, textAlign: 'right' }}>Setoran dicek</th>
                    <th style={{ padding: '8px 16px', fontWeight: 600, textAlign: 'right' }}>Login</th>
                  </tr>
                </thead>
                <tbody>
                  {(rekanSyaikh ?? []).map((r) => {
                    const isMe = r.id === syaikhId;
                    return (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--line)', background: isMe ? 'var(--accent-tint)' : 'transparent' }}>
                        <td style={{ padding: '8px 16px', fontWeight: isMe ? 700 : 500 }}>
                          {r.name} {isMe && <span className="t-tiny" style={{ color: 'var(--accent-2)' }}>(saya)</span>}
                        </td>
                        <td style={{ padding: '8px 8px', color: 'var(--muted)' }}>{r.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'right' }}>{checkedByRekan.get(r.id) ?? 0}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                          {r.last_login_at
                            ? new Date(r.last_login_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}

          <SectionHeader title="Musyrif & Musyrifah" right={`${counters.total} orang`} />

          {rows.length === 0 ? (
            <div className="card-flat" style={{ padding: 18 }}>
              <p className="t-small">Belum ada musyrif/musyrifah terdaftar.</p>
            </div>
          ) : (
            <div className="card-flat" style={{ overflow: 'hidden' }}>
              {rows.map(({ musyrif, setoran, rekaman, statusKey }) => {
                const setorUrl = absUrl('/2in1/musyrif/setor');
                const reminderWa = buildWaMeUrl(
                  musyrif.whatsapp_number,
                  tplReminderMusyrifBelumSetor({
                    musyrifName: musyrif.name,
                    musyrifGender: musyrif.gender,
                    setorUrl,
                    deadlineLabel,
                  })
                );
                return (
                  <div
                    key={musyrif.id}
                    className="row"
                    style={{ color: 'var(--ink)' }}
                  >
                    <div className="avatar">
                      <Initials name={musyrif.name} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{musyrif.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        <StatusLabel statusKey={statusKey} />
                        {setoran?.submitted_at && statusKey !== 'belum' && (
                          <> · {formatTime(setoran.submitted_at)}</>
                        )}
                      </div>
                    </div>
                    {statusKey === 'belum' && musyrif.gender === syaikhGender && (
                      <a
                        href={reminderWa}
                        target="_blank"
                        rel="noopener"
                        className="act-btn wa"
                        style={{ textDecoration: 'none' }}
                      >
                        {Icon.wa(11)} Ingatkan
                      </a>
                    )}
                    {statusKey === 'menunggu' && setoran && musyrif.gender === syaikhGender && (
                      <Link
                        href={`/2in1/syaikh/cek/${setoran.id}`}
                        className="badge badge-kuning"
                        style={{ textDecoration: 'none' }}
                      >
                        <span className="dot" />
                        Cek
                      </Link>
                    )}
                    {musyrif.gender !== syaikhGender && (
                      <span className="t-tiny" style={{ color: 'var(--muted)' }}>
                        {musyrif.gender === 'ikhwan' ? 'ikhwan' : 'akhwat'}
                      </span>
                    )}
                    {statusKey === 'selesai' && (
                      <span className="nilai-trio">
                        {rekaman.slice(0, 3).map((n, i) => (
                          <span key={i} className={`d ${n}`} />
                        ))}
                        {Array.from({ length: Math.max(0, 3 - rekaman.length) }).map((_, i) => (
                          <span key={`e${i}`} className="d" />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Progress ranking peserta bulan ini */}
          <SectionHeader title={`Ranking peserta — ${monthLabel}`} right={`${pesertaMonthlyRows.length} peserta`} style={{ marginTop: 24 }} />
          <Podium
            items={pesertaMonthlyRows
              .filter((r) => r.rataRata !== null)
              .slice(0, 3)
              .map((r) => ({
                id: r.peserta.id,
                name: r.peserta.name,
                sub: kelasNameById.get(r.peserta.kelas_id) ?? undefined,
                score: r.rataRata,
              }))}
            href={(id) => `/peserta/${id}`}
            colorFor={(score) =>
              score === null
                ? 'var(--muted-2)'
                : score >= 3
                  ? 'var(--hijau-ink)'
                  : score >= 2
                    ? 'var(--kuning-ink)'
                    : 'var(--merah-ink)'
            }
          />
          <div className="card-flat" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            {/* Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `30px 1fr ${monthCycles.map(() => '70px').join(' ')} 56px`,
                gap: 6,
                padding: '8px 12px',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--line)',
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <div>#</div>
              <div>Peserta</div>
              {monthCycles.map((c) => (
                <div key={c} style={{ textAlign: 'center' }}>{formatCycleRangeShort(c)}</div>
              ))}
              <div style={{ textAlign: 'center' }}>Rata²</div>
            </div>
            {pesertaMonthlyRows.length === 0 ? (
              <div style={{ padding: 18 }}>
                <p className="t-small">Belum ada data bulan ini.</p>
              </div>
            ) : (
              pesertaMonthlyRows.map(({ peserta, sel, rataRata }, idx) => {
                return (
                  <div
                    key={peserta.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `30px 1fr ${monthCycles.map(() => '70px').join(' ')} 56px`,
                      gap: 6,
                      padding: '9px 12px',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--line)',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontSize: 12, color: idx < 3 ? 'var(--accent-2)' : 'var(--muted)', fontWeight: idx < 3 ? 700 : 400 }}>
                      {idx + 1}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {peserta.name}
                      </div>
                    </div>
                    {sel.map((x) => (
                      <div key={x.cycle} style={{ textAlign: 'center' }}>
                        <SyaikhMonthCell status={x.status} rekaman={x.rekaman} />
                      </div>
                    ))}
                    <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                      {rataRata !== null ? (
                        <span style={{ color: rataRata >= 3 ? 'var(--hijau-ink)' : rataRata >= 2 ? 'var(--kuning-ink)' : 'var(--merah-ink)' }}>
                          {rataRata.toFixed(1)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted-2)' }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SyaikhMonthCell({ status, rekaman }: { status: 'belum' | 'menunggu' | 'selesai'; rekaman: NilaiRekaman[] }) {
  if (status === 'belum') return <span className="badge badge-merah" style={{ fontSize: 9 }}><span className="dot" />–</span>;
  if (status === 'menunggu') return <span className="badge badge-kuning" style={{ fontSize: 9 }}><span className="dot" />cek</span>;
  if (rekaman.length > 0) {
    return (
      <span className="nilai-trio" style={{ justifyContent: 'center' }}>
        {rekaman.slice(0, 3).map((n, i) => <span key={i} className={`d ${n}`} style={{ width: 7, height: 7 }} />)}
        {Array.from({ length: Math.max(0, 3 - rekaman.length) }).map((_, i) => <span key={`e${i}`} className="d" style={{ width: 7, height: 7 }} />)}
      </span>
    );
  }
  return <span className="badge badge-hijau" style={{ fontSize: 9 }}><span className="dot" />✓</span>;
}

function StatusLabel({ statusKey }: { statusKey: 'belum' | 'menunggu' | 'selesai' }) {
  if (statusKey === 'belum') return <span style={{ color: 'var(--merah-ink)' }}>belum setor</span>;
  if (statusKey === 'menunggu') return <span style={{ color: 'var(--kuning-ink)' }}>menunggu cek</span>;
  return <span style={{ color: 'var(--hijau-ink)' }}>selesai</span>;
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
