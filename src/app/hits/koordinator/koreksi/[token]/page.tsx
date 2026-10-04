import Link from 'next/link';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { DecideKoreksiPanel } from './DecideKoreksiPanel';

export const dynamic = 'force-dynamic';

export default async function KoreksiDecidePage({ params }: { params: { token: string } }) {
  await requireKoordinatorKetuaKelas();
  const { data: header } = await supabaseAdmin
    .from('hits_pertemuan_koreksi')
    .select('id, status, requested_by_name, halaqah:halaqah_id(name)')
    .eq('token', params.token).maybeSingle();

  if (!header) {
    return (<main style={{ minHeight: '100vh' }}><div className="page" style={{ maxWidth: 560, margin: '0 auto' }}><h1 className="t-h1">Pengajuan tidak ditemukan</h1></div></main>);
  }
  const h = header.halaqah as unknown as { name: string } | null;

  const { data: items } = await supabaseAdmin
    .from('hits_pertemuan_koreksi_item')
    .select('id, jenis, level, pertemuan_no, tanggal, catatan, status')
    .eq('koreksi_id', header.id)
    .order('created_at');

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }} className="page">
        <div className="topbar">
          <div className="wordmark"><span className="mark">H</span> Koreksi Pertemuan</div>
          <Link href="/hits/koordinator" className="back">← Dashboard</Link>
        </div>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 4 }}>{h?.name ?? '—'}</p>
        <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>Diajukan: {header.requested_by_name}</p>
        {header.status !== 'pending' ? (
          <div className="card-flat" style={{ padding: 16, textAlign: 'center' }}><p className="t-body" style={{ fontWeight: 600 }}>Pengajuan ini sudah diputuskan.</p></div>
        ) : (
          <DecideKoreksiPanel token={params.token} items={items ?? []} status={header.status} />
        )}
      </div>
    </main>
  );
}
