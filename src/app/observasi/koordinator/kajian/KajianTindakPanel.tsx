'use client';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { remindKajianKetua } from './actions';

export type TindakItem = {
  ketuaWa: string; namaKetua: string; tanggal: string; tanggalWib: string;
  state: 'belum-isi' | 'alpa'; sisaHari: number | null;
};

export function KajianTindakPanel({ items }: { items: TindakItem[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function remind(it: TindakItem) {
    start(async () => {
      const r = await remindKajianKetua({ ketuaWa: it.ketuaWa, tanggal: it.tanggal, namaKetua: it.namaKetua, tanggalWib: it.tanggalWib });
      if (r.ok && r.waLink) { window.open(r.waLink, '_blank'); setMsg('Reminder dikirim.'); }
      else setMsg(r.error ?? 'Gagal');
    });
  }

  if (!items.length) {
    return (
      <div className="card-flat" style={{ padding: '24px 20px', textAlign: 'center' }}>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tak ada yang perlu ditindak.</p>
      </div>
    );
  }

  return (
    <div>
      {/* dirender tanpa syarat sejak mount: live region yang baru dibuat tak diumumkan */}
      <p
        className="t-small"
        role="status"
        aria-live="polite"
        style={{ color: 'var(--ink-2)', marginBottom: msg ? 8 : 0, minHeight: msg ? undefined : 0 }}
      >
        {msg ?? ''}
      </p>
      {items.map((it, i) => (
        <div
          key={i}
          className="card-flat"
          style={{
            padding: '10px 14px', marginBottom: 6,
            borderLeft: `3px solid ${it.state === 'alpa' ? 'var(--merah)' : 'var(--kuning)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{it.namaKetua}</div>
            <div className="t-small" style={{ color: 'var(--muted)' }}>{it.tanggalWib}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {it.state === 'alpa' ? (
              <span className="badge badge-merah"><span className="dot" />Alpa</span>
            ) : (
              <span className="badge badge-kuning">
                <span className="dot" />
                Belum isi{it.sisaHari != null ? ` · sisa ${it.sisaHari} hari` : ''}
              </span>
            )}
            <button
              type="button"
              className="act-btn wa"
              disabled={pending}
              aria-label={`Kirim reminder ke ${it.namaKetua} untuk ${it.tanggalWib}`}
              onClick={() => remind(it)}
            >
              {Icon.wa(11)} Reminder
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
