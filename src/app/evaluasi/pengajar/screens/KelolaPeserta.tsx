'use client';

import { useState } from 'react';
import { isPesertaManual } from '@/lib/evaluasi-peserta';

export interface KelolaPesertaItem {
  id: string;
  nama: string;
}

interface Props {
  halaqahId: string;
  halaqahNama: string;
  peserta: KelolaPesertaItem[];
  /** Mode Coba menahan semua tulisan ke server — daftar peserta bukan bahan eksperimen. */
  coba: boolean;
  back: () => void;
}

type Sibuk = { jenis: 'tambah' | 'ubah' | 'hapus'; id: string } | null;

const KOTAK: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1.5px solid var(--line)',
  background: '#ffffff',
  font: 'inherit',
  fontSize: 14,
  color: 'var(--ink)',
};

export function KelolaPeserta({ halaqahId, halaqahNama, peserta, coba, back }: Props) {
  const [namaBaru, setNamaBaru] = useState('');
  const [ubahId, setUbahId] = useState<string | null>(null);
  const [ubahNama, setUbahNama] = useState('');
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<Sibuk>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async (
    url: string,
    body: Record<string, unknown>,
    tandai: NonNullable<Sibuk>
  ): Promise<void> => {
    setGalat(null);
    setSibuk(tandai);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setGalat(data.error ?? 'Gagal menyimpan. Periksa koneksi lalu coba lagi.');
        setSibuk(null);
        return;
      }
      // Muat ulang: daftar peserta dirakit di server (page.tsx) bersama nilai dan
      // sesi. Menambal state di klien saja berisiko membuat kunci nilai meleset
      // dari peserta yang baru muncul.
      window.location.reload();
    } catch {
      setGalat('Gagal menyimpan. Periksa koneksi lalu coba lagi.');
      setSibuk(null);
    }
  };

  const tambah = () => {
    const nama = namaBaru.trim();
    if (!nama) return;
    void kirim('/api/evaluasi/peserta/upsert', { halaqah_id: halaqahId, nama }, { jenis: 'tambah', id: 'baru' });
  };

  const simpanUbah = (id: string) => {
    const nama = ubahNama.trim();
    if (!nama) return;
    void kirim(
      '/api/evaluasi/peserta/upsert',
      { halaqah_id: halaqahId, peserta_id: id, nama },
      { jenis: 'ubah', id }
    );
  };

  const hapus = (id: string) => {
    void kirim('/api/evaluasi/peserta/hapus', { halaqah_id: halaqahId, peserta_id: id }, { jenis: 'hapus', id });
  };

  const adaProses = sibuk !== null;
  const jumlahManual = peserta.filter((p) => isPesertaManual(p.id)).length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid var(--line)' }}>
        <button onClick={back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)', background: '#ffffff', color: 'var(--ink-2)', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Peserta Halaqah</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{halaqahNama} · {peserta.length} peserta</div>
        </div>
      </div>

      {coba && (
        <div style={{ margin: '14px 16px 0', padding: '10px 12px', borderRadius: 10, background: 'oklch(0.95 0.05 85)', border: '1px solid oklch(0.85 0.08 85)', fontSize: 12, color: 'oklch(0.42 0.09 75)' }}>
          Mode Coba menyala. Daftar peserta bukan bahan eksperimen — matikan Mode Coba dulu untuk menambah atau mengubah.
        </div>
      )}

      {galat && (
        <div style={{ margin: '14px 16px 0', padding: '10px 12px', borderRadius: 10, background: 'oklch(0.96 0.03 25)', border: '1px solid oklch(0.86 0.07 25)', fontSize: 12, color: 'oklch(0.46 0.14 25)' }}>
          {galat}
        </div>
      )}

      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
          Tambah peserta
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={namaBaru}
            onChange={(e) => setNamaBaru(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !coba && !adaProses) tambah(); }}
            placeholder="Nama lengkap peserta"
            disabled={coba || adaProses}
            style={{ ...KOTAK, flex: 1, opacity: coba ? 0.55 : 1 }}
          />
          <button
            onClick={tambah}
            disabled={coba || adaProses || namaBaru.trim().length < 2}
            style={{
              flexShrink: 0,
              height: 42,
              padding: '0 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--ink)',
              color: '#ffffff',
              font: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: coba || adaProses || namaBaru.trim().length < 2 ? 'not-allowed' : 'pointer',
              opacity: coba || adaProses || namaBaru.trim().length < 2 ? 0.5 : 1,
            }}
          >
            {sibuk?.jenis === 'tambah' ? '…' : 'Tambah'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 6 }}>
          Nama semua peserta bisa dibetulkan di sini. Pembetulan hanya berlaku untuk modul Evaluasi —
          data di pusat tidak ikut berubah.
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
          Daftar peserta ({peserta.length})
        </div>
        {peserta.length === 0 ? (
          <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, padding: 14, fontSize: 12, color: 'var(--muted-2)' }}>
            Belum ada peserta. Tambahkan lewat kotak di atas.
          </div>
        ) : (
          <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
            {peserta.map((p, i) => {
              const manual = isPesertaManual(p.id);
              const sedangUbah = ubahId === p.id;
              const sedangHapus = konfirmasiHapus === p.id;
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '10px 12px',
                    borderBottom: i < peserta.length - 1 ? '1px solid var(--line)' : 'none',
                    background: sedangHapus ? 'oklch(0.98 0.015 25)' : 'transparent',
                  }}
                >
                  {sedangUbah ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={ubahNama}
                        onChange={(e) => setUbahNama(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !adaProses) simpanUbah(p.id); }}
                        autoFocus
                        style={{ ...KOTAK, flex: 1 }}
                      />
                      <button
                        onClick={() => simpanUbah(p.id)}
                        disabled={adaProses || ubahNama.trim().length < 2}
                        style={{ flexShrink: 0, height: 42, padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--ink)', color: '#ffffff', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: adaProses || ubahNama.trim().length < 2 ? 0.5 : 1 }}
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => setUbahId(null)}
                        style={{ flexShrink: 0, height: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: '#ffffff', font: 'inherit', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}
                      >
                        Batal
                      </button>
                    </div>
                  ) : sedangHapus ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'oklch(0.46 0.14 25)' }}>
                        {manual ? (
                          <>Hapus <strong>{p.nama}</strong> beserta nilainya?</>
                        ) : (
                          <>
                            Keluarkan <strong>{p.nama}</strong> dari halaqah ini? Nilainya tetap
                            tersimpan, dan data di pusat tidak ikut berubah.
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => hapus(p.id)}
                        disabled={adaProses}
                        style={{ flexShrink: 0, height: 34, padding: '0 12px', borderRadius: 8, border: 'none', background: 'oklch(0.55 0.16 25)', color: '#ffffff', font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: adaProses ? 0.5 : 1 }}
                      >
                        {sibuk?.jenis === 'hapus' ? '…' : manual ? 'Hapus' : 'Keluarkan'}
                      </button>
                      <button
                        onClick={() => setKonfirmasiHapus(null)}
                        style={{ flexShrink: 0, height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--line-2)', background: '#ffffff', font: 'inherit', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.nama}</div>
                        {manual && (
                          <div style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 1 }}>ditambahkan sendiri</div>
                        )}
                      </div>
                      {!coba && (
                        <>
                          <button
                            onClick={() => { setUbahId(p.id); setUbahNama(p.nama); setKonfirmasiHapus(null); }}
                            style={{ flexShrink: 0, height: 30, padding: '0 10px', borderRadius: 7, border: '1px solid var(--line-2)', background: '#ffffff', font: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}
                          >
                            Ubah
                          </button>
                          <button
                            onClick={() => { setKonfirmasiHapus(p.id); setUbahId(null); }}
                            style={{ flexShrink: 0, height: 30, padding: '0 10px', borderRadius: 7, border: '1px solid oklch(0.85 0.08 25)', background: '#ffffff', font: 'inherit', fontSize: 11, fontWeight: 600, color: 'oklch(0.46 0.14 25)', cursor: 'pointer' }}
                          >
                            {manual ? 'Hapus' : 'Keluarkan'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {jumlahManual > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 8 }}>
            {jumlahManual} peserta ditambahkan sendiri. Agar tercatat di semua modul, mintakan juga
            pendaftarannya ke koordinator.
          </div>
        )}
      </div>
      <div style={{ height: 28 }} />
    </>
  );
}
