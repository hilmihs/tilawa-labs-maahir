'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { changePassword } from '@/lib/auth';

export function ChangePasswordForm() {
  const [state, formAction] = useFormState(changePassword, undefined);

  return (
    <form
      action={formAction}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div>
        <label className="field-label" htmlFor="current_password">Password saat ini</label>
        <input
          id="current_password"
          className="input"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <label className="field-label" htmlFor="new_password">Password baru</label>
        <input
          id="new_password"
          className="input"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
        />
      </div>
      <div>
        <label className="field-label" htmlFor="confirm_password">Konfirmasi password baru</label>
        <input
          id="confirm_password"
          className="input"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
        />
      </div>

      {state?.error && (
        <div className="banner banner-error">
          <div>
            <div className="title">Gagal mengganti password</div>
            <div className="desc">{state.error}</div>
          </div>
        </div>
      )}

      {state?.ok && (
        <div className="banner banner-success">
          <div className="ic" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="title">Password diganti</div>
            <div className="desc">Lain kali login pakai password baru.</div>
          </div>
        </div>
      )}

      <SubmitBtn />
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
      style={{ marginTop: 6 }}
    >
      {pending ? 'Menyimpan…' : 'Simpan password baru'}
    </button>
  );
}
