'use client';

import { useState, useTransition } from 'react';

export type KlarifikasiResult = { ok?: boolean; error?: string };

export interface TabayyunKlarifikasiFormProps {
  tabayyunId: string;
  /** Sisa hutang halaqah. > 0 → field menit muncul dan wajib. */
  saldoHutang: number;
  alasanAwal: string | null;
  menitAwal: number | null;
  catatanAwal: string | null;
  /** Menit observasi − menit yang dilaporkan lewat izin. > 0 → minta penjelasan selisih. */
  selisihIzinMenit: number;
  /** Server action pemanggil; jalur token & jalur login memberi action berbeda. */
  onSubmit: (fd: FormData) => Promise<KlarifikasiResult>;
}

export function TabayyunKlarifikasiForm({
  tabayyunId,
  saldoHutang,
  alasanAwal,
  menitAwal,
  catatanAwal,
  selisihIzinMenit,
  onSubmit,
}: TabayyunKlarifikasiFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(fd);
      if (res?.error) { setError(res.error); return; }
      if (res?.ok) setDone(true);
    });
  }

  if (done) {
    return (
      <div className="t-small" style={{ color: 'var(--hijau-ink)' }}>
        ✓ Klarifikasi terkirim · menunggu keputusan koordinator. Anda masih bisa
        memuat ulang halaman ini untuk merevisi selama belum diputuskan.
      </div>
    );
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="tabayyun_id" value={tabayyunId} />

      {selisihIzinMenit > 0 && (
        <div
          className="t-small"
          style={{
            marginBottom: 12,
            padding: '8px 10px',
            background: 'var(--kuning-tint)',
            border: '1px solid var(--kuning-line)',
            borderRadius: 6,
            color: 'var(--kuning-ink)',
          }}
        >
          Izin yang Anda kirim <strong>belum menutupi seluruh catatan observasi</strong> —
          masih ada selisih <strong>{selisihIzinMenit} menit</strong>. Mohon jelaskan
          selisih tersebut pada kotak di bawah.
        </div>
      )}

      <label className="t-small" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
        Alasan / klarifikasi
      </label>
      <textarea
        name="alasan_pengajar"
        required
        rows={3}
        placeholder="Tulis alasan/klarifikasi…"
        defaultValue={alasanAwal ?? ''}
        className="input"
        style={{ width: '100%', marginBottom: 12 }}
      />

      {saldoHutang > 0 && (
        <>
          <div
            className="t-small"
            style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}
          >
            Sisa hutang menit kelas ini: <strong>{saldoHutang} menit</strong>.
          </div>

          <label className="t-small" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Menit hutang yang sudah ditunaikan di pertemuan ini
          </label>
          <input
            name="bayar_menit_klaim"
            type="number"
            required
            min={0}
            max={saldoHutang}
            step={1}
            inputMode="numeric"
            placeholder="0 jika belum menunaikan"
            defaultValue={menitAwal ?? ''}
            className="input"
            style={{ width: '100%', marginBottom: 8 }}
          />

          <input
            name="bayar_catatan"
            className="input"
            placeholder="Catatan cara menunaikan (opsional)"
            defaultValue={catatanAwal ?? ''}
            style={{ width: '100%', marginBottom: 12 }}
          />
        </>
      )}

      {error && (
        <div className="t-small" style={{ color: 'var(--merah-ink)', marginBottom: 8 }}>{error}</div>
      )}

      <button type="submit" className="btn" disabled={pending}>
        {pending ? 'Mengirim…' : 'Kirim Klarifikasi'}
      </button>
    </form>
  );
}
