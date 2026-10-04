'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { useFormState, useFormStatus } from 'react-dom';
import { login } from '@/lib/auth';

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState(login, undefined);
  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label className="field-label" htmlFor="login_whatsapp_number">Nomor WhatsApp</label>
        <input
          id="login_whatsapp_number"
          className="input"
          name="whatsapp_number"
          type="tel"
          autoComplete="username"
          required
          placeholder="08xxxxxxxxxx"
        />
      </div>
      <div>
        <label className="field-label" htmlFor="login_password">Password</label>
        <input
          id="login_password"
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>
      {state?.error && (
        <div className="banner banner-error">
          <div>
            <div className="title">Gagal login</div>
            <div className="desc">{state.error}</div>
          </div>
        </div>
      )}
      <SubmitBtn />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <Link href="/lupa-password" className="t-small" style={{ color: 'var(--muted)' }}>
          Lupa password?
        </Link>
      </div>
    </form>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-block btn-primary"
      style={{ marginTop: 6, height: 52 }}
    >
      {pending ? 'Memproses…' : 'Login'}
      {!pending && <span style={{ color: 'var(--emas)', display: 'flex' }}>{Icon.arrow(14)}</span>}
    </button>
  );
}
