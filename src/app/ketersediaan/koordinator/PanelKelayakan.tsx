'use client';

import { useMemo, useState } from 'react';
import { hapusIsianTakLayak, salinKelayakan, setelKelayakanMassal, ubahKelayakan } from './actions';
import { Bagian, Kotak, useAksi } from './ui';

export interface BarisKelayakanUI {
  pengajar_id: string;
  nama: string;
  boleh: boolean;
  belumDisetel: boolean;
  belumMengajar: boolean;
  punyaIsian: boolean;
  isianOffline: boolean;
}

/**
 * Daftar pengajar yang boleh mengisi ketersediaan periode ini.
 *
 * Dua pekerjaan dalam satu panel karena keduanya selalu beriringan: menyetel
 * daftarnya, dan membereskan isian yang sudah terlanjur masuk dari orang di
 * luar daftar. Memisahkannya hanya membuat koordinator bolak-balik.
 */
export function PanelKelayakan({
  periodeId,
  baris,
  pakaiDaftar,
  periodeLain,
}: {
  periodeId: string;
  baris: BarisKelayakanUI[];
  pakaiDaftar: boolean;
  periodeLain: { id: string; nama: string }[];
}) {
  const { pending, jalan, tampilan } = useAksi();
  const [cari, setCari] = useState('');
  const [waUrl, setWaUrl] = useState<{ nama: string; url: string } | null>(null);
  const [asal, setAsal] = useState('');

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return q ? baris.filter((b) => b.nama.toLowerCase().includes(q)) : baris;
  }, [baris, cari]);

  const jumlahBoleh = baris.filter((b) => b.boleh).length;
  // Isian yang seluruhnya slot offline tidak dihitung "liar": slot offline
  // ditambahkan koordinator sendiri, jadi orang di luar daftar online masih
  // boleh punya isian offline (mis. pengajar Masjid Al-Kautsar).
  const perluDibereskan = baris.filter((b) => !b.boleh && b.punyaIsian && !b.isianOffline);

  return (
    <Bagian
      judul="Siapa yang boleh mengisi ketersediaan"
      keterangan={
        pakaiDaftar
          ? `Hanya yang dicentang di bawah yang bisa membuka form ketersediaan. ${jumlahBoleh} dari ${baris.length} pengajar.`
          : 'Daftar belum disetel, jadi SEMUA pengajar aktif bisa mengisi. Centang beberapa nama lalu simpan untuk mulai memakai daftar.'
      }
    >
      {tampilan}

      {waUrl && (
        <Kotak nada="netral">
          Isian {waUrl.nama} sudah dihapus.{' '}
          <a href={waUrl.url} target="_blank" rel="noopener noreferrer">
            Kirim pemberitahuan WhatsApp
          </a>
        </Kotak>
      )}

      {perluDibereskan.length > 0 && (
        <Kotak nada="galat">
          {perluDibereskan.length} orang di luar daftar sudah terlanjur mengisi:{' '}
          {perluDibereskan.map((b) => b.nama).join(', ')}. Hapus isiannya lewat tombol
          &quot;Hapus isian&quot; di barisnya, lalu kabari lewat tautan WA yang muncul.
        </Kotak>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input
          className="input"
          placeholder="Cari nama…"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          style={{ width: 200 }}
        />
        <button
          className="btn btn-sm btn-ghost"
          disabled={pending}
          onClick={() =>
            jalan(() =>
              setelKelayakanMassal({ periodeId, bolehIds: baris.map((b) => b.pengajar_id) })
            )
          }
        >
          Boleh semua
        </button>
        <button
          className="btn btn-sm btn-ghost"
          disabled={pending}
          onClick={() => jalan(() => setelKelayakanMassal({ periodeId, bolehIds: [] }))}
        >
          Kosongkan daftar
        </button>
        {periodeLain.length > 0 && (
          <>
            <select
              className="input"
              value={asal}
              onChange={(e) => setAsal(e.target.value)}
              style={{ width: 200 }}
            >
              <option value="">Salin dari periode…</option>
              {periodeLain.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
            <button
              className="btn btn-sm btn-ghost"
              disabled={pending || !asal}
              onClick={() => jalan(() => salinKelayakan({ periodeId, dariPeriodeId: asal }))}
            >
              Salin
            </button>
          </>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="t-small" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
              <th style={{ padding: '6px 8px' }}>Pengajar</th>
              <th style={{ padding: '6px 8px' }}>Status</th>
              <th style={{ padding: '6px 8px' }}>Isian</th>
              <th style={{ padding: '6px 8px' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {tersaring.map((b) => (
              <tr key={b.pengajar_id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '6px 8px' }}>
                  {b.nama}
                  {b.belumMengajar && (
                    <span
                      className="t-small"
                      style={{ color: 'var(--muted-2)', marginLeft: 6 }}
                      title="Tidak memegang halaqah HITS aktif maupun kelas Maahir"
                    >
                      · belum mengajar
                    </span>
                  )}
                </td>
                <td style={{ padding: '6px 8px' }}>{b.boleh ? 'Boleh' : 'Tidak'}</td>
                <td style={{ padding: '6px 8px' }}>
                  {b.punyaIsian
                    ? b.isianOffline
                      ? 'sudah mengisi · offline (diatur koordinator)'
                      : 'sudah mengisi'
                    : '—'}
                </td>
                <td style={{ padding: '6px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={pending}
                    onClick={() =>
                      jalan(() =>
                        ubahKelayakan({ periodeId, pengajarId: b.pengajar_id, boleh: !b.boleh })
                      )
                    }
                  >
                    {b.boleh ? 'Cabut' : 'Izinkan'}
                  </button>
                  {!b.boleh && b.punyaIsian && !b.isianOffline && (
                    <button
                      className="btn btn-sm btn-ghost"
                      disabled={pending}
                      onClick={() =>
                        jalan(
                          () => hapusIsianTakLayak({ periodeId, pengajarId: b.pengajar_id }),
                          (data) => {
                            const url = (data as { waUrl?: string } | undefined)?.waUrl;
                            if (url) setWaUrl({ nama: b.nama, url });
                          }
                        )
                      }
                    >
                      Hapus isian
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {tersaring.length === 0 && (
              <tr>
                <td className="t-small" style={{ padding: '8px', color: 'var(--muted-2)' }} colSpan={4}>
                  Tidak ada nama yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Bagian>
  );
}
