'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/icons';

/**
 * Tombol Keluar + modal konfirmasi. Logout lewat route handler lalu hard-navigate
 * ke "/" supaya pasti kembali ke halaman login (andal lintas RSC).
 */
export function LogoutButton({
  className = 'btn btn-sm btn-ghost',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [loading, setLoading] = useState(false);

  function open() {
    dialogRef.current?.showModal();
  }
  function close() {
    if (!loading) dialogRef.current?.close();
  }

  async function confirmLogout() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // abaikan — tetap arahkan ke login
    }
    window.location.href = '/';
  }

  return (
    <>
      <button type="button" className={className} style={{ height: 30, ...style }} onClick={open}>
        {Icon.logout(12)} Keluar
      </button>

      <dialog
        ref={dialogRef}
        style={{
          border: 'none',
          borderRadius: 'var(--r-lg)',
          padding: 0,
          maxWidth: 360,
          width: 'calc(100% - 32px)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-raised)',
        }}
        onClick={(e) => {
          // klik backdrop → tutup
          if (e.target === dialogRef.current) close();
        }}
      >
        <div style={{ padding: 20 }}>
          <div className="t-h1" style={{ fontSize: 17, marginBottom: 6 }}>Keluar dari akun?</div>
          <p className="t-small" style={{ marginBottom: 18 }}>
            Anda akan keluar dan kembali ke halaman login.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={close} disabled={loading}>
              Batal
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmLogout} disabled={loading}>
              {loading ? 'Keluar…' : 'Keluar'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
