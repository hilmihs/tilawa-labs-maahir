import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildWaMeUrl } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { ProcessClient } from './ProcessClient';
import { AcceptedView } from './AcceptedView';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordProcessPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();

  const { data: req } = await supabaseAdmin
    .from('password_reset_requests')
    .select('id, whatsapp_number, requester_name, status, decided_by_wa, decided_at, created_at, new_password_plaintext, plaintext_expires_at')
    .eq('id', params.id)
    .maybeSingle();

  if (!req) notFound();

  let acceptedWaUrl: string | null = null;
  if (req.status === 'accepted' && req.new_password_plaintext) {
    const template = [
      `Assalamu'alaikum ${req.requester_name ?? ''}`.trim() + `,`,
      ``,
      `Password sementara Anda: *${req.new_password_plaintext}*`,
      ``,
      `Login di: ${absUrl('/')}`,
      ``,
      `Setelah berhasil masuk, mohon segera ganti password via menu Akun (foto profil → Akun → Ganti Password).`,
    ].join('\n');
    acceptedWaUrl = buildWaMeUrl(req.whatsapp_number, template);
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="page" style={{ paddingTop: 32, maxWidth: 520, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/" className="t-small" style={{ color: 'var(--muted)' }}>
            ← Home
          </Link>
        </div>
        <h1 className="t-h1" style={{ marginBottom: 6 }}>Permintaan Reset Password</h1>
        <p className="t-body" style={{ marginBottom: 20, color: 'var(--muted)' }}>
          ID: <code style={{ fontFamily: 'var(--font-mono), monospace' }}>{req.id.slice(0, 8)}…</code>
        </p>

        {req.status === 'pending' && <ProcessClient request={req} />}

        {req.status === 'accepted' && (
          <AcceptedView
            requestId={req.id}
            requesterName={req.requester_name}
            whatsappNumber={req.whatsapp_number}
            decidedAt={req.decided_at}
            decidedByWa={req.decided_by_wa}
            plaintext={req.new_password_plaintext}
            plaintextExpiresAt={req.plaintext_expires_at}
            waMeUrl={acceptedWaUrl}
          />
        )}

        {req.status === 'declined' && (
          <div className="banner banner-success">
            <div>
              <div className="title">Sudah diproses</div>
              <div className="desc">
                Status: <strong>Ditolak</strong><br />
                Diproses oleh: {req.decided_by_wa ?? '—'}<br />
                Pada: {req.decided_at ? new Date(req.decided_at).toLocaleString('id-ID') : '—'}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
