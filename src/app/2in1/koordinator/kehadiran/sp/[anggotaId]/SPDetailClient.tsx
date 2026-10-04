'use client';

import { useState } from 'react';
import { batalkanSatu, putihkanSesi, type SPActionResult } from '../actions';

export type SesiOpt = {
  key: string; // "<anggotaId>|<tanggal>"
  tanggal: string;
  label: string;
  kelasName: string;
  status: 'izin' | 'alpa';
  /** Terisi bila sesi ini sudah dianulir pemutihan aktif. */
  sudahDiputihkan: string | null; // teks penjelas
};

export type RiwayatRow = {
  id: string;
  label: string; // "17 Jul 2026" / "Juli 2026 (sebulan)"
  alasan: string | null;
  oleh: string | null;
  pada: string;
  dibatalkan: { oleh: string | null; pada: string } | null;
};

export function SPDetailClient({
  anggotaId,
  sesi,
  riwayat,
}: {
  anggotaId: string;
  sesi: SesiOpt[];
  riwayat: RiwayatRow[];
}) {
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [alasan, setAlasan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bisaDipilih = sesi.filter((s) => !s.sudahDiputihkan);

  function toggle(key: string) {
    setPilih((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function run(fd: FormData, fn: (p: undefined, f: FormData) => Promise<SPActionResult>) {
    setBusy(true);
    setError(null);
    const res = await fn(undefined, fd);
    if (res.error) setError(res.error);
    setBusy(false);
    return res;
  }

  async function onPutihkan() {
    const fd = new FormData();
    fd.set('kembali_ke', anggotaId);
    fd.set('alasan', alasan);
    for (const k of pilih) fd.append('sesi', k);
    const res = await run(fd, putihkanSesi);
    if (res.ok) {
      setPilih(new Set());
      setAlasan('');
    }
  }

  async function onBatal(id: string) {
    const fd = new FormData();
    fd.set('id', id);
    fd.set('kembali_ke', anggotaId);
    await run(fd, batalkanSatu);
  }

  return (
    <div>
      {error && (
        <div className="banner banner-error" style={{ marginBottom: 10 }}>
          <div className="desc">{error}</div>
        </div>
      )}

      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}>
        SESI IZIN / ALPA ({sesi.length})
      </div>

      {sesi.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Tak ada sesi izin maupun alpa. Tidak ada yang perlu diputihkan.
        </p>
      ) : (
        <div className="card-flat" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          {sesi.map((s) => (
            <label
              key={s.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderBottom: '1px solid var(--line)',
                opacity: s.sudahDiputihkan ? 0.55 : 1,
                cursor: s.sudahDiputihkan ? 'default' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={pilih.has(s.key)}
                disabled={busy || !!s.sudahDiputihkan}
                onChange={() => toggle(s.key)}
              />
              <span style={{ flex: 1 }}>
                <span className="t-small" style={{ fontWeight: 600 }}>{s.label}</span>
                <span className="t-tiny" style={{ color: 'var(--muted-2)', marginLeft: 6 }}>
                  {s.kelasName}
                </span>
                {s.sudahDiputihkan && (
                  <span className="t-tiny" style={{ color: 'var(--muted-2)', display: 'block' }}>
                    sudah diputihkan — {s.sudahDiputihkan}
                  </span>
                )}
              </span>
              <span
                className="badge"
                style={
                  s.status === 'alpa'
                    ? { background: 'var(--merah-tint)', borderColor: 'var(--merah-line)', color: 'var(--merah-ink)' }
                    : { background: 'var(--kuning-tint)', borderColor: 'var(--kuning-line)', color: 'var(--kuning-ink)' }
                }
              >
                {s.status === 'alpa' ? 'ALPA' : 'IZIN'}
              </span>
            </label>
          ))}
        </div>
      )}

      {bisaDipilih.length > 0 && (
        <div className="card-flat" style={{ padding: 12, marginBottom: 20 }}>
          <input
            type="text"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="Alasan (mis. sakit, ada surat dokter)"
            style={{
              width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, marginBottom: 8,
              border: '1px solid var(--line)', background: 'var(--surface, #fff)', color: 'var(--ink)',
            }}
          />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy || pilih.size === 0}
            onClick={onPutihkan}
          >
            {pilih.size === 0 ? 'Pilih tanggal dulu' : `Putihkan ${pilih.size} tanggal`}
          </button>
        </div>
      )}

      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}>
        RIWAYAT PEMUTIHAN ({riwayat.length})
      </div>
      {riwayat.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum pernah diputihkan.</p>
      ) : (
        <div className="table-scroll">
          <table className="k-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Periode</th>
                <th>Alasan</th>
                <th>Oleh</th>
                <th>Kapan</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {riwayat.map((r) => (
                <tr key={r.id} style={r.dibatalkan ? { opacity: 0.55 } : undefined}>
                  <td style={r.dibatalkan ? { textDecoration: 'line-through' } : undefined}>{r.label}</td>
                  <td className="t-tiny" style={{ color: 'var(--muted-2)' }}>{r.alasan || '—'}</td>
                  <td className="t-tiny">{r.oleh || '—'}</td>
                  <td className="t-tiny" style={{ color: 'var(--muted-2)' }}>{r.pada}</td>
                  <td>
                    {r.dibatalkan ? (
                      <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                        dibatalkan {r.dibatalkan.oleh ? `oleh ${r.dibatalkan.oleh}` : ''} {r.dibatalkan.pada}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        disabled={busy}
                        onClick={() => onBatal(r.id)}
                      >
                        Batalkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
