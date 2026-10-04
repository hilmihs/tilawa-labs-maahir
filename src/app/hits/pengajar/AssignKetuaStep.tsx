'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { electKetua } from './actions';

export type HalaqahForAssign = {
  id: string;
  name: string;
  levelTagged: boolean;
  pertemuanCount: number;
  currentKetua: string | null;
  peserta: { id: string; nama: string }[];
};

type ElectDone = { waUrl?: string; pendingApproval?: boolean; info?: string };

function AssignForm({
  halaqah,
  onDone,
}: {
  halaqah: HalaqahForAssign;
  onDone: (res: ElectDone) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Mode manual: ketua tidak ada di daftar peserta → ketik nama sendiri.
  const [manual, setManual] = useState(halaqah.peserta.length === 0);

  function handleSubmit(fd: FormData) {
    setError(null);
    const pesertaId = (fd.get('peserta_id') as string) ?? '';
    const ketuaNama = ((fd.get('ketua_nama') as string) ?? '').trim();
    // Dropdown mode tapi belum pilih peserta → tunjukkan error, jangan switch ke manual.
    if (!manual && !pesertaId) {
      setError('Pilih peserta dari daftar terlebih dahulu.');
      return;
    }
    startTransition(async () => {
      const res = await electKetua(undefined, fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (res?.ok) onDone({ waUrl: res.waUrl, pendingApproval: res.pendingApproval, info: res.info });
    });
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="halaqah_id" value={halaqah.id} />

      <div style={{ marginBottom: 12 }}>
        <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
          {manual ? 'Tulis nama ketua kelas' : 'Pilih peserta sebagai ketua kelas'}{' '}
          <span style={{ color: 'var(--danger)' }}>*</span>
        </label>

        {manual ? (
          <input
            type="text"
            name="ketua_nama"
            required
            placeholder="Nama lengkap ketua kelas"
            className="input"
            style={{ width: '100%' }}
          />
        ) : (
          <select name="peserta_id" required className="input" style={{ width: '100%' }} defaultValue="">
            <option value="" disabled>— Pilih peserta —</option>
            {halaqah.peserta.map((p) => (
              <option key={p.id} value={p.id}>{p.nama}</option>
            ))}
          </select>
        )}

        {halaqah.peserta.length > 0 && (
          <button
            type="button"
            onClick={() => setManual((m) => !m)}
            style={{ background: 'none', border: 'none', padding: '4px 0', marginTop: 4, cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 500 }}
          >
            {manual ? '← Pilih dari daftar peserta' : 'Ketua tidak ada di daftar? Tulis manual'}
          </button>
        )}
        {manual && halaqah.peserta.length === 0 && (
          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
            Tidak ada peserta terdaftar — tulis nama ketua secara manual.
          </p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="t-small" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
          Nomor WhatsApp ketua kelas <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <input
          type="tel"
          name="ketua_wa"
          required
          placeholder="08xxxxxxxxxx"
          className="input"
          style={{ width: '100%' }}
        />
        <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
          Ketua dapat login dengan nomor ini. Password awal = 6 digit terakhir nomor WA.
        </p>
      </div>

      {error && (
        <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending} style={{ width: '100%' }}>
        {pending ? 'Menyimpan...' : 'Tunjuk & Kirim WhatsApp'}
      </button>
    </form>
  );
}

export function AssignKetuaPanel({ halaqahList }: { halaqahList: HalaqahForAssign[] }) {
  // Halaqah yang butuh penunjukan: sudah ada pertemuan tapi belum ada ketua.
  const needsAssign = halaqahList.filter((h) => h.pertemuanCount >= 1 && !h.currentKetua);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [modalHalaqah, setModalHalaqah] = useState<HalaqahForAssign | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [doneInfo, setDoneInfo] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  // Auto-popup halaqah pertama yang butuh penunjukan saat halaman dibuka.
  useEffect(() => {
    if (needsAssign.length > 0) {
      setModalHalaqah(needsAssign[0]);
      setWaUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (modalHalaqah && !d.open) d.showModal();
    if (!modalHalaqah && d.open) d.close();
  }, [modalHalaqah]);

  function openAssign(h: HalaqahForAssign) {
    setWaUrl(null);
    setPendingApproval(false);
    setDoneInfo(null);
    setModalHalaqah(h);
  }

  function handleDone(res: ElectDone, halaqahId?: string) {
    setWaUrl(res.waUrl ?? null);
    setPendingApproval(!!res.pendingApproval);
    setDoneInfo(res.info ?? null);
    // Hanya tandai "selesai" bila ketua benar-benar aktif (bukan menunggu approval).
    if (halaqahId && !res.pendingApproval) setDoneIds((prev) => new Set(prev).add(halaqahId));
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        style={{
          border: 'none', borderRadius: 16, padding: 0,
          maxWidth: 480, width: '90vw', background: 'var(--surface)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)', maxHeight: '90vh', overflow: 'auto',
        }}
        onClose={() => setModalHalaqah(null)}
      >
        {modalHalaqah && (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h2 className="t-h2">Tunjuk Ketua Kelas</h2>
              <button
                onClick={() => setModalHalaqah(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)' }}
              >
                &times;
              </button>
            </div>
            <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
              Halaqah: <strong>{modalHalaqah.name}</strong>
            </p>

            {waUrl ? (
              <div style={{ textAlign: 'center' }}>
                <p className="t-body" style={{ fontWeight: 600, color: pendingApproval ? 'var(--kuning-ink)' : 'var(--hijau-ink)', marginBottom: 8 }}>
                  {pendingApproval ? 'Perlu persetujuan peran ganda' : 'Ketua kelas berhasil ditunjuk.'}
                </p>
                {doneInfo && (
                  <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>{doneInfo}</p>
                )}
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ width: '100%', marginBottom: 8 }}>
                  {pendingApproval ? 'Kirim WA persetujuan' : 'Kirim info login via WhatsApp'}
                </a>
                <button className="btn-ghost" onClick={() => setModalHalaqah(null)} style={{ width: '100%' }}>
                  Tutup
                </button>
              </div>
            ) : (
              <AssignForm key={modalHalaqah.id} halaqah={modalHalaqah} onDone={(res) => handleDone(res, modalHalaqah.id)} />
            )}
          </div>
        )}
      </dialog>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {halaqahList.map((h) => {
          const assigned = h.currentKetua && !doneIds.has(h.id);
          const justDone = doneIds.has(h.id);
          return (
            <div key={h.id} className="card-flat" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <p className="t-body" style={{ fontWeight: 600 }}>{h.name}</p>
                  <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                    {!h.levelTagged
                      ? 'Halaqah belum ditag level (hubungi koordinator)'
                      : `${h.pertemuanCount} pertemuan berlalu`}
                    {' · '}
                    {justDone
                      ? 'Ketua baru ditunjuk'
                      : h.currentKetua
                      ? `Ketua: ${h.currentKetua}`
                      : 'Belum ada ketua'}
                  </p>
                </div>
                <button className="btn" onClick={() => openAssign(h)} style={{ whiteSpace: 'nowrap' }}>
                  {assigned ? 'Ganti' : 'Tunjuk'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
