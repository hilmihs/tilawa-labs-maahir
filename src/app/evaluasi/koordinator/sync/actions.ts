'use server';
import { revalidatePath } from 'next/cache';
import { isSuperadmin, getAdminActor } from '@/lib/admin-guard';
import { runPull } from '@/lib/hilmihs/sync';
import { applyStages, rejectStages } from '@/lib/hilmihs/apply';

async function guard(): Promise<string> {
  if (!(await isSuperadmin())) throw new Error('Unauthorized');
  return (await getAdminActor())?.name ?? 'admin';
}

export async function triggerPull() {
  await guard();
  const r = await runPull();
  revalidatePath('/evaluasi/koordinator/sync');
  return r;
}
export async function approve(stageIds: string[]) {
  const actor = await guard();
  const r = await applyStages(stageIds, actor);
  revalidatePath('/evaluasi/koordinator/sync');
  return r;
}
export async function reject(stageIds: string[]) {
  const actor = await guard();
  const r = await rejectStages(stageIds, actor);
  revalidatePath('/evaluasi/koordinator/sync');
  return r;
}
