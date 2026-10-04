'use client';

import { useState } from 'react';
import type { Gender } from '@/types/db';
import { tambahGrupPool, ubahStatusGrupPool } from './actions';
import { Bagian, useAksi } from './ui';

export interface BarisGrup {
  id: string;
  gender: Gender;
  invite_link: string;
  status: string;
  halaqah: string | null;
}

/**
 * Kolam grup WhatsApp cadangan.
 *
 * Jalur utama tetap pengajar membuat grupnya sendiri saat konfirmasi. Kolam ini
 * untuk yang tidak sanggup — dan harus disiapkan lebih dulu, karena WhatsApp
 * Cloud API resmi tidak punya endpoint grup sama sekali: tidak bisa membuat
 * grup, menambah anggota, maupun mengambil tautan undangan. Yang dapat diotomasi
 * hanya pembagiannya, bukan pembuatannya.
 */
export function PanelGrupPool({ periodeId, baris }: { periodeId: string; baris: BarisGrup[] }) {
  const { pending, jalan, tampilan } = useAksi();
  const [gender, setGender] = useState<Gender>('ikhwan');
  const [tempelan, setTempelan] = useState('');

  const hitung = (g: Gender, s: string) =>
    baris.filter((b) => b.gender === g && b.status === s).length;

  return (
    <Bagian
      judul="Kolam grup WhatsApp cadangan"
      keterangan="Buat grup kosong di WhatsApp, salin tautan undangannya, lalu tempel di sini — boleh banyak sekaligus. Sistem mencabut satu saat ada pengajar yang tidak sanggup membuat grup sendiri."
    >
      <p className="t-small" style={{ marginBottom: 10 }}>
        Ikhwan: <strong>{hitung('ikhwan', 'kosong')}</strong> siap ·{' '}
        {hitung('ikhwan', 'terpakai')} terpakai · {hitung('ikhwan', 'rusak')} rusak
        {'   '}| Akhwat: <strong>{hitung('akhwat', 'kosong')}</strong> siap ·{' '}
        {hitung('akhwat', 'terpakai')} terpakai · {hitung('akhwat', 'rusak')} rusak
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Kelompok</span>
          <select className="input" value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="ikhwan">Ikhwan</option>
            <option value="akhwat">Akhwat</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 320px' }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>
            Tempel tautan undangan (satu per baris)
          </span>
          <textarea
            className="input"
            rows={3}
            value={tempelan}
            onChange={(e) => setTempelan(e.target.value)}
            placeholder={'https://chat.whatsapp.com/AbCdEf…\nhttps://chat.whatsapp.com/GhIjKl…'}
          />
        </label>
        <button
          className="btn btn-sm"
          disabled={pending || !tempelan.trim()}
          onClick={() =>
            jalan(
              () => tambahGrupPool({ periodeId, gender, tempelan }),
              () => setTempelan('')
            )
          }
        >
          Masukkan ke kolam
        </button>
      </div>

      {tampilan}

      {baris.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table className="t-small" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
                <th style={{ padding: '6px 8px' }}>Tautan</th>
                <th style={{ padding: '6px 8px' }}>Kel.</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
                <th style={{ padding: '6px 8px' }}>Dipakai</th>
                <th style={{ padding: '6px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 8px', wordBreak: 'break-all' }}>
                    <code style={{ fontSize: 11 }}>{b.invite_link}</code>
                  </td>
                  <td style={{ padding: '6px 8px' }}>{b.gender === 'ikhwan' ? 'Ikh' : 'Akh'}</td>
                  <td style={{ padding: '6px 8px' }}>{b.status}</td>
                  <td style={{ padding: '6px 8px' }}>{b.halaqah ?? '—'}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {b.status !== 'terpakai' && (
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={pending}
                        onClick={() =>
                          jalan(() =>
                            ubahStatusGrupPool({
                              id: b.id,
                              status: b.status === 'rusak' ? 'kosong' : 'rusak',
                              catatan: '',
                            })
                          )
                        }
                      >
                        {b.status === 'rusak' ? 'Kembalikan ke kolam' : 'Tandai rusak'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bagian>
  );
}
