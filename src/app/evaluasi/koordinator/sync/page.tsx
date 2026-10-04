import { redirect } from 'next/navigation';
import { isSuperadmin } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EvalSyncRun, EvalSyncStage } from '@/types/db';
import { SyncReviewPanel } from './SyncReviewPanel';

export const dynamic = 'force-dynamic';

export default async function SyncReviewPage() {
  if (!(await isSuperadmin())) redirect('/');

  const { data: runs } = await supabaseAdmin
    .from('eval_sync_run').select('*').order('started_at', { ascending: false }).limit(1);
  const lastRun = (runs ?? [])[0] as EvalSyncRun | undefined;

  const { data: stageRows } = await supabaseAdmin
    .from('eval_sync_stage').select('*')
    .is('applied_at', null).eq('rejected', false)
    .order('entity').order('op');
  const stage = (stageRows ?? []) as EvalSyncStage[];

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }} className="page">
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Sinkron hilmihs → Evaluasi</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 14 }}>
          {lastRun
            ? `Pull terakhir: ${lastRun.started_at} · status ${lastRun.status} · sumber ${lastRun.source_generated_at ?? '—'}`
            : 'Belum pernah pull.'}
        </p>
        <SyncReviewPanel stage={stage} />
      </div>
    </main>
  );
}
