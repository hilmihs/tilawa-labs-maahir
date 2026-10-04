import Link from 'next/link';
import { requireKoordinator } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Icon } from '@/components/icons';
import { createLibur, deleteLibur } from './actions';

export const dynamic = 'force-dynamic';

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1.5px solid var(--border)',
  fontSize: 14,
} as const;

function fmt(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default async function KoordinatorLiburPage() {
  await requireKoordinator();

  const { data: kelasRows } = await supabaseAdmin
    .from('program_kelas')
    .select('id, name, gender')
    .order('gender')
    .order('name');
  const kelasList = kelasRows ?? [];
  const kelasName = new Map(kelasList.map((k) => [k.id, k.name]));

  const { data: liburRows } = await supabaseAdmin
    .from('program_kelas_libur')
    .select('id, program_kelas_id, tanggal_mulai, tanggal_selesai, keterangan')
    .order('tanggal_mulai', { ascending: false });

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Libur Kelas Maahir
          </div>
          <Link href="/2in1/koordinator" className="back">
            {Icon.back(12)} Koordinator
          </Link>
        </div>

        <div className="page">
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            Tanggal libur dikecualikan dari presensi yang diharapkan (rekap & daftar belum diisi).
          </p>

          {/* Form tambah libur */}
          <form action={createLibur} className="card" style={{ padding: 16, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="t-tiny" style={{ marginBottom: 4 }}>Kelas</div>
              <select name="program_kelas_id" defaultValue="all" style={inputStyle}>
                <option value="all">Semua kelas Maahir</option>
                {kelasList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div className="t-tiny" style={{ marginBottom: 4 }}>Tanggal Mulai</div>
                <input type="date" name="tanggal_mulai" required style={inputStyle} />
              </div>
              <div>
                <div className="t-tiny" style={{ marginBottom: 4 }}>Tanggal Selesai</div>
                <input type="date" name="tanggal_selesai" required style={inputStyle} />
              </div>
            </div>

            <div>
              <div className="t-tiny" style={{ marginBottom: 4 }}>Keterangan (opsional)</div>
              <input type="text" name="keterangan" placeholder="mis: Libur Idul Adha" style={inputStyle} />
            </div>

            <button type="submit" className="btn btn-block btn-primary">
              + Tambah Libur
            </button>
          </form>

          {/* Daftar libur */}
          <div className="t-tiny" style={{ marginBottom: 8, color: 'var(--muted-2)' }}>
            DAFTAR LIBUR ({(liburRows ?? []).length})
          </div>
          {(liburRows ?? []).length === 0 && (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada libur terdaftar.
            </p>
          )}
          {(liburRows ?? []).map((l) => {
            const rentang =
              l.tanggal_mulai === l.tanggal_selesai
                ? fmt(l.tanggal_mulai)
                : `${fmt(l.tanggal_mulai)} – ${fmt(l.tanggal_selesai)}`;
            return (
              <div key={l.id} className="card" style={{ padding: '10px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {l.program_kelas_id ? kelasName.get(l.program_kelas_id) ?? 'Kelas' : 'Semua kelas Maahir'}
                  </div>
                  <div className="t-tiny" style={{ marginTop: 2 }}>
                    {rentang}{l.keterangan ? ` · ${l.keterangan}` : ''}
                  </div>
                </div>
                <form action={deleteLibur}>
                  <input type="hidden" name="id" value={l.id} />
                  <button type="submit" className="btn btn-sm btn-ghost" style={{ color: 'var(--merah-ink)' }}>
                    Hapus
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
