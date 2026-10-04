import type { CSSProperties, ReactNode } from 'react';

export function SectionHeader({
  title, right, style, as,
}: {
  title: ReactNode; right?: ReactNode; style?: CSSProperties;
  /** Elemen judul. Default 'div'; pakai 'h2' agar seksi terbaca di navigasi heading. */
  as?: 'div' | 'h2' | 'h3';
}) {
  const Tag = as ?? 'div';
  return (
    <div className="section-row" style={style}>
      <Tag className="t-tiny">{title}</Tag>
      {right != null && <div className="t-small">{right}</div>}
    </div>
  );
}
