import type { RoleAccess, PengajarSession, KoordinatorKetuaKelasSession } from '@/types/db';

export type PindahReqLite = {
  request_type?: string | null;
  target_pengajar_id: string | null;
  target_wa: string | null;
  approver_pengajar_id?: string | null;
  approver_wa?: string | null;
};

export type DeciderInfo = {
  actor: RoleAccess;
  role: 'pengajar' | 'koordinator_ketua_kelas';
  id: string;
};

/**
 * Siapa yang berhak memutuskan pengajuan pindah/pengambilan halaqah.
 * - transfer_out : pengajar TUJUAN (target).
 * - claim_in     : pemilik halaqah (approver) ATAU koordinator ketua kelas yang
 *                  gender-nya sama dengan gender halaqah (ikhwan/akhwat, bisa >1
 *                  koordinator per gender).
 *
 * Mengembalikan identitas pemutus (untuk decided_by_* & audit), atau null bila
 * akun yang login tidak berhak. `accesses` = seluruh role akun (getAllAccesses).
 */
export function resolveDecider(
  req: PindahReqLite,
  halaqahGender: string | null,
  accesses: RoleAccess[],
  wa: string | null
): DeciderInfo | null {
  const pengajarAcc = accesses.find((a): a is PengajarSession => a.role === 'pengajar');
  const kkAccs = accesses.filter(
    (a): a is KoordinatorKetuaKelasSession => a.role === 'koordinator_ketua_kelas'
  );

  if (req.request_type === 'claim_in') {
    // 1. pemilik halaqah (approver) — cocok via pengajar_id atau WA.
    if (pengajarAcc) {
      const byId = !!req.approver_pengajar_id && req.approver_pengajar_id === pengajarAcc.pengajar_id;
      const byWa = !!req.approver_wa && !!wa && wa === req.approver_wa;
      if (byId || byWa) return { actor: pengajarAcc, role: 'pengajar', id: pengajarAcc.pengajar_id };
    }
    // 2. koordinator ketua kelas segender halaqah.
    const kk = kkAccs.find((k) => k.gender === halaqahGender);
    if (kk) return { actor: kk, role: 'koordinator_ketua_kelas', id: kk.koordinator_kk_id };
    return null;
  }

  // transfer_out: hanya pengajar tujuan (target).
  if (pengajarAcc) {
    const byId = !!req.target_pengajar_id && req.target_pengajar_id === pengajarAcc.pengajar_id;
    const byWa = !!req.target_wa && !!wa && wa === req.target_wa;
    if (byId || byWa) return { actor: pengajarAcc, role: 'pengajar', id: pengajarAcc.pengajar_id };
  }
  return null;
}
