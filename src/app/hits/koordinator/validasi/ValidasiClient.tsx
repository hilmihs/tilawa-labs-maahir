'use client';

import { useState, useTransition } from 'react';
import { HITS_LEVEL_LABEL } from '@/types/db';
import type { HitsBatch, HitsHalaqah, HitsHalaqahPeserta, HitsSheetSource } from '@/types/db';
import {
  createBatch, addSource, enumeratePresensiTabs, runSync,
  setHalaqahLevel, setPengajarWa, provisionPengajar,
  addManualHalaqah, deleteHalaqah, addManualPeserta, deletePeserta,
} from './actions';

type Res = { error?: string; ok?: boolean; info?: string };
type Action = (prev: Res | undefined, fd: FormData) => Promise<Res>;

export function ValidasiClient({
  batches, sources, halaqah, peserta,
}: {
  batches: HitsBatch[];
  sources: HitsSheetSource[];
  halaqah: HitsHalaqah[];
  peserta: HitsHalaqahPeserta[];
}) {
  const [activeBatch, setActiveBatch] = useState<string>(batches[0]?.id ?? '');
  const [msg, setMsg] = useState<string>('');
  const [pending, startTransition] = useTransition();

  function run(action: Action, fd: FormData, reset?: HTMLFormElement) {
    setMsg('');
    startTransition(async () => {
      const r = await action(undefined, fd);
      setMsg(r.error ? `⚠ ${r.error}` : r.info ?? '✓ Tersimpan');
      if (!r.error) reset?.reset();
    });
  }
  function onSubmit(action: Action) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      run(action, new FormData(form), form);
    };
  }

  const batchSources = sources.filter((s) => s.batch_id === activeBatch);
  const batchHalaqah = halaqah.filter((h) => h.batch_id === activeBatch);
  const pesertaByHalaqah = new Map<string, HitsHalaqahPeserta[]>();
  for (const p of peserta) {
    const arr = pesertaByHalaqah.get(p.halaqah_id) ?? [];
    arr.push(p);
    pesertaByHalaqah.set(p.halaqah_id, arr);
  }

  return (
    <div>
      {msg && (
        <p className="t-small" style={{ marginBottom: 12, color: msg.startsWith('⚠') ? 'var(--merah-ink)' : 'var(--hijau-ink)' }}>
          {msg}{pending ? ' …' : ''}
        </p>
      )}

      {/* Batch tabs */}
      <div className="filter-bar" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {batches.map((b) => (
          <button
            key={b.id}
            className={`chip${b.id === activeBatch ? ' chip-active' : ''}`}
            onClick={() => setActiveBatch(b.id)}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* Add batch */}
      <details style={{ marginBottom: 16 }}>
        <summary className="t-small">+ Tambah batch</summary>
        <form onSubmit={onSubmit(createBatch)} className="filter-bar" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input className="input" name="name" placeholder="Nama batch (== tab kaldik)" required style={{ flex: '1 1 240px' }} />
          <input className="input" name="start_date" type="date" required />
          <button className="btn" disabled={pending}>Buat</button>
        </form>
      </details>

      {!activeBatch && <p className="t-small">Buat batch dulu.</p>}

      {activeBatch && (
        <>
          {/* Sources */}
          <h3 className="t-h2" style={{ marginTop: 8 }}>Sumber Spreadsheet</h3>
          <div className="table-scroll" style={{ marginBottom: 10 }}>
            <table className="k-table">
              <thead><tr><th>Jenis</th><th>Spreadsheet</th><th>gid</th><th>Label</th><th>Sync terakhir</th></tr></thead>
              <tbody>
                {batchSources.map((s) => (
                  <tr key={s.id}>
                    <td>{s.kind}</td>
                    <td className="t-tiny">{s.spreadsheet_id.slice(0, 12)}…</td>
                    <td className="t-tiny">{s.gid ?? '—'}</td>
                    <td className="t-tiny">{s.label ?? '—'}</td>
                    <td className="t-tiny" style={{ color: s.last_sync_status && s.last_sync_status !== 'ok' ? 'var(--merah-ink)' : undefined }}>
                      {s.last_synced_at ? `${new Date(s.last_synced_at).toLocaleString('id-ID')} · ${s.last_sync_status}` : 'belum'}
                    </td>
                  </tr>
                ))}
                {batchSources.length === 0 && <tr><td colSpan={5} className="t-tiny">Belum ada sumber.</td></tr>}
              </tbody>
            </table>
          </div>

          <details style={{ marginBottom: 8 }}>
            <summary className="t-small">+ Tambah kaldik / presensi (satu tab)</summary>
            <form onSubmit={onSubmit(addSource)} className="filter-bar" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input type="hidden" name="batch_id" value={activeBatch} />
              <select className="chip-select" name="kind" required>
                <option value="kaldik">kaldik</option>
                <option value="presensi">presensi</option>
              </select>
              <input className="input" name="url" placeholder="URL / ID spreadsheet" required style={{ flex: '1 1 240px' }} />
              <input className="input" name="gid" placeholder="gid tab" style={{ width: 110 }} />
              <input className="input" name="label" placeholder="label" style={{ width: 140 }} />
              <button className="btn" disabled={pending}>Tambah</button>
            </form>
          </details>

          <details style={{ marginBottom: 8 }}>
            <summary className="t-small">⚡ Enumerasi semua tab presensi (publish-to-web)</summary>
            <form onSubmit={onSubmit(enumeratePresensiTabs)} className="filter-bar" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input type="hidden" name="batch_id" value={activeBatch} />
              <input className="input" name="url" placeholder="URL spreadsheet presensi" required style={{ flex: '1 1 280px' }} />
              <button className="btn" disabled={pending}>Cari tab</button>
            </form>
          </details>

          <form onSubmit={onSubmit(runSync)} style={{ marginBottom: 20 }}>
            <input type="hidden" name="batch_id" value={activeBatch} />
            <button className="btn btn-primary" disabled={pending}>↻ Sinkronkan sekarang</button>
          </form>

          {/* Halaqah validation */}
          <h3 className="t-h2">Halaqah ({batchHalaqah.length})</h3>
          {batchHalaqah.map((h) => (
            <HalaqahCard
              key={h.id}
              h={h}
              peserta={pesertaByHalaqah.get(h.id) ?? []}
              onRun={run}
              pending={pending}
              onSubmit={onSubmit}
            />
          ))}

          <details style={{ marginTop: 12 }}>
            <summary className="t-small">+ Tambah halaqah manual</summary>
            <form onSubmit={onSubmit(addManualHalaqah)} className="filter-bar" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input type="hidden" name="batch_id" value={activeBatch} />
              <input className="input" name="name" placeholder="Nama halaqah" required style={{ flex: '1 1 200px' }} />
              <select className="chip-select" name="level">
                <option value="">level…</option>
                <option value="qoidah_nuroniyyah">QN</option>
                <option value="perbaikan_bacaan">PB</option>
              </select>
              <select className="chip-select" name="gender">
                <option value="">gender…</option>
                <option value="ikhwan">Ikhwan</option>
                <option value="akhwat">Akhwat</option>
              </select>
              <button className="btn" disabled={pending}>Tambah</button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}

function HalaqahCard({
  h, peserta, onRun, pending, onSubmit,
}: {
  h: HitsHalaqah;
  peserta: HitsHalaqahPeserta[];
  onRun: (a: Action, fd: FormData, reset?: HTMLFormElement) => void;
  pending: boolean;
  onSubmit: (a: Action) => (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ marginBottom: 10, padding: 12 }}>
      <div className="section-row" style={{ alignItems: 'center' }}>
        <div>
          <strong>{h.name}</strong>{' '}
          {h.source === 'manual' && <span className="badge">manual</span>}{' '}
          {!h.active && <span className="badge badge-merah">nonaktif (hilang dari sheet)</span>}
          <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{h.jadwal_raw ?? 'jadwal —'} · {h.pengajar_nama_sheet ?? 'guru —'}</div>
        </div>
        <button className="chip" onClick={() => setOpen(!open)}>{open ? 'Tutup' : `Peserta (${peserta.length})`}</button>
      </div>

      <div className="filter-bar" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <form onSubmit={onSubmit(setHalaqahLevel)} className="filter-bar" style={{ gap: 4 }}>
          <input type="hidden" name="halaqah_id" value={h.id} />
          <select className="chip-select" name="level" defaultValue={h.level ?? ''} required>
            <option value="" disabled>level…</option>
            <option value="qoidah_nuroniyyah">{HITS_LEVEL_LABEL.qoidah_nuroniyyah}</option>
            <option value="perbaikan_bacaan">{HITS_LEVEL_LABEL.perbaikan_bacaan}</option>
          </select>
          <button className="btn btn-sm" disabled={pending}>Set level</button>
        </form>

        <form onSubmit={onSubmit(setPengajarWa)} className="filter-bar" style={{ gap: 4 }}>
          <input type="hidden" name="halaqah_id" value={h.id} />
          <input className="input" name="pengajar_wa" placeholder="WA pengajar (08…)" defaultValue={h.pengajar_wa ?? ''} style={{ width: 150 }} />
          <button className="btn btn-sm" disabled={pending}>{h.pengajar_id ? 'Update WA' : 'Tautkan'}</button>
        </form>

        {!h.pengajar_id && (
          <form onSubmit={onSubmit(provisionPengajar)} className="filter-bar" style={{ gap: 4 }}>
            <input type="hidden" name="halaqah_id" value={h.id} />
            <input type="hidden" name="name" value={h.pengajar_nama_sheet ?? ''} />
            <input className="input" name="pengajar_wa" placeholder="WA" style={{ width: 110 }} />
            <select className="chip-select" name="gender" defaultValue={h.gender ?? 'ikhwan'}>
              <option value="ikhwan">Ikhwan</option>
              <option value="akhwat">Akhwat</option>
            </select>
            <button className="btn btn-sm" disabled={pending} title="Buat pengajar baru dari nama sheet + WA">+ Daftar pengajar</button>
          </form>
        )}

        <form onSubmit={onSubmit(deleteHalaqah)}>
          <input type="hidden" name="halaqah_id" value={h.id} />
          <button className="btn btn-sm btn-danger" disabled={pending}>Hapus</button>
        </form>
      </div>

      {open && (
        <div style={{ marginTop: 8 }}>
          <table className="k-table">
            <thead><tr><th>Nama</th><th>MURID_ID</th><th>Status</th><th>Ketua</th><th></th></tr></thead>
            <tbody>
              {peserta.map((p) => (
                <tr key={p.id}>
                  <td>{p.nama}</td>
                  <td className="t-tiny">{p.murid_id ?? '—'}</td>
                  <td className="t-tiny">{p.status_peserta ?? '—'}{!p.active && ' · nonaktif'}</td>
                  <td>{p.is_ketua ? <span className="badge badge-hijau">Ketua</span> : ''}</td>
                  <td>
                    <form onSubmit={onSubmit(deletePeserta)}>
                      <input type="hidden" name="peserta_id" value={p.id} />
                      <button className="btn btn-sm btn-danger" disabled={pending}>×</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={onSubmit(addManualPeserta)} className="filter-bar" style={{ gap: 6, marginTop: 6 }}>
            <input type="hidden" name="halaqah_id" value={h.id} />
            <input className="input" name="nama" placeholder="+ Nama peserta manual" style={{ flex: '1 1 180px' }} />
            <button className="btn btn-sm" disabled={pending}>Tambah</button>
          </form>
        </div>
      )}
    </div>
  );
}
