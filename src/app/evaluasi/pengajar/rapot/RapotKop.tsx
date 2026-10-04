import type { RapotIdentitas } from '@/lib/rapot';

type RapotKopProps = {
  identitas: RapotIdentitas;
  logoSrc: string;
  sub?: string;
  pageLabel?: string;
};

export default function RapotKop({ identitas, logoSrc, sub, pageLabel }: RapotKopProps) {
  const subText =
    sub ??
    [
      `Halaqah ${identitas.halaqah}`,
      identitas.batch ? `Batch ${identitas.batch}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, paddingBottom: 14 }}>
        <img
          src={logoSrc}
          alt="Tilawa Labs"
          width={58}
          height={58}
          style={{ width: 58, height: 58, borderRadius: 8, flexShrink: 0, objectFit: 'cover' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.02em', color: '#1b1a17' }}>
            Tilawa Labs
          </div>
          <div style={{ fontSize: 11, color: '#7a766f', marginTop: 2 }}>{subText}</div>
        </div>
        {pageLabel ? (
          <div style={{ fontSize: 10.5, color: '#a8a39a', flexShrink: 0, textAlign: 'right' }}>
            {pageLabel}
          </div>
        ) : null}
      </div>
      <div style={{ height: 2.5, background: '#1b1a17', marginBottom: 4 }} />
      <div style={{ height: 1, background: '#1b1a17', marginBottom: 18 }} />
    </div>
  );
}
