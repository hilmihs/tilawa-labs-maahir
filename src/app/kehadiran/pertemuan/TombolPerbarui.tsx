'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { perbaruiPertemuan } from './actions';

/** Tombol tarik ulang data Dashboard Edu untuk periode yang sedang dilihat. */
export function TombolPerbarui({ month }: { month: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);

  function perbarui() {
    setPesan(null);
    startTransition(async () => {
      try {
        const res = await perbaruiPertemuan(month);
        setPesan({ ok: res.ok, teks: res.pesan });
        router.refresh();
      } catch {
        setPesan({ ok: false, teks: 'Gagal memperbarui. Coba lagi beberapa saat lagi.' });
      }
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-sm btn-ghost" onClick={perbarui} disabled={pending}>
        {pending ? 'Memperbarui…' : 'Perbarui'}
      </button>
      {pesan && (
        <span
          className="t-tiny"
          role="status"
          style={{ color: pesan.ok ? 'var(--hijau-ink)' : 'var(--merah-ink)' }}
        >
          {pesan.teks}
        </span>
      )}
    </div>
  );
}
