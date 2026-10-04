import { supabaseAdmin } from '@/lib/supabase-admin';
import { HITS_LEVEL_SHORT } from '@/lib/hits-pertemuan';
import type { HitsLevel } from '@/types/db';
import { DecidePanel } from './DecidePanel';

export const dynamic = 'force-dynamic';

export default async function HapusPertemuanPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const { data: req } = await supabaseAdmin
    .from('hits_pertemuan_hapus_request')
    .select('*, halaqah:halaqah_id(name, pengajar_nama_sheet)')
    .eq('token', token)
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

  const halaqah = req.halaqah as unknown as { name: string; pengajar_nama_sheet: string | null } | null;
  const levelLabel = HITS_LEVEL_SHORT[req.level as HitsLevel] ?? req.level;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 24 }} className="page">
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Pengajuan Hapus Pertemuan</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
          Persetujuan koordinator ketua kelas ({req.gender})
        </p>

        <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row label="Halaqah" value={halaqah?.name ?? '—'} />
          <Row label="Pengajar" value={halaqah?.pengajar_nama_sheet ?? '—'} />
          <Row label="Pertemuan" value={`${req.pertemuan_no} (${levelLabel})${req.tanggal ? ` · ${req.tanggal}` : ''}`} />
          <Row label="Diajukan oleh" value={req.requested_by_name} />
          <Row label="Alasan" value={req.alasan || '—'} />
        </div>

        <DecidePanel token={token} status={req.status} catatanKoordinator={req.catatan_koordinator} />
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
