'use client';

import { useMemo, useState } from 'react';
import { putihkanMassal, batalkanBatchAction, type MassalResult } from './actions';
import type { KelasPilihan } from '@/lib/maahir-pemutihan-batch';

export type BatchRow = {
  id: string;
  alasan: string | null;
  jumlahPeserta: number;
  kelasNames: string[];
  oleh: string | null;
  pada: string;
  dibatalkan: { oleh: string | null; pada: string } | null;
};

/**
 * Pintasan grup — hanya menyalakan/mematikan centang, tak disimpan ke mana pun.
 * Polanya diturunkan dari nama kelas yang dipakai koordinator sehari-hari
 * ("Maahir Talaqqi (Senin pagi)", "Maahir 6A - Ikhwan", "Maahir Tahfidzul
 * Qur'an 1"), jadi tak perlu tabel grup baru dan seleksi tetap kelas-level.
 */
const GRUP: Array<{ key: string; label: string; match: (k: KelasPilihan) => boolean }> = [
  { key: 'semua', label: 'Semua', match: () => true },
  { key: 'ikhwan', label: 'Ikhwan', match: (k) => k.gender === 'ikhwan' },
  { key: 'akhwat', label: 'Akhwat', match: (k) => k.gender === 'akhwat' },
  { key: 'talaqqi', label: 'Talaqqi', match: (k) => /talaqqi/i.test(k.name) },
  { key: 'intensif', label: 'Intensif', match: (k) => /intensif/i.test(k.name) },
  { key: 'reguler', label: 'Reguler (6A–6D)', match: (k) => /maahir\s*6[a-z]\b/i.test(k.name) },
  { key: 'takhassus', label: 'Takhassus', match: (k) => /takhassus/i.test(k.name) },
  { key: 'tahfidz', label: 'Tahfidz', match: (k) => /tahfidz/i.test(k.name) },
];

export function MassalClient({
  month,
  kelas,
  rows,
}: {
  month: string;
  kelas: KelasPilihan[];
  rows: BatchRow[];
}) {
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [alasan, setAlasan] = useState('');
  const [tinjau, setTinjau] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState<MassalResult | null>(null);
  const [konfirmBatal, setKonfirmBatal] = useState<string | null>(null);

  const kelasById = useMemo(() => new Map(kelas.map((k) => [k.id, k])), [kelas]);
  const terpilih = useMemo(
    () => [...dipilih].map((id) => kelasById.get(id)).filter((k): k is KelasPilihan => !!k),
    [dipilih, kelasById]
  );
  const totalPeserta = terpilih.reduce((s, k) => s + k.jumlahAnggota, 0);

  /** Grup dianggap aktif bila seluruh kelas anggotanya tercentang. */
  function grupAktif(g: (typeof GRUP)[number]) {
    const anggota = kelas.filter(g.match);
    return anggota.length > 0 && anggota.every((k) => dipilih.has(k.id));
  }

  function toggleGrup(g: (typeof GRUP)[number]) {
    const anggota = kelas.filter(g.match);
    const semuaAda = grupAktif(g);
    const next = new Set(dipilih);
    for (const k of anggota) {
      if (semuaAda) next.delete(k.id);
      else next.add(k.id);
    }
    setDipilih(next);
    setTinjau(false);
    setHasil(null);
  }

  function toggleKelas(id: string) {
    const next = new Set(dipilih);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDipilih(next);
    setTinjau(false);
    setHasil(null);
  }

  async function onTerapkan() {
    setBusy(true);
    setHasil(null);
    const fd = new FormData();
    fd.set('month', month);
    fd.set('alasan', alasan);
    fd.set('kelas_ids', [...dipilih].join(','));
    const res = await putihkanMassal(undefined, fd);
    setHasil(res);
    setBusy(false);
    if (res.ok) {
      setDipilih(new Set());
      setAlasan('');
      setTinjau(false);
    }
  }

  async function onBatalBatch(id: string) {
    setBusy(true);
    setHasil(null);
    const fd = new FormData();
    fd.set('batch_id', id);
    const res = await batalkanBatchAction(undefined, fd);
    setHasil(res);
    setBusy(false);
    setKonfirmBatal(null);
  }

  return (
    <div>
      {hasil?.error && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          <div className="desc">{hasil.error}</div>
        </div>
      )}
      {hasil?.ok && (
        <div className="banner banner-success" style={{ marginBottom: 12 }}>
          <div className="desc">
            {hasil.dibuat === undefined
              ? 'Batch dibatalkan.'
              : `${hasil.dibuat} peserta diputihkan` +
                (hasil.dilewati ? ` · ${hasil.dilewati} dilewati (sudah ada)` : '') +
                '.'}
          </div>
        </div>
      )}

      <div className="card-flat" style={{ padding: 12, marginBottom: 16 }}>
        <div className="t-small" style={{ fontWeight: 600, marginBottom: 8 }}>Pilih kelas</div>

        <input
          type="text"
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder="Alasan (mis. libur pesantren Juli)"
          style={{
            width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, marginBottom: 10,
            border: '1px solid var(--line)', background: 'var(--surface, #fff)', color: 'var(--ink)',
          }}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {GRUP.map((g) => {
            const aktif = grupAktif(g);
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => toggleGrup(g)}
                className={`btn btn-xs ${aktif ? 'btn-soft' : 'btn-ghost'}`}
              >
                {aktif ? '✓ ' : ''}{g.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {kelas.map((k) => {
            const on = dipilih.has(k.id);
            return (
              <label
                key={k.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  borderRadius: 8, cursor: 'pointer',
                  background: on ? 'var(--surface-3)' : 'transparent',
                }}
              >
                <input type="checkbox" checked={on} onChange={() => toggleKelas(k.id)} />
                <span className="t-small" style={{ flex: 1 }}>{k.name}</span>
                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                  {k.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} · {k.jumlahAnggota}
                </span>
              </label>
            );
          })}
        </div>

        <div
          className="section-row"
          style={{ marginTop: 12, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
        >
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>
            {terpilih.length === 0
              ? 'Belum ada kelas dipilih.'
              : `${terpilih.length} kelas · ${totalPeserta} peserta akan diputihkan`}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy || terpilih.length === 0}
            onClick={() => setTinjau(true)}
          >
            Tinjau &amp; terapkan
          </button>
        </div>
      </div>

      {tinjau && terpilih.length > 0 && (
        <div className="card-flat" style={{ padding: 12, marginBottom: 16, borderColor: 'var(--kuning-line)' }}>
          <div className="t-small" style={{ fontWeight: 600, marginBottom: 6 }}>
            Konfirmasi pemutihan
          </div>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
            <strong>{totalPeserta} peserta</strong> dari <strong>{terpilih.length} kelas</strong>{' '}
            akan dianggap hadir penuh pada periode ini. Alasan:{' '}
            <em>{alasan.trim() || 'tanpa alasan'}</em>.
          </p>
          <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
            {terpilih.map((k) => k.name).join(' · ')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={onTerapkan}>
              {busy ? 'Menyimpan…' : 'Ya, putihkan'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setTinjau(false)}>
              Batal
            </button>
          </div>
        </div>
      )}

      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}>
        RIWAYAT PEMUTIHAN MASSAL BULAN INI ({rows.length})
      </div>
      {rows.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada pemutihan massal bulan ini.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              className="card-flat"
              style={{ padding: 10, opacity: r.dibatalkan ? 0.6 : 1 }}
            >
              <div className="section-row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="t-small" style={{ fontWeight: 600 }}>
                    {r.kelasNames.length} kelas · {r.jumlahPeserta} peserta
                  </div>
                  <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
                    {r.alasan || 'tanpa alasan'}
                  </div>
                  <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
                    oleh {r.oleh || '—'} · {r.pada}
                  </div>
                  <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
                    {r.kelasNames.join(' · ')}
                  </div>
                  {r.dibatalkan && (
                    <div className="t-tiny" style={{ color: 'var(--merah-ink)', marginTop: 4 }}>
                      dibatalkan {r.dibatalkan.oleh ? `oleh ${r.dibatalkan.oleh}` : ''} {r.dibatalkan.pada}
                    </div>
                  )}
                </div>
                {!r.dibatalkan &&
                  (konfirmBatal === r.id ? (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-xs btn-danger"
                        disabled={busy}
                        onClick={() => onBatalBatch(r.id)}
                      >
                        Ya, batalkan
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        disabled={busy}
                        onClick={() => setKonfirmBatal(null)}
                      >
                        Tidak
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost"
                      style={{ flexShrink: 0 }}
                      disabled={busy}
                      onClick={() => setKonfirmBatal(r.id)}
                    >
                      Batalkan batch
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
