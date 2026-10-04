import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { LogoutButton } from '@/components/LogoutButton';
import {
  USER_ROLE_TABLES,
  isUserRole,
  getUserDetail,
  getRecentSessions,
  getRecentAudit,
  getRoleInsight,
} from '@/lib/admin-users';
import { UserActionsClient } from '../../UserActionsClient';

export const dynamic = 'force-dynamic';

function fmtDateTime(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: { role: string; id: string };
}) {
  await requireAdmin();
  if (!isUserRole(params.role)) notFound();
  const role = params.role;

  const user = await getUserDetail(role, params.id);
  if (!user) notFound();

  const [sessions, audit, insight] = await Promise.all([
    getRecentSessions(role, params.id, 20),
    getRecentAudit(role, params.id, 30),
    getRoleInsight(role, params.id, user.whatsapp_number),
  ]);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Superadmin — User</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/admin/users" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>← Daftar</Link>
              <LogoutButton />
            </div>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 2 }}>{user.name}</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            {USER_ROLE_TABLES[role].label}
          </p>

          <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row label="WhatsApp" value={user.whatsapp_number ?? '—'} />
            <Row label="Status" value={user.active ? 'Aktif' : 'Nonaktif'} />
            <Row label="Login terakhir" value={USER_ROLE_TABLES[role].hasLastLogin ? fmtDateTime(user.last_login_at) : 'tidak dilacak'} />
            <Row label="Terdaftar" value={fmtDateTime(user.created_at)} />
          </div>

          {insight && insight.metrics.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 className="t-h2" style={{ marginBottom: 8 }}>Ringkasan {USER_ROLE_TABLES[role].label}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                {insight.metrics.map((m) => (
                  <div key={m.label} className="card-flat" style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{m.value}</div>
                    <div className="t-small" style={{ color: 'var(--muted-2)' }}>{m.label}</div>
                  </div>
                ))}
              </div>
              {insight.halaqah && insight.halaqah.length > 0 && (
                <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                  {insight.halaqah.map((h, i) => (
                    <li key={i} className="t-small">{h.name}{h.level ? ` · ${h.level}` : ''}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <UserActionsClient
            role={role}
            id={user.id}
            wa={user.whatsapp_number}
            name={user.name}
            active={user.active}
            isKetua={role === 'ketua_kelas'}
          />

          <div style={{ height: 20 }} />

          <h2 className="t-h2" style={{ marginBottom: 8 }}>Riwayat Login ({sessions.length})</h2>
          {sessions.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>Belum ada riwayat login.</p>
          ) : (
            <div className="card-flat" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Login</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Logout</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Perangkat</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtDateTime(s.login_at)}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{s.logout_at ? fmtDateTime(s.logout_at) : '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 11, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.user_agent ?? s.ip_address ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="t-h2" style={{ marginBottom: 8 }}>Aktivitas ({audit.length})</h2>
          {audit.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada aktivitas tercatat.</p>
          ) : (
            <div className="card-flat" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Waktu</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Action</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Target</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a, i) => {
                    const detailStr = a.detail ? JSON.stringify(a.detail) : '';
                    return (
                      <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmtDateTime(a.created_at)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span className="badge badge-neutral" style={{ fontSize: 11 }}><span className="dot" />{a.action}</span>
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 12 }}>
                          {a.target_table ?? '—'}
                          {a.target_id && <div style={{ fontFamily: 'var(--font-mono), monospace' }}>{a.target_id.slice(0, 8)}…</div>}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {detailStr.length > 80 ? detailStr.slice(0, 80) + '…' : detailStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span className="t-small" style={{ color: 'var(--muted-2)', minWidth: 130 }}>{label}</span>
      <span className="t-small" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
