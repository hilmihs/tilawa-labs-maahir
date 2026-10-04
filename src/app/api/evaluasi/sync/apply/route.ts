import { NextRequest, NextResponse } from 'next/server';
import { isSuperadmin, getAdminActor } from '@/lib/admin-guard';
import { applyStages, rejectStages } from '@/lib/hilmihs/apply';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!(await isSuperadmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const actor = (await getAdminActor())?.name ?? 'admin';
  const body = await req.json();
  const { action, stageIds } = body as { action: 'apply' | 'reject'; stageIds: string[] };
  if (!Array.isArray(stageIds) || !stageIds.length) {
    return NextResponse.json({ error: 'stageIds wajib' }, { status: 400 });
  }
  try {
    const result = action === 'reject'
      ? await rejectStages(stageIds, actor)
      : await applyStages(stageIds, actor);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
