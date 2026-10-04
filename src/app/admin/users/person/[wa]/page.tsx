import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { LogoutButton } from '@/components/LogoutButton';
import {
  USER_ROLE_TABLES,
  getPersonDetail,
  getMergedSessionsForWa,
  getMergedAuditForWa,
} from '@/lib/admin-users';
import { startImpersonation } from '@/lib/admin-impersonate';

export const dynamic = 'force-dynamic';

function fmtDateTime(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function PersonDetailPage({ params }: { params: { wa: string } }) {
  await requireAdmin();
  const wa = decodeURIComponent(params.wa);
  const person = await getPersonDetail(wa);
  if (!person) notFound();

  const [sessions, audit] = await Promise.all([
    getMergedSessionsForWa(wa, 20),
    getMergedAuditForWa(wa, 30),
  ]);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20, paddingBottom: 80 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Superadmin — Orang</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/admin/users?mode=person" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>← Daftar</Link>
              <LogoutButton />
            </div>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 2 }}>{person.name}</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12, fontFamily: 'var(--font-mono), monospace' }}>{person.whatsapp_number}</p>

          {person.conflict && (
            <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 16, borderLeft: '3px solid var(--merah)' }}>
              <strong className="t-small">⚠️ Nama bentrok pada nomor ini:</strong>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>{person.nameVariants.join(' · ')} — perbaiki via edit identitas agar tidak terjadi salah-akun saat login.</p>
            </div>
          )}

          {/* Roles */}
          <h2 className="t-h2" style={{ marginBottom: 8 }}>Role ({person.roles.length})</h2>
          <div className="card-flat" style={{ padding: 0, overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Role</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nama (di tabel)</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Login terakhir</th>
                  <th style={{ padding: '8px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {person.roles.map((r) => (
                  <tr key={r.role + r.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{USER_ROLE_TABLES[r.role].label}</td>
                    <td style={{ padding: '8px 12px' }}>{r.name}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={`badge ${r.active ? 'badge-hijau' : 'badge-neutral'}`} style={{ fontSize: 11 }}><span className="dot" />{r.active ? 'aktif' : 'nonaktif'}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDateTime(r.last_login_at)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <Link href={`/admin/users/${r.role}/${r.id}`} className="btn btn-xs btn-ghost">Detail & aksi</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={startImpersonation} style={{ marginBottom: 20 }}>
            <input type="hidden" name="wa" value={person.whatsapp_number} />
            <button type="submit" className="btn btn-sm" style={{ background: '#7a2e2e', color: '#fff' }}>Login sebagai {person.name}</button>
          </form>

          <h2 className="t-h2" style={{ marginBottom: 8 }}>Riwayat Login gabungan ({sessions.length})</h2>
          {sessions.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>Belum ada.</p>
          ) : (
            <div className="card-flat" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                <thead><tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Login</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Logout</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Perangkat</th>
                </tr></thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtDateTime(s.login_at)}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{s.logout_at ? fmtDateTime(s.logout_at) : '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 11, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user_agent ?? s.ip_address ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="t-h2" style={{ marginBottom: 8 }}>Aktivitas gabungan ({audit.length})</h2>
          {audit.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada.</p>
          ) : (
            <div className="card-flat" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                <thead><tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Waktu</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Action</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Target</th>
                </tr></thead>
                <tbody>
                  {audit.map((a, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmtDateTime(a.created_at)}</td>
                      <td style={{ padding: '8px 12px' }}><span className="badge badge-neutral" style={{ fontSize: 11 }}><span className="dot" />{a.action}</span></td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 12 }}>{a.target_table ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
