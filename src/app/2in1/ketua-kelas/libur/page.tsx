import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, findKetuaWakilKelas } from '@/lib/program-kelas';
import { Icon } from '@/components/icons';
import { LiburRequestForm } from './LiburRequestForm';
import { namaTampilKelas } from '@/lib/grup-sesi';

export const dynamic = 'force-dynamic';

function tglLabel(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default async function KetuaLiburPage() {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const myKelas = await findKetuaWakilKelas(wa);
  if (myKelas.length === 0) {
    return (
      <main style={{ padding: 24 }}>
        <p className="t-body" style={{ color: 'var(--muted-2)' }}>
          Halaman ini hanya untuk Ketua / Wakil Ketua Kelas program Maahir.
        </p>
        <Link href="/" className="btn btn-ghost" style={{ marginTop: 16 }}>← Kembali</Link>
      </main>
    );
  }

  const kelasIds = myKelas.map((k) => k.id);
  // Libur berlaku per kelas per hari — kelas bergrup sesi disebut label sesi + harinya.
  const kelasById = new Map(myKelas.map((k) => [k.id, namaTampilKelas(k, { denganHari: true })]));

  // Pengajuan yang sudah dibuat (semua status, terbaru dulu).
  const { data: reqs } = await supabaseAdmin
    .from('program_kelas_libur_request')
    .select('id, program_kelas_id, tanggal, alasan, status, created_at')
    .in('program_kelas_id', kelasIds)
    .order('created_at', { ascending: false })
    .limit(20);

  const STATUS_BADGE: Record<string, string> = {
    pending: 'badge-kuning', approved: 'badge-hijau', rejected: 'badge-merah',
  };
  const STATUS_LABEL: Record<string, string> = {
    pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak',
  };

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark"><span className="mark">M</span> Ajukan Libur</div>
          <Link href="/2in1/ketua-kelas" className="back">{Icon.back(12)} Ketua Kelas</Link>
        </div>

        <div className="page">
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            Ajukan agar tanggal pertemuan diliburkan. Setelah disetujui koordinator,
            pertemuan tanggal itu tidak dihitung dalam kehadiran; anggota yang sudah
            mengisi jadi teranulir.
          </p>

          <LiburRequestForm kelasOptions={myKelas.map((k) => ({ id: k.id, name: kelasById.get(k.id) ?? k.name }))} />

          {(reqs ?? []).length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
                Riwayat pengajuan
              </div>
              {(reqs ?? []).map((r) => (
                <div key={r.id} className="card-flat" style={{ padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{tglLabel(r.tanggal)}</div>
                      <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                        {kelasById.get(r.program_kelas_id) ?? ''}{r.alasan ? ` · ${r.alasan}` : ''}
                      </div>
                    </div>
                    <span className={`badge ${STATUS_BADGE[r.status] ?? ''}`} style={{ flexShrink: 0, height: 'fit-content' }}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
