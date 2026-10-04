import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import type { PengajarSession } from '@/types/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getKelompokDinilaiIds } from '@/lib/penilai-ketua';
import { PenilaianPedagogisForm } from '../penilaian/PenilaianPedagogisForm';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';

export const dynamic = 'force-dynamic';

const PED_FIELDS = [
  'skor_metode_pengajaran',
  'keterangan_metode',
  'skor_kepatuhan_silabus',
  'keterangan_silabus',
  'skor_manajemen_halaqah',
  'keterangan_halaqah',
  'skor_evaluasi_penguasaan',
  'keterangan_evaluasi',
  'skor_kepatuhan_sop',
  'keterangan_sop',
  'catatan_umum',
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

/**
 * Penilaian ketua kelompok oleh penilai yang ditugaskan (bukan koordinator).
 * Daftar yang dinilai = ketua dari kelompok-kelompok di `penilai_ketua_kelompok`.
 * Padanan koordinator: /2in1/koordinator/penilaian-ketua.
 */
export default async function PenilaianKetuaOlehPenilaiPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const pengajar = accesses.find((a) => a.role === 'pengajar') as PengajarSession | undefined;
  if (!pengajar) redirect('/');

  const kelompokIds = await getKelompokDinilaiIds(pengajar.pengajar_id);
  if (kelompokIds.length === 0) redirect('/kehadiran/pengajar');

  const cur = currentYearMonth();
  const ym = searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : cur;
  const monthOptions = monthOptionsSince(ymMinus(cur, 11));

  // Ketua dari tiap kelompok yang ditugaskan.
  const { data: ketuaRaw } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, kelompok_id')
    .eq('is_ketua', true)
    .eq('active', true)
    .neq('matrix_exclude', true)
    .in('kelompok_id', kelompokIds)
    .order('name');
  const ketuas = (ketuaRaw ?? []) as Array<{ id: string; name: string; kelompok_id: string | null }>;

  const { data: kelompokRaw } = await supabaseAdmin
    .from('kelompok_pengajar')
    .select('id, name')
    .in('id', kelompokIds);
  const kelompokName = new Map((kelompokRaw ?? []).map((k) => [k.id as string, k.name as string]));

  const ketuaIds = ketuas.map((k) => k.id);
  const noId = ['00000000-0000-0000-0000-000000000000'];
  const { data: existing } = await supabaseAdmin
    .from('penilaian_pedagogis')
    .select(PED_FIELDS.join(', ') + ', pengajar_id')
    .eq('year_month', ym)
    .in('pengajar_id', ketuaIds.length ? ketuaIds : noId);
  const existingMap = new Map(
    (existing ?? []).map((e) => [(e as unknown as { pengajar_id: string }).pengajar_id, e])
  );

  const members = ketuas.map((k) => ({
    id: k.id,
    name: `${k.name}${k.kelompok_id ? ` — ${kelompokName.get(k.kelompok_id) ?? ''}` : ''}`,
    penilaian: (existingMap.get(k.id) ?? null) as never,
  }));

  // Kelompok yang ditugaskan tapi ketuanya belum ditetapkan — tak akan muncul
  // di form, jadi disebut eksplisit supaya penilai tak mengira ada yang hilang.
  const tanpaKetua = kelompokIds
    .filter((id) => !ketuas.some((k) => k.kelompok_id === id))
    .map((id) => kelompokName.get(id) ?? id);

  const belum = members.filter((m) => !m.penilaian).length;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <Link href="/kehadiran/pengajar" className="btn btn-sm btn-ghost" style={{ textDecoration: 'none' }}>←</Link>
            <div style={{ flex: 1 }}>
              <h1 className="t-h1" style={{ margin: 0 }}>Penilaian Ketua Kelompok</h1>
              <p className="t-small" style={{ margin: 0, color: 'var(--muted-2)' }}>
                Skala 0–4 · auto-simpan ·{' '}
                <strong style={{ color: belum ? 'var(--merah-ink)' : 'var(--hijau-ink)' }}>
                  {belum} belum dinilai
                </strong>
              </p>
            </div>
            <MonthNavSelect options={monthOptions} value={ym} />
          </div>

          {members.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada ketua kelompok yang ditugaskan kepada Anda.
            </p>
          ) : (
            <>
              <div className="t-tiny" style={{ marginBottom: 8 }}>EDIT {monthLabelOf(ym).toUpperCase()}</div>
              <PenilaianPedagogisForm key={ym} members={members} yearMonth={ym} readOnly={false} />
            </>
          )}

          {tanpaKetua.length > 0 && (
            <p className="t-tiny" style={{ marginTop: 16, color: 'var(--muted-2)' }}>
              Belum ada ketua aktif di: {tanpaKetua.join(', ')}.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
