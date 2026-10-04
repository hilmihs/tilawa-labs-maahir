'use client';

import { useState } from 'react';
import { simpanTargetAction, hapusTargetAction, type TargetResult } from './actions';
import type { Gender } from '@/types/db';

export type VersiRow = {
  id: string;
  halamanPerBulan: number;
  berlakuLabel: string;
  catatan: string | null;
  oleh: string | null;
  pada: string;
};

export type AnggotaBaris = {
  id: string;
  name: string;
  /** Koreksi khusus peserta ini; null = ikut default kelas. */
  koreksi: number | null;
  /** Yang benar-benar berlaku hari ini (koreksi atau default). null = belum diatur. */
  efektif: number | null;
  versi: VersiRow[];
};

export type KelasBlok = {
  id: string;
  name: string;
  gender: Gender;
  defaultBerlaku: number | null;
  defaultVersi: VersiRow[];
  anggota: AnggotaBaris[];
};

/**
 * Satu form per sasaran (default kelas atau satu peserta). Sengaja tidak
 * menyimpan seluruh tabel sekaligus: tiap simpan membuat VERSI bertanggal,
 * jadi menyimpan borongan akan menerbitkan belasan versi sekaligus untuk
 * angka yang sebenarnya tak berubah.
 */
export function TargetSetoranClient({
  blok,
  defaultBerlaku,
  maxTanggal,
}: {
  blok: KelasBlok[];
  defaultBerlaku: string;
  maxTanggal: string;
}) {
  const [hasil, setHasil] = useState<TargetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [buka, setBuka] = useState<string | null>(null);

  async function simpan(kelasId: string, anggotaId: string | null, form: HTMLFormElement) {
    const fd = new FormData(form);
    fd.set('program_kelas_id', kelasId);
    fd.set('anggota_id', anggotaId ?? '');
    setBusy(true);
    setHasil(null);
    const res = await simpanTargetAction(undefined, fd);
    setHasil(res);
    setBusy(false);
  }

  async function hapus(id: string) {
    const fd = new FormData();
    fd.set('id', id);
    setBusy(true);
    setHasil(null);
    setHasil(await hapusTargetAction(undefined, fd));
    setBusy(false);
  }

  return (
    <div>
      {hasil?.error && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          <div className="desc">{hasil.error}</div>
        </div>
      )}
      {hasil?.ok && (
        <div className="banner banner-success" style={{ marginBottom: 12 }}>
          <div className="desc">Target tersimpan.</div>
        </div>
      )}

      {blok.map((k) => (
        <section key={k.id} className="card-flat" style={{ padding: 12, marginBottom: 16 }}>
          <div className="t-small" style={{ fontWeight: 600, marginBottom: 2 }}>{k.name}</div>
          <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
            {k.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} · {k.anggota.length} peserta ·{' '}
            {k.defaultBerlaku === null
              ? 'default kelas belum diatur'
              : `default kelas ${k.defaultBerlaku} hal/bln`}
          </div>

          <Baris
            label="Default seluruh kelas"
            sublabel="Dipakai peserta yang tak punya koreksi sendiri."
            nilai={k.defaultBerlaku}
            versi={k.defaultVersi}
            busy={busy}
            defaultBerlaku={defaultBerlaku}
            maxTanggal={maxTanggal}
            terbuka={buka === `${k.id}|default`}
            onToggle={() => setBuka(buka === `${k.id}|default` ? null : `${k.id}|default`)}
            onSimpan={(form) => simpan(k.id, null, form)}
            onHapus={hapus}
          />

          <div className="t-tiny" style={{ color: 'var(--muted-2)', margin: '12px 0 4px', fontWeight: 600 }}>
            KOREKSI PER PESERTA
          </div>
          {k.anggota.length === 0 ? (
            <p className="t-tiny" style={{ color: 'var(--muted-2)' }}>Belum ada peserta aktif.</p>
          ) : (
            k.anggota.map((a) => (
              <Baris
                key={a.id}
                label={a.name}
                sublabel={
                  a.koreksi !== null
                    ? `koreksi ${a.koreksi} hal/bln`
                    : a.efektif !== null
                      ? `ikut default (${a.efektif} hal/bln)`
                      : 'belum ada target'
                }
                nilai={a.koreksi}
                versi={a.versi}
                busy={busy}
                defaultBerlaku={defaultBerlaku}
                maxTanggal={maxTanggal}
                terbuka={buka === `${k.id}|${a.id}`}
                onToggle={() => setBuka(buka === `${k.id}|${a.id}` ? null : `${k.id}|${a.id}`)}
                onSimpan={(form) => simpan(k.id, a.id, form)}
                onHapus={hapus}
              />
            ))
          )}
        </section>
      ))}
    </div>
  );
}

function Baris({
  label,
  sublabel,
  nilai,
  versi,
  busy,
  defaultBerlaku,
  maxTanggal,
  terbuka,
  onToggle,
  onSimpan,
  onHapus,
}: {
  label: string;
  sublabel: string;
  nilai: number | null;
  versi: VersiRow[];
  busy: boolean;
  defaultBerlaku: string;
  maxTanggal: string;
  terbuka: boolean;
  onToggle: () => void;
  onSimpan: (form: HTMLFormElement) => void;
  onHapus: (id: string) => void;
}) {
  return (
    <div style={{ borderTop: '1px solid var(--surface-3)', padding: '8px 0' }}>
      <div className="section-row" style={{ alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="t-small" style={{ fontWeight: nilai !== null ? 600 : 400 }}>{label}</div>
          <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>{sublabel}</div>
        </div>
        <button type="button" className="btn btn-xs btn-ghost" onClick={onToggle} disabled={busy}>
          {terbuka ? 'Tutup' : nilai === null ? 'Atur' : 'Ubah'}
          {versi.length > 0 ? ` · ${versi.length} versi` : ''}
        </button>
      </div>

      {terbuka && (
        <div style={{ marginTop: 8 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSimpan(e.currentTarget);
            }}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
          >
            <div style={{ flex: '0 1 130px' }}>
              <label className="t-tiny" style={{ display: 'block', marginBottom: 2 }}>Halaman/bulan</label>
              <input
                type="text"
                inputMode="decimal"
                name="halaman_per_bulan"
                defaultValue={nilai ?? ''}
                placeholder="mis. 80 atau 32"
                className="input"
                style={{ height: 34 }}
                required
              />
            </div>
            <div style={{ flex: '0 1 160px' }}>
              <label className="t-tiny" style={{ display: 'block', marginBottom: 2 }}>Berlaku mulai</label>
              <input
                type="date"
                name="berlaku_mulai"
                defaultValue={defaultBerlaku}
                max={maxTanggal}
                className="input"
                style={{ height: 34 }}
                required
              />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label className="t-tiny" style={{ display: 'block', marginBottom: 2 }}>Catatan (opsional)</label>
              <input type="text" name="catatan" className="input" style={{ height: 34 }} />
            </div>
            <button type="submit" className="btn btn-sm btn-primary" style={{ height: 34 }} disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan versi'}
            </button>
          </form>

          {versi.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {versi.map((v) => (
                <div
                  key={v.id}
                  className="section-row t-tiny"
                  style={{ alignItems: 'center', gap: 8, padding: '3px 0', color: 'var(--muted-2)' }}
                >
                  <span>
                    <strong style={{ color: 'var(--ink)' }}>{v.halamanPerBulan} hal/bln</strong>{' '}
                    sejak {v.berlakuLabel}
                    {v.catatan ? ` · ${v.catatan}` : ''} · {v.oleh || '—'} · {v.pada}
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    disabled={busy}
                    onClick={() => onHapus(v.id)}
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
