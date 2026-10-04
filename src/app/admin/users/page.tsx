import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-guard';
import { LogoutButton } from '@/components/LogoutButton';
import { StatCard } from '@/components/ui/StatCard';
import {
  USER_ROLES,
  USER_ROLE_TABLES,
  isUserRole,
  getTriageReport,
  getUsersForRolePaged,
  getPersonIndex,
  getPengajarAggregates,
  getMusyrifAggregates,
  getKetuaAggregates,
  getPesertaAggregates,
  getActionCounts30d,
  type UserRole,
} from '@/lib/admin-users';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 50;

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

type SP = {
  mode?: string; role?: string; q?: string; filter?: string;
  sort?: string; dir?: string; page?: string; conflicts?: string; imperr?: string;
};

export default async function AdminUsersPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const triage = await getTriageReport();

  const mode = searchParams.mode === 'person' ? 'person' : 'role';
  const role: UserRole = isUserRole(searchParams.role ?? '') ? (searchParams.role as UserRole) : 'pengajar';
  const q = searchParams.q ?? '';
  const filter = (['all', 'active', 'never_login'].includes(searchParams.filter ?? '') ? searchParams.filter : 'all') as 'all' | 'active' | 'never_login';
  const sort = (searchParams.sort === 'last_login' ? 'last_login' : 'name') as 'name' | 'last_login';
  const dir = (searchParams.dir === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
  const page = Math.max(0, parseInt(searchParams.page ?? '0', 10) || 0);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20, paddingBottom: 80 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Superadmin — User</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/admin/audit" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>Log Aktivitas</Link>
              <Link href="/" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>Dashboard</Link>
              <LogoutButton />
            </div>
          </div>

          {/* ---- Triase strip ---- */}
          <h1 className="t-h1" style={{ marginBottom: 4 }}>Daftar User</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
            {triage.totalPeople} orang (per nomor WA). Triase di bawah; klik untuk telusur.
          </p>

          {searchParams.imperr && (
            <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 12 }}>Gagal impersonate: {searchParams.imperr}</p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {triage.waConflicts.length > 0 && (
              <Link href="/admin/users?mode=person&conflicts=1" className="badge badge-merah" style={{ textDecoration: 'none', padding: '6px 10px' }}>
                ⚠️ {triage.waConflicts.length} WA bentrok (nama beda)
              </Link>
            )}
            {triage.neverLogin.map((n) => (
              <Link key={n.role} href={`/admin/users?mode=role&role=${n.role}&filter=never_login`} className="badge badge-kuning" style={{ textDecoration: 'none', padding: '6px 10px' }}>
                {n.count} {n.label} belum login
              </Link>
            ))}
            {triage.orphans.pengajarNoHalaqah > 0 && (
              <span className="badge badge-neutral" style={{ padding: '6px 10px' }}>{triage.orphans.pengajarNoHalaqah} pengajar tanpa halaqah</span>
            )}
            {triage.orphans.ketuaNoHalaqah > 0 && (
              <span className="badge badge-neutral" style={{ padding: '6px 10px' }}>{triage.orphans.ketuaNoHalaqah} ketua tanpa halaqah</span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
            {USER_ROLES.map((r) => (
              <StatCard key={r} value={triage.countsByRole[r].total} label={USER_ROLE_TABLES[r].label} sub={`${triage.countsByRole[r].active} aktif`} />
            ))}
          </div>

          {/* ---- Mode toggle ---- */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Link href="/admin/users?mode=role" className={`btn btn-sm ${mode === 'role' ? 'btn-primary' : 'btn-ghost'}`}>Per Role</Link>
            <Link href="/admin/users?mode=person" className={`btn btn-sm ${mode === 'person' ? 'btn-primary' : 'btn-ghost'}`}>Per Orang (WA)</Link>
          </div>

          {mode === 'person'
            ? await PersonMode({ page, conflictsOnly: searchParams.conflicts === '1', q })
            : await RoleMode({ role, q, filter, sort, dir, page })}
        </div>
      </div>
    </main>
  );
}

// ===================== ROLE MODE =====================
async function RoleMode({ role, q, filter, sort, dir, page }: {
  role: UserRole; q: string; filter: 'all' | 'active' | 'never_login'; sort: 'name' | 'last_login'; dir: 'asc' | 'desc'; page: number;
}) {
  const { rows, total } = await getUsersForRolePaged(role, { q, filter, sort, dir, page, pageSize: PAGE_SIZE });
  const ids = rows.map((r) => r.id);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Agregat per role.
  const waById: Record<string, string | null> = Object.fromEntries(rows.map((r) => [r.id, r.whatsapp_number]));
  const pengajarAgg = role === 'pengajar' ? await getPengajarAggregates(ids, waById) : null;
  const musyrifAgg = role === 'musyrif' ? await getMusyrifAggregates(ids) : null;
  const ketuaAgg = role === 'ketua_kelas' ? await getKetuaAggregates(ids) : null;
  const pesertaAgg = role === 'peserta' ? await getPesertaAggregates(ids) : null;
  const actionAgg = (role === 'koordinator' || role === 'syaikh' || role === 'koordinator_ketua_kelas')
    ? await getActionCounts30d(role, ids) : null;

  const extraCols: string[] =
    role === 'pengajar' ? ['#Halaqah', 'Matrix', 'Check-in'] :
    role === 'musyrif' ? ['#Kelas', '#Peserta', 'Cek bln'] :
    role === 'ketua_kelas' ? ['Keterangan', 'Login'] :
    role === 'peserta' ? ['Kelas', 'Setoran'] :
    ['Aksi 30h'];

  function qs(next: Partial<Record<string, string>>): string {
    const sp = new URLSearchParams({ mode: 'role', role, q, filter, sort, dir, page: String(page) });
    for (const [k, v] of Object.entries(next)) if (v != null) sp.set(k, v);
    return `?${sp.toString()}`;
  }

  return (
    <div>
      {/* Role tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {USER_ROLES.map((r) => (
          <Link key={r} href={`/admin/users?mode=role&role=${r}`} className={`btn btn-xs ${r === role ? 'btn-soft active' : 'btn-ghost'}`} style={{ fontSize: 12 }}>
            {USER_ROLE_TABLES[r].label}
          </Link>
        ))}
      </div>

      {/* Filter form (GET) */}
      <form method="get" className="card-flat" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="hidden" name="mode" value="role" />
        <input type="hidden" name="role" value={role} />
        <div style={{ flex: '2 1 200px' }}>
          <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>Cari nama / WA</label>
          <input name="q" defaultValue={q} className="input" placeholder="ketik…" style={{ width: '100%', height: 36 }} />
        </div>
        <div style={{ flex: '1 1 130px' }}>
          <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>Filter</label>
          <select name="filter" defaultValue={filter} className="input" style={{ height: 36 }}>
            <option value="all">Semua</option>
            <option value="active">Aktif</option>
            <option value="never_login">Belum login</option>
          </select>
        </div>
        <div style={{ flex: '1 1 130px' }}>
          <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>Urut</label>
          <select name="sort" defaultValue={sort} className="input" style={{ height: 36 }}>
            <option value="name">Nama</option>
            <option value="last_login">Login terakhir</option>
          </select>
        </div>
        <button type="submit" className="btn btn-ghost btn-sm" style={{ height: 36 }}>Terapkan</button>
      </form>

      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>{total} {USER_ROLE_TABLES[role].label}</p>

      <div className="card-flat" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nama</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>WhatsApp</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Status</th>
              {USER_ROLE_TABLES[role].hasLastLogin && <th style={{ padding: '8px 12px', fontWeight: 600 }}>Login terakhir</th>}
              {extraCols.map((c) => <th key={c} style={{ padding: '8px 12px', fontWeight: 600 }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((u, i) => {
              const pa = pengajarAgg?.get(u.id);
              const ma = musyrifAgg?.get(u.id);
              const ka = ketuaAgg?.get(u.id);
              const pea = pesertaAgg?.get(u.id);
              const aa = actionAgg?.get(u.id);
              return (
                <tr key={u.id} style={{ borderTop: '1px solid var(--line)', background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                    <Link href={`/admin/users/${role}/${u.id}`}>{u.name}</Link>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace' }}>{u.whatsapp_number ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className={`badge ${u.active ? 'badge-hijau' : 'badge-neutral'}`} style={{ fontSize: 11 }}><span className="dot" />{u.active ? 'aktif' : 'nonaktif'}</span>
                  </td>
                  {USER_ROLE_TABLES[role].hasLastLogin && (
                    <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(u.last_login_at)}</td>
                  )}
                  {role === 'pengajar' && (<>
                    <td style={{ padding: '8px 12px' }}>{pa?.halaqahCount ?? 0}</td>
                    <td style={{ padding: '8px 12px' }}>{pa?.matrixAvg != null ? pa.matrixAvg.toFixed(1) : '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{pa?.lastCheckin ? new Date(pa.lastCheckin).toLocaleDateString('id-ID') : '—'}</td>
                  </>)}
                  {role === 'musyrif' && (<>
                    <td style={{ padding: '8px 12px' }}>{ma?.kelasCount ?? 0}</td>
                    <td style={{ padding: '8px 12px' }}>{ma?.pesertaCount ?? 0}</td>
                    <td style={{ padding: '8px 12px' }}>{ma?.cekBulanIni ?? 0}</td>
                  </>)}
                  {role === 'ketua_kelas' && (<>
                    <td style={{ padding: '8px 12px' }}>{ka ? `${ka.terisi}/${ka.expected}` : '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{ka?.loggedIn ? '✓' : '—'}</td>
                  </>)}
                  {role === 'peserta' && (<>
                    <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{pea?.kelasName ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{pea?.setoranStatusThisWeek ?? 'belum'}</td>
                  </>)}
                  {(role === 'koordinator' || role === 'syaikh' || role === 'koordinator_ketua_kelas') && (
                    <td style={{ padding: '8px 12px' }}>{aa ?? 0}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <Link href={qs({ page: String(Math.max(0, page - 1)) })} className="btn btn-ghost btn-sm" style={{ pointerEvents: page === 0 ? 'none' : 'auto', opacity: page === 0 ? 0.5 : 1 }}>Sebelumnya</Link>
          <span className="t-small" style={{ color: 'var(--muted)' }}>Halaman {page + 1} / {totalPages}</span>
          <Link href={qs({ page: String(page + 1) })} className="btn btn-ghost btn-sm" style={{ pointerEvents: page + 1 >= totalPages ? 'none' : 'auto', opacity: page + 1 >= totalPages ? 0.5 : 1 }}>Selanjutnya</Link>
        </div>
      )}
    </div>
  );
}

// ===================== PERSON MODE =====================
async function PersonMode({ page, conflictsOnly, q }: { page: number; conflictsOnly: boolean; q: string }) {
  let people = await getPersonIndex();
  if (conflictsOnly) people = people.filter((p) => p.conflict);
  if (q) {
    const needle = q.toLowerCase();
    people = people.filter((p) => p.name.toLowerCase().includes(needle) || p.whatsapp_number.includes(q));
  }
  const total = people.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const slice = people.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function qs(p: number): string {
    const sp = new URLSearchParams({ mode: 'person', page: String(p) });
    if (conflictsOnly) sp.set('conflicts', '1');
    if (q) sp.set('q', q);
    return `?${sp.toString()}`;
  }

  return (
    <div>
      <form method="get" className="card-flat" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input type="hidden" name="mode" value="person" />
        {conflictsOnly && <input type="hidden" name="conflicts" value="1" />}
        <div style={{ flex: 1 }}>
          <label className="t-tiny" style={{ display: 'block', marginBottom: 4 }}>Cari nama / WA</label>
          <input name="q" defaultValue={q} className="input" placeholder="ketik…" style={{ width: '100%', height: 36 }} />
        </div>
        <button type="submit" className="btn btn-ghost btn-sm" style={{ height: 36 }}>Cari</button>
      </form>

      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        {total} orang{conflictsOnly ? ' (WA bentrok)' : ''}
      </p>

      <div className="card-flat" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nama</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>WhatsApp</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Role</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Login terakhir</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((p, i) => (
              <tr key={p.whatsapp_number} style={{ borderTop: '1px solid var(--line)', background: i % 2 ? 'var(--surface)' : 'transparent' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                  <Link href={`/admin/users/person/${p.whatsapp_number}`}>{p.name}</Link>
                  {p.conflict && <span className="badge badge-merah" style={{ fontSize: 10, marginLeft: 6 }}>bentrok: {p.nameVariants.join(' / ')}</span>}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace' }}>{p.whatsapp_number}</td>
                <td style={{ padding: '8px 12px' }}>
                  {p.roles.map((r) => (
                    <span key={r.role + r.id} className={`badge ${r.active ? 'badge-hijau' : 'badge-neutral'}`} style={{ fontSize: 10, marginRight: 4 }}>
                      {USER_ROLE_TABLES[r.role].label}
                    </span>
                  ))}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(p.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <Link href={qs(Math.max(0, page - 1))} className="btn btn-ghost btn-sm" style={{ pointerEvents: page === 0 ? 'none' : 'auto', opacity: page === 0 ? 0.5 : 1 }}>Sebelumnya</Link>
          <span className="t-small" style={{ color: 'var(--muted)' }}>Halaman {page + 1} / {totalPages}</span>
          <Link href={qs(page + 1)} className="btn btn-ghost btn-sm" style={{ pointerEvents: page + 1 >= totalPages ? 'none' : 'auto', opacity: page + 1 >= totalPages ? 0.5 : 1 }}>Selanjutnya</Link>
        </div>
      )}
    </div>
  );
}
