'use client';

import { useState, useTransition } from 'react';
import {
  jalankanOutbox,
  muatUsulanPemetaan,
  sahkanPemetaan,
  ujiKoneksiTilawah,
  ulangiOutboxGagal,
} from './actions';

export interface BarisOutbox {
  id: string;
  halaqah: string;
  aksi: string;
  status: string;
  percobaan: number;
  error: string | null;
  payload: string;
  terkirim_pada: string | null;
}

interface BarisSlot {
  slot_id: string;
  label: string;
  kelompok: string;
  mode: string;
  day_id: number | null;
  session_id: number | null;
  tersimpan: boolean;
  hari_keyakinan: string;
  hari_alasan: string;
  sesi_keyakinan: string;
  sesi_alasan: string;
}

interface BarisLevel {
  level_nama: string;
  level_id: number | null;
  tersimpan: boolean;
  keyakinan: string;
  alasan: string;
}

interface Pilihan {
  id: number;
  nama: string;
}

interface Props {
  periodeId: string;
  namaPeriode: string;
  programId: number | null;
  batchId: number | null;
  kirimNyata: boolean;
  outbox: BarisOutbox[];
}

export function PanelTilawah(props: Props) {
  const [pending, mulai] = useTransition();
  const [termasukPerluCek, setTermasukPerluCek] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const [slot, setSlot] = useState<BarisSlot[]>([]);
  const [level, setLevel] = useState<BarisLevel[]>([]);
  const [pilihanHari, setPilihanHari] = useState<Pilihan[]>([]);
  const [pilihanSesi, setPilihanSesi] = useState<Pilihan[]>([]);
  const [pilihanLevel, setPilihanLevel] = useState<Pilihan[]>([]);

  function jalan(
    fn: () => Promise<{ ok: true; pesan: string; data?: unknown } | { ok: false; error: string }>,
    sesudah?: (data: unknown) => void
  ) {
    setPesan(null);
    setGalat(null);
    mulai(async () => {
      const r = await fn();
      if (r.ok) {
        setPesan(r.pesan);
        sesudah?.(r.data);
      } else setGalat(r.error);
    });
  }

  function muat() {
    if (!props.batchId) {
      setGalat('Tetapkan batch tujuan di halaman Kelola Ketersediaan terlebih dahulu.');
      return;
    }
    jalan(
      () => muatUsulanPemetaan({ periodeId: props.periodeId, batchId: props.batchId! }),
      (data) => {
        const d = data as {
          slot: BarisSlot[];
          level: BarisLevel[];
          pilihanHari: Pilihan[];
          pilihanSesi: Pilihan[];
          pilihanLevel: Pilihan[];
        };
        setSlot(d.slot);
        setLevel(d.level);
        setPilihanHari(d.pilihanHari);
        setPilihanSesi(d.pilihanSesi);
        setPilihanLevel(d.pilihanLevel);
      }
    );
  }

  const belumLengkap = slot.filter((s) => !s.day_id || !s.session_id).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => jalan(ujiKoneksiTilawah)}>
          Uji koneksi
        </button>
        <button className="btn btn-sm" disabled={pending} onClick={muat}>
          {pending ? 'Menarik…' : 'Tarik master & usulkan pemetaan'}
        </button>
        <button
          className="btn btn-sm btn-ghost"
          disabled={pending}
          onClick={() => jalan(() => jalankanOutbox({ periodeId: props.periodeId }))}
        >
          {props.kirimNyata ? 'Kirim antrean ke CMS' : 'Susun payload (mode percobaan)'}
        </button>
      </div>

      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
        Periode <strong>{props.namaPeriode}</strong> · program {props.programId ?? '—'} · batch{' '}
        {props.batchId ?? '—'} ·{' '}
        {props.kirimNyata ? 'pengiriman NYATA aktif' : 'mode kirim-percobaan'}
      </p>

      {galat && <Kotak nada="galat">{galat}</Kotak>}
      {pesan && <Kotak nada="baik">{pesan}</Kotak>}

      {slot.length > 0 && (
        <>
          <h2 className="t-h2" style={{ fontSize: 16, marginTop: 16, marginBottom: 4 }}>
            Pemetaan slot
          </h2>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
            Baris bertanda <strong>ragu</strong> perlu diperiksa manual. Sebagian master hari CMS
            punya <code>int_days</code> yang tidak sesuai namanya — memilihnya membuat halaqah
            terjadwal pada hari yang lebih sedikit dari yang dimaksud.
            {belumLengkap > 0 && (
              <>
                {' '}
                <strong style={{ color: 'var(--merah-ink)' }}>
                  {belumLengkap} slot belum punya padanan — halaqahnya akan ditahan.
                </strong>
              </>
            )}
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table className="t-small" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '6px 8px' }}>Slot</th>
                  <th style={{ padding: '6px 8px' }}>day_id</th>
                  <th style={{ padding: '6px 8px' }}>session_id</th>
                  <th style={{ padding: '6px 8px' }}>Catatan mesin</th>
                </tr>
              </thead>
              <tbody>
                {slot.map((s, i) => (
                  <tr key={s.slot_id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '6px 8px' }}>
                      {s.label}
                      <span style={{ color: 'var(--muted-2)' }}>
                        {' '}
                        · {s.kelompok === 'ikhwan' ? 'Ikh' : 'Akh'} · {s.mode}
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <select
                        className="input"
                        value={s.day_id ?? ''}
                        onChange={(e) => {
                          const n = [...slot];
                          n[i] = { ...s, day_id: e.target.value ? Number(e.target.value) : null };
                          setSlot(n);
                        }}
                      >
                        <option value="">— belum —</option>
                        {pilihanHari.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.id} · {h.nama}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <select
                        className="input"
                        value={s.session_id ?? ''}
                        onChange={(e) => {
                          const n = [...slot];
                          n[i] = { ...s, session_id: e.target.value ? Number(e.target.value) : null };
                          setSlot(n);
                        }}
                      >
                        <option value="">— belum —</option>
                        {pilihanSesi.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.id} · {x.nama}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px', color: warnaKeyakinan(s) }}>
                      {s.tersimpan ? 'sudah disahkan · ' : ''}
                      hari: {s.hari_keyakinan} — {s.hari_alasan}
                      <br />
                      sesi: {s.sesi_keyakinan} — {s.sesi_alasan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="t-h2" style={{ fontSize: 16, marginTop: 16, marginBottom: 8 }}>
            Pemetaan level
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {level.map((l, i) => (
              <div key={l.level_nama} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="t-small" style={{ minWidth: 130 }}>{l.level_nama}</span>
                <select
                  className="input"
                  value={l.level_id ?? ''}
                  onChange={(e) => {
                    const n = [...level];
                    n[i] = { ...l, level_id: e.target.value ? Number(e.target.value) : null };
                    setLevel(n);
                  }}
                >
                  <option value="">— belum —</option>
                  {pilihanLevel.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.id} · {x.nama}
                    </option>
                  ))}
                </select>
                <span className="t-small" style={{ color: 'var(--muted-2)' }}>
                  {l.tersimpan ? 'sudah disahkan · ' : ''}
                  {l.keyakinan} — {l.alasan}
                </span>
              </div>
            ))}
          </div>

          <button
            className="btn"
            style={{ marginTop: 12 }}
            disabled={pending}
            onClick={() =>
              jalan(() =>
                sahkanPemetaan({
                  periodeId: props.periodeId,
                  batchId: props.batchId!,
                  slot: slot.map((s) => ({
                    slot_id: s.slot_id,
                    day_id: s.day_id,
                    session_id: s.session_id,
                  })),
                  level: level.map((l) => ({ level_nama: l.level_nama, level_id: l.level_id })),
                })
              )
            }
          >
            Sahkan pemetaan
          </button>
        </>
      )}

      <h2 className="t-h2" style={{ fontSize: 16, marginTop: 24, marginBottom: 8 }}>
        Antrean pengiriman ({props.outbox.length})
      </h2>
      {props.outbox.some((b) => b.status === 'gagal') && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <button
            className="btn btn-sm btn-ghost"
            disabled={pending}
            onClick={() =>
              jalan(() => ulangiOutboxGagal({ periodeId: props.periodeId, termasukPerluCek }))
            }
          >
            Ulangi yang gagal
          </button>
          <label className="t-small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={termasukPerluCek}
              onChange={(e) => setTermasukPerluCek(e.target.checked)}
            />
            termasuk PERLU CEK — sudah saya pastikan pertemuannya belum ada di CMS
          </label>
        </div>
      )}
      {props.outbox.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Belum ada antrean. Antrean terbentuk setelah pengajar mengonfirmasi kesediaannya.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="t-small" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
                <th style={{ padding: '6px 8px' }}>Halaqah</th>
                <th style={{ padding: '6px 8px' }}>Aksi</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
                <th style={{ padding: '6px 8px' }}>Payload / galat</th>
              </tr>
            </thead>
            <tbody>
              {props.outbox.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 8px' }}>{b.halaqah}</td>
                  <td style={{ padding: '6px 8px' }}>{b.aksi}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {b.status}
                    {b.percobaan > 0 ? ` (${b.percobaan}×)` : ''}
                  </td>
                  <td style={{ padding: '6px 8px', maxWidth: 420, wordBreak: 'break-all' }}>
                    {b.error ? (
                      <span style={{ color: 'var(--merah-ink)' }}>{b.error}</span>
                    ) : (
                      <code style={{ fontSize: 11 }}>{b.payload}</code>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function warnaKeyakinan(s: BarisSlot): string {
  if (s.hari_keyakinan === 'tidak_ada' || s.sesi_keyakinan === 'tidak_ada') return 'var(--merah-ink)';
  if (s.hari_keyakinan === 'ragu' || s.sesi_keyakinan === 'ragu') return 'var(--kuning-ink, var(--muted-2))';
  return 'var(--muted-2)';
}

function Kotak({ nada, children }: { nada: 'baik' | 'galat'; children: React.ReactNode }) {
  const warna = nada === 'galat' ? 'var(--merah-ink)' : 'var(--hijau-ink)';
  return (
    <div
      className="t-small"
      style={{
        border: `1px solid ${warna}`,
        color: warna,
        borderRadius: 8,
        padding: '8px 10px',
        margin: '8px 0',
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </div>
  );
}
