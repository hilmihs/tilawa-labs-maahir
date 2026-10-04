import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { logLogout } from '@/lib/session-log';

export const runtime = 'nodejs';

// Logout via route handler — client navigate sendiri (hindari quirk RSC redirect
// di server action yang kadang tak men-redirect browser).
export async function POST() {
  try {
    const s = await getSession();
    const accesses = s.accesses ?? (s.session ? [s.session] : []);
    if (accesses.length) {
      try {
        await logLogout(accesses);
      } catch {
        // audit log gagal jangan blokir logout
      }
    }
    s.destroy();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
