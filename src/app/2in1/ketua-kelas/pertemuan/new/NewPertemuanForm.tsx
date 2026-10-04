'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PROGRAMS = [
  { value: 'kelas_maahir', label: 'Kelas Maahir', mulai: '', selesai: '' },
  { value: 'at_tibyan', label: 'At-Tibyan', mulai: '08:30', selesai: '10:00' },
  { value: 'muallim_najih', label: "Mu'allim Najih", mulai: '19:30', selesai: '21:00' },
];

type KelasOption = {
  id: string;
  name: string;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
};

export function NewPertemuanForm({ kelasList }: { kelasList: KelasOption[] }) {
  const router = useRouter();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  const [kelasId, setKelasId] = useState(kelasList[0]?.id ?? '');
  const [program, setProgram] = useState('kelas_maahir');
  const [tanggal, setTanggal] = useState(today);
  const [namaKegiatan, setNamaKegiatan] = useState('Kelas Maahir');
  const [waktuMulai, setWaktuMulai] = useState(
    kelasList[0]?.waktu_mulai?.slice(0, 5) ?? ''
  );
  const [waktuSelesai, setWaktuSelesai] = useState(
    kelasList[0]?.waktu_selesai?.slice(0, 5) ?? ''
  );
  const [keterangan, setKeterangan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickProgram(p: typeof PROGRAMS[number]) {
    setProgram(p.value);
    setNamaKegiatan(p.label);
    if (p.value === 'kelas_maahir') {
      const k = kelasList.find((x) => x.id === kelasId);
      setWaktuMulai(k?.waktu_mulai?.slice(0, 5) ?? '');
      setWaktuSelesai(k?.waktu_selesai?.slice(0, 5) ?? '');
    } else {
      setWaktuMulai(p.mulai);
      setWaktuSelesai(p.selesai);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/2in1/pertemuan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_kelas_id: kelasId,
          program,
          tanggal,
          nama_kegiatan: namaKegiatan,
          waktu_mulai: waktuMulai || null,
          waktu_selesai: waktuSelesai || null,
          keterangan: keterangan || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal menyimpan');
      router.push(`/2in1/ketua-kelas/pertemuan/${json.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {kelasList.length > 1 && (
        <div>
          <div className="t-tiny" style={{ marginBottom: 4 }}>Kelas</div>
          <select
            value={kelasId}
            onChange={(e) => setKelasId(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
          >
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <div className="t-tiny" style={{ marginBottom: 4 }}>Program</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {PROGRAMS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => pickProgram(p)}
              className={program === p.value ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}
              style={{ flex: 1, fontSize: 12 }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="t-tiny" style={{ marginBottom: 4 }}>Tanggal</div>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
        />
      </div>

      <div>
        <div className="t-tiny" style={{ marginBottom: 4 }}>Nama Kegiatan</div>
        <input
          type="text"
          value={namaKegiatan}
          onChange={(e) => setNamaKegiatan(e.target.value)}
          placeholder="mis: Pertemuan Rutin"
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div className="t-tiny" style={{ marginBottom: 4 }}>Waktu Mulai</div>
          <input
            type="time"
            value={waktuMulai}
            onChange={(e) => setWaktuMulai(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
          />
        </div>
        <div>
          <div className="t-tiny" style={{ marginBottom: 4 }}>Waktu Selesai</div>
          <input
            type="time"
            value={waktuSelesai}
            onChange={(e) => setWaktuSelesai(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
          />
        </div>
      </div>

      <div>
        <div className="t-tiny" style={{ marginBottom: 4 }}>Keterangan (opsional)</div>
        <input
          type="text"
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder="catatan tambahan..."
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14 }}
        />
      </div>

      {error && (
        <div className="banner banner-error">
          <div className="desc">{error}</div>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !tanggal || !namaKegiatan || !kelasId}
        className={`btn btn-block ${!submitting && tanggal && namaKegiatan ? 'btn-primary' : 'btn-soft'}`}
      >
        {submitting ? 'Menyimpan…' : 'Simpan & Isi Kehadiran →'}
      </button>
    </div>
  );
}
