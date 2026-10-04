import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOneOfRoles } from '@/lib/session';
import { DecidePanel } from './DecidePanel';

export const dynamic = 'force-dynamic';

function tglLabel(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default async function LiburApprovePage({ params }: { params: { token: string } }) {
  // Wajib login sebagai koordinator/syaikh (redirect ke login bila belum).
  await requireOneOfRoles(['koordinator', 'syaikh']);

  const { data: req } = await supabaseAdmin
    .from('program_kelas_libur_request')
    .select('*, kelas:program_kelas_id(name)')
    .eq('token', params.token)
    .maybeSingle();

  if (!req) {
    return (
      <main style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }} className="page">
          <h1 className="t-h1">Pengajuan tidak ditemukan</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)' }}>Link tidak valid.</p>
        </div>
      </main>
    );
  }

  const kelas = req.kelas as unknown as { name: string } | null;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 24 }} className="page">
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Pengajuan Libur Pertemuan</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
          Persetujuan koordinator ({req.gender})
        </p>

        <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row label="Kelas" value={kelas?.name ?? '—'} />
          <Row label="Tanggal" value={tglLabel(req.tanggal)} />
          <Row label="Diajukan oleh" value={req.requester_name} />
          <Row label="Alasan" value={req.alasan || '—'} />
        </div>

        <DecidePanel token={params.token} status={req.status} catatanKoordinator={req.catatan_koordinator} />
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span className="t-small" style={{ color: 'var(--muted-2)', minWidth: 110 }}>{label}</span>
      <span className="t-small" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
