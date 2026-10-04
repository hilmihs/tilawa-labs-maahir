import { getImpersonation } from '@/lib/session';
import { stopImpersonating } from '@/lib/admin-impersonate';

export async function ImpersonationBanner() {
  const imp = await getImpersonation();
  if (!imp) return null;
  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
        background: '#7a2e2e', color: '#fff', padding: '8px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        fontSize: 13, boxShadow: '0 -2px 12px rgba(0,0,0,0.2)',
      }}
    >
      <span>Anda login sebagai <strong>{imp.targetName}</strong> (impersonate)</span>
      <form action={stopImpersonating}>
        <button type="submit" style={{ background: '#fff', color: '#7a2e2e', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 600, cursor: 'pointer' }}>
          Kembali ke admin
        </button>
      </form>
    </div>
  );
}
