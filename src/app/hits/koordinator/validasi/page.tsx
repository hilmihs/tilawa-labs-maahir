import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ValidasiClient } from './ValidasiClient';
import { Icon } from '@/components/icons';
import type { HitsBatch, HitsHalaqah, HitsHalaqahPeserta, HitsSheetSource } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function ValidasiPage() {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const { data: batches } = await supabaseAdmin
    .from('hits_batch')
    .select('*')
    .order('start_date', { ascending: false });

  const batchIds = (batches ?? []).map((b) => b.id);

  const [{ data: sources }, { data: halaqah }, { data: peserta }] = await Promise.all([
    supabaseAdmin.from('hits_sheet_source').select('*').in('batch_id', batchIds.length ? batchIds : ['x']),
    supabaseAdmin
      .from('hits_halaqah')
      .select('*')
      .in('batch_id', batchIds.length ? batchIds : ['x'])
      .order('name'),
    supabaseAdmin
      .from('hits_halaqah_peserta')
      .select('id, halaqah_id, nama, murid_id, status_peserta, is_ketua, ketua_wa, source, active')
      .order('nama'),
  ]);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">H</span> Validasi &amp; Sumber Data
          </div>
          <Link href="/hits/koordinator" className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>
        <div className="page">
          <ValidasiClient
            batches={(batches ?? []) as HitsBatch[]}
            sources={(sources ?? []) as HitsSheetSource[]}
            halaqah={(halaqah ?? []) as HitsHalaqah[]}
            peserta={(peserta ?? []) as HitsHalaqahPeserta[]}
          />
        </div>
      </div>
    </main>
  );
}
