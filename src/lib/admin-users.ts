import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getHitsRekap } from '@/lib/hits-rekap';
import { currentCycleStart } from '@/lib/week';
import { todayJakarta } from '@/lib/maahir-presensi';

export const USER_ROLE_TABLES = {
  pengajar: { table: 'pengajar', hasLastLogin: true, label: 'Pengajar' },
  musyrif: { table: 'musyrif', hasLastLogin: true, label: 'Musyrif' },
  koordinator: { table: 'koordinator', hasLastLogin: true, label: 'Koordinator' },
  syaikh: { table: 'syaikh', hasLastLogin: true, label: 'Syaikh' },
  ketua_kelas: { table: 'ketua_kelas', hasLastLogin: true, label: 'Ketua Kelas' },
  koordinator_ketua_kelas: { table: 'koordinator_ketua_kelas', hasLastLogin: true, label: 'Koord. Ketua Kelas' },
  peserta: { table: 'peserta', hasLastLogin: false, label: 'Peserta' },
} as const;

export type UserRole = keyof typeof USER_ROLE_TABLES;
export const USER_ROLES = Object.keys(USER_ROLE_TABLES) as UserRole[];

export function isUserRole(r: string): r is UserRole {
  return r in USER_ROLE_TABLES;
}

export type UserRow = {
  id: string;
  name: string;
  whatsapp_number: string | null;
  active: boolean;
  last_login_at: string | null;
  created_at: string | null;
};

export async function getUserCountsByRole(): Promise<Record<UserRole, { total: number; active: number }>> {
  const out = {} as Record<UserRole, { total: number; active: number }>;
  await Promise.all(
    USER_ROLES.map(async (role) => {
      const table = USER_ROLE_TABLES[role].table;
      const [{ count: total }, { count: active }] = await Promise.all([
        supabaseAdmin.from(table).select('id', { count: 'exact', head: true }),
        supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).eq('active', true),
      ]);
      out[role] = { total: total ?? 0, active: active ?? 0 };
    })
  );
  return out;
}

export async function getUsersForRole(role: UserRole): Promise<UserRow[]> {
  const { table, hasLastLogin } = USER_ROLE_TABLES[role];
  const cols = hasLastLogin
    ? 'id, name, whatsapp_number, active, created_at, last_login_at'
    : 'id, name, whatsapp_number, active, created_at';
  const { data } = await supabaseAdmin.from(table).select(cols).order('name');
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    whatsapp_number: (r.whatsapp_number as string) ?? null,
    active: !!r.active,
    last_login_at: hasLastLogin ? ((r.last_login_at as string) ?? null) : null,
    created_at: (r.created_at as string) ?? null,
  }));
}

export async function getUserDetail(role: UserRole, id: string): Promise<UserRow | null> {
  const { table, hasLastLogin } = USER_ROLE_TABLES[role];
  const cols = hasLastLogin
    ? 'id, name, whatsapp_number, active, created_at, last_login_at'
    : 'id, name, whatsapp_number, active, created_at';
  const { data } = await supabaseAdmin.from(table).select(cols).eq('id', id).maybeSingle();
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    whatsapp_number: (r.whatsapp_number as string) ?? null,
    active: !!r.active,
    last_login_at: hasLastLogin ? ((r.last_login_at as string) ?? null) : null,
    created_at: (r.created_at as string) ?? null,
  };
}

export type SessionRow = {
  login_at: string;
  logout_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

export async function getRecentSessions(role: UserRole, id: string, limit = 20): Promise<SessionRow[]> {
  const { data } = await supabaseAdmin
    .from('session_log')
    .select('login_at, logout_at, ip_address, user_agent')
    .eq('actor_role', role)
    .eq('actor_id', id)
    .order('login_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as SessionRow[];
}

export type AuditRow = {
  action: string;
  target_table: string | null;
  target_id: string | null;
  detail: unknown;
  created_at: string;
};

export async function getRecentAudit(role: UserRole, id: string, limit = 30): Promise<AuditRow[]> {
  const { data } = await supabaseAdmin
    .from('audit_log')
    .select('action, target_table, target_id, detail, created_at')
    .eq('actor_role', role)
    .eq('actor_id', id)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as AuditRow[];
}

function ymNow(): string {
  return todayJakarta().slice(0, 7);
}

// ============================================================
// Triase + Per Orang (WA)  — dibangun dari 1 pass 7-select
// ============================================================

type RawRoleRow = { role: UserRole; id: string; name: string; whatsapp_number: string | null; active: boolean; last_login_at: string | null };

async function fetchAllRoleRows(): Promise<RawRoleRow[]> {
  const all = await Promise.all(
    USER_ROLES.map(async (role) => {
      const rows = await getUsersForRole(role);
      return rows.map((r) => ({
        role,
        id: r.id,
        name: r.name,
        whatsapp_number: r.whatsapp_number,
        active: r.active,
        last_login_at: r.last_login_at,
      }));
    })
  );
  return all.flat();
}

export type WaConflict = { whatsapp_number: string; rows: { role: UserRole; id: string; name: string }[] };

export type PersonRow = {
  whatsapp_number: string;
  name: string;
  nameVariants: string[];
  roles: { role: UserRole; id: string; name: string; active: boolean; last_login_at: string | null }[];
  anyActive: boolean;
  lastLoginAt: string | null;
  conflict: boolean;
};

function buildPersonIndex(rows: RawRoleRow[]): PersonRow[] {
  const byWa = new Map<string, RawRoleRow[]>();
  for (const r of rows) {
    if (!r.whatsapp_number) continue;
    const arr = byWa.get(r.whatsapp_number) ?? [];
    arr.push(r);
    byWa.set(r.whatsapp_number, arr);
  }
  const people: PersonRow[] = [];
  for (const [wa, group] of byWa) {
    const nameVariants = Array.from(new Set(group.map((g) => g.name.trim()).filter(Boolean)));
    const distinctLower = new Set(nameVariants.map((n) => n.toLowerCase()));
    const lastLoginAt = group
      .map((g) => g.last_login_at)
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null;
    people.push({
      whatsapp_number: wa,
      name: nameVariants[0] ?? '(tanpa nama)',
      nameVariants,
      roles: group.map((g) => ({ role: g.role, id: g.id, name: g.name, active: g.active, last_login_at: g.last_login_at })),
      anyActive: group.some((g) => g.active),
      lastLoginAt,
      conflict: distinctLower.size > 1,
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  return people;
}

export async function getPersonIndex(): Promise<PersonRow[]> {
  return buildPersonIndex(await fetchAllRoleRows());
}

export async function getPersonDetail(wa: string): Promise<PersonRow | null> {
  const people = buildPersonIndex(await fetchAllRoleRows());
  return people.find((p) => p.whatsapp_number === wa) ?? null;
}

export type TriageReport = {
  countsByRole: Record<UserRole, { total: number; active: number }>;
  neverLogin: { role: UserRole; label: string; count: number }[];
  waConflicts: WaConflict[];
  orphans: { pengajarNoHalaqah: number; ketuaNoHalaqah: number };
  totalPeople: number;
};

export async function getTriageReport(): Promise<TriageReport> {
  const rows = await fetchAllRoleRows();
  const people = buildPersonIndex(rows);

  const countsByRole = {} as Record<UserRole, { total: number; active: number }>;
  for (const role of USER_ROLES) countsByRole[role] = { total: 0, active: 0 };
  for (const r of rows) {
    countsByRole[r.role].total += 1;
    if (r.active) countsByRole[r.role].active += 1;
  }

  const neverLogin = USER_ROLES
    .filter((role) => USER_ROLE_TABLES[role].hasLastLogin)
    .map((role) => ({
      role,
      label: USER_ROLE_TABLES[role].label,
      count: rows.filter((r) => r.role === role && r.active && !r.last_login_at).length,
    }))
    .filter((x) => x.count > 0);

  const waConflicts: WaConflict[] = people
    .filter((p) => p.conflict)
    .map((p) => ({ whatsapp_number: p.whatsapp_number, rows: p.roles.map((r) => ({ role: r.role, id: r.id, name: r.name })) }));

  // Orphans (cheap)
  const { data: hh } = await supabaseAdmin.from('hits_halaqah').select('pengajar_id').eq('active', true);
  const pengajarWithHalaqah = new Set((hh ?? []).map((h) => h.pengajar_id).filter(Boolean));
  const pengajarNoHalaqah = rows.filter((r) => r.role === 'pengajar' && r.active && !pengajarWithHalaqah.has(r.id)).length;

  const { count: ketuaNoHalaqah } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id', { count: 'exact', head: true })
    .eq('active', true)
    .is('hits_halaqah_id', null);

  return {
    countsByRole,
    neverLogin,
    waConflicts,
    orphans: { pengajarNoHalaqah, ketuaNoHalaqah: ketuaNoHalaqah ?? 0 },
    totalPeople: people.length,
  };
}

export async function getMergedSessionsForWa(wa: string, limit = 30): Promise<SessionRow[]> {
  const person = await getPersonDetail(wa);
  if (!person) return [];
  const results = await Promise.all(
    person.roles.map((r) => getRecentSessions(r.role, r.id, limit))
  );
  return results.flat().sort((a, b) => b.login_at.localeCompare(a.login_at)).slice(0, limit);
}

export async function getMergedAuditForWa(wa: string, limit = 40): Promise<AuditRow[]> {
  const person = await getPersonDetail(wa);
  if (!person) return [];
  const results = await Promise.all(
    person.roles.map((r) => getRecentAudit(r.role, r.id, limit))
  );
  return results.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

// ============================================================
// List per-role paginated
// ============================================================

export type UserListQuery = {
  q?: string;
  filter?: 'all' | 'active' | 'never_login';
  sort?: 'name' | 'last_login';
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
};
export type UserListResult = { rows: UserRow[]; total: number; page: number; pageSize: number };

export async function getUsersForRolePaged(role: UserRole, query: UserListQuery): Promise<UserListResult> {
  const { table, hasLastLogin } = USER_ROLE_TABLES[role];
  const page = Math.max(0, query.page ?? 0);
  const pageSize = query.pageSize ?? 50;
  const cols = hasLastLogin
    ? 'id, name, whatsapp_number, active, created_at, last_login_at'
    : 'id, name, whatsapp_number, active, created_at';

  let q = supabaseAdmin.from(table).select(cols, { count: 'exact' });
  if (query.q) q = q.or(`name.ilike.%${query.q}%,whatsapp_number.ilike.%${query.q}%`);
  if (query.filter === 'active') q = q.eq('active', true);
  if (query.filter === 'never_login' && hasLastLogin) q = q.is('last_login_at', null).eq('active', true);

  const sortCol = query.sort === 'last_login' && hasLastLogin ? 'last_login_at' : 'name';
  q = q.order(sortCol, { ascending: (query.dir ?? 'asc') === 'asc', nullsFirst: false });
  q = q.range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, count } = await q;
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    whatsapp_number: (r.whatsapp_number as string) ?? null,
    active: !!r.active,
    last_login_at: hasLastLogin ? ((r.last_login_at as string) ?? null) : null,
    created_at: (r.created_at as string) ?? null,
  }));
  return { rows, total: count ?? 0, page, pageSize };
}

// ============================================================
// Agregat batch per-role (hanya untuk id di halaman aktif)
// ============================================================

export type PengajarAgg = { halaqahCount: number; matrixAvg: number | null; lastCheckin: string | null };

export async function getPengajarAggregates(
  ids: string[],
  waById: Record<string, string | null>
): Promise<Map<string, PengajarAgg>> {
  const out = new Map<string, PengajarAgg>();
  if (!ids.length) return out;
  for (const id of ids) out.set(id, { halaqahCount: 0, matrixAvg: null, lastCheckin: null });

  const waList = ids.map((id) => waById[id]).filter((x): x is string => !!x);
  const [{ data: hById }, { data: hByWa }, { data: matrix }, { data: checkins }] = await Promise.all([
    supabaseAdmin.from('hits_halaqah').select('pengajar_id').in('pengajar_id', ids).eq('active', true),
    waList.length
      ? supabaseAdmin.from('hits_halaqah').select('pengajar_wa').in('pengajar_wa', waList).eq('active', true)
      : Promise.resolve({ data: [] as { pengajar_wa: string }[] }),
    supabaseAdmin.from('matrix_rekap').select('pengajar_id, rata_rata_keseluruhan').eq('year_month', ymNow()).in('pengajar_id', ids),
    supabaseAdmin.from('checkin_pengajar').select('pengajar_id, checked_in_at').in('pengajar_id', ids).order('checked_in_at', { ascending: false }),
  ]);

  for (const h of hById ?? []) {
    if (!h.pengajar_id) continue;
    const a = out.get(h.pengajar_id);
    if (a) a.halaqahCount += 1;
  }
  // halaqah by WA (pengajar tak ter-link id) → map balik ke id via waById.
  const idByWa = new Map<string, string>();
  for (const id of ids) { const w = waById[id]; if (w) idByWa.set(w, id); }
  for (const h of (hByWa ?? []) as { pengajar_wa: string }[]) {
    const id = idByWa.get(h.pengajar_wa);
    if (id) { const a = out.get(id); if (a) a.halaqahCount += 1; }
  }
  for (const m of matrix ?? []) {
    const a = out.get(m.pengajar_id);
    if (a) a.matrixAvg = m.rata_rata_keseluruhan;
  }
  for (const c of checkins ?? []) {
    const a = out.get(c.pengajar_id);
    if (a && !a.lastCheckin) a.lastCheckin = c.checked_in_at;
  }
  return out;
}

export type MusyrifAgg = { kelasCount: number; pesertaCount: number; cekBulanIni: number };

export async function getMusyrifAggregates(ids: string[]): Promise<Map<string, MusyrifAgg>> {
  const out = new Map<string, MusyrifAgg>();
  if (!ids.length) return out;
  for (const id of ids) out.set(id, { kelasCount: 0, pesertaCount: 0, cekBulanIni: 0 });

  const { data: kelas } = await supabaseAdmin.from('kelas').select('id, musyrif_id').in('musyrif_id', ids);
  const kelasIds = (kelas ?? []).map((k) => k.id);
  const kelasMusyrif = new Map<string, string>();
  for (const k of kelas ?? []) {
    kelasMusyrif.set(k.id, k.musyrif_id);
    const a = out.get(k.musyrif_id); if (a) a.kelasCount += 1;
  }
  if (kelasIds.length) {
    const { data: pes } = await supabaseAdmin.from('peserta').select('kelas_id').in('kelas_id', kelasIds);
    for (const p of pes ?? []) {
      const mid = kelasMusyrif.get(p.kelas_id as string);
      if (mid) { const a = out.get(mid); if (a) a.pesertaCount += 1; }
    }
  }
  const monthStart = `${ymNow()}-01`;
  const { data: cek } = await supabaseAdmin
    .from('setoran')
    .select('checked_by_musyrif_id')
    .in('checked_by_musyrif_id', ids)
    .gte('checked_at', `${monthStart}T00:00:00Z`);
  for (const c of cek ?? []) {
    const a = out.get(c.checked_by_musyrif_id as string); if (a) a.cekBulanIni += 1;
  }
  return out;
}

export type KetuaAgg = { terisi: number; expected: number; loggedIn: boolean };

export async function getKetuaAggregates(ids: string[]): Promise<Map<string, KetuaAgg>> {
  const out = new Map<string, KetuaAgg>();
  if (!ids.length) return out;
  const rekap = await getHitsRekap(ymNow());
  const byKetua = new Map<string, { terisi: number; expected: number; loggedIn: boolean }>();
  for (const r of rekap) {
    if (r.ketuaKelasId) byKetua.set(r.ketuaKelasId, { terisi: r.terisi, expected: r.expected, loggedIn: r.ketuaLoggedIn });
  }
  for (const id of ids) {
    const m = byKetua.get(id);
    out.set(id, m ?? { terisi: 0, expected: 0, loggedIn: false });
  }
  return out;
}

export type PesertaAgg = { kelasName: string | null; setoranStatusThisWeek: string | null };

export async function getPesertaAggregates(ids: string[]): Promise<Map<string, PesertaAgg>> {
  const out = new Map<string, PesertaAgg>();
  if (!ids.length) return out;
  for (const id of ids) out.set(id, { kelasName: null, setoranStatusThisWeek: null });

  const { data: pes } = await supabaseAdmin.from('peserta').select('id, kelas_id').in('id', ids);
  const kelasIds = Array.from(new Set((pes ?? []).map((p) => p.kelas_id).filter(Boolean) as string[]));
  const kelasName = new Map<string, string>();
  if (kelasIds.length) {
    const { data: kelas } = await supabaseAdmin.from('kelas').select('id, name').in('id', kelasIds);
    for (const k of kelas ?? []) kelasName.set(k.id, k.name);
  }
  for (const p of pes ?? []) {
    const a = out.get(p.id);
    if (a) a.kelasName = p.kelas_id ? (kelasName.get(p.kelas_id) ?? null) : null;
  }
  const week = currentCycleStart();
  const { data: setoran } = await supabaseAdmin
    .from('setoran')
    .select('peserta_id, status')
    .eq('week_start', week)
    .in('peserta_id', ids);
  for (const s of setoran ?? []) {
    const a = out.get(s.peserta_id as string);
    if (a) a.setoranStatusThisWeek = s.status as string;
  }
  return out;
}

export async function getActionCounts30d(role: UserRole, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of ids) out.set(id, 0);
  if (!ids.length) return out;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('audit_log')
    .select('actor_id')
    .eq('actor_role', role)
    .gte('created_at', since)
    .in('actor_id', ids);
  for (const r of data ?? []) {
    out.set(r.actor_id as string, (out.get(r.actor_id as string) ?? 0) + 1);
  }
  return out;
}

// ============================================================
// Insight detail (1 user)
// ============================================================

export type RoleInsight = {
  metrics: { label: string; value: string }[];
  halaqah?: { name: string; level: string | null }[];
};

export async function getRoleInsight(role: UserRole, id: string, wa: string | null): Promise<RoleInsight | null> {
  if (role === 'pengajar') {
    const orFilter = wa ? `pengajar_id.eq.${id},pengajar_wa.eq.${wa}` : `pengajar_id.eq.${id}`;
    const [{ data: hal }, { data: matrix }, { data: checkin }, { count: tabayyunOpen }] = await Promise.all([
      supabaseAdmin.from('hits_halaqah').select('name, level').eq('active', true).or(orFilter),
      supabaseAdmin.from('matrix_rekap').select('rata_rata_keseluruhan, ranking, total_teguran_kumulatif').eq('year_month', ymNow()).eq('pengajar_id', id).maybeSingle(),
      supabaseAdmin.from('checkin_pengajar').select('checked_in_at').eq('pengajar_id', id).order('checked_in_at', { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from('hits_tabayyun').select('id', { count: 'exact', head: true }).eq('pengajar_id', id).neq('status', 'decided'),
    ]);
    return {
      metrics: [
        { label: 'Halaqah aktif', value: String((hal ?? []).length) },
        { label: `Matrix avg (${ymNow()})`, value: matrix?.rata_rata_keseluruhan != null ? matrix.rata_rata_keseluruhan.toFixed(1) : '—' },
        { label: 'Ranking', value: matrix?.ranking != null ? `#${matrix.ranking}` : '—' },
        { label: 'Teguran kumulatif', value: String(matrix?.total_teguran_kumulatif ?? 0) },
        { label: 'Tabayyun terbuka', value: String(tabayyunOpen ?? 0) },
        { label: 'Check-in terakhir', value: checkin?.checked_in_at ? new Date(checkin.checked_in_at).toLocaleDateString('id-ID') : '—' },
      ],
      halaqah: (hal ?? []).map((h) => ({ name: h.name, level: h.level })),
    };
  }

  if (role === 'musyrif') {
    const agg = (await getMusyrifAggregates([id])).get(id);
    return {
      metrics: [
        { label: 'Kelas diampu', value: String(agg?.kelasCount ?? 0) },
        { label: 'Total peserta', value: String(agg?.pesertaCount ?? 0) },
        { label: `Cek setoran (${ymNow()})`, value: String(agg?.cekBulanIni ?? 0) },
      ],
    };
  }

  if (role === 'ketua_kelas') {
    const agg = (await getKetuaAggregates([id])).get(id);
    const { data: kk } = await supabaseAdmin.from('ketua_kelas').select('hits_halaqah_id, last_login_at').eq('id', id).maybeSingle();
    let halaqahName: string | null = null;
    if (kk?.hits_halaqah_id) {
      const { data: h } = await supabaseAdmin.from('hits_halaqah').select('name, level').eq('id', kk.hits_halaqah_id).maybeSingle();
      halaqahName = h?.name ?? null;
    }
    return {
      metrics: [
        { label: 'Halaqah', value: halaqahName ?? '—' },
        { label: `Keterangan terisi (${ymNow()})`, value: `${agg?.terisi ?? 0} / ${agg?.expected ?? 0}` },
        { label: 'Status login', value: kk?.last_login_at ? 'sudah login' : 'belum pernah' },
      ],
    };
  }

  if (role === 'syaikh') {
    const monthStart = `${ymNow()}-01`;
    const { count } = await supabaseAdmin
      .from('setoran_musyrif')
      .select('id', { count: 'exact', head: true })
      .eq('checked_by_syaikh_id', id)
      .gte('checked_at', `${monthStart}T00:00:00Z`);
    return { metrics: [{ label: `Cek setoran musyrif (${ymNow()})`, value: String(count ?? 0) }] };
  }

  if (role === 'peserta') {
    const agg = (await getPesertaAggregates([id])).get(id);
    return {
      metrics: [
        { label: 'Kelas', value: agg?.kelasName ?? '—' },
        { label: 'Setoran cycle ini', value: agg?.setoranStatusThisWeek ?? 'belum' },
      ],
    };
  }

  // koordinator / koordinator_ketua_kelas → ringkasan aktivitas saja
  const count = (await getActionCounts30d(role, [id])).get(id) ?? 0;
  return { metrics: [{ label: 'Aksi 30 hari', value: String(count) }] };
}
