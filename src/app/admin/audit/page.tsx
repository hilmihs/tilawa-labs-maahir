import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;

// Tabel sumber nama aktor per role.
const ACTOR_TABLE_BY_ROLE: Record<string, string> = {
  koordinator: 'koordinator',
  koordinator_ketua_kelas: 'koordinator_ketua_kelas',
  syaikh: 'syaikh',
  pengajar: 'pengajar',
  musyrif: 'musyrif',
  ketua_kelas: 'ketua_kelas',
  peserta: 'peserta',
};

const ROLE_LABEL: Record<string, string> = {
  koordinator: 'Koordinator',
  koordinator_ketua_kelas: 'Koord. Ketua Kelas',
  syaikh: 'Syaikh',
  pengajar: 'Pengajar',
  musyrif: 'Musyrif',
  ketua_kelas: 'Ketua Kelas',
  peserta: 'Peserta',
};

const ACTION_LABEL: Record<string, string> = {
  'libur.create': 'Buat libur',
  'tabayyun.decide': 'Putuskan tabayyun',
  'alasan.decide': 'Putuskan alasan',
  'alasan.submit': 'Ajukan alasan',
  'checkin.submit': 'Check-in',
  'checkin.invalidate': 'Batalkan check-in',
  'observasi.submit': 'Submit observasi',
  'ketua_kelas.elect': 'Pilih ketua kelas',
  'hits.ketua.elect': 'Pilih ketua kelas (HITS)',
  'hits.ketua.resend_login': 'Kirim ulang login ketua',
  'cek.submit_syaikh': 'Cek setoran (syaikh)',
  'cek.submit_musyrif': 'Cek setoran (musyrif)',
};

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

interface SP {
  page?: string;
  role?: string;
  action?: string;
  since?: string;
}

export default async function AdminAuditPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();

  const page = Math.max(0, parseInt(searchParams.page ?? '0', 10) || 0);
  const since = searchParams.since && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.since)
    ? searchParams.since
    : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const roleFilter = searchParams.role && ACTOR_TABLE_BY_ROLE[searchParams.role] ? searchParams.role : '';
  const actionFilter = searchParams.action ?? '';

  let q = supabaseAdmin
    .from('audit_log')
    .select('id, actor_role, actor_id, action, target_table, target_id, detail, created_at', { count: 'exact' })
    .gte('created_at', `${since}T00:00:00Z`)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (roleFilter) q = q.eq('actor_role', roleFilter);
  if (actionFilter) q = q.eq('action', actionFilter);

  const { data: logs, count } = await q;

  // Resolusi nama aktor: kelompokkan actor_id per role, query tiap tabel.
  const idsByRole = new Map<string, Set<string>>();
  for (const l of logs ?? []) {
    if (!l.actor_id) continue;
    const set = idsByRole.get(l.actor_role) ?? new Set<string>();
    set.add(l.actor_id);
    idsByRole.set(l.actor_role, set);
  }
  const actorName = new Map<string, string>(); // `${role}:${id}` → name
  for (const [role, ids] of idsByRole) {
    const table = ACTOR_TABLE_BY_ROLE[role];
    if (!table) continue;
    const { data: rows } = await supabaseAdmin
      .from(table)
      .select('id, name')
      .in('id', Array.from(ids));
    for (const r of rows ?? []) actorName.set(`${role}:${r.id}`, r.name);
  }

  // Daftar action unik (untuk filter) dalam rentang.
  const { data: actionTypes } = await supabaseAdmin
    .from('audit_log')
    .select('action')
    .gte('created_at', `${since}T00:00:00Z`)
    .limit(1000);
  const uniqueActions = Array.from(new Set((actionTypes ?? []).map((a) => a.action))).sort();

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  function pageHref(p: number): string {
    const sp = new URLSearchParams();
    sp.set('page', String(p));
    if (roleFilter) sp.set('role', roleFilter);
    if (actionFilter) sp.set('action', actionFilter);
    if (since) sp.set('since', since);
    return `?${sp.toString()}`;
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20, paddingBottom: 80 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Superadmin — Log Aktivitas</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/admin/users" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>
                {Icon.back(12)} User
              </Link>
              <LogoutButton />
            </div>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>Log Aktivitas</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>
            Semua aksi tercatat dari seluruh role. Total {count ?? 0} record sejak {since}.
          </p>

          {/* Filter */}
          <form method="get" className="card-flat" style={{ padding: 12, marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 150px' }}>
              <label className="t-tiny" htmlFor="since" style={{ display: 'block', marginBottom: 4 }}>Sejak tanggal</label>
              <input id="since" type="date" name="since" defaultValue={since} className="input" style={{ height: 38 }} />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label className="t-tiny" htmlFor="role" style={{ display: 'block', marginBottom: 4 }}>Role</label>
              <select id="role" name="role" defaultValue={roleFilter} className="select" style={{ height: 38 }}>
                <option value="">Semua role</option>
                {Object.keys(ACTOR_TABLE_BY_ROLE).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '2 1 200px' }}>
              <label className="t-tiny" htmlFor="action" style={{ display: 'block', marginBottom: 4 }}>Action</label>
              <select id="action" name="action" defaultValue={actionFilter} className="select" style={{ height: 38 }}>
                <option value="">Semua action</option>
                {uniqueActions.map((a) => (
                  <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-ghost btn-sm" style={{ height: 38 }}>Terapkan</button>
          </form>

          {(logs ?? []).length === 0 ? (
            <div className="card-flat" style={{ padding: 32, textAlign: 'center' }}>
              <p className="t-body" style={{ color: 'var(--muted)' }}>Tidak ada aktivitas untuk filter ini.</p>
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 920 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Waktu</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Aktor</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Action</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Target</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {(logs ?? []).map((l, i) => {
                    const name = actorName.get(`${l.actor_role}:${l.actor_id}`) ?? (l.actor_id?.slice(0, 8) ?? '—');
                    const label = ACTION_LABEL[l.action] ?? l.action;
                    const detailStr = l.detail ? JSON.stringify(l.detail) : '';
                    return (
                      <tr key={l.id} style={{ borderTop: '1px solid var(--line)', background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmtDateTime(l.created_at)}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{name}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>{ROLE_LABEL[l.actor_role] ?? l.actor_role}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className="badge badge-neutral" style={{ fontSize: 11 }}><span className="dot" />{label}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>
                          {l.target_table ?? '—'}
                          {l.target_id && <div style={{ fontFamily: 'var(--font-mono), monospace' }}>{l.target_id.slice(0, 8)}…</div>}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {detailStr.length > 90 ? detailStr.slice(0, 90) + '…' : detailStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 8 }}>
              <Link href={pageHref(Math.max(0, page - 1))} className="btn btn-ghost btn-sm" style={{ pointerEvents: page === 0 ? 'none' : 'auto', opacity: page === 0 ? 0.5 : 1 }}>Sebelumnya</Link>
              <span className="t-small" style={{ color: 'var(--muted)' }}>Halaman {page + 1} / {totalPages}</span>
              <Link href={pageHref(page + 1)} className="btn btn-ghost btn-sm" style={{ pointerEvents: page + 1 >= totalPages ? 'none' : 'auto', opacity: page + 1 >= totalPages ? 0.5 : 1 }}>Selanjutnya</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
