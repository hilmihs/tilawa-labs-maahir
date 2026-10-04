import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, findKetuaProgramKelas } from '@/lib/program-kelas';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Icon } from '@/components/icons';
import { namaTampilKelas } from '@/lib/grup-sesi';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7); // '2026-06'

const PROGRAM_LABEL: Record<string, string> = {
  kelas_maahir: 'Kelas Maahir',
  at_tibyan: 'At-Tibyan',
  muallim_najih: "Mu'allim Najih",
};

export default async function RiwayatPertemuanPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const myKelas = await findKetuaProgramKelas(wa);
  if (myKelas.length === 0) redirect('/2in1/ketua-kelas');
  const kelasIds = myKelas.map((k) => k.id);
  const kelasById = new Map(myKelas.map((k) => [k.id, k]));

  const nowMonth = new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : nowMonth;

  const [y, m] = month.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const { data: pertemuanList } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal, nama_kegiatan, waktu_mulai, waktu_selesai')
    .in('program_kelas_id', kelasIds)
    .gte('tanggal', monthStart)
    .lt('tanggal', nextMonth)
    .order('tanggal', { ascending: false });

  const pertemuanIds = (pertemuanList ?? []).map((p) => p.id);
  const { data: kehadiranCounts } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('pertemuan_id, status')
    .in('pertemuan_id', pertemuanIds.length ? pertemuanIds : ['00000000-0000-0000-0000-000000000000']);

  const countByPertemuan = new Map<string, { hadir: number; total: number }>();
  for (const k of kehadiranCounts ?? []) {
    const prev = countByPertemuan.get(k.pertemuan_id) ?? { hadir: 0, total: 0 };
    prev.total += 1;
    if (k.status === 'hadir' || k.status === 'terlambat') prev.hadir += 1;
    countByPertemuan.set(k.pertemuan_id, prev);
  }

  const monthOptions = monthOptionsSince(ANCHOR_MONTH);

  const items = (pertemuanList ?? []).map((p) => ({
    ...p,
    counts: countByPertemuan.get(p.id) ?? null,
    programLabel: PROGRAM_LABEL[p.program] ?? p.program,
    // Kelas bergrup → label sesi; harinya sudah terbaca di tanggal kartu.
    kelasName: namaTampilKelas(kelasById.get(p.program_kelas_id) ?? { name: '' }),
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Riwayat Pertemuan
          </div>
          <Link href="/2in1/ketua-kelas" className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ marginBottom: 16, alignItems: 'center' }}>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Semua pertemuan — tap untuk lihat & edit kehadiran
            </p>
            <MonthNavSelect options={monthOptions} value={month} />
          </div>

          {items.length === 0 && (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada pertemuan pada bulan ini.
            </p>
          )}

          {items.map((p) => {
            const tanggalLabel = new Date(p.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
              weekday: 'long', day: 'numeric', month: 'short',
            });
            const timeRange = p.waktu_mulai
              ? `${p.waktu_mulai.slice(0, 5)}${p.waktu_selesai ? ' – ' + p.waktu_selesai.slice(0, 5) : ''}`
              : null;
            return (
              <Link key={p.id} href={`/2in1/ketua-kelas/pertemuan/${p.id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.programLabel}</div>
                      <div className="t-small">{p.nama_kegiatan} · {p.kelasName}</div>
                      <div className="t-tiny" style={{ marginTop: 2 }}>
                        {tanggalLabel}{timeRange ? ` · ${timeRange}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {p.counts ? (
                        <span className="badge badge-hijau">
                          <span className="dot" />
                          {p.counts.hadir}/{p.counts.total}
                        </span>
                      ) : (
                        <span className="badge badge-kuning">
                          <span className="dot" />
                          Isi →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
