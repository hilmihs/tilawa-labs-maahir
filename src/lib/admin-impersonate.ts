'use server';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { requireAdmin, getAdminActor } from '@/lib/admin-guard';
import { loadAccessesForWa } from '@/lib/access';
import { logAudit } from '@/lib/audit';
import { normalizeWhatsApp } from '@/lib/whatsapp';
import { ROLE_LANDING } from '@/lib/roles';
import { ADMIN_WA } from '@/lib/constants';

/** Admin "login sebagai" user lain (by WA). Plain form action; error → redirect balik dgn ?imperr. */
export async function startImpersonation(fd: FormData): Promise<void> {
  const { wa: adminWa } = await requireAdmin();
  const fail = (msg: string): never => redirect(`/admin/users?imperr=${encodeURIComponent(msg)}`);
  const targetWa = normalizeWhatsApp(String(fd.get('wa') ?? ''));
  if (!targetWa) fail('Nomor WA target wajib.');
  if (targetWa === ADMIN_WA) fail('Tidak bisa impersonate akun admin.');

  const s = await getSession();
  if (s.impersonator) fail('Sedang impersonate — hentikan dulu.');

  const targetAccesses = await loadAccessesForWa(targetWa);
  if (!targetAccesses.length) fail('Target tidak punya akses aktif.');

  const actor = await getAdminActor();
  if (actor) {
    await logAudit({
      actor,
      action: 'admin.impersonate.start',
      targetTable: 'whatsapp',
      targetId: targetWa,
      detail: { targetName: targetAccesses[0].name, roles: targetAccesses.map((a) => a.role) },
    });
  }

  s.impersonator = {
    adminWa,
    adminAccesses: s.accesses ?? (s.session ? [s.session] : []),
    targetWa,
    targetName: targetAccesses[0].name,
    startedAt: new Date().toISOString(),
  };
  s.accesses = targetAccesses;
  s.session = targetAccesses[0];
  await s.save();

  redirect(ROLE_LANDING[targetAccesses[0].role] ?? '/');
}

/** Kembali ke akun admin tanpa login ulang. */
export async function stopImpersonating(): Promise<void> {
  const s = await getSession();
  const imp = s.impersonator;
  if (!imp) redirect('/');

  const restored = imp.adminAccesses?.length ? imp.adminAccesses : await loadAccessesForWa(imp.adminWa);
  s.accesses = restored;
  s.session = restored[0];
  delete s.impersonator;
  await s.save();

  const actor = await getAdminActor();
  if (actor) {
    await logAudit({
      actor,
      action: 'admin.impersonate.stop',
      targetTable: 'whatsapp',
      targetId: imp.targetWa,
      detail: { durationMs: Date.now() - Date.parse(imp.startedAt) },
    });
  }

  redirect('/admin/users');
}
