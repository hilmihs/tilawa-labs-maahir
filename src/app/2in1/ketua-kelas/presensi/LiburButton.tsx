'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markLibur } from './actions';

export function LiburButton({
  programKelasId,
  tanggal,
  mingguan,
  label,
}: {
  programKelasId: string;
  tanggal: string;
  mingguan: boolean;
  label: string;
}) {
  const [arm, setArm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function confirm() {
    setErr(null);
    start(async () => {
      const r = await markLibur(programKelasId, tanggal, mingguan);
      if (r.error) {
        setErr(r.error);
        return;
      }
      setArm(false);
      router.refresh(); // tanggal libur → drop dari daftar, lanjut hari berikutnya
    });
  }

  return (
    <div style={{ marginTop: 10 }}>
      {!arm ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--muted)' }}
          onClick={() => setArm(true)}
        >
          🏖️ Tandai {mingguan ? 'pekan' : 'hari'} ini LIBUR
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="t-small" style={{ color: 'var(--muted)' }}>
            Tandai {label} libur? Tak perlu isi presensi.
          </span>
          <button type="button" className="btn btn-sm" style={{ background: 'var(--accent)', color: '#fff' }} disabled={pending} onClick={confirm}>
            {pending ? 'Menyimpan…' : 'Ya, libur'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArm(false)} disabled={pending}>
            Batal
          </button>
        </div>
      )}
      {err && <p className="t-tiny" style={{ color: 'var(--merah-ink)', marginTop: 4 }}>{err}</p>}
    </div>
  );
}
