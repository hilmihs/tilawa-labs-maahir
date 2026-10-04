import type { ReactNode } from 'react';

export function StatCard({
  value, label, valueColor, dotColor, mono = false, sub,
}: {
  value: ReactNode; label: ReactNode; valueColor?: string;
  dotColor?: string; mono?: boolean; sub?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className={mono ? 'v t-mono' : 'v'} style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
      <div className="l">
        {dotColor && <span className="accent-dot" style={{ background: dotColor }} />}
        {label}
        {sub != null && (
          <div style={{ color: 'var(--muted-2)', fontSize: 11, marginTop: 2 }}>{sub}</div>
        )}
      </div>
    </div>
  );
}
