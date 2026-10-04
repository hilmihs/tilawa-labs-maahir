'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { clearPlaintext, regeneratePassword } from './actions';

interface Props {
  requestId: string;
  requesterName: string | null;
  whatsappNumber: string;
  decidedAt: string | null;
  decidedByWa: string | null;
  plaintext: string | null;
  plaintextExpiresAt: string | null;
  waMeUrl: string | null;
}

function fmtDateTime(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('id-ID');
}

export function AcceptedView(props: Props) {
  const hasValidPlaintext =
    props.plaintext &&
    props.plaintextExpiresAt &&
    new Date(props.plaintextExpiresAt).getTime() > Date.now();

  if (hasValidPlaintext && props.plaintext && props.waMeUrl) {
    return (
      <PlaintextRecovery
        requestId={props.requestId}
        requesterName={props.requesterName}
        password={props.plaintext}
        waMeUrl={props.waMeUrl}
        expiresAt={props.plaintextExpiresAt!}
      />
    );
  }

  // Plaintext expired / cleared — show banner + regenerate option
  return (
    <ExpiredView
      requestId={props.requestId}
      requesterName={props.requesterName}
      whatsappNumber={props.whatsappNumber}
      decidedAt={props.decidedAt}
      decidedByWa={props.decidedByWa}
    />
  );
}

function PlaintextRecovery({
  requestId,
  requesterName,
  password,
  waMeUrl,
  expiresAt,
}: {
  requestId: string;
  requesterName: string | null;
  password: string;
  waMeUrl: string;
  expiresAt: string;
}) {
  const [clearState, clearAction] = useFormState(clearPlaintext, undefined);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (clearState?.ok) {
    return (
      <div className="banner banner-success">
        <div>
          <div className="title">Plaintext password sudah dihapus</div>
          <div className="desc">Halaman ini sekarang aman tertinggal. Pemohon sudah menerima password via WhatsApp.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="banner banner-success">
        <div>
          <div className="title">Password sementara tersedia (re-show)</div>
          <div className="desc">
            Password sudah di-hash dan ter-sinkron ke semua tabel role pemohon. Plaintext disimpan sementara
            sampai <strong>{fmtDateTime(expiresAt)}</strong> supaya Anda bisa re-kirim kalau lupa.
          </div>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="recovery_password">
          Password sementara — {requesterName ?? 'pemohon'}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="recovery_password"
            className="input"
            value={password}
            readOnly
            style={{ fontFamily: 'var(--font-mono), monospace', letterSpacing: 1 }}
          />
          <button type="button" onClick={handleCopy} className="btn btn-ghost" style={{ flexShrink: 0 }}>
            {copied ? '✓' : 'Salin'}
          </button>
        </div>
      </div>

      <p className="t-small" style={{ color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
        Klik tombol di bawah untuk buka tab WhatsApp dengan pesan siap kirim.
      </p>

      <a
        href={waMeUrl}
        target="_blank"
        rel="noreferrer"
        className="btn btn-block btn-primary"
        style={{ fontSize: 16 }}
      >
        📱 Buka WhatsApp — {requesterName ?? 'pemohon'}
      </a>

      <form action={clearAction}>
        <input type="hidden" name="id" value={requestId} />
        <ClearBtn />
      </form>
      {clearState?.error && (
        <p className="t-small" style={{ color: 'var(--danger)' }}>{clearState.error}</p>
      )}
    </div>
  );
}

function ExpiredView({
  requestId,
  requesterName,
  whatsappNumber,
  decidedAt,
  decidedByWa,
}: {
  requestId: string;
  requesterName: string | null;
  whatsappNumber: string;
  decidedAt: string | null;
  decidedByWa: string | null;
}) {
  const [regenState, regenAction] = useFormState(regeneratePassword, undefined);
  const [copied, setCopied] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    if (regenState?.waMeUrl) {
      const w = window.open(regenState.waMeUrl, '_blank', 'noopener,noreferrer');
      if (!w || w.closed || typeof w.closed === 'undefined') {
        setPopupBlocked(true);
      }
    }
  }, [regenState?.waMeUrl]);

  if (regenState?.password && regenState?.waMeUrl) {
    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(regenState.password!);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore
      }
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="banner banner-success">
          <div>
            <div className="title">Password baru berhasil di-regenerate</div>
            <div className="desc">
              Hash sudah disinkron. Plaintext tersedia 24 jam ke depan. Kirim ke pemohon via WhatsApp.
            </div>
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="regen_password">Password baru</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="regen_password"
              className="input"
              value={regenState.password}
              readOnly
              style={{ fontFamily: 'var(--font-mono), monospace', letterSpacing: 1 }}
            />
            <button type="button" onClick={handleCopy} className="btn btn-ghost" style={{ flexShrink: 0 }}>
              {copied ? '✓' : 'Salin'}
            </button>
          </div>
        </div>
        {popupBlocked ? (
          <div className="banner banner-error">
            <div>
              <div className="title">Tab WhatsApp diblokir browser</div>
              <div className="desc">Klik tombol di bawah untuk buka WhatsApp manual.</div>
            </div>
          </div>
        ) : (
          <p className="t-small" style={{ color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
            Tab WhatsApp dibuka otomatis. Kalau tidak terbuka, klik tombol di bawah.
          </p>
        )}
        <a
          href={regenState.waMeUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-block btn-primary"
          style={{ fontSize: 16 }}
        >
          📱 Buka WhatsApp — {requesterName ?? 'pemohon'}
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="banner banner-success">
        <div>
          <div className="title">Sudah diproses</div>
          <div className="desc">
            Status: <strong>Diterima</strong><br />
            Diproses oleh: {decidedByWa ?? '—'}<br />
            Pada: {fmtDateTime(decidedAt)}<br />
            <br />
            Pemohon ({requesterName ?? whatsappNumber}) seharusnya sudah terima password via WhatsApp.
            Plaintext sementara sudah tidak tersedia (TTL 24 jam habis atau sudah ditandai sudah dikirim).
          </div>
        </div>
      </div>

      <div className="banner banner-error">
        <div>
          <div className="title">Pemohon tidak terima password?</div>
          <div className="desc">
            Klik tombol di bawah untuk generate password baru. Password lama akan invalid.
          </div>
        </div>
      </div>

      <form action={regenAction}>
        <input type="hidden" name="id" value={requestId} />
        <RegenBtn />
      </form>
      {regenState?.error && (
        <p className="t-small" style={{ color: 'var(--danger)' }}>{regenState.error}</p>
      )}
    </div>
  );
}

function ClearBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-block btn-ghost">
      {pending ? 'Memproses…' : 'Tandai sudah dikirim — hapus plaintext'}
    </button>
  );
}

function RegenBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-block btn-primary">
      {pending ? 'Memproses…' : 'Re-generate & kirim password baru'}
    </button>
  );
}
