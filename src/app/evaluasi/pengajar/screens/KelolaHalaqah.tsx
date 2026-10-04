'use client';

// Betulkan nama & level halaqah dari sisi pengajar.
//
// Keduanya kolom mirror hilmihs. Server menandainya terkurasi (migrasi 0074)
// sehingga sync tak menariknya balik — lihat src/lib/evaluasi-kurasi.ts dan
// src/app/api/evaluasi/halaqah/ubah/route.ts. Data di hulu TIDAK ikut berubah.

import { useState } from 'react';

interface Props {
  halaqahId: string;
  nama: string;
  level: string | null;
  /** Ditampilkan sebagai cadangan level: beberapa program tak memakai level. */
  mustawa: number | null;
  /** Mode Coba menahan semua tulisan ke server — identitas halaqah bukan bahan eksperimen. */
  coba: boolean;
  back: () => void;
}

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

const KAP: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 8,
};

export function KelolaHalaqah({ halaqahId, nama, level, mustawa, coba, back }: Props) {
  const [namaBaru, setNamaBaru] = useState(nama);
  const [levelBaru, setLevelBaru] = useState(level ?? '');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const namaBersih = namaBaru.trim().replace(/\s+/g, ' ');
  const levelBersih = levelBaru.trim().replace(/\s+/g, ' ');
  const berubah = namaBersih !== nama || levelBersih !== (level ?? '');
  const bolehSimpan = !coba && !sibuk && berubah && namaBersih.length >= 3;

  const simpan = async () => {
    if (!bolehSimpan) return;
    setGalat(null);
    setSibuk(true);
    try {
      const res = await fetch('/api/evaluasi/halaqah/ubah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          halaqah_id: halaqahId,
          nama: namaBersih,
          level: levelBersih === '' ? null : levelBersih,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setGalat(data.error ?? 'Gagal menyimpan. Periksa koneksi lalu coba lagi.');
        setSibuk(false);
        return;
      }
      // Muat ulang: nama & level halaqah dipakai di kop rapot, judul layar, dan
      // pemilih halaqah — semuanya dirakit di server (page.tsx).
      window.location.reload();
    } catch {
      setGalat('Gagal menyimpan. Periksa koneksi lalu coba lagi.');
      setSibuk(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid var(--line)' }}>
        <button onClick={back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)', background: '#ffffff', color: 'var(--ink-2)', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Data Halaqah</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Betulkan nama dan level</div>
        </div>
      </div>

      {coba && (
        <div style={{ margin: '14px 16px 0', padding: '10px 12px', borderRadius: 10, background: 'oklch(0.95 0.05 85)', border: '1px solid oklch(0.85 0.08 85)', fontSize: 12, color: 'oklch(0.42 0.09 75)' }}>
          Mode Coba menyala. Identitas halaqah bukan bahan eksperimen — matikan Mode Coba dulu untuk mengubah.
        </div>
      )}

      {galat && (
        <div style={{ margin: '14px 16px 0', padding: '10px 12px', borderRadius: 10, background: 'oklch(0.96 0.03 25)', border: '1px solid oklch(0.86 0.07 25)', fontSize: 12, color: 'oklch(0.46 0.14 25)' }}>
          {galat}
        </div>
      )}

      <div style={{ padding: '18px 16px 0' }}>
        <div style={KAP}>Nama halaqah</div>
        <input
          value={namaBaru}
          onChange={(e) => setNamaBaru(e.target.value)}
          placeholder="Nama halaqah"
          disabled={coba || sibuk}
          style={{ ...KOTAK, opacity: coba ? 0.55 : 1 }}
        />
        <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 6 }}>
          Nama ini tercetak di kop rapot dan dipakai di seluruh layar Evaluasi.
        </div>
      </div>

      <div style={{ padding: '18px 16px 0' }}>
        <div style={KAP}>Level</div>
        <input
          value={levelBaru}
          onChange={(e) => setLevelBaru(e.target.value)}
          placeholder={mustawa != null ? `Kosongkan → tampil "Mustawa ${mustawa}"` : 'Mis. HITS Dasar'}
          disabled={coba || sibuk}
          style={{ ...KOTAK, opacity: coba ? 0.55 : 1 }}
        />
        <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 6 }}>
          Boleh dikosongkan.
          {mustawa != null ? ` Bila kosong, tampilan jatuh ke "Mustawa ${mustawa}".` : ''}
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <button
          onClick={simpan}
          disabled={!bolehSimpan}
          className="ev-dark"
          style={{
            width: '100%',
            height: 46,
            borderRadius: 10,
            border: 'none',
            background: 'var(--ink)',
            color: '#ffffff',
            font: 'inherit',
            fontSize: 14,
            fontWeight: 700,
            cursor: bolehSimpan ? 'pointer' : 'not-allowed',
            opacity: bolehSimpan ? 1 : 0.45,
          }}
        >
          {sibuk ? 'Menyimpan…' : 'Simpan'}
        </button>
        <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 10, lineHeight: 1.5 }}>
          Pembetulan hanya berlaku untuk modul Evaluasi — data di pusat tidak ikut berubah, dan
          sinkron berikutnya tidak akan menimpanya lagi.
        </div>
      </div>
      <div style={{ height: 28 }} />
    </>
  );
}
