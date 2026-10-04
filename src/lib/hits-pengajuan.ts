import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayJakarta } from '@/lib/maahir-presensi';

export type PengajuanJenis = 'pindah' | 'hapus' | 'koreksi' | 'dual';

export const PENGAJUAN_LABEL: Record<PengajuanJenis, string> = {
  pindah: 'Pindah/Claim',
  hapus: 'Hapus Pertemuan',
  koreksi: 'Koreksi',
  dual: 'Dual-Role',
};

export const JENIS_ORDER: PengajuanJenis[] = ['pindah', 'hapus', 'koreksi', 'dual'];

const HREF: Record<PengajuanJenis, (token: string) => string> = {
  pindah: (t) => `/hits/pindah-halaqah/${t}`,
  hapus: (t) => `/hits/hapus-pertemuan/${t}`,
  koreksi: (t) => `/hits/koordinator/koreksi/${t}`,
  dual: (t) => `/hits/ketua-dual/${t}`,
};

export type KoreksiItemLite = {
  pertemuan_no: number | null;
  level: string | null;
  tanggal: string | null;
  jenis: string | null;
};

export type PengajuanRow = {
  jenis: PengajuanJenis;
  id: string;
  token: string | null;
  decideHref: string | null;
  halaqahId: string | null;
  halaqahName: string;
  batchName: string;
  gender: 'ikhwan' | 'akhwat' | null;
  requesterName: string;
  requesterWa: string | null;
  ringkas: string;
  items?: KoreksiItemLite[];
  ageDays: number;
  conflict: string | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decidedByRole: string | null;
  /** Untuk pengajuan pending: sedang menunggu keputusan siapa. */
  waitingOn: WaitingOn;
};

export type WaitingOn = 'pengajar_tujuan' | 'pemilik_halaqah' | 'koordinator';

export const WAITING_LABEL: Record<WaitingOn, string> = {
  pengajar_tujuan: 'Menunggu pengajar tujuan',
  pemilik_halaqah: 'Menunggu pemilik halaqah',
  koordinator: 'Menunggu keputusan koordinator',
};

type HalaqahLite = {
  id: string;
  name: string | null;
  batch_id: string | null;
  gender: 'ikhwan' | 'akhwat' | null;
  pengajar_id: string | null;
  active: boolean | null;
};

/** Selisih hari kalender (fromIso .. today), minimal 0. */
function daysBetween(fromIso: string, todayIso: string): number {
  if (!fromIso) return 0;
  const a = Date.parse(fromIso.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(todayIso + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

/**
 * Semua pengajuan HITS (4 jenis) ternormalkan.
 * which='pending' → status='pending'; which='decided' → status<>'pending'.
 * Best-effort per tabel: kegagalan 1 tabel tak menggagalkan lainnya.
 */
export async function getHitsPengajuan(which: 'pending' | 'decided'): Promise<PengajuanRow[]> {
  const today = todayJakarta();
  const isPending = which === 'pending';
  const withStatus = (q: any) => (isPending ? q.eq('status', 'pending') : q.neq('status', 'pending'));

  const [pindahRes, hapusRes, koreksiRes, dualRes] = await Promise.all([
    withStatus(
      supabaseAdmin
        .from('hits_halaqah_pindah_request')
        .select(
          'id, halaqah_id, requested_by_name, requested_by_wa, target_name, token, status, decided_by_role, decided_at, created_at, request_type, approver_kind'
        )
    ),
    withStatus(
      supabaseAdmin
        .from('hits_pertemuan_hapus_request')
        .select(
          'id, halaqah_id, pertemuan_no, tanggal, level, gender, alasan, requested_by_name, token, status, decided_by_role, decided_at, created_at'
        )
    ),
    withStatus(
      supabaseAdmin
        .from('hits_pertemuan_koreksi')
        .select(
          'id, halaqah_id, requested_by_name, requested_by_wa, token, status, decided_by_role, decided_at, created_at'
        )
    ),
    withStatus(
      supabaseAdmin
        .from('ketua_dualrole_request')
        .select(
          'id, new_halaqah_id, gender, requested_by_name, requested_by_wa, target_name, token, status, decided_by_role, decided_at, created_at, approver_kind'
        )
    ),
  ]);

  const pindah = (pindahRes.data ?? []) as any[];
  const hapus = (hapusRes.data ?? []) as any[];
  const koreksi = (koreksiRes.data ?? []) as any[];
  const dual = (dualRes.data ?? []) as any[];

  // Enrich halaqah + batch (sekali).
  const halaqahIds = [
    ...pindah.map((r) => r.halaqah_id),
    ...hapus.map((r) => r.halaqah_id),
    ...koreksi.map((r) => r.halaqah_id),
    ...dual.map((r) => r.new_halaqah_id),
  ].filter(Boolean) as string[];

  const halaqahById = new Map<string, HalaqahLite>();
  const batchNameById = new Map<string, string>();
  if (halaqahIds.length) {
    const { data: hls } = await supabaseAdmin
      .from('hits_halaqah')
      .select('id, name, batch_id, gender, pengajar_id, active')
      .in('id', [...new Set(halaqahIds)]);
    for (const h of (hls ?? []) as HalaqahLite[]) halaqahById.set(h.id, h);
    const batchIds = [...new Set((hls ?? []).map((h: any) => h.batch_id).filter(Boolean))] as string[];
    if (batchIds.length) {
      const { data: bs } = await supabaseAdmin.from('hits_batch').select('id, name').in('id', batchIds);
      for (const b of (bs ?? []) as any[]) batchNameById.set(b.id, b.name);
    }
  }

  // Item koreksi (fitur 7).
  const koreksiItems = new Map<string, KoreksiItemLite[]>();
  if (koreksi.length) {
    const { data: items } = await supabaseAdmin
      .from('hits_pertemuan_koreksi_item')
      .select('koreksi_id, pertemuan_no, level, tanggal, jenis')
      .in(
        'koreksi_id',
        koreksi.map((r) => r.id)
      );
    for (const it of (items ?? []) as any[]) {
      const arr = koreksiItems.get(it.koreksi_id) ?? [];
      arr.push({ pertemuan_no: it.pertemuan_no, level: it.level, tanggal: it.tanggal, jenis: it.jenis });
      koreksiItems.set(it.koreksi_id, arr);
    }
  }

  const enrich = (halaqahId: string | null) => {
    const h = halaqahId ? halaqahById.get(halaqahId) : undefined;
    return {
      h,
      halaqahName: h?.name ?? '(halaqah dihapus)',
      batchName: h?.batch_id ? batchNameById.get(h.batch_id) ?? '' : '',
    };
  };
  const conflictOf = (h: HalaqahLite | undefined, needPengajarFree: boolean): string | null => {
    if (!h) return 'Halaqah tak ditemukan';
    if (h.active === false) return 'Halaqah nonaktif';
    if (needPengajarFree && h.pengajar_id) return 'Halaqah sudah ada pengajar';
    return null;
  };

  const common = (
    jenis: PengajuanJenis,
    r: any,
    halaqahId: string | null,
    gender: any,
    h: HalaqahLite | undefined,
    halaqahName: string,
    batchName: string
  ) => ({
    jenis,
    id: r.id,
    token: r.token ?? null,
    decideHref: r.token ? HREF[jenis](r.token) : null,
    halaqahId,
    halaqahName,
    batchName,
    gender: (gender ?? h?.gender ?? null) as 'ikhwan' | 'akhwat' | null,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? null,
    decidedByRole: r.decided_by_role ?? null,
    ageDays: daysBetween(r.created_at, today),
    waitingOn: ((): WaitingOn => {
      if (jenis === 'pindah') {
        if (r.request_type === 'transfer_out') return 'pengajar_tujuan';
        return r.approver_kind === 'koordinator_kk' ? 'koordinator' : 'pemilik_halaqah';
      }
      if (jenis === 'dual') return r.approver_kind === 'koordinator_kk' ? 'koordinator' : 'pengajar_tujuan';
      return 'koordinator'; // hapus, koreksi
    })(),
  });

  const rows: PengajuanRow[] = [];

  for (const r of pindah) {
    const { h, halaqahName, batchName } = enrich(r.halaqah_id);
    rows.push({
      ...common('pindah', r, r.halaqah_id, null, h, halaqahName, batchName),
      requesterName: r.requested_by_name ?? '—',
      requesterWa: r.requested_by_wa ?? null,
      ringkas: `${r.requested_by_name ?? '—'} → ${r.target_name ? 'ke ' + r.target_name : 'claim'} · ${halaqahName}`,
      conflict: conflictOf(h, true),
    });
  }
  for (const r of hapus) {
    const { h, halaqahName, batchName } = enrich(r.halaqah_id);
    const bits = [`Hapus #${r.pertemuan_no ?? '?'}`, r.tanggal ?? null, r.level ?? null].filter(Boolean);
    rows.push({
      ...common('hapus', r, r.halaqah_id, r.gender, h, halaqahName, batchName),
      requesterName: r.requested_by_name ?? '—',
      requesterWa: null,
      ringkas: bits.join(' · ') + (r.alasan ? ` — ${r.alasan}` : ''),
      conflict: conflictOf(h, false),
    });
  }
  for (const r of koreksi) {
    const { h, halaqahName, batchName } = enrich(r.halaqah_id);
    const items = koreksiItems.get(r.id) ?? [];
    const first = items[0];
    const firstStr = first
      ? `#${first.pertemuan_no ?? '?'}${first.level ? ' (' + first.level + ')' : ''}${first.tanggal ? ' → ' + first.tanggal : ''}`
      : '';
    rows.push({
      ...common('koreksi', r, r.halaqah_id, null, h, halaqahName, batchName),
      requesterName: r.requested_by_name ?? '—',
      requesterWa: r.requested_by_wa ?? null,
      items,
      ringkas: `Ubah ${items.length} pertemuan${firstStr ? ' · ' + firstStr : ''} · ${halaqahName}`,
      conflict: conflictOf(h, false),
    });
  }
  for (const r of dual) {
    const { h, halaqahName, batchName } = enrich(r.new_halaqah_id);
    rows.push({
      ...common('dual', r, r.new_halaqah_id, r.gender, h, halaqahName, batchName),
      requesterName: r.requested_by_name ?? '—',
      requesterWa: r.requested_by_wa ?? null,
      ringkas: `${r.requested_by_name ?? '—'}${r.target_name ? ' → ' + r.target_name : ''} · ${halaqahName}`,
      conflict: conflictOf(h, true),
    });
  }

  if (isPending) {
    rows.sort((a, b) => {
      const ca = a.conflict ? 0 : 1;
      const cb = b.conflict ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
  } else {
    rows.sort((a, b) => {
      const da = a.decidedAt ?? '';
      const db = b.decidedAt ?? '';
      return da > db ? -1 : da < db ? 1 : 0;
    });
  }

  return rows;
}

export function countByJenis(rows: PengajuanRow[]): Record<PengajuanJenis, number> {
  const out: Record<PengajuanJenis, number> = { pindah: 0, hapus: 0, koreksi: 0, dual: 0 };
  for (const r of rows) out[r.jenis] += 1;
  return out;
}
