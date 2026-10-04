export type DistSegment = { value: number; color: string; label?: string };

export function MiniDistribution({
  segments, height = 8, showLegend = true,
}: { segments: DistSegment[]; height?: number; showLegend?: boolean }) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((sum, s) => sum + s.value, 0);
  return (
    <div>
      <div style={{ display: 'flex', width: '100%', height, borderRadius: height / 2, overflow: 'hidden', background: 'var(--line)' }}>
        {total === 0 ? null : shown.map((s, i) => (
          <div key={i} style={{ flex: s.value, background: s.color }} title={s.label ? `${s.label}: ${s.value}` : String(s.value)} />
        ))}
      </div>
      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
          {segments.filter((s) => s.label).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label} {s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
