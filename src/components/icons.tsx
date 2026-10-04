export const Icon = {
  back: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrow: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  mic: (s = 16) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="6" y="2" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 8a4.5 4.5 0 009 0M8 12.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  play: (s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M3 2.5v7l6-3.5z" />
    </svg>
  ),
  redo: (s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 6a4 4 0 117 2.8M9 3v3H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (s = 12) => (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  wa: (s = 13) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5C4.4 1.5 1.5 4.4 1.5 8c0 1.2.3 2.3.9 3.3L1.5 14.5l3.3-.9c1 .5 2 .8 3.2.8 3.6 0 6.5-2.9 6.5-6.5S11.6 1.5 8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 6c0 2 1.5 3.5 3.5 3.5l.7-.9-1.3-.4-.7.5c-.7-.3-1.2-.8-1.5-1.5l.5-.7-.4-1.3L6 6z" fill="currentColor" />
    </svg>
  ),
  search: (s = 13) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  logout: (s = 12) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M9 11.5V13a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h5a1 1 0 011 1v1.5M6 8h8m0 0l-2.5-2.5M14 8l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  user: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 13.5c.5-2.5 2.5-4 5-4s4.5 1.5 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  shield: (s = 14) => (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5L3 3v5c0 3 2 5.5 5 6.5 3-1 5-3.5 5-6.5V3L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
};

export function Waveform({
  progress = 0,
  bars = 38,
  height = 30,
  full = false,
}: {
  progress?: number;
  bars?: number;
  height?: number;
  full?: boolean;
}) {
  const heights = Array.from({ length: bars }, (_, i) => {
    const t = (Math.sin(i * 1.7) + Math.sin(i * 0.41 + 1) + Math.sin(i * 0.9 + 2)) / 3;
    return 0.25 + Math.abs(t) * 0.75;
  });
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${bars * 4} ${height}`}
      preserveAspectRatio="none"
    >
      {heights.map((h, i) => {
        const x = i * 4 + 1;
        const bh = h * (height - 4);
        const y = (height - bh) / 2;
        const past = full || i / bars <= progress;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={2}
            height={bh}
            rx={1}
            fill={past ? 'currentColor' : '#d8d3c8'}
          />
        );
      })}
    </svg>
  );
}

export function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  return <>{(parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')}</>;
}
