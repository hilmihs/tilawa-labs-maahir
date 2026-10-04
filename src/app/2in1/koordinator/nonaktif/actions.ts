'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { isKebal, setOrangAktif } from '@/lib/orang-aktif';
import type { RoleAccess } from '@/types/db';

export type NonaktifResult = { ok?: boolean; info?: string; error?: string };

/** Hanya role `koordinator` penuh — `koordinator_kehadiran` tidak cukup. */
async function requireKoordinatorPenuh(): Promise<RoleAccess> {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const koor = accesses.find((a) => a.role === 'koordinator');
  if (!koor) throw new Error('Akses ditolak.');
  return koor;
}

export async function toggleOrangAktif(
  _prev: NonaktifResult | undefined,
  fd: FormData
): Promise<NonaktifResult> {
  let actor: RoleAccess;
  try {
    actor = await requireKoordinatorPenuh();
  } catch {
    return { error: 'Akses ditolak.' };
  }

  const wa = String(fd.get('wa') ?? '').trim();
  const nama = String(fd.get('nama') ?? '').trim();
  const next = String(fd.get('next') ?? '') === 'true';
  if (!wa) return { error: 'Nomor WA tidak valid.' };

  // Penonaktifan koordinator/syaikh hanya lewat /admin/users.
  if (!next && (await isKebal(wa))) {
    return { error: 'Nomor ini koordinator/syaikh — nonaktifkan lewat admin.' };
  }

  let hasil;
  try {
    hasil = await setOrangAktif(wa, next);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Gagal menyimpan.' };
  }

  void logAudit({
    actor,
    action: 'koordinator.orang.toggle_active',
    targetTable: 'pengajar',
    targetId: null,
    detail: { wa, nama, to: next, terpengaruh: hasil.terpengaruh },
  });

  revalidatePath('/2in1/koordinator/nonaktif');

  const jumlah = Object.values(hasil.terpengaruh).reduce((a, b) => a + b, 0);
  if (jumlah === 0) return { error: 'Tidak ada baris yang cocok dengan nomor ini.' };
  const rincian = Object.entries(hasil.terpengaruh)
    .map(([t, n]) => `${t} (${n})`)
    .join(', ');
  return {
    ok: true,
    info: `${nama || wa} ${next ? 'diaktifkan' : 'dinonaktifkan'} — ${rincian}.`,
  };
}
