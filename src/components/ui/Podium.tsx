import Link from 'next/link';
import { Initials } from '@/components/icons';

export type PodiumItem = { id: string; name: string; sub?: string; score: number | null };

export function Podium({
  items, href, colorFor,
}: {
  items: PodiumItem[];
  href: (id: string) => string;
  colorFor: (score: number | null) => string;
}) {
  if (items.length === 0) return null;
  const order = [items[1], items[0], items[2]].filter(Boolean) as PodiumItem[];
  return (
    <div className="podium" style={{ marginBottom: 20 }}>
      {order.map((it) => {
        const rank = items[0] === it ? 1 : items[1] === it ? 2 : 3;
        const isFirst = rank === 1;
        return (
          <Link key={it.id} href={href(it.id)} prefetch={false}
            style={{ textDecoration: 'none', flex: 1, maxWidth: 200 }}>
            <div className={`podium-card${isFirst ? ' first' : ''}`}>
              {/* Juara #1 duduk di kartu forest — warnanya dibalik ke krem/emas. */}
              <div style={{ fontSize: 11, fontWeight: 700, color: isFirst ? 'var(--emas)' : 'var(--kuning-ink)', marginBottom: 6 }}>
                #{rank}
                {isFirst && (
                  <span style={{ marginLeft: 5, fontSize: 10, background: 'var(--emas)', color: 'var(--forest)', padding: '1px 5px', borderRadius: 4 }}>Terbaik</span>
                )}
              </div>
              <div
                className="avatar"
                style={{
                  width: 40, height: 40, fontSize: 14, margin: '0 auto 8px',
                  background: isFirst ? 'var(--emas)' : 'var(--accent-tint)',
                  color: isFirst ? 'var(--forest)' : 'var(--accent-2)',
                  fontWeight: 800,
                }}
              >
                <Initials name={it.name} />
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isFirst ? 'var(--forest-ink)' : 'var(--ink)' }}>{it.name}</div>
              {it.sub && (
                <div style={{ fontSize: 10, color: isFirst ? 'var(--forest-soft)' : 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</div>
              )}
              <div className="t-mono" style={{ fontSize: isFirst ? 22 : 20, fontWeight: 800, marginTop: 8, color: isFirst ? 'var(--emas)' : colorFor(it.score) }}>
                {it.score !== null ? it.score.toFixed(1) : '—'}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
