'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { PREDIKAT_LABEL, PREDIKAT_UJIAN, PREDIKAT_WARNA } from '@/lib/ujian';
import type { JenisRekaman, PredikatUjian } from '@/types/db';
import { simpanNilaiUjian, type NilaiUjianResult } from '../actions';

export interface RekamanUjianView {
  jenis: JenisRekaman;
  label: string;
  audioUrl: string | null;
  adaRekaman: boolean;
  durationSec: number | null;
  predikat: PredikatUjian | null;
  masukan: string | null;
}

export function NilaiUjianForm({
  ujianId,
  rekamanList,
  sudahDinilai,
}: {
  ujianId: string;
  rekamanList: RekamanUjianView[];
  sudahDinilai: boolean;
}) {
  const [state, formAction] = useFormState<NilaiUjianResult | undefined, FormData>(simpanNilaiUjian, undefined);
  const [pilih, setPilih] = useState<Partial<Record<JenisRekaman, PredikatUjian | null>>>(() =>
    Object.fromEntries(rekamanList.map((r) => [r.jenis, r.predikat]))
  );
  const terisi = rekamanList.filter((r) => pilih[r.jenis]).length;

  if (state?.ok) {
    return (
      <div>
        <div className="banner banner-success" style={{ marginBottom: 14 }}>
          <div>
            <div className="title">Nilai ujian tersimpan</div>
            <div className="desc">Peserta sudah bisa melihat nilainya. Kabari juga lewat WhatsApp.</div>
          </div>
        </div>
        <a href={state.waUrl} target="_blank" rel="noopener" className="btn btn-wa btn-block">
          {Icon.wa(14)} Kirim hasil ke peserta
        </a>
        <a href="/2in1/musyrif/ujian" className="btn btn-ghost btn-block" style={{ marginTop: 12 }}>
          Kembali ke daftar ujian
        </a>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="ujian_id" value={ujianId} />
      <div className="t-small" style={{ marginBottom: 14 }}>
        {terisi} / {rekamanList.length} matan dinilai
        {sudahDinilai && ' · sudah pernah dinilai, perubahan akan menimpa nilai lama'}
      </div>

      {rekamanList.map((r) => (
        <div key={r.jenis} className="card" style={{ padding: 14, marginBottom: 12 }}>
          <div className="rec-head">
            <div className="title">{r.label}</div>
          </div>

          {r.adaRekaman ? (
            r.audioUrl ? (
              <audio controls preload="none" src={r.audioUrl} style={{ width: '100%', margin: '8px 0 12px' }} />
            ) : (
              <p className="t-small" style={{ fontStyle: 'italic', margin: '8px 0 14px' }}>
                Audio tidak tersedia.
              </p>
            )
          ) : (
            <p className="t-small" style={{ fontStyle: 'italic', margin: '8px 0 14px' }}>
              Tidak ada rekaman. Isi predikat bila matan ini diujikan langsung (telepon/tatap muka).
            </p>
          )}

          <label className="field-label">Predikat</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {PREDIKAT_UJIAN.map((p) => (
              <label
                key={p}
                className={`nilai ${PREDIKAT_WARNA[p]} ${pilih[r.jenis] === p ? 'on' : ''}`}
                style={{ cursor: 'pointer', fontSize: 12, gap: 4 }}
              >
                <input
                  type="radio"
                  name={`predikat_${r.jenis}`}
                  value={p}
                  defaultChecked={r.predikat === p}
                  onChange={() => setPilih((prev) => ({ ...prev, [r.jenis]: p }))}
                  required={r.adaRekaman}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                />
                <span className="dot" />
                {PREDIKAT_LABEL[p]}
              </label>
            ))}
          </div>
          {!r.adaRekaman && (
            <label className="t-small" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name={`predikat_${r.jenis}`}
                value=""
                defaultChecked={!r.predikat}
                onChange={() => setPilih((prev) => ({ ...prev, [r.jenis]: null }))}
              />
              Tidak diujikan
            </label>
          )}

          <label className="field-label" style={{ marginTop: 12 }}>
            Masukan
          </label>
          <textarea
            className="textarea"
            name={`masukan_${r.jenis}`}
            defaultValue={r.masukan ?? ''}
            placeholder="Catatan untuk peserta…"
          />
        </div>
      ))}

      {state && !state.ok && (
        <div className="banner banner-error" style={{ marginTop: 12 }}>
          <div>
            <div className="title">Gagal menyimpan</div>
            <div className="desc">{state.error}</div>
          </div>
        </div>
      )}

      <Simpan label={sudahDinilai ? 'Perbarui nilai ujian' : 'Simpan nilai ujian'} />
    </form>
  );
}

function Simpan({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary btn-block" style={{ marginTop: 16 }}>
      {pending ? 'Menyimpan…' : label}
    </button>
  );
}
