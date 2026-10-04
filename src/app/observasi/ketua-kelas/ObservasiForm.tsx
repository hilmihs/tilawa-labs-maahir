'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { submitObservasi } from './actions';
import { KONDISI_KELAS_LABEL, STATUS_LATIHAN_LABEL } from '@/types/db';
import type { KondisiKelas, StatusLatihan, ObservasiKelas } from '@/types/db';

interface Props {
  kelasName: string;
  pengajarName: string;
  todayDate: string;
  todayUnfilled: boolean;
  history: (ObservasiKelas & { pengajar_name?: string })[];
}

export function ObservasiForm({ kelasName, pengajarName, todayDate, todayUnfilled, history }: Props) {
  const [editing, setEditing] = useState<string | null>(todayUnfilled ? todayDate : null);
  const [records, setRecords] = useState(history);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const editingRecord = records.find((r) => r.tanggal === editing);

  const [kondisi, setKondisi] = useState<KondisiKelas>(editingRecord?.kondisi ?? 'KBBS');
  const [latihanDiberikan, setLatihanDiberikan] = useState(editingRecord?.latihan_mandiri_diberikan ?? true);
  const [statusLatihan, setStatusLatihan] = useState<StatusLatihan>(editingRecord?.status_latihan_val ?? 'SML');
  const [semuaSelesai, setSemuaSelesai] = useState(editingRecord?.semua_siswa_selesai_latihan ?? true);
  const [catatan, setCatatan] = useState(editingRecord?.catatan ?? '');

  useEffect(() => {
    if (todayUnfilled) {
      setModalOpen(true);
    }
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (modalOpen && !d.open) d.showModal();
    if (!modalOpen && d.open) d.close();
  }, [modalOpen]);

  function openEdit(tanggal: string) {
    const rec = records.find((r) => r.tanggal === tanggal);
    setKondisi(rec?.kondisi ?? 'KBBS');
    setLatihanDiberikan(rec?.latihan_mandiri_diberikan ?? true);
    setStatusLatihan(rec?.status_latihan_val ?? 'SML');
    setSemuaSelesai(rec?.semua_siswa_selesai_latihan ?? true);
    setCatatan(rec?.catatan ?? '');
    setEditing(tanggal);
    setError(null);
    setSuccess(null);
  }

  function openNew() {
    setKondisi('KBBS');
    setLatihanDiberikan(true);
    setStatusLatihan('SML');
    setSemuaSelesai(true);
    setCatatan('');
    setEditing(todayDate);
    setError(null);
    setSuccess(null);
    setModalOpen(true);
  }

  function handleSubmit(fd: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await submitObservasi(undefined, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.ok) {
        const tanggal = fd.get('tanggal') as string;
        setRecords((prev) => {
          const exists = prev.find((r) => r.tanggal === tanggal);
          if (exists) {
            return prev.map((r) =>
              r.tanggal === tanggal
                ? { ...r, kondisi, latihan_mandiri_diberikan: latihanDiberikan, status_latihan_val: latihanDiberikan ? statusLatihan : null, semua_siswa_selesai_latihan: latihanDiberikan ? semuaSelesai : null, catatan: catatan || null }
                : r
            );
          }
          return [
            {
              id: 'new-' + tanggal,
              kelas_hits_id: '',
              ketua_kelas_id: '',
              tanggal,
              kondisi,
              pengajar_on_cam: null,
              latihan_mandiri_diberikan: latihanDiberikan,
              status_latihan_val: latihanDiberikan ? statusLatihan : null,
              semua_siswa_selesai_latihan: latihanDiberikan ? semuaSelesai : null,
              catatan: catatan || null,
              created_at: new Date().toISOString(),
            },
            ...prev,
          ];
        });
        setSuccess('Observasi berhasil disimpan.');
        setEditing(null);
        if (modalOpen) {
          setTimeout(() => setModalOpen(false), 1200);
        }
      }
    });
  }

  const formUI = (
    <div style={{ padding: '16px 20px' }}>
      <h3 className="t-h2" style={{ marginBottom: 4 }}>
        {editingRecord ? 'Edit Observasi' : 'Isi Observasi'}
      </h3>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        {kelasName} — {pengajarName} — {editing}
      </p>

      <form action={handleSubmit}>
        <input type="hidden" name="tanggal" value={editing ?? todayDate} />

        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Kondisi Kelas</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(Object.keys(KONDISI_KELAS_LABEL) as KondisiKelas[]).map((k) => (
              <label
                key={k}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  border: `1px solid ${kondisi === k ? 'var(--accent)' : 'var(--line-2)'}`,
                  borderRadius: 8, cursor: 'pointer',
                  background: kondisi === k ? 'var(--accent-tint)' : 'transparent',
                }}
              >
                <input
                  type="radio" name="kondisi" value={k} required
                  checked={kondisi === k}
                  onChange={() => setKondisi(k)}
                />
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{k}</span>
                  <span className="t-small" style={{ marginLeft: 8 }}>
                    {KONDISI_KELAS_LABEL[k]}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {kondisi !== 'LIBUR' && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label">Latihan mandiri diberikan?</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[true, false].map((v) => (
                  <label
                    key={String(v)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 8, padding: '10px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${latihanDiberikan === v ? 'var(--accent)' : 'var(--line-2)'}`,
                      background: latihanDiberikan === v ? 'var(--accent-tint)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio" name="latihan_mandiri_diberikan" value={String(v)}
                      checked={latihanDiberikan === v}
                      onChange={() => setLatihanDiberikan(v)}
                    />
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{v ? 'Ya' : 'Tidak'}</span>
                  </label>
                ))}
              </div>
            </div>

            {latihanDiberikan && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label className="field-label">Status latihan mandiri</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(Object.keys(STATUS_LATIHAN_LABEL) as StatusLatihan[]).map((s) => (
                      <label
                        key={s}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px',
                          border: `1px solid ${statusLatihan === s ? 'var(--accent)' : 'var(--line-2)'}`,
                          borderRadius: 8, cursor: 'pointer',
                          background: statusLatihan === s ? 'var(--accent-tint)' : 'transparent',
                        }}
                      >
                        <input
                          type="radio" name="status_latihan_val" value={s}
                          checked={statusLatihan === s}
                          onChange={() => setStatusLatihan(s)}
                        />
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{s}</span>
                          <span className="t-small" style={{ marginLeft: 8 }}>
                            {STATUS_LATIHAN_LABEL[s]}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label className="field-label">Semua siswa selesai latihan?</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[true, false].map((v) => (
                      <label
                        key={String(v)}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          gap: 8, padding: '10px', borderRadius: 8, cursor: 'pointer',
                          border: `1px solid ${semuaSelesai === v ? 'var(--accent)' : 'var(--line-2)'}`,
                          background: semuaSelesai === v ? 'var(--accent-tint)' : 'transparent',
                        }}
                      >
                        <input
                          type="radio" name="semua_siswa_selesai_latihan" value={String(v)}
                          checked={semuaSelesai === v}
                          onChange={() => setSemuaSelesai(v)}
                        />
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{v ? 'Ya' : 'Tidak'}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Catatan (opsional)</label>
          <textarea
            name="catatan"
            className="textarea"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Catatan tambahan..."
          />
        </div>

        {error && (
          <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>
            {error}
          </p>
        )}
        {success && (
          <p className="t-small" style={{ color: 'var(--success, #4caf50)', marginBottom: 8 }}>
            {success}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={pending} style={{ flex: 1 }}>
            {pending ? 'Menyimpan...' : 'Simpan Observasi'}
          </button>
          {editing && !todayUnfilled && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setEditing(null); setModalOpen(false); }}
            >
              Batal
            </button>
          )}
        </div>
      </form>
    </div>
  );

  return (
    <>
      {/* Auto-popup modal for unfilled observasi */}
      <dialog
        ref={dialogRef}
        style={{
          border: 'none', borderRadius: 16, padding: 0,
          maxWidth: 480, width: '90vw',
          background: 'var(--surface)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          maxHeight: '90vh', overflow: 'auto',
        }}
        onClose={() => setModalOpen(false)}
      >
        <div style={{ padding: '16px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="t-h2">Observasi Hari Ini</h2>
          <button
            onClick={() => setModalOpen(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: 'var(--muted)', padding: '4px 8px',
            }}
          >
            &times;
          </button>
        </div>
        {editing && formUI}
        {!editing && success && (
          <div style={{ padding: '24px 20px', textAlign: 'center' }}>
            <p className="t-body" style={{ fontWeight: 600, color: 'var(--success, #4caf50)' }}>
              {success}
            </p>
          </div>
        )}
      </dialog>

      {/* Tombol isi observasi hari ini (jika belum ada modal) */}
      {!modalOpen && todayUnfilled && (
        <button
          onClick={openNew}
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: 16 }}
        >
          Isi Observasi Hari Ini
        </button>
      )}

      {/* Inline edit form */}
      {editing && !modalOpen && (
        <div className="card-flat" style={{ marginBottom: 16 }}>
          {formUI}
        </div>
      )}

      {/* History table */}
      <div className="card-flat" style={{ overflow: 'auto' }}>
        <table className="k-table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Kondisi</th>
              <th>Latihan</th>
              <th>Status</th>
              <th>Catatan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                  Belum ada data observasi.
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.tanggal}>
                  <td className="nm">{r.tanggal}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: r.kondisi === 'KBBS' ? 'var(--hijau-tint)' : r.kondisi === 'LIBUR' ? 'var(--surface-3)' : 'var(--kuning-tint)',
                        borderColor: r.kondisi === 'KBBS' ? 'var(--hijau-line)' : r.kondisi === 'LIBUR' ? 'var(--line)' : 'var(--kuning-line)',
                        color: r.kondisi === 'KBBS' ? 'var(--hijau-ink)' : r.kondisi === 'LIBUR' ? 'var(--muted)' : 'var(--kuning-ink)',
                      }}
                    >
                      {r.kondisi}
                    </span>
                  </td>
                  <td>{r.kondisi === 'LIBUR' ? '—' : r.latihan_mandiri_diberikan ? 'Ya' : 'Tidak'}</td>
                  <td>{r.status_latihan_val ?? '—'}</td>
                  <td className="t-small" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.catatan ?? '—'}
                  </td>
                  <td>
                    <button
                      onClick={() => { openEdit(r.tanggal); setModalOpen(true); }}
                      className="act-btn"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
