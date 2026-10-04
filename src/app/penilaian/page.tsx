import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { currentYearMonth } from '@/lib/week';
import { PenilaianMasyaikhForm } from '@/components/PenilaianMasyaikhForm';

export const dynamic = 'force-dynamic';

function ymLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 15).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

export default async function PenilaianPage({
  searchParams,
}: {
  searchParams: { bulan?: string };
}) {
  const s = await getSession();
  // Pengguna multi-peran: peran utama sesi bisa saja pengajar, sementara menu
  // Penilaian muncul karena ia juga koordinator/syaikh — ambil akses itu.
  const session = [s.session, ...(s.accesses ?? [])].find(
    (a) => a?.role === 'koordinator' || a?.role === 'syaikh'
  );
  if (!session || (session.role !== 'koordinator' && session.role !== 'syaikh')) {
    redirect('/');
  }

  const cur = currentYearMonth();
  const curYm = `${cur.year}-${String(cur.month).padStart(2, '0')}`;
  // Bulan lampau tetap bisa diinput (mis. Juli isi penilaian Juni & sebelumnya).
  const rawBulan = typeof searchParams?.bulan === 'string' ? searchParams.bulan : '';
  const yearMonth = /^\d{4}-\d{2}$/.test(rawBulan) ? rawBulan : curYm;
  const monthLabel = ymLabel(yearMonth);

  // Opsi bulan: 12 bulan terakhir (termasuk bulan berjalan) + bulan terpilih.
  const monthOptions: string[] = [];
  for (let i = 0, y = cur.year, m = cur.month; i < 12; i++) {
    monthOptions.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  if (!monthOptions.includes(yearMonth)) monthOptions.unshift(yearMonth);

  const { data: allKelompok } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name')
    .order('name');

  const { data: allPengajar } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, kelompok_id, is_ketua')
    .eq('active', true)
    .order('name');

  const pengajarIds = (allPengajar ?? []).map((p) => p.id);

  const { data: existingPenilaian } = await supabaseAdmin
    .from('penilaian_masyaikh')
    .select('id, pengajar_id, skor_bacaan, keterangan_bacaan, assessor_role')
    .eq('year_month', yearMonth)
    .in('pengajar_id', pengajarIds.length ? pengajarIds : ['00000000-0000-0000-0000-000000000000']);

  const penilaianByPengajar = new Map<string, {
    skor_bacaan: number | null;
    keterangan_bacaan: string | null;
    assessor_role: string | null;
  }>();
  for (const p of existingPenilaian ?? []) {
    penilaianByPengajar.set(p.pengajar_id, {
      skor_bacaan: p.skor_bacaan,
      keterangan_bacaan: p.keterangan_bacaan,
      assessor_role: p.assessor_role,
    });
  }

  const kelompokMap = new Map((allKelompok ?? []).map((k) => [k.id, k]));
  const pengajarWithPenilaian = (allPengajar ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    gender: p.gender as 'ikhwan' | 'akhwat',
    is_ketua: p.is_ketua,
    kelompokLabel: kelompokMap.get(p.kelompok_id)?.name ?? null,
    penilaian: penilaianByPengajar.get(p.id) ?? null,
  }));

  // Urut: kelompok → ketua dulu → nama
  const sortPengajar = <T extends { kelompokLabel: string | null; is_ketua: boolean; name: string }>(arr: T[]) =>
    [...arr].sort((a, b) =>
      (a.kelompokLabel ?? '').localeCompare(b.kelompokLabel ?? '', 'id', { numeric: true }) ||
      Number(b.is_ketua) - Number(a.is_ketua) ||
      a.name.localeCompare(b.name, 'id')
    );

  const ikhwanList = sortPengajar(pengajarWithPenilaian.filter((p) => p.gender === 'ikhwan'));
  const akhwatList = sortPengajar(pengajarWithPenilaian.filter((p) => p.gender === 'akhwat'));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="dash-header">
        <div className="grp">
          <Link href="/" className="wordmark">
            <span className="mark">M</span>Maahir
          </Link>
          <span style={{ width: 1, height: 16, background: 'var(--forest-line)' }} />
          <span className="t-small" style={{ color: 'var(--forest-soft)', fontWeight: 500 }}>
            Penilaian Pengajar
          </span>
        </div>
        <div className="grp">
          <Link href="/akun" className="btn btn-sm btn-ghost" style={{ height: 32, padding: '0 12px', textDecoration: 'none' }}>
            Akun
          </Link>
          <LogoutButton />
        </div>
      </div>

      <div className="dash-body" style={{ maxWidth: 800 }}>

        <div>
          <h1 className="t-h1" style={{ fontSize: 22, marginBottom: 4 }}>
            Penilaian Pengajar — {monthLabel}
          </h1>
          <p className="t-small">
            Kualitas Bacaan pengajar (skala 0–4). Ketuk angka (atau tekan 0–4 saat
            baris fokus). Lihat “Panduan Standar Skala” untuk kriteria tiap nilai. Tersimpan otomatis.
          </p>
        </div>

        <form method="get" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <div>
            <label className="t-tiny" htmlFor="penilaian_bulan" style={{ display: 'block', marginBottom: 4 }}>
              Bulan penilaian
            </label>
            <select id="penilaian_bulan" name="bulan" defaultValue={yearMonth} className="select" style={{ height: 38 }}>
              {monthOptions.map((ym) => (
                <option key={ym} value={ym}>{ymLabel(ym)}{ym === curYm ? ' (berjalan)' : ''}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-sm" style={{ height: 38 }}>Tampilkan</button>
        </form>
        {yearMonth !== curYm && (
          <p className="t-tiny" style={{ color: 'var(--ink-2)' }}>
            Mengisi penilaian bulan lampau ({monthLabel}). Perubahan memengaruhi Matrix bulan itu.
          </p>
        )}

        {ikhwanList.length === 0 && akhwatList.length === 0 && (
          <p className="t-body">Belum ada pengajar aktif.</p>
        )}

        {/* key sertakan yearMonth → form re-mount saat ganti bulan, supaya state skor
            reset dari data bulan terpilih (cegah skor basi tersimpan ke bulan baru). */}
        <PenilaianMasyaikhForm key={`ikhwan:${yearMonth}`} pengajarList={ikhwanList} yearMonth={yearMonth} title="Ikhwan" />
        <PenilaianMasyaikhForm
          key={`akhwat:${yearMonth}`}
          pengajarList={akhwatList}
          yearMonth={yearMonth}
          title="Akhwat"
          defaultCollapsed={ikhwanList.length > 0}
        />
      </div>
    </main>
  );
}
