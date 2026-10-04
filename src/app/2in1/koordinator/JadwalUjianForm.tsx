'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { hapusJadwalUjian, simpanJadwalUjian, type JadwalUjianResult } from './ujian-actions';

export interface PeriodeUjianView {
  id: string;
  nama: string;
  mulai: string;
  selesai: string;
  jumlahData: number;
}

/** Daftar periode (bisa diubah) + baris tambah dengan usulan +3 bulan terisi. */
export function JadwalUjianForm({
  periodes,
  usulan,
}: {
  periodes: PeriodeUjianView[];
  usulan: { nama: string; mulai: string; selesai: string } | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {periodes.map((p) => (
        <BarisPeriode key={p.id} periode={p} />
      ))}
      <div className="t-tiny" style={{ marginTop: 6 }}>
        Tambah periode {usulan ? '(usulan: 3 bulan setelah periode terakhir)' : ''}
      </div>
      {/* key ikut usulan: setelah tambah berhasil, baris kosong dirender ulang dengan usulan baru */}
      <BarisPeriode key={`baru-${usulan?.mulai ?? ''}-${periodes.length}`} periode={usulan ? { id: '', jumlahData: 0, ...usulan } : { id: '', nama: '', mulai: '', selesai: '', jumlahData: 0 }} />
    </div>
  );
}

function BarisPeriode({ periode }: { periode: PeriodeUjianView }) {
  const [simpan, aksiSimpan] = useFormState<JadwalUjianResult | undefined, FormData>(simpanJadwalUjian, undefined);
  const [hapus, aksiHapus] = useFormState<JadwalUjianResult | undefined, FormData>(hapusJadwalUjian, undefined);
  const baru = !periode.id;
  const pesan = simpan?.error ?? hapus?.error ?? null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <form action={aksiSimpan} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
          {!baru && <input type="hidden" name="id" value={periode.id} />}
          <input
            className="input"
            name="nama"
            defaultValue={periode.nama}
            placeholder="Nama, mis. Ujian Desember 2026"
            required
            style={{ flex: '1 1 180px', height: 32, fontSize: 13 }}
          />
          <input className="input" type="date" name="mulai" defaultValue={periode.mulai} required style={{ height: 32, fontSize: 13, width: 150 }} />
          <span className="t-small">s/d</span>
          <input className="input" type="date" name="selesai" defaultValue={periode.selesai} required style={{ height: 32, fontSize: 13, width: 150 }} />
          <Tombol label={baru ? 'Tambah' : 'Simpan'} primary={baru} />
        </form>
        {!baru && periode.jumlahData === 0 && (
          <form action={aksiHapus}>
            <input type="hidden" name="id" value={periode.id} />
            <Tombol label="Hapus" />
          </form>
        )}
        {!baru && periode.jumlahData > 0 && <span className="t-small">{periode.jumlahData} data</span>}
      </div>
      {pesan && <div style={{ fontSize: 12, color: 'var(--merah-ink)', marginTop: 4 }}>{pesan}</div>}
      {simpan?.ok && <div style={{ fontSize: 12, color: 'var(--hijau-ink)', marginTop: 4 }}>Tersimpan.</div>}
    </div>
  );
}

function Tombol({ label, primary }: { label: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-ghost'}`} style={{ height: 32 }}>
      {pending ? '…' : label}
    </button>
  );
}
