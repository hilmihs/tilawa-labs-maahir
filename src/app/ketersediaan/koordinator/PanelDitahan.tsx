'use client';

import { useMemo, useState } from 'react';
import type { BarisDitahan, RingkasDitahan } from '@/lib/ketersediaan-ditahan';
import { batalkanPendaftar, loloskanPendaftar } from './actions';
import { Bagian, useAksi } from './ui';

/**
 * Layar pendaftar yang tertahan saringan mutu.
 *
 * Saringan tanpa layar tidak ada gunanya: pada tarikan nyata pertama 474 dari
 * 1.341 baris tertahan, dan 186 di antaranya nomor WA ganda yang hanya bisa
 * dibereskan manusia. Tanpa daftar ini angka itu hanya jadi selisih yang tak
 * pernah dikejar.
 *
 * Dua tindakan saja, sengaja sempit:
 *  · Loloskan — koordinator sudah memeriksa dan menyatakan barisnya layak.
 *  · Batalkan — barisnya memang tidak akan diproses.
 * Menyunting isi baris tidak disediakan: sheet tetap sumber kebenaran, dan
 * perbaikan yang dilakukan di sini akan tertimpa pada tarikan berikutnya.
 */
export function PanelDitahan({
  periodeId,
  ringkas,
}: {
  periodeId: string;
  ringkas: RingkasDitahan;
}) {
  const { pending, jalan, tampilan } = useAksi();
  const [saring, setSaring] = useState<string>('');
  const [buka, setBuka] = useState(false);

  const baris = useMemo(() => {
    if (!saring) return ringkas.baris;
    return ringkas.baris.filter((b) => b.alasan.some((a) => a.startsWith(saring.split('"')[0])));
  }, [ringkas.baris, saring]);

  if (ringkas.total === 0) {
    return (
      <Bagian judul="Pendaftar ditahan" keterangan="Tidak ada baris yang tertahan saringan mutu.">
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Semua pendaftar lolos.</p>
      </Bagian>
    );
  }

  return (
    <Bagian
      judul={`Pendaftar ditahan (${ringkas.total})`}
      keterangan="Baris ini tidak ikut dihitung dan tidak akan dialokasikan sampai dibereskan. Perbaikan sebaiknya dilakukan di sheet — tarikan berikutnya akan memperbaruinya sendiri."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <button
          className={saring === '' ? 'btn btn-sm' : 'btn btn-sm btn-ghost'}
          onClick={() => setSaring('')}
        >
          Semua ({ringkas.total})
        </button>
        {ringkas.perAlasan.map((a) => (
          <button
            key={a.alasan}
            className={saring === a.alasan ? 'btn btn-sm' : 'btn btn-sm btn-ghost'}
            onClick={() => setSaring(a.alasan)}
            title={a.alasan}
          >
            {a.alasan.length > 40 ? `${a.alasan.slice(0, 40)}…` : a.alasan} ({a.jumlah})
          </button>
        ))}
      </div>

      {ringkas.slotAsing.length > 0 && (
        <div
          className="t-small"
          style={{
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 10,
          }}
        >
          <strong>Pilihan jam yang tidak dikenali master:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {ringkas.slotAsing.slice(0, 12).map((s) => (
              <li key={s.nilai}>
                {s.jumlah}× <code style={{ fontSize: 11 }}>{s.nilai}</code>
              </li>
            ))}
          </ul>
          <p style={{ color: 'var(--muted-2)', margin: '6px 0 0' }}>
            Tambahkan slotnya di Master Slot bila memang dibuka, atau biarkan bila pilihannya
            sudah tidak dipakai.
          </p>
        </div>
      )}

      {tampilan}

      <button className="btn btn-sm btn-ghost" onClick={() => setBuka((v) => !v)}>
        {buka ? 'Sembunyikan daftar' : `Tampilkan daftar (${baris.length})`}
      </button>

      {buka && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table className="t-small" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
                <th style={{ padding: '6px 8px' }}>Nama</th>
                <th style={{ padding: '6px 8px' }}>WA</th>
                <th style={{ padding: '6px 8px' }}>Umur</th>
                <th style={{ padding: '6px 8px' }}>Pilihan jam</th>
                <th style={{ padding: '6px 8px' }}>Alasan ditahan</th>
                <th style={{ padding: '6px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <BarisTampil key={b.id} baris={b} periodeId={periodeId} pending={pending} jalan={jalan} />
              ))}
            </tbody>
          </table>
          {ringkas.total > ringkas.baris.length && (
            <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
              Menampilkan {ringkas.baris.length} dari {ringkas.total}. Sisanya muncul setelah
              yang ini dibereskan.
            </p>
          )}
        </div>
      )}
    </Bagian>
  );
}

function BarisTampil({
  baris,
  periodeId,
  pending,
  jalan,
}: {
  baris: BarisDitahan;
  periodeId: string;
  pending: boolean;
  jalan: ReturnType<typeof useAksi>['jalan'];
}) {
  const [yakin, setYakin] = useState(false);
  return (
    <tr style={{ borderBottom: '1px solid var(--line)' }}>
      <td style={{ padding: '6px 8px' }}>
        {baris.nama || <em style={{ color: 'var(--merah-ink)' }}>kosong</em>}
        {baris.rekaman_url && (
          <>
            {' '}
            <a href={baris.rekaman_url} target="_blank" rel="noopener noreferrer">
              rekaman
            </a>
          </>
        )}
      </td>
      <td style={{ padding: '6px 8px' }}>{baris.wa ?? '—'}</td>
      <td style={{ padding: '6px 8px' }}>{baris.umur ?? '—'}</td>
      <td style={{ padding: '6px 8px', maxWidth: 260 }}>
        <span style={{ color: baris.slot_id ? undefined : 'var(--merah-ink)' }}>
          {baris.slot_label_raw ?? '—'}
        </span>
      </td>
      <td style={{ padding: '6px 8px', color: 'var(--muted-2)', maxWidth: 300 }}>
        {baris.alasan.join(' · ')}
      </td>
      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
        <button
          className="btn btn-sm btn-ghost"
          disabled={pending || !baris.slot_id}
          title={
            baris.slot_id
              ? 'Nyatakan baris ini layak diproses'
              : 'Tidak bisa diloloskan: slotnya belum dikenali master'
          }
          onClick={() => jalan(() => loloskanPendaftar({ periodeId, pendaftarId: baris.id }))}
        >
          Loloskan
        </button>{' '}
        {yakin ? (
          <>
            <button
              className="btn btn-sm"
              disabled={pending}
              onClick={() => jalan(() => batalkanPendaftar({ periodeId, pendaftarId: baris.id }))}
            >
              Ya, batalkan
            </button>{' '}
            <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => setYakin(false)}>
              Tidak
            </button>
          </>
        ) : (
          // Dua langkah: pembatalan mengeluarkan orangnya dari antrean dan tarikan
          // CSV berikutnya tidak menghidupkannya lagi.
          <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => setYakin(true)}>
            Batalkan
          </button>
        )}
      </td>
    </tr>
  );
}
