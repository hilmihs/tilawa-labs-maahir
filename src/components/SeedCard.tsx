'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { runSeed, type SeedResult, type SeedKey } from '@/app/koordinator/admin/actions';

interface Props {
  seedKey: SeedKey;
  title: string;
  description: string;
  destructive: boolean;
}

export function SeedCard({ seedKey, title, description, destructive }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<SeedResult | undefined, FormData>(
    runSeed,
    undefined
  );

  const accent = destructive ? 'var(--merah)' : 'var(--hijau)';
  const hasResult = !!state?.log && state.log.length > 0;
  const hasErrorOnly = !!state?.error && !hasResult;

  return (
    <div
      className="card-flat"
      style={{
        padding: 16,
        marginBottom: 12,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: accent,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <h3 className="t-h3" style={{ margin: 0 }}>{title}</h3>
            {destructive ? (
              <span className="badge badge-merah" style={{ fontSize: 10, padding: '2px 6px' }}>
                DESTRUKTIF
              </span>
            ) : (
              <span className="badge badge-hijau" style={{ fontSize: 10, padding: '2px 6px' }}>
                AMAN
              </span>
            )}
          </div>
          <p className="t-small" style={{ margin: '6px 0 0', color: 'var(--muted)' }}>
            {description}
          </p>
        </div>
        {!open && !hasResult && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ flexShrink: 0 }}
            onClick={() => setOpen(true)}
          >
            Jalankan
          </button>
        )}
      </div>

      {open && !hasResult && (
        <form
          action={formAction}
          style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <input type="hidden" name="seed" value={seedKey} />
          <div>
            <label className="field-label">Password koordinator</label>
            <input
              className="input"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </div>
          {state?.error && (
            <div className="banner banner-error">
              <div>
                <div className="title">Gagal</div>
                <div className="desc">{state.error}</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setOpen(false)}
            >
              Batal
            </button>
            <ConfirmBtn destructive={destructive} />
          </div>
        </form>
      )}

      {/* Defensive: kalau ada error tapi form sudah tertutup, tetap tampilkan */}
      {!open && hasErrorOnly && (
        <div style={{ marginTop: 14 }} className="banner banner-error">
          <div>
            <div className="title">Gagal</div>
            <div className="desc">{state!.error}</div>
          </div>
        </div>
      )}

      {hasResult && (
        <div style={{ marginTop: 14 }}>
          <div className={`banner ${state!.ok ? 'banner-success' : 'banner-error'}`}>
            <div>
              <div className="title">{state!.ok ? 'Seed selesai' : 'Seed gagal'}</div>
              <div className="desc">
                {state!.ok
                  ? 'Eksekusi berhasil. Lihat log di bawah.'
                  : 'Ada error saat eksekusi. Cek log di bawah untuk detail.'}
              </div>
            </div>
          </div>
          <div className="t-tiny" style={{ margin: '12px 0 6px' }}>Log eksekusi</div>
          <pre
            style={{
              background: 'var(--surface-2, #f7f7f8)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: 10,
              fontSize: 11,
              lineHeight: 1.5,
              overflowX: 'auto',
              maxHeight: 280,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
            {state!.log!.join('\n')}
          </pre>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ marginTop: 10 }}
            onClick={() => {
              setOpen(false);
              window.location.reload();
            }}
          >
            Tutup & refresh
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmBtn({ destructive }: { destructive: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn btn-sm ${destructive ? 'btn-danger' : 'btn-primary'}`}
      style={{ flex: 1 }}
    >
      {pending && <Spinner />}
      {pending ? 'Memproses…' : destructive ? 'Konfirmasi & Jalankan' : 'Jalankan'}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="spin"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
