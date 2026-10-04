'use client';

import { useState, useTransition } from 'react';
import { tetapkanKeputusan, batalkanKeputusan } from './actions';
import { NAMA_KELAS } from '@/lib/evaluasi-keputusan';
import type { Keputusan } from '@/lib/evaluasi-keputusan';

const HIJAU_TXT = 'oklch(0.40 0.10 150)';
const AMBER_TXT = 'oklch(0.48 0.11 80)';
const AMBER_BG = 'oklch(0.96 0.05 85)';
const AMBER_BORDER = 'oklch(0.86 0.08 85)';
const MERAH_TXT = 'oklch(0.46 0.14 25)';

/**
 * Dua tombol pilihan KELAS pengulangan + pembatalan.
 *
 * Sengaja bukan `<select>`: pilihannya cuma dua dan keduanya harus terbaca
 * sekaligus, karena koordinator menyapu banyak baris berturut-turut dan
 * dropdown memaksa satu klik ekstra hanya untuk melihat pilihannya.
 *
 * Tidak ada konfirmasi: keputusan ini bisa diganti dan dibatalkan kapan saja,
 * dan dialog di setiap baris akan membuat penyisiran 40 peserta menyiksa.
 */
export function KeputusanKontrol({
  pesertaId,
  nilai,
  bolehUbah,
}: {
  pesertaId: string;
  /** Keputusan tersimpan; null = belum diputuskan. */
  nilai: Keputusan | null;
  /** false = hanya tampilan (koordinator ketua kelas). */
  bolehUbah: boolean;
}) {
  const [pending, start] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);

  if (!bolehUbah) {
    return nilai ? (
      <Lencana nilai={nilai} />
    ) : (
      <span className="t-small" style={{ color: 'var(--line-2)' }}>—</span>
    );
  }

  function jalankan(fn: () => Promise<void>) {
    setGalat(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setGalat(e instanceof Error ? e.message : 'Gagal menyimpan.');
      }
    });
  }

  const tombol = (k: Keputusan, label: string, judul: string) => {
    const aktif = nilai === k;
    return (
      <button
        key={k}
        type="button"
        disabled={pending}
        title={judul}
        onClick={() => jalankan(() => tetapkanKeputusan(pesertaId, k))}
        style={{
          height: 26,
          minWidth: 34,
          padding: '0 8px',
          borderRadius: 6,
          border: `1px solid ${aktif ? AMBER_BORDER : 'var(--line)'}`,
          background: aktif ? AMBER_BG : 'transparent',
          color: aktif ? AMBER_TXT : 'var(--muted)',
          font: 'inherit',
          fontSize: 11.5,
          fontWeight: aktif ? 800 : 600,
          cursor: pending ? 'progress' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        {tombol('qn', 'QN', `Mengulang di ${NAMA_KELAS.qn}`)}
        {tombol('pb', 'PB', `Mengulang di ${NAMA_KELAS.pb}`)}
        {nilai && (
          <button
            type="button"
            disabled={pending}
            title="Batalkan keputusan"
            onClick={() => jalankan(() => batalkanKeputusan(pesertaId))}
            style={{
              height: 26,
              padding: '0 7px',
              borderRadius: 6,
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'var(--muted-2)',
              font: 'inherit',
              fontSize: 11.5,
              cursor: pending ? 'progress' : 'pointer',
              opacity: pending ? 0.6 : 1,
            }}
          >
            ×
          </button>
        )}
      </div>
      {galat && (
        <span style={{ fontSize: 10.5, color: MERAH_TXT, textAlign: 'right' }}>{galat}</span>
      )}
    </div>
  );
}

/** Tampilan baca-saja untuk yang tak boleh mengubah. */
function Lencana({ nilai }: { nilai: Keputusan }) {
  return (
    <span
      title={`Mengulang di ${NAMA_KELAS[nilai]}`}
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: 999,
        background: AMBER_BG,
        border: `1px solid ${AMBER_BORDER}`,
        fontSize: 10.5,
        fontWeight: 700,
        color: AMBER_TXT,
        whiteSpace: 'nowrap',
      }}
    >
      {nilai === 'qn' ? 'QN' : 'PB'}
    </span>
  );
}

/** Dipakai baris yang tidak sedang mengulang — tak ada yang perlu diputuskan. */
export function KeputusanKosong({ lulus }: { lulus: boolean }) {
  return (
    <span
      className="t-small"
      style={{ color: lulus ? HIJAU_TXT : 'var(--line-2)', opacity: lulus ? 0.7 : 1 }}
      title={lulus ? 'Lulus — tak perlu keputusan' : 'Nilai akhir PB belum lengkap'}
    >
      —
    </span>
  );
}
