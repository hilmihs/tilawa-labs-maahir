'use client';

import { useMemo, useState, useTransition } from 'react';
import { toggleOrangAktif, type NonaktifResult } from './actions';
import type { OrangRow } from '@/lib/orang-aktif';

export function NonaktifClient({ orang }: { orang: OrangRow[] }) {
  const [q, setQ] = useState('');
  const [hanyaNonaktif, setHanyaNonaktif] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [konfirmasi, setKonfirmasi] = useState<string | null>(null); // wa yg menunggu konfirmasi

  const list = useMemo(() => {
    const key = q.trim().toLowerCase();
    return orang.filter((o) => {
      if (hanyaNonaktif && o.active) return false;
      if (!key) return true;
      return o.name.toLowerCase().includes(key) || o.wa.includes(key);
    });
  }, [orang, q, hanyaNonaktif]);

  function jalankan(o: OrangRow, next: boolean) {
    setErr(null);
    setMsg(null);
    setKonfirmasi(null);
    const fd = new FormData();
    fd.set('wa', o.wa);
    fd.set('nama', o.name);
    fd.set('next', String(next));
    start(async () => {
      const res: NonaktifResult = await toggleOrangAktif(undefined, fd);
      if (res.error) setErr(res.error);
      else setMsg(res.info ?? 'Berhasil.');
    });
  }

  const jmlNonaktif = orang.filter((o) => !o.active).length;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="Cari nama atau nomor WA…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: '1 1 200px' }}
        />
        <button
          type="button"
          className={hanyaNonaktif ? 'btn btn-sm' : 'btn btn-sm btn-ghost'}
          onClick={() => setHanyaNonaktif((v) => !v)}
        >
          Nonaktif ({jmlNonaktif})
        </button>
      </div>

      {msg && (
        <div className="banner banner-success" style={{ marginBottom: 10 }}>
          <div className="desc">{msg}</div>
        </div>
      )}
      {err && (
        <div className="banner banner-error" style={{ marginBottom: 10 }}>
          <div className="desc">{err}</div>
        </div>
      )}

      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
        Menampilkan {list.length} dari {orang.length} orang.
      </p>

      {list.map((o) => (
        <div
          key={o.wa}
          className="card-flat"
          style={{ padding: '10px 12px', marginBottom: 8, opacity: o.active ? 1 : 0.6 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {o.name}{' '}
                {!o.active && (
                  <span className="t-tiny" style={{ color: 'var(--bad-ink, #a33)' }}>
                    · nonaktif
                  </span>
                )}
              </div>
              <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                {o.wa}
                {o.kelompok ? ` · ${o.kelompok}` : ''}
              </div>
              {o.peran.length > 0 && (
                <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
                  Ikut terkena: {o.peran.join(', ')}
                </div>
              )}
            </div>

            {konfirmasi === o.wa ? (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={() => jalankan(o, false)}
                >
                  Ya, nonaktifkan
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={pending}
                  onClick={() => setKonfirmasi(null)}
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ flexShrink: 0 }}
                disabled={pending}
                onClick={() => (o.active ? setKonfirmasi(o.wa) : jalankan(o, true))}
              >
                {o.active ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
            )}
          </div>
        </div>
      ))}

      {list.length === 0 && (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada yang cocok.</p>
      )}
    </>
  );
}
