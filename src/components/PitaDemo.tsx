/**
 * The demo banner.
 *
 * A visitor who reaches a login form with no credentials leaves, so the demo
 * accounts are printed here. That is only safe because this build is sealed —
 * see DEMO.md: synthetic data, the admin SQL endpoint off, the production
 * rosters stubbed out of the bundle, and a nightly reset.
 *
 * Rendered from the root layout so no route can be reached without it.
 */
export function PitaDemo() {
  if (process.env.NEXT_PUBLIC_DEMO !== '1') return null;

  return (
    <div
      dir="ltr"
      style={{
        background: '#14201A',
        color: '#EFE9DC',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        lineHeight: 1.45,
        padding: '7px 14px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 18px',
        alignItems: 'baseline',
      }}
    >
      <strong style={{ letterSpacing: '.08em', textTransform: 'uppercase' }}>Demo</strong>
      <span>Synthetic data. Resets nightly. Nothing here is sent to anyone.</span>
      <span style={{ opacity: 0.88 }}>
        Sign in with a WhatsApp number — coordinator <b>6289900000001</b> · musyrif{' '}
        <b>6289900000002</b> · password <b>demo123</b>
      </span>
    </div>
  );
}
