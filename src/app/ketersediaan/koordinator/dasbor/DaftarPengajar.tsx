'use client';

import { useState } from 'react';
import type { BarisPengajarDasbor } from '../data';

export function DaftarPengajar({ baris, tampilGender }: { baris: BarisPengajarDasbor[]; tampilGender: boolean }) {
  const [cari, setCari] = useState('');
  const q = cari.trim().toLowerCase();
  const tampil = q ? baris.filter((b) => b.nama.toLowerCase().includes(q)) : baris;
  const belum = baris.filter((b) => b.halaqah === 0).length;

  return (
    <div className="ks-isi">
      <div className="ks-kartu">
        <div className="ks-kartu-kepala">
          <h2>Pengajar dan jam yang disanggupi</h2>
          <input
            id="cari-pengajar"
            className="ks-cari"
            type="search"
            placeholder="Cari nama pengajar"
            aria-label="Cari nama pengajar"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </div>
        <div className="ks-kartu-isi">
          <p className="t-small" style={{ marginTop: 0 }}>
            {baris.length} pengajar · {belum} belum mendapat halaqah. Angka setelah jam adalah urutan prioritas di jam
            itu. Kuning: bertabrakan dengan halaqah yang masih berjalan — dicatat, tidak dikunci. Jam halaqah terpakai
            sampai pertemuan terakhirnya: HITS Dasar 50 pertemuan, HITS Lanjutan 26 — Lanjutan membebaskan jam lebih awal.
          </p>
          {tampil.length === 0 ? (
            <p className="t-small" style={{ margin: 0 }}>
              {baris.length === 0 ? 'Belum ada ketersediaan. Impor dari xlsx di tab Pengaturan.' : 'Tidak ada pengajar yang cocok.'}
            </p>
          ) : (
            <div className="table-scroll">
              <table className="k-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Jam yang disanggupi</th>
                    <th style={{ textAlign: 'right' }}>Halaqah</th>
                    <th style={{ textAlign: 'right' }}>Sumber</th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div className="nm">{b.nama}</div>
                        <div className="sub">
                          {tampilGender ? `${b.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} · ` : ''}
                          {b.jam.length} jam{b.status !== 'aktif' ? ` · ${b.status}` : ''}
                        </div>
                      </td>
                      <td>
                        <div className="ks-chip-daftar">
                          {b.jam.map((j, i) => (
                            <span key={i} className={`ks-chip${j.bentrok ? ' bentrok' : ''}`} title={j.bentrok ?? undefined}>
                              {j.label}
                              {j.mode === 'offline' ? ' · offline' : ''}
                              {j.prioritas !== null && <span className="pr">#{j.prioritas}</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {b.halaqah > 0 ? b.halaqah : <span className="badge badge-neutral">belum</span>}
                        {b.halaqahRinci.map((h, i) => (
                          <div key={i} className="sub" style={{ whiteSpace: 'nowrap' }}>
                            {h.level?.replace('HITS ', '') ?? '—'} · {h.label}
                            {h.status === 'usulan' ? ' · usulan' : ''}
                            {h.selesai ? ` · bebas setelah ${tanggalPendek(h.selesai)}` : ''}
                          </div>
                        ))}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="badge badge-neutral">{b.sumber === 'impor' ? 'impor xlsx' : 'isi sendiri'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function tanggalPendek(t: string): string {
  return new Date(`${t.slice(0, 10)}T00:00:00Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
