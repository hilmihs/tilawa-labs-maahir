'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { butuhAlasan, type StatusKehadiran } from '@/lib/kehadiran-status';

type Status = StatusKehadiran;

// H / I / S / A / T sesuai keterangan kehadiran peserta.
const STATUS_OPTIONS: { value: Status; code: string; label: string; color: string }[] = [
  { value: 'hadir', code: 'H', label: 'Hadir', color: 'var(--hijau)' },
  { value: 'izin', code: 'I', label: 'Izin', color: '#64b5f6' },
  { value: 'sakit', code: 'S', label: 'Sakit', color: '#ce93d8' },
  { value: 'tidak_ada_keterangan', code: 'A', label: 'Alpa', color: 'var(--merah)' },
  { value: 'terlambat', code: 'T', label: 'Terlambat', color: 'var(--kuning)' },
];

type PesertaRow = {
  id: string;
  name: string;
  status: Status;
  catatan: string;
  setoran: string; // halaman setoran pertemuan ini (kosong = belum diisi)
  mode: 'offline' | 'online';
  /**
   * Peserta Takhassus yang dipresensi di kelas halaqah ini — setorannya diisi
   * ketua di sini walau kelasnya bukan Takhassus.
   */
  takhassus?: boolean;
};

export function PresensiWizardForm({
  pertemuanId,
  pesertaList,
  remaining,
  materi: materiAwal = '',
  showSetoran = false,
}: {
  pertemuanId: string;
  pesertaList: PesertaRow[];
  remaining: number;
  materi?: string;
  showSetoran?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PesertaRow[]>(pesertaList);
  // Materi pertemuan — seragam untuk seluruh peserta (per-pertemuan).
  const [materi, setMateri] = useState(materiAwal);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cegah double-submit / flicker saat berpindah ke hari berikutnya.
  const done = useRef(false);

  function updateRow(id: string, patch: Partial<PesertaRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function markAll(status: Status) {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  }

  async function saveAndNext() {
    if (done.current) return;
    // Tidak hadir wajib beralasan — kolom Keterangan di rekap & laporan bulanan
    // mengandalkannya. Dicek juga di API PUT kehadiran.
    const belumBeralasan = rows.filter((r) => butuhAlasan(r.status) && r.catatan.trim() === '');
    if (belumBeralasan.length > 0) {
      setError(
        `Alasan wajib diisi untuk ${belumBeralasan.length} peserta yang tidak hadir: ` +
          belumBeralasan.map((r) => r.name).join(', ')
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/2in1/kehadiran/${pertemuanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rows.map((r) => ({
            anggota_id: r.id,
            status: r.status,
            catatan: r.catatan || undefined,
            mode: r.mode,
            ...(showSetoran || r.takhassus
              ? { setoran_halaman: r.setoran === '' ? null : r.setoran }
              : {}),
          })),
          ...(showSetoran ? { materi } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal simpan');
      done.current = true;
      // Server hitung ulang hari yang belum terisi → maju ke berikutnya / dashboard.
      router.replace('/2in1/ketua-kelas/presensi');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal simpan');
      setSubmitting(false);
    }
  }

  const hadir = rows.filter((r) => r.status === 'hadir' || r.status === 'terlambat').length;

  return (
    <div>
      {/* Summary + bulk */}
      <div className="section-row" style={{ marginBottom: 10 }}>
        <div className="t-small">
          <span style={{ color: 'var(--hijau-ink)', fontWeight: 600 }}>{hadir}</span>
          <span style={{ color: 'var(--muted-2)' }}> / {rows.length} hadir</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => markAll(o.value)}
            className="btn btn-xs btn-ghost"
            style={{ fontSize: 11 }}
          >
            Semua {o.code}
          </button>
        ))}
      </div>

      {error && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          <div className="desc">{error}</div>
        </div>
      )}

      {showSetoran && (
        <div className="card" style={{ padding: '10px 12px', marginBottom: 12 }}>
          <label className="t-tiny" style={{ color: 'var(--muted-2)', display: 'block', marginBottom: 4 }}>
            Materi pertemuan ini (mis. surat/juz yang disetorkan)
          </label>
          <input
            type="text"
            value={materi}
            onChange={(e) => setMateri(e.target.value)}
            placeholder="materi / tema…"
            style={{
              width: '100%',
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-input, #f5f5f5)',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((p) => (
          <div key={p.id} className="card" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              {p.name}
              {p.takhassus && (
                <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>Takhassus</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => updateRow(p.id, { status: o.value })}
                  title={o.label}
                  style={{
                    minWidth: 34,
                    padding: '5px 9px',
                    fontSize: 12,
                    fontWeight: p.status === o.value ? 700 : 500,
                    background: p.status === o.value ? o.color : 'var(--bg-input, #f0f0f0)',
                    color: p.status === o.value ? '#fff' : 'var(--muted-2)',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  {o.code}
                </button>
              ))}
            </div>
            {/* Hadir offline / online — hanya untuk peserta yang hadir. */}
            {(p.status === 'hadir' || p.status === 'terlambat') && (
              <div style={{ marginTop: 6, display: 'flex', gap: 4, alignItems: 'center' }}>
                <span className="t-tiny" style={{ color: 'var(--muted-2)', marginRight: 2 }}>Ikut</span>
                {(['offline', 'online'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateRow(p.id, { mode: m })}
                    style={{
                      padding: '3px 10px',
                      fontSize: 11,
                      fontWeight: p.mode === m ? 700 : 400,
                      background: p.mode === m ? 'var(--accent, #3b82f6)' : 'var(--bg-input, #f0f0f0)',
                      color: p.mode === m ? '#fff' : 'var(--muted-2)',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    {m === 'offline' ? 'Offline' : 'Online'}
                  </button>
                ))}
              </div>
            )}
            {/* Setoran hafalan pertemuan ini — hanya sesi Kelas Maahir & peserta hadir. */}
            {(showSetoran || p.takhassus) && (p.status === 'hadir' || p.status === 'terlambat' || p.setoran) && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>Setoran</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={p.setoran}
                  onChange={(e) => updateRow(p.id, { setoran: e.target.value })}
                  placeholder="0"
                  style={{
                    width: 70,
                    fontSize: 11,
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-input, #f5f5f5)',
                  }}
                />
                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>halaman</span>
              </div>
            )}
            {(butuhAlasan(p.status) || p.catatan) && (
              <input
                type="text"
                value={p.catatan}
                onChange={(e) => updateRow(p.id, { catatan: e.target.value })}
                placeholder={butuhAlasan(p.status) ? 'alasan tidak hadir (wajib)…' : 'catatan...'}
                style={{
                  marginTop: 6,
                  width: '100%',
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 6,
                  // Tandai merah selagi alasan wajib masih kosong.
                  border:
                    butuhAlasan(p.status) && p.catatan.trim() === ''
                      ? '1px solid var(--merah, #dc2626)'
                      : '1px solid var(--border)',
                  background: 'var(--bg-input, #f5f5f5)',
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '10px 2px 0' }}>
        H = Hadir · I = Izin · S = Sakit · A = Alpa · T = Terlambat
      </div>

      <button
        type="button"
        onClick={saveAndNext}
        disabled={submitting}
        className={`btn btn-block ${submitting ? 'btn-soft' : 'btn-primary'}`}
        style={{ marginTop: 16 }}
      >
        {submitting ? 'Menyimpan…' : remaining > 1 ? 'Simpan & Lanjut →' : 'Simpan & Selesai'}
      </button>
    </div>
  );
}
