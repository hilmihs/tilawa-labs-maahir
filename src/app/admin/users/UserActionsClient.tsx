'use client';

import { useState, useTransition } from 'react';
import {
  toggleUserActive,
  editUserIdentity,
  adminResetPassword,
  adminResendLogin,
  type AdminActionResult,
} from '@/lib/admin-actions';
import { startImpersonation } from '@/lib/admin-impersonate';

export function UserActionsClient({
  role,
  id,
  wa,
  name,
  active,
  isKetua,
}: {
  role: string;
  id: string;
  wa: string | null;
  name: string;
  active: boolean;
  isKetua: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function run(fn: () => Promise<AdminActionResult>) {
    setErr(null); setMsg(null); setWaUrl(null);
    start(async () => {
      const res = await fn();
      if (res?.error) { setErr(res.error); return; }
      if (res?.waUrl) setWaUrl(res.waUrl);
      setMsg(res?.info ?? (res?.password ? `Password baru: ${res.password}` : 'Berhasil.'));
      if (res?.ok && !res?.waUrl) setEditing(false);
    });
  }

  function fdOf(extra: Record<string, string>): FormData {
    const fd = new FormData();
    fd.set('role', role); fd.set('id', id);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  }

  return (
    <div className="card-flat" style={{ padding: '14px 16px', marginTop: 16 }}>
      <div className="t-small" style={{ fontWeight: 600, marginBottom: 10 }}>Aksi Admin</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn btn-sm btn-ghost" disabled={pending}
          onClick={() => run(() => toggleUserActive(undefined, fdOf({ next: String(!active) })))}>
          {active ? 'Nonaktifkan' : 'Aktifkan'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={pending}
          onClick={() => run(() => adminResetPassword(undefined, fdOf({})))}>
          Reset password
        </button>
        {isKetua && (
          <button type="button" className="btn btn-sm btn-ghost" disabled={pending}
            onClick={() => run(() => adminResendLogin(undefined, fdOf({})))}>
            Kirim-ulang login
          </button>
        )}
        <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => setEditing((v) => !v)}>
          {editing ? 'Batal edit' : 'Edit nama/WA'}
        </button>
        {wa && (
          <form action={startImpersonation} style={{ display: 'inline' }}>
            <input type="hidden" name="wa" value={wa} />
            <button type="submit" className="btn btn-sm" style={{ background: '#7a2e2e', color: '#fff' }} disabled={pending}>
              Login sebagai
            </button>
          </form>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input id="edit_name" className="input" defaultValue={name} placeholder="Nama" />
          <input id="edit_wa" className="input" defaultValue={wa ?? ''} placeholder="Nomor WA" />
          <p className="t-tiny" style={{ color: 'var(--muted-2)' }}>
            ⚠️ Mengubah WA memindahkan identitas login row ini. WA yang sudah dipakai orang lain (nama beda) akan ditolak.
          </p>
          <button type="button" className="btn btn-sm btn-primary" disabled={pending}
            onClick={() => {
              const nm = (document.getElementById('edit_name') as HTMLInputElement)?.value ?? '';
              const w = (document.getElementById('edit_wa') as HTMLInputElement)?.value ?? '';
              run(() => editUserIdentity(undefined, fdOf({ name: nm, whatsapp_number: w })));
            }}>
            Simpan
          </button>
        </div>
      )}

      {err && <p className="t-small" style={{ color: 'var(--danger)', marginTop: 8 }}>{err}</p>}
      {msg && <p className="t-small" style={{ color: 'var(--hijau-ink)', marginTop: 8 }}>{msg}</p>}
      {waUrl && (
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-wa btn-sm" style={{ marginTop: 8 }}>
          Buka WhatsApp
        </a>
      )}
    </div>
  );
}
