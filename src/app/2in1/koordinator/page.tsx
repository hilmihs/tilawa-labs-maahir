import Link from 'next/link';
import { requireKoordinator } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon, Initials } from '@/components/icons';
import {
  CYCLE_ANCHOR,
  currentCycleStart,
  formatCycleDeadline,
  formatCycleRange,
  previousCycles,
  cyclesInMonth,
  currentYearMonth,
} from '@/lib/week';
import { formatCycleRangeShort } from '@/lib/week';
import {
  buildWaMeUrl,
  salutation,
  tplReminderPesertaBelumSetor,
  tplReminderMusyrifBelumCek,
  tplReminderMusyrifBelumSetor,
} from '@/lib/whatsapp';
import { absUrl, appOrigin } from '@/lib/url';
import { KoordinatorFilterBar } from '@/components/KoordinatorFilterBar';
import { MonitoringTable, type MonitoringRow } from '@/components/MonitoringTable';
import { RankingTable, type RankingRow } from '@/components/RankingTable';
import type { Gender, NilaiRekaman, StatusSetoran } from '@/types/db';
import { UjianMonitoring } from './UjianMonitoring';

export const dynamic = 'force-dynamic';

type SP = {
  week?: string;
  gender?: string;
  kelas?: string;
  status?: string;
  q?: string;
  month?: string;
  ujian?: string;
  ujian_status?: string;
  ujian_gender?: string;
  ujian_kelas?: string;
};

export default async function KoordinatorDashboard({
  searchParams,
}: {
  searchParams: SP;
}) {
  const koor = await requireKoordinator();
  const koordinatorGender = koor.gender;

  const week = searchParams.week ?? currentCycleStart();
  const { year: curYear, month: curMonth } = currentYearMonth();
  // Periode ranking = bulan terpilih (default bulan berjalan).
  let rankYear = curYear;
  let rankMonth = curMonth;
  if (searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)) {
    const [my, mm] = searchParams.month.split('-').map(Number);
    rankYear = my;
    rankMonth = mm;
  }
  const rankYearMonth = `${rankYear}-${String(rankMonth).padStart(2, '0')}`;
  const monthLabel = new Date(Date.UTC(rankYear, rankMonth - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  // Jumlah cycle per bulan tidak tetap sejak aturan bulanan (28 → 27) berlaku:
  // dua di era 2-pekan, satu sejak Oktober, tiga di September 2026.
  const rankCycles = cyclesInMonth(rankYear, rankMonth);
  // Opsi bulan: dari bulan anchor (2026-06) s/d bulan berjalan.
  const monthOptions: Array<{ value: string; label: string }> = [];
  {
    const [ay, am] = CYCLE_ANCHOR.split('-').map(Number);
    let y = ay;
    let m = am;
    while (y < curYear || (y === curYear && m <= curMonth)) {
      const val = `${y}-${String(m).padStart(2, '0')}`;
      monthOptions.push({
        value: val,
        label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    monthOptions.reverse();
  }
  const deadlineLabel = formatCycleDeadline(week);
  // View cross-gender penuh: koordinator (ikhwan & akhwat) lihat semua data.
  // Aksi (kirim reminder) tetap di-gating same-gender di UI bawah.
  const genderFilter: Gender | null =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? (searchParams.gender as Gender)
      : null;
  const kelasFilter = searchParams.kelas ?? null;
  const statusFilter = searchParams.status ?? null;
  const q = (searchParams.q ?? '').trim().toLowerCase();

  const origin = appOrigin();

  // Fetch semua kelas (kedua gender). Dropdown filter ada opsi gender + kelas.
  const { data: allKelas } = await supabaseAdmin
    .from('kelas')
    .select('id, name, gender, musyrif:musyrif_id(id, name, gender, whatsapp_number)')
    .order('name');

  const kelasList = (allKelas ?? []).filter((k) => {
    if (genderFilter && k.gender !== genderFilter) return false;
    if (kelasFilter && k.id !== kelasFilter) return false;
    return true;
  });
  const kelasIds = kelasList.map((k) => k.id);

  let pesertaQuery = supabaseAdmin
    .from('peserta')
    .select('id, name, gender, kelas_id, whatsapp_number')
    .eq('active', true)
    .order('name');
  if (kelasIds.length > 0) {
    pesertaQuery = pesertaQuery.in('kelas_id', kelasIds);
  } else if (genderFilter || kelasFilter) {
    pesertaQuery = pesertaQuery.eq(
      'id',
      '00000000-0000-0000-0000-000000000000'
    );
  }
  const { data: allPesertaUnfiltered } = await pesertaQuery;
  const pesertaList = (allPesertaUnfiltered ?? []).filter((p) =>
    q ? p.name.toLowerCase().includes(q) : true
  );

  const pesertaIds = pesertaList.map((p) => p.id);
  const { data: setoranList } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id, status, submitted_at, checked_at')
    .in(
      'peserta_id',
      pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000']
    )
    .eq('week_start', week);

  const setoranByPeserta = new Map(
    (setoranList ?? []).map((s) => [s.peserta_id, s])
  );

  const setoranIds = (setoranList ?? []).map((s) => s.id);
  const { data: rekamanList } = await supabaseAdmin
    .from('rekaman')
    .select('setoran_id, jenis, nilai')
    .in(
      'setoran_id',
      setoranIds.length ? setoranIds : ['00000000-0000-0000-0000-000000000000']
    );

  const rekamanBySetoran = new Map<string, NilaiRekaman[]>();
  for (const r of rekamanList ?? []) {
    const arr = rekamanBySetoran.get(r.setoran_id) ?? [];
    if (r.nilai) arr.push(r.nilai as NilaiRekaman);
    rekamanBySetoran.set(r.setoran_id, arr);
  }

  const kelasById = new Map(
    (allKelas ?? []).map((k) => [
      k.id,
      k as unknown as {
        id: string;
        name: string;
        gender: Gender;
        musyrif: { id: string; name: string; gender: Gender; whatsapp_number: string };
      },
    ])
  );

  type Row = {
    peserta: { id: string; name: string; gender: Gender; kelas_id: string; whatsapp_number: string };
    setoran: { id: string; status: StatusSetoran; submitted_at: string | null; checked_at: string | null } | undefined;
    rekaman: NilaiRekaman[];
    statusKey: 'belum' | 'menunggu' | 'selesai';
  };

  const rowsAll: Row[] = pesertaList.map((p) => {
    const setoran = setoranByPeserta.get(p.id) as Row['setoran'];
    const rekaman = setoran ? rekamanBySetoran.get(setoran.id) ?? [] : [];
    let statusKey: Row['statusKey'] = 'belum';
    if (setoran?.status === 'submitted') statusKey = 'menunggu';
    else if (setoran?.status === 'checked') statusKey = 'selesai';
    return { peserta: p, setoran, rekaman, statusKey };
  });

  const rows = statusFilter
    ? rowsAll.filter((r) => r.statusKey === statusFilter)
    : rowsAll;

  // Counters across the un-filtered-by-status set
  const counters = {
    total: rowsAll.length,
    belum: rowsAll.filter((r) => r.statusKey === 'belum').length,
    menunggu: rowsAll.filter((r) => r.statusKey === 'menunggu').length,
    selesai: rowsAll.filter((r) => r.statusKey === 'selesai').length,
  };

  const weekOptions = [currentCycleStart(), ...previousCycles(8)];

  // Risky peserta: ≥2 cycle tidak setor — HANYA hitung cycle yang sudah ada
  // (sejak anchor 2026-06-01). Saat <2 cycle berjalan, konsep "berisiko" belum
  // berlaku → section disembunyikan.
  const riskCycles = [week, ...previousCycles(2)].filter((c) => c >= CYCLE_ANCHOR);
  const riskN = riskCycles.length;
  const { data: riskSetoranList } = riskN >= 2
    ? await supabaseAdmin
        .from('setoran')
        .select('peserta_id, week_start, status')
        .in('peserta_id', pesertaIds.length ? pesertaIds : ['00000000-0000-0000-0000-000000000000'])
        .in('week_start', riskCycles)
    : { data: [] as Array<{ peserta_id: string; week_start: string; status: string }> };

  const setoranByPesertaCycle = new Map<string, Map<string, string>>();
  for (const s of riskSetoranList ?? []) {
    const inner = setoranByPesertaCycle.get(s.peserta_id) ?? new Map<string, string>();
    inner.set(s.week_start, s.status);
    setoranByPesertaCycle.set(s.peserta_id, inner);
  }

  const riskyPeserta = riskN >= 2
    ? pesertaList
        .map((p) => {
          const cycles = setoranByPesertaCycle.get(p.id) ?? new Map<string, string>();
          let missing = 0;
          for (const c of riskCycles) {
            const st = cycles.get(c);
            if (!st || st === 'draft') missing++;
          }
          return { peserta: p, missing };
        })
        .filter((r) => r.missing >= 2)
        .sort((a, b) => b.missing - a.missing)
        .slice(0, 8)
    : [];

  // Ranking: SEMUA peserta aktif (independen dari filter bar atas; ranking punya
  // filter sendiri di client).
  const { data: rankPesertaAll } = await supabaseAdmin
    .from('peserta')
    .select('id, name, gender, kelas_id')
    .eq('active', true)
    .order('name');
  const rankIds = (rankPesertaAll ?? []).map((p) => p.id);

  // Monthly H1/H2 progress untuk semua peserta aktif.
  const { data: monthlySetoranRaw } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id, week_start, status, submitted_at, checked_at')
    .in('peserta_id', rankIds.length ? rankIds : ['00000000-0000-0000-0000-000000000000'])
    .in('week_start', rankCycles.length ? rankCycles : ['1970-01-01']);

  type MonthlySt = { id: string; peserta_id: string; week_start: string; status: string; submitted_at: string | null; checked_at: string | null };
  const monthlyByPeserta = new Map<string, Record<string, MonthlySt>>();
  for (const st of (monthlySetoranRaw ?? []) as MonthlySt[]) {
    const entry = monthlyByPeserta.get(st.peserta_id) ?? {};
    entry[st.week_start] = st;
    monthlyByPeserta.set(st.peserta_id, entry);
  }

  const checkedMonthlyIds = (monthlySetoranRaw ?? [])
    .filter((st) => st.status === 'checked')
    .map((st) => st.id);
  const { data: monthlyRekamanRaw } = checkedMonthlyIds.length
    ? await supabaseAdmin
        .from('rekaman')
        .select('setoran_id, nilai')
        .in('setoran_id', checkedMonthlyIds)
    : { data: [] as Array<{ setoran_id: string; nilai: string | null }> };

  const monthlyRekamanBySetoran = new Map<string, NilaiRekaman[]>();
  for (const r of monthlyRekamanRaw ?? []) {
    const arr = monthlyRekamanBySetoran.get(r.setoran_id) ?? [];
    if (r.nilai) arr.push(r.nilai as NilaiRekaman);
    monthlyRekamanBySetoran.set(r.setoran_id, arr);
  }

  function nilaiToSkor(n: NilaiRekaman): number {
    if (n === 'hijau') return 4;
    if (n === 'kuning') return 2;
    return 0;
  }

  const statusOfSt = (st: MonthlySt | undefined): 'belum' | 'menunggu' | 'selesai' => {
    if (!st) return 'belum';
    if (st.status === 'checked') return 'selesai';
    if (st.status === 'submitted') return 'menunggu';
    return 'belum';
  };
  const rankingRows: RankingRow[] = (rankPesertaAll ?? []).map((p) => {
    const entry = monthlyByPeserta.get(p.id) ?? {};
    const perPeriode: RankingRow['periode'] = {};
    const allNilai: NilaiRekaman[] = [];
    for (const c of rankCycles) {
      const st = entry[c];
      const rek = st ? monthlyRekamanBySetoran.get(st.id) ?? [] : [];
      allNilai.push(...rek);
      perPeriode[c] = { status: statusOfSt(st), setoranId: st?.id ?? null, rekaman: rek };
    }
    const rataRata = allNilai.length > 0
      ? Math.round((allNilai.reduce((acc, n) => acc + nilaiToSkor(n), 0) / allNilai.length) * 10) / 10
      : null;
    return {
      id: p.id,
      name: p.name,
      gender: p.gender as Gender,
      kelasId: p.kelas_id,
      kelasName: kelasById.get(p.kelas_id)?.name ?? '',
      periode: perPeriode,
      rataRata,
    };
  });

  // Status setoran musyrif → syaikh untuk cycle yang dipilih (read-only,
  // koordinator tidak meminder; itu tugas syaikh).
  const allMusyrifIds = Array.from(
    new Set(
      (allKelas ?? [])
        .map((k) => (k.musyrif as unknown as { id: string } | null)?.id)
        .filter((id): id is string => typeof id === 'string')
    )
  );
  // 2 periode per bulan (h1 & h2 dari bulan ranking terpilih).
  const { data: musyrifSetoranList } = await supabaseAdmin
    .from('setoran_musyrif')
    .select('id, musyrif_id, week_start, status')
    .in(
      'musyrif_id',
      allMusyrifIds.length ? allMusyrifIds : ['00000000-0000-0000-0000-000000000000']
    )
    .in('week_start', rankCycles.length ? rankCycles : ['1970-01-01']);
  const musyrifSetoranByMusyrif = new Map<string, Record<string, string>>();
  const musyrifSetoranIdToMusyrif = new Map<string, string>();
  const checkedMusyrifSetoranIds: string[] = [];
  for (const m of musyrifSetoranList ?? []) {
    const e = musyrifSetoranByMusyrif.get(m.musyrif_id) ?? {};
    e[m.week_start] = m.status;
    musyrifSetoranByMusyrif.set(m.musyrif_id, e);
    musyrifSetoranIdToMusyrif.set(m.id, m.musyrif_id);
    if (m.status === 'checked') checkedMusyrifSetoranIds.push(m.id);
  }
  // Rata-rata nilai rekaman musyrif (kontribusi tajwid musyrif ke matrix guru).
  const { data: musyrifRekamanRaw } = checkedMusyrifSetoranIds.length
    ? await supabaseAdmin
        .from('rekaman_musyrif')
        .select('setoran_musyrif_id, nilai')
        .in('setoran_musyrif_id', checkedMusyrifSetoranIds)
        .not('nilai', 'is', null)
    : { data: [] as Array<{ setoran_musyrif_id: string; nilai: string | null }> };
  const musyrifNilaiAcc = new Map<string, number[]>();
  for (const r of musyrifRekamanRaw ?? []) {
    const mid = musyrifSetoranIdToMusyrif.get(r.setoran_musyrif_id);
    if (!mid || !r.nilai) continue;
    const arr = musyrifNilaiAcc.get(mid) ?? [];
    arr.push(nilaiToSkor(r.nilai as NilaiRekaman));
    musyrifNilaiAcc.set(mid, arr);
  }
  const currentCycle = currentCycleStart();
  const statusKeyOf = (st?: string): 'belum' | 'menunggu' | 'selesai' =>
    st === 'checked' ? 'selesai' : st === 'submitted' ? 'menunggu' : 'belum';

  // Inactive musyrif: last_login_at > 14 hari atau null.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: inactiveMusyrif } = allMusyrifIds.length
    ? await supabaseAdmin
        .from('musyrif')
        .select('id, name, gender, whatsapp_number, last_login_at')
        .in('id', allMusyrifIds)
        .eq('active', true)
        .or(`last_login_at.is.null,last_login_at.lt.${fourteenDaysAgo}`)
        .order('last_login_at', { ascending: true, nullsFirst: true })
    : { data: [] as Array<{ id: string; name: string; gender: Gender; whatsapp_number: string; last_login_at: string | null }> };
  // Daftar musyrif unik dari kelasList (deduped by id)
  const musyrifMap = new Map<
    string,
    { id: string; name: string; gender: Gender; whatsapp_number: string }
  >();
  for (const k of allKelas ?? []) {
    const m = k.musyrif as unknown as
      | { id: string; name: string; gender: Gender; whatsapp_number: string }
      | null;
    if (m?.id && !musyrifMap.has(m.id)) {
      musyrifMap.set(m.id, m);
    }
  }
  const musyrifSummaryRows = Array.from(musyrifMap.values()).map((m) => {
    const e = musyrifSetoranByMusyrif.get(m.id) ?? {};
    const skor = musyrifNilaiAcc.get(m.id) ?? [];
    const rataRata = skor.length
      ? Math.round((skor.reduce((a, b) => a + b, 0) / skor.length) * 10) / 10
      : null;
    return {
      musyrif: m,
      // Satu entri per cycle bulan ini — jumlahnya ikut aturan cycle, bukan
      // selalu dua seperti sebelum barnamij jadi bulanan.
      periodeStatus: rankCycles.map((c) => ({ cycle: c, status: statusKeyOf(e[c]) })),
      rataRata,
    };
  });

  // Serialize baris monitoring + bangun URL aksi WA server-side.
  const monitoringRows: MonitoringRow[] = rows.map(({ peserta, setoran, rekaman, statusKey }) => {
    const kelas = kelasById.get(peserta.kelas_id);
    let actionUrl: string | null = null;
    let actionLabel: string | null = null;
    let actionWarn = false;
    if (statusKey === 'belum') {
      actionUrl = buildWaMeUrl(
        peserta.whatsapp_number,
        tplReminderPesertaBelumSetor({
          pesertaName: peserta.name,
          pesertaGender: peserta.gender,
          setorUrl: `${origin}/2in1/peserta`,
          deadlineLabel,
        })
      );
      actionLabel = 'Ingatkan peserta';
    } else if (statusKey === 'menunggu' && setoran?.id && kelas) {
      actionUrl = buildWaMeUrl(
        kelas.musyrif.whatsapp_number,
        tplReminderMusyrifBelumCek({
          musyrifName: kelas.musyrif.name,
          musyrifGender: kelas.musyrif.gender,
          pesertaName: peserta.name,
          kelasName: kelas.name,
          cekUrl: absUrl(`/2in1/musyrif/cek/${setoran.id}`),
        })
      );
      actionLabel = 'Ingatkan musyrif';
      actionWarn = true;
    }
    return {
      id: peserta.id,
      name: peserta.name,
      gender: peserta.gender,
      kelasName: kelas?.name ?? '',
      musyrifName: kelas?.musyrif.name ?? '',
      statusKey,
      nilai: rekaman,
      submittedAt: setoran?.submitted_at && statusKey !== 'belum' ? formatTime(setoran.submitted_at) : null,
      pesertaHref: `/peserta/${peserta.id}`,
      actionUrl,
      actionLabel,
      actionWarn,
    };
  });

  return (
    <main style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div className="dash-header">
        <div className="grp">
          <Link href="/" className="wordmark">
            <span className="mark">M</span>Maahir
          </Link>
          <span style={{ width: 1, height: 16, background: 'var(--forest-line)' }} />
          <span className="t-small" style={{ color: 'var(--forest-soft)', fontWeight: 500 }}>
            Koordinator {koordinatorGender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
          </span>
        </div>
        <div className="grp">
          <span className="pekan-tag">
            <span className="dot" />
            Periode {formatCycleRangeShort(week)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              className="avatar"
              style={{
                width: 30,
                height: 30,
                fontSize: 12,
                background: 'var(--emas)',
                color: 'var(--forest)',
              }}
            >
              <Initials name={koor.name} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{koor.name}</span>
          </div>
          <a
            href="#ujian"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Ujian
          </a>
          <Link
            href="/2in1/koordinator/kehadiran"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Kehadiran
          </Link>
          <Link
            href="/2in1/koordinator/pedagogis"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Pedagogis
          </Link>
          <Link
            href="/2in1/koordinator/penilaian-ketua"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Nilai Ketua
          </Link>
          <Link
            href="/2in1/koordinator/libur"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Libur
          </Link>
          <Link
            href="/2in1/koordinator/target-setoran"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Target Setoran
          </Link>
          <Link
            href="/2in1/laporan"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Laporan
          </Link>
          <Link
            href="/2in1/koordinator/admin"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Admin
          </Link>
          <Link
            href="/akun"
            className="btn btn-sm btn-ghost"
            style={{ height: 30, padding: '0 12px', textDecoration: 'none' }}
          >
            Akun
          </Link>
          <LogoutButton />
        </div>
      </div>

      {/* Body */}
      <div className="dash-body">
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="t-h1" style={{ fontSize: 24, marginBottom: 4 }}>
              Monitoring setoran
            </h1>
            <p className="t-small">
              {counters.total} peserta · diperbarui otomatis dari setoran masuk
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="stat-grid">
          <div className="stat">
            <div className="v">{counters.total}</div>
            <div className="l">Total peserta</div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: 'var(--merah-ink)' }}>{counters.belum}</div>
            <div className="l">
              <span className="accent-dot" style={{ background: 'var(--merah)' }} />
              Belum setor
            </div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: 'var(--kuning-ink)' }}>{counters.menunggu}</div>
            <div className="l">
              <span className="accent-dot" style={{ background: 'var(--kuning)' }} />
              Menunggu cek
            </div>
          </div>
          <div className="stat">
            <div className="v" style={{ color: 'var(--hijau-ink)' }}>{counters.selesai}</div>
            <div className="l">
              <span className="accent-dot" style={{ background: 'var(--hijau)' }} />
              Selesai dicek
            </div>
          </div>
        </div>

        {/* Alerts: risky peserta + inactive musyrif */}
        {(riskyPeserta.length > 0 || (inactiveMusyrif ?? []).length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>
            {riskyPeserta.length > 0 && (
              <div className="card-flat" style={{ padding: '14px 18px', borderLeft: '3px solid var(--merah)' }}>
                <div className="t-tiny" style={{ color: 'var(--merah-ink)', marginBottom: 6 }}>
                  PESERTA BERISIKO (≥2 dari {riskN} cycle terakhir tidak setor)
                </div>
                {riskyPeserta.map((r) => {
                  const kelas = kelasById.get(r.peserta.kelas_id);
                  return (
                    <div key={r.peserta.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <div style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{r.peserta.name}</span>
                        <span className="t-small" style={{ color: 'var(--muted-2)', marginLeft: 6 }}>
                          {kelas?.name ?? ''}
                        </span>
                      </div>
                      <span className="badge badge-merah" style={{ fontSize: 10 }}>
                        {r.missing}/{riskN} cycle
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {(inactiveMusyrif ?? []).length > 0 && (
              <div className="card-flat" style={{ padding: '14px 18px', borderLeft: '3px solid var(--kuning-ink)' }}>
                <div className="t-tiny" style={{ color: 'var(--kuning-ink)', marginBottom: 6 }}>
                  MUSYRIF/MUSYRIFAH TIDAK AKTIF ({'>'}14 hari tidak login)
                </div>
                {(inactiveMusyrif ?? []).slice(0, 8).map((m) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>
                      <span className="t-small" style={{ color: 'var(--muted-2)', marginLeft: 6 }}>
                        {m.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
                      </span>
                    </div>
                    <span className="t-small" style={{ color: 'var(--muted)' }}>
                      {m.last_login_at
                        ? new Date(m.last_login_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                        : 'belum pernah'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filter bar (auto-apply on change) */}
        <KoordinatorFilterBar
          kelasOptions={(allKelas ?? []).map((k) => ({
            id: k.id,
            name: k.name,
            gender: k.gender as Gender,
          }))}
          weekOptions={weekOptions.map((w) => ({
            value: w,
            label: formatCycleRange(w),
          }))}
          current={{
            q: searchParams.q ?? '',
            week,
            kelas: kelasFilter,
            status: statusFilter,
            gender: genderFilter,
          }}
        />

        {/* Table monitoring (sortable) */}
        <MonitoringTable rows={monitoringRows} total={counters.total} />

        {/* Ranking progress (filter + sort sendiri) */}
        <RankingTable
          rows={rankingRows}
          kelasOptions={(allKelas ?? []).map((k) => ({ id: k.id, name: k.name, gender: k.gender as Gender }))}
          monthOptions={monthOptions}
          currentMonth={rankYearMonth}
          periods={rankCycles.map((c) => ({ key: c, label: formatCycleRangeShort(c) }))}
        />

        {/* Ujian hafalan peserta (±3 bulan sekali) */}
        <UjianMonitoring
          pesertaList={pesertaList as Array<{ id: string; name: string; gender: Gender; kelas_id: string }>}
          kelasById={
            new Map(
              (allKelas ?? []).map((k) => [
                k.id as string,
                {
                  name: k.name as string,
                  musyrifName: (k.musyrif as unknown as { name: string } | null)?.name ?? null,
                },
              ])
            )
          }
          periodeParam={searchParams.ujian}
          statusParam={searchParams.ujian_status}
          genderParam={searchParams.ujian_gender}
          kelasParam={searchParams.ujian_kelas}
          query={{
            week: searchParams.week,
            gender: searchParams.gender,
            kelas: searchParams.kelas,
            status: searchParams.status,
            q: searchParams.q,
            month: searchParams.month,
            ujian: searchParams.ujian,
          }}
        />

        {/* Status setoran musyrif → syaikh, satu badge per cycle bulan itu */}
        <div style={{ marginTop: 12 }}>
          <div className="section-row">
            <div className="t-tiny">
              Setoran musyrif → Syaikh (ikhwan) / Ustadzah (akhwat)
            </div>
            <div className="t-small">{monthLabel} · {musyrifSummaryRows.length} musyrif</div>
          </div>
          <div className="card-flat" style={{ overflow: 'hidden' }}>
            {musyrifSummaryRows.length === 0 ? (
              <div style={{ padding: 14 }}>
                <p className="t-small">Belum ada musyrif terdaftar.</p>
              </div>
            ) : (
              musyrifSummaryRows.map(({ musyrif, periodeStatus, rataRata }) => {
                const sameGender = musyrif.gender === koordinatorGender;
                // Reminder utk periode berjalan yg belum setor.
                const curStatus = periodeStatus.find((x) => x.cycle === currentCycle)?.status ?? null;
                const setorUrl = absUrl('/2in1/musyrif/setor');
                const reminderWa =
                  sameGender && curStatus === 'belum'
                    ? buildWaMeUrl(
                        musyrif.whatsapp_number,
                        tplReminderMusyrifBelumSetor({
                          musyrifName: musyrif.name,
                          musyrifGender: musyrif.gender,
                          setorUrl,
                          deadlineLabel,
                        })
                      )
                    : null;
                return (
                  <div key={musyrif.id} className="row">
                    <div className="avatar">
                      <Initials name={musyrif.name} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{musyrif.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {salutation(musyrif.gender)} → {musyrif.gender === 'ikhwan' ? 'Syaikh' : 'Ustadzah'}
                      </div>
                    </div>
                    {reminderWa && (
                      <a
                        href={reminderWa}
                        target="_blank"
                        rel="noopener"
                        className="act-btn wa"
                        style={{ textDecoration: 'none', marginRight: 8 }}
                      >
                        {Icon.wa(11)} Ingatkan
                      </a>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ textAlign: 'center', minWidth: 40 }}>
                        <div style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: rataRata === null ? 'var(--muted-2)' : rataRata >= 3 ? 'var(--hijau-ink)' : rataRata >= 2 ? 'var(--kuning-ink)' : 'var(--merah-ink)',
                        }}>
                          {rataRata !== null ? rataRata.toFixed(1) : '—'}
                        </div>
                        <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>rata²</div>
                      </div>
                      {periodeStatus.map((x) => (
                        <PeriodBadge key={x.cycle} label={formatCycleRangeShort(x.cycle)} status={x.status} />
                      ))}
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

function PeriodBadge({ label, status }: { label: string; status: 'belum' | 'menunggu' | 'selesai' }) {
  const cls = status === 'selesai' ? 'badge-hijau' : status === 'menunggu' ? 'badge-kuning' : 'badge-merah';
  return (
    <span className={`badge ${cls}`} style={{ fontSize: 10 }} title={`Periode ${label}: ${status}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
