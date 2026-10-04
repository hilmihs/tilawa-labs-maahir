import Link from 'next/link';
import { LupaPasswordForm } from './LupaPasswordForm';

export const dynamic = 'force-dynamic';

export default function LupaPasswordPage() {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="page" style={{ paddingTop: 56, maxWidth: 480, margin: '0 auto' }}>
        <div className="wordmark" style={{ marginBottom: 24 }}>
          <span className="mark">M</span>
          Tilawa Labs
        </div>
        <h1 className="t-h1" style={{ marginBottom: 6 }}>Lupa Password</h1>
        <p className="t-body" style={{ marginBottom: 26 }}>
          Masukkan nomor WhatsApp Anda. Permintaan akan dikirim ke Technical Support. Setelah disetujui, password baru akan dikirimkan ke WhatsApp Anda.
        </p>
        <LupaPasswordForm />
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Link href="/" className="t-small" style={{ color: 'var(--muted)' }}>
            ← Kembali ke login
          </Link>
        </div>
      </div>
    </main>
  );
}
