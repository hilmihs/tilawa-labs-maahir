import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, findSelfAttendanceMembership, isTakhassusKelas } from '@/lib/program-kelas';
import { PROGRAM_LABEL } from '@/lib/maahir-presensi';
import { Icon } from '@/components/icons';
import { RiwayatRow } from './RiwayatRow';

export const dynamic = 'force-dynamic';

export default async function MaahirMandiriRiwayatPage() {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const membership = await findSelfAttendanceMembership(wa);
  if (!membership) redirect('/2in1/maahir-mandiri');

  const { kelas, anggotaId, anggotaName } = membership;

  // Kehadiran yang sudah diisi peserta ini + tanggal/program pertemuannya.
  const { data: rows } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('status, catatan, setoran_halaman, mode, pertemuan:pertemuan_id(tanggal, program, program_kelas_id)')
    .eq('anggota_id', anggotaId)
    .not('diisi_at', 'is', null);

  type Row = {
    tanggal: string; program: string; status: string; catatan: string | null; setoran: number | null;
    mode: 'offline' | 'online';
  };
  const list: Row[] = (rows ?? [])
    .map((r) => {
      const p = r.pertemuan as unknown as { tanggal: string; program: string; program_kelas_id: string } | null;
      if (!p || p.program_kelas_id !== kelas.id) return null;
      return {
        tanggal: p.tanggal, program: p.program, status: r.status, catatan: r.catatan,
        setoran: r.setoran_halaman,
        mode: (r.mode === 'online' ? 'online' : 'offline') as 'offline' | 'online',
      };
    })
    .filter((r): r is Row => r !== null)
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0));

  const totalSetoran = list.reduce((s, r) => s + (r.program === 'kelas_maahir' ? (r.setoran ?? 0) : 0), 0);
  const hadirCount = list.filter((r) => r.status === 'hadir' || r.status === 'terlambat').length;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark"><span className="mark">M</span> Riwayat Saya</div>
          <Link href="/2in1/maahir-mandiri" className="back">{Icon.back(12)} Presensi</Link>
        </div>

        <div className="page">
          <div className="card" style={{ padding: '12px 14px', marginBottom: 14, background: 'var(--surface-2)' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{anggotaName}</div>
            <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
              {kelas.name} · {list.length} pertemuan · Hadir {hadirCount} · Total setoran {totalSetoran} hlm
            </div>
          </div>

          {list.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada kehadiran terisi.</p>
          ) : (
            list.map((r) => (
              <RiwayatRow
                key={`${r.tanggal}|${r.program}`}
                kelasId={kelas.id}
                anggotaId={anggotaId}
                tanggal={r.tanggal}
                program={r.program}
                programLabel={PROGRAM_LABEL[r.program] ?? r.program}
                tanggalLabel={new Date(r.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                })}
                status={r.status}
                catatan={r.catatan}
                setoran={r.setoran}
                mode={r.mode}
                askSetoran={r.program === 'kelas_maahir' && isTakhassusKelas(kelas.name)}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}
