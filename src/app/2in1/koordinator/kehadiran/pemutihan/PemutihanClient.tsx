'use client';

import { useMemo, useState } from 'react';
import { putihkan, batalkanPemutihan } from './actions';

export type PemutihanRow = {
  id: string;
  anggotaId: string;
  alasan: string | null;
  /** 'Sebulan penuh' atau tanggalnya. */
  periode: string;
  oleh: string | null;
  pada: string;
  dibatalkan: { oleh: string | null; pada: string } | null;
  /** true = pemutihan sebulan-penuh yang masih aktif. */
  kunciSebulan: boolean;
};
export type AnggotaOpt = { id: string; name: string; kelasName: string };

/** Kelola pemutihan absensi satu bulan: cari peserta → putihkan / batalkan. */
export function PemutihanClient({
  month,
  anggota,
  rows,
}: {
  month: string;
  anggota: AnggotaOpt[];
  rows: PemutihanRow[];
}) {
  const [q, setQ] = useState('');
  const [alasan, setAlasan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(anggota.map((a) => [a.id, a])), [anggota]);
  // Hanya pemutihan sebulan-penuh yang aktif yang menyembunyikan seseorang dari
  // pencarian — yang per-tanggal masih boleh diputihkan sebulan penuh.
  const sudah = useMemo(
    () => new Set(rows.filter((r) => r.kunciSebulan).map((r) => r.anggotaId)),
    [rows]
  );
  const query = q.trim().toLowerCase();
  const hasil = useMemo(
    () =>
      query.length < 2
        ? []
        : anggota
            .filter(
              (a) =>
                !sudah.has(a.id) &&
                (a.name.toLowerCase().includes(query) || a.kelasName.toLowerCase().includes(query))
            )
            .slice(0, 12),
    [anggota, query, sudah]
  );

  async function run(fd: FormData, fn: (p: undefined, f: FormData) => Promise<{ ok?: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn(undefined, fd);
    if (res.error) setError(res.error);
    setBusy(false);
  }

  async function onPutihkan(anggotaId: string) {
    const fd = new FormData();
    fd.set('anggota_id', anggotaId);
    fd.set('month', month);
    fd.set('alasan', alasan);
    await run(fd, putihkan);
    setQ('');
  }

  async function onBatal(id: string) {
    const fd = new FormData();
    fd.set('id', id);
    await run(fd, batalkanPemutihan);
  }

  return (
    <div>
      {error && (
        <div className="banner banner-error" style={{ marginBottom: 10 }}>
          <div className="desc">{error}</div>
        </div>
      )}

      <div className="card-flat" style={{ padding: 12, marginBottom: 16 }}>
        <div className="t-small" style={{ fontWeight: 600, marginBottom: 6 }}>Putihkan peserta</div>
        <input
          type="text"
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder="Alasan (mis. ustadzah, tugas pesantren)"
          style={{
            width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, marginBottom: 8,
            border: '1px solid var(--line)', background: 'var(--surface, #fff)', color: 'var(--ink)',
          }}
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama peserta / kelas…"
          style={{
            width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--line)', background: 'var(--surface, #fff)', color: 'var(--ink)',
          }}
        />
        {query.length >= 2 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {hasil.length === 0 && (
              <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>Tidak ada yang cocok.</span>
            )}
            {hasil.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={busy}
                onClick={() => onPutihkan(a.id)}
                className="btn btn-xs btn-ghost"
                style={{ justifyContent: 'space-between', display: 'flex', width: '100%' }}
              >
                <span>{a.name}</span>
                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>{a.kelasName} · putihkan →</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}>
        RIWAYAT PEMUTIHAN BULAN INI ({rows.length})
      </div>
      {rows.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada peserta yang diputihkan.</p>
      ) : (
        <div className="table-scroll">
          <table className="k-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Peserta</th>
                <th>Kelas</th>
                <th>Periode</th>
                <th>Alasan</th>
                <th>Oleh</th>
                <th>Kapan</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = byId.get(r.anggotaId);
                return (
                  <tr key={r.id} style={r.dibatalkan ? { opacity: 0.55 } : undefined}>
                    <td style={r.dibatalkan ? { textDecoration: 'line-through' } : undefined}>
                      {a?.name ?? '—'}
                    </td>
                    <td className="t-tiny">{a?.kelasName ?? '—'}</td>
                    <td className="t-tiny">{r.periode}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
