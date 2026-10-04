'use client';

import { useRef, useState, useTransition } from 'react';
import {
  listPengajarOptions,
  ajukanPindahHalaqah,
  remindPindahTarget,
  listClaimableHalaqah,
  ajukanKlaimHalaqah,
} from './actions';

type Batch = { id: string; name: string };
type MyHalaqah = {
  id: string;
  name: string;
  gender: 'ikhwan' | 'akhwat' | null;
  pending: { target_name: string; target_wa: string | null } | null;
};
type ClaimHalaqah = { id: string; name: string; pengajarNama: string | null; pengajarLinked: boolean };
type PengajarOpt = { id: string; name: string; whatsapp_number: string | null };

// ── Mode 1: Pindahkan halaqah saya ──
function PindahDialog({ myHalaqah }: { myHalaqah: MyHalaqah[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [step, setStep] = useState<'list' | 'target' | 'done'>('list');
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<MyHalaqah | null>(null);
  const [opts, setOpts] = useState<PengajarOpt[]>([]);
  const [manual, setManual] = useState(false);
  const [waUrl, setWaUrl] = useState<string | null>(null);

  function open() {
    setStep('list'); setError(null); setSel(null); setOpts([]); setManual(false); setWaUrl(null);
    dialogRef.current?.showModal();
  }
  function close() { dialogRef.current?.close(); }

  function pick(h: MyHalaqah) {
    setSel(h); setError(null);
    start(async () => {
      const po = await listPengajarOptions(h.gender ?? undefined);
      setOpts(po.pengajar);
      setStep('target');
    });
  }

  function remind(h: MyHalaqah) {
    setError(null);
    start(async () => {
      const res = await remindPindahTarget(h.id);
      if (res?.waUrl) { window.open(res.waUrl, '_blank'); return; }
      setError(res?.error ?? 'Gagal membuat reminder.');
    });
  }

  function submit(fd: FormData) {
    if (!sel) return;
    fd.set('halaqah_id', sel.id);
    setError(null);
    start(async () => {
      const res = await ajukanPindahHalaqah(undefined, fd);
      if (res?.waUrl) { setWaUrl(res.waUrl); setStep('done'); return; }
      if (res?.ok) { setError(res.error ?? null); setStep('done'); return; }
      setError(res?.error ?? 'Gagal mengajukan.');
    });
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-block" onClick={open} style={{ marginTop: 12 }}>
        Pindahkan halaqah saya
      </button>
      <dialog ref={dialogRef} onClose={close}
        style={{ border: 'none', borderRadius: 16, padding: 0, maxWidth: 480, width: '90vw', background: 'var(--surface)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 className="t-h2">Pindahkan Halaqah</h2>
            <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>&times;</button>
          </div>
          {error && step !== 'done' && <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}

          {step === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {myHalaqah.length === 0 && <p className="t-small">Anda belum punya halaqah.</p>}
              {myHalaqah.map((h) => (
                <div key={h.id} className="card-flat" style={{ padding: '10px 12px', border: '1px solid var(--line)' }}>
                  <div style={{ fontWeight: 600 }}>{h.name}</div>
                  {h.pending ? (
                    <div style={{ marginTop: 4 }}>
                      <div className="t-small" style={{ color: 'var(--kuning-ink)' }}>
                        Menunggu persetujuan {h.pending.target_name}.
                      </div>
                      <button type="button" className="act-btn wa" style={{ marginTop: 4, fontSize: 12 }} disabled={pending} onClick={() => remind(h)}>
                        Ingatkan pengajar tujuan
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} disabled={pending} onClick={() => pick(h)}>
                      Pindahkan →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 'target' && sel && (
            <form action={submit}>
              <p className="t-small" style={{ marginBottom: 8 }}>Pindahkan <strong>{sel.name}</strong> ke pengajar (sesama gender):</p>
              {!manual ? (
                <select name="target_pengajar_id" required className="input" style={{ width: '100%' }} defaultValue="">
                  <option value="" disabled>— Pilih pengajar tujuan —</option>
                  {opts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.whatsapp_number ? '' : ' (tanpa WA)'}</option>)}
                </select>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="text" name="target_name" required placeholder="Nama pengajar tujuan" className="input" style={{ width: '100%' }} />
                  <input type="tel" name="target_wa" required placeholder="08xxxxxxxxxx" className="input" style={{ width: '100%' }} />
                </div>
              )}
              <button type="button" onClick={() => setManual((m) => !m)} style={{ background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 500 }}>
                {manual ? '← Pilih dari daftar pengajar' : 'Tidak ada di daftar? Tulis manual'}
              </button>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => setStep('list')} disabled={pending}>← Kembali</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={pending}>{pending ? 'Mengirim…' : 'Ajukan & kirim WA'}</button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <p className="t-body" style={{ fontWeight: 600, color: 'var(--hijau-ink)', marginBottom: 8 }}>Pengajuan tersimpan.</p>
              {error && <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>{error}</p>}
              {waUrl ? (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block" style={{ marginBottom: 8 }}>Kirim link persetujuan via WhatsApp</a>
              ) : (
                <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>Nomor WA pengajar tujuan belum ada — bagikan link manual.</p>
              )}
              <button type="button" className="btn-ghost btn-block" onClick={close}>Tutup</button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

// ── Mode 2: Tambah halaqah (klaim) ──
function ClaimDialog({ batches }: { batches: Batch[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [step, setStep] = useState<'batch' | 'halaqah' | 'done'>('batch');
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState('');
  const [list, setList] = useState<ClaimHalaqah[]>([]);
  const [waUrl, setWaUrl] = useState<string | null>(null);

  function open() {
    setStep('batch'); setError(null); setBatchId(''); setList([]); setWaUrl(null);
    dialogRef.current?.showModal();
  }
  function close() { dialogRef.current?.close(); }

  function pickBatch(id: string) {
    setBatchId(id); setError(null);
    if (!id) { setList([]); return; }
    start(async () => {
      const res = await listClaimableHalaqah(id);
      setList(res.halaqah);
      setStep('halaqah');
    });
  }

  function claim(h: ClaimHalaqah) {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set('halaqah_id', h.id);
      const res = await ajukanKlaimHalaqah(undefined, fd);
      if (res?.waUrl) { setWaUrl(res.waUrl); setStep('done'); return; }
      if (res?.ok) { setError(res.error ?? null); setWaUrl(null); setStep('done'); return; }
      setError(res?.error ?? 'Gagal mengajukan.');
    });
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-block" onClick={open} style={{ marginTop: 8 }}>
        Tambah halaqah (klaim)
      </button>
      <dialog ref={dialogRef} onClose={close}
        style={{ border: 'none', borderRadius: 16, padding: 0, maxWidth: 480, width: '90vw', background: 'var(--surface)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 className="t-h2">Tambah Halaqah</h2>
            <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}>&times;</button>
          </div>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
            Pilih halaqah (sesama gender). Perlu persetujuan pemilik halaqah, atau koordinator ketua kelas bila belum ada pengajar.
          </p>
          {error && step !== 'done' && <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>}

          {step === 'batch' && (
            <div>
              <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Pilih batch</label>
              <select className="input" style={{ width: '100%' }} value={batchId} onChange={(e) => pickBatch(e.target.value)} disabled={pending}>
                <option value="">— Pilih batch —</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {step === 'halaqah' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '55vh', overflow: 'auto' }}>
                {list.length === 0 && <p className="t-small">Tidak ada halaqah gender Anda di batch ini.</p>}
                {list.map((h) => (
                  <button key={h.id} type="button" className="card-flat" onClick={() => claim(h)} disabled={pending}
                    style={{ textAlign: 'left', padding: '10px 12px', cursor: 'pointer', border: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 600 }}>{h.name}</div>
                    <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                      {h.pengajarLinked ? `Pengajar: ${h.pengajarNama ?? '—'}` : 'Belum ada pengajar'}
                    </div>
                  </button>
                ))}
              </div>
              <button type="button" className="btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setStep('batch')}>← Ganti batch</button>
            </div>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <p className="t-body" style={{ fontWeight: 600, color: 'var(--hijau-ink)', marginBottom: 8 }}>Pengajuan klaim tersimpan.</p>
              {error && <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>{error}</p>}
              {waUrl ? (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block" style={{ marginBottom: 8 }}>Kirim link persetujuan via WhatsApp</a>
              ) : (
                <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>Approver belum ada WA — bagikan link manual.</p>
              )}
              <button type="button" className="btn-ghost btn-block" onClick={close}>Tutup</button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

export function PindahHalaqahPanel({ batches, myHalaqah }: { batches: Batch[]; myHalaqah: MyHalaqah[] }) {
  return (
    <>
      <PindahDialog myHalaqah={myHalaqah} />
      <ClaimDialog batches={batches} />
    </>
  );
}
