'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useRef, useState } from 'react';
import { Icon, Waveform } from '@/components/icons';
import {
  JENIS_REKAMAN_LABEL,
  type JenisRekaman,
  type NilaiRekaman,
} from '@/types/db';

// Formulir periksa setoran untuk musyrif (setoran peserta) dan syaikh
// (setoran musyrif). Turunan dari `@/components/CekForm`, dengan dua beda:
//   · jenis yang belum disetor tampil "Belum disetor" tanpa pilihan nilai —
//     dulu nilainya wajib diisi lalu UPDATE-nya kena 0 baris diam-diam;
//   · pemutar audio memberi pesan jelas bila berkas gagal dimuat.

export type CekResult =
  | { ok: true; waUrl: string }
  | { ok?: false; error: string };

type CekAction = (
  prev: CekResult | undefined,
  formData: FormData
) => Promise<CekResult>;

const JENIS_LABEL_CEK: Record<JenisRekaman, string> = {
  tuhfatul_athfal: 'Tuhfatul Athfal',
  jazariyyah: 'Al-Jazariyyah',
  syawahid: 'Asy-Syawahid',
};

export interface RekamanView {
  jenis: JenisRekaman;
  /** Ada baris rekaman untuk jenis ini (walau audionya mungkin sudah diarsip). */
  disetor: boolean;
  audioUrl: string | null;
  durationSec: number | null;
  nilai: NilaiRekaman | null;
  masukan: string | null;
}

export function CekSetoranForm({
  setoranId,
  rekamanList,
  alreadyChecked,
  action,
  backHref,
  forwardLabel = 'Kirim hasil ke peserta',
  pengirim = 'peserta',
  catatanKurang,
}: {
  setoranId: string;
  rekamanList: RekamanView[];
  alreadyChecked: boolean;
  action: CekAction;
  backHref: string;
  forwardLabel?: string;
  /** Siapa yang menyetor — dipakai di pesan "minta … merekam ulang". */
  pengirim?: 'peserta' | 'musyrif';
  /** Catatan bila setoran belum lengkap (dirakit di server: tahu batas cycle). */
  catatanKurang?: { judul: string; isi: string } | null;
}) {
  const [state, formAction] = useFormState<CekResult | undefined, FormData>(
    action,
    undefined
  );
  const [selected, setSelected] = useState<Record<JenisRekaman, NilaiRekaman | null>>(
    () =>
      Object.fromEntries(rekamanList.map((r) => [r.jenis, r.nilai])) as Record<
        JenisRekaman,
        NilaiRekaman | null
      >
  );

  const disetorList = rekamanList.filter((r) => r.disetor);
  const filledCount = disetorList.filter((r) => selected[r.jenis]).length;
  const total = disetorList.length;

  if (state?.ok) {
    return (
      <div>
        <div className="banner banner-success" style={{ marginBottom: 14 }}>
          <div className="ic" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="title">Pemeriksaan tersimpan</div>
            <div className="desc">
              Tap tombol di bawah untuk meneruskan hasil ke {pengirim} via WhatsApp.
            </div>
          </div>
        </div>
        <a href={state.waUrl} target="_blank" rel="noopener" className="btn btn-wa btn-block">
          {Icon.wa(14)} {forwardLabel}
        </a>
        <a href={backHref} className="btn btn-ghost btn-block" style={{ marginTop: 12 }}>
          Kembali ke dashboard
        </a>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="setoran_id" value={setoranId} />

      {catatanKurang && (
        <div
          className="banner"
          role="note"
          style={{
            marginBottom: 14,
            background: 'var(--kuning-tint)',
            borderColor: 'var(--kuning)',
          }}
        >
          <div>
            <div className="title">{catatanKurang.judul}</div>
            <div className="desc">{catatanKurang.isi}</div>
          </div>
        </div>
      )}

      <div className="t-small" style={{ marginBottom: 14 }}>
        {filledCount} / {total} dinilai
        {total < rekamanList.length && <> · {rekamanList.length - total} belum disetor</>}
      </div>

      {rekamanList.map((r) =>
        r.disetor ? (
          <RekamanCard
            key={r.jenis}
            rekaman={r}
            selected={selected[r.jenis]}
            setSelected={(n) =>
              setSelected((prev) => ({ ...prev, [r.jenis]: n }))
            }
            disabled={alreadyChecked}
            pengirim={pengirim}
          />
        ) : (
          <BelumDisetorCard key={r.jenis} jenis={r.jenis} />
        )
      )}

      {state?.error && (
        <div className="banner banner-error" style={{ marginTop: 12 }} role="alert">
          <div>
            <div className="title">Gagal menyimpan</div>
            <div className="desc">{state.error}</div>
          </div>
        </div>
      )}

      {alreadyChecked ? (
        <p className="t-small" style={{ fontStyle: 'italic', marginTop: 18 }}>
          Setoran ini sudah dicek dan tidak bisa diubah.
        </p>
      ) : total === 0 ? (
        <p className="t-small" style={{ fontStyle: 'italic', marginTop: 18 }}>
          Belum ada rekaman yang bisa dinilai.
        </p>
      ) : (
        <SubmitButton />
      )}
    </form>
  );
}

function BelumDisetorCard({ jenis }: { jenis: JenisRekaman }) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12, opacity: 0.75 }}>
      <div className="rec-head">
        <div className="title">{JENIS_LABEL_CEK[jenis] ?? JENIS_REKAMAN_LABEL[jenis]}</div>
        <span className="status">
          <span className="dot" /> belum disetor
        </span>
      </div>
      <p className="t-small" style={{ fontStyle: 'italic', margin: '8px 0 0' }}>
        Belum disetor — tidak ada rekaman untuk dinilai.
      </p>
    </div>
  );
}

type GagalAudio = 'hilang' | 'kedaluwarsa' | 'format' | 'lain';

const PESAN_GAGAL_AUDIO: Record<GagalAudio, (pengirim: string) => string> = {
  hilang: (p) => `File audio tidak ditemukan di server — minta ${p} merekam ulang.`,
  kedaluwarsa: () => 'Tautan audio sudah kedaluwarsa — muat ulang halaman ini.',
  format: (p) =>
    `Audio ada di server, tapi tidak bisa diputar di browser ini. Coba buka di Chrome, atau minta ${p} merekam ulang.`,
  lain: (p) =>
    `Audio gagal dimuat. Periksa koneksi lalu muat ulang halaman; bila tetap gagal, minta ${p} merekam ulang.`,
};

/**
 * Cari tahu kenapa <audio> gagal: MediaError tidak membedakan 404, tanda
 * tangan kedaluwarsa, dan format yang tak didukung. Minta satu byte saja dan
 * batalkan begitu header tiba, supaya berkas belasan MB tidak ikut terunduh.
 */
async function diagnosaAudio(url: string): Promise<GagalAudio> {
  const ctrl = new AbortController();
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    ctrl.abort();
    if (res.status === 404) return 'hilang';
    if (res.status === 403 || res.status === 401) return 'kedaluwarsa';
    if (res.ok) return 'format';
    return 'lain';
  } catch {
    return 'lain';
  }
}

function RekamanCard({
  rekaman,
  selected,
  setSelected,
  disabled,
  pengirim,
}: {
  rekaman: RekamanView;
  selected: NilaiRekaman | null;
  setSelected: (n: NilaiRekaman) => void;
  disabled: boolean;
  pengirim: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [gagal, setGagal] = useState<GagalAudio | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const diagnosaJalan = useRef(false);
  const totalSec = rekaman.durationSec ?? 0;

  function tanganiGagal() {
    setPlaying(false);
    if (diagnosaJalan.current || !rekaman.audioUrl) return;
    diagnosaJalan.current = true;
    setGagal('lain');
    void diagnosaAudio(rekaman.audioUrl).then(setGagal);
  }

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch(() => {
        // play() juga menolak untuk hal remeh (mis. dijeda cepat); hanya
        // anggap gagal bila elemen memang menyimpan galat media.
        if (a.error) tanganiGagal();
      });
    } else a.pause();
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      <div className="rec-head">
        <div className="title">{JENIS_LABEL_CEK[rekaman.jenis] ?? JENIS_REKAMAN_LABEL[rekaman.jenis]}</div>
        {selected ? (
          <span className="status done">
            <span className="dot" />
            <span className="t-mono">{formatTime(totalSec)}</span>
          </span>
        ) : (
          <span className="status">
            <span className="dot" /> belum dinilai
          </span>
        )}
      </div>

      {rekaman.audioUrl ? (
        <>
          <audio
            ref={audioRef}
            src={rekaman.audioUrl}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setPos(0);
            }}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration > 0) setPos(el.currentTime / el.duration);
            }}
            onError={tanganiGagal}
            style={{ display: 'none' }}
          />
          {gagal ? (
            <div
              className="banner banner-error"
              role="alert"
              style={{ margin: '8px 0 14px', padding: '10px 12px' }}
            >
              <div className="desc">{PESAN_GAGAL_AUDIO[gagal](pengirim)}</div>
            </div>
          ) : (
            <>
              <div className={`wave ${selected ? 'done' : ''}`}>
                <Waveform progress={pos || 0.5} height={28} />
              </div>
              <div className="rec-action" style={{ marginTop: 8, marginBottom: 12 }}>
                <button type="button" className="play" onClick={toggle} aria-label={playing ? 'Jeda' : 'Putar'}>
                  {playing ? (
                    <svg width={12} height={12} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                      <rect x="3" y="2.5" width="2.2" height="7" rx="0.6" />
                      <rect x="6.8" y="2.5" width="2.2" height="7" rx="0.6" />
                    </svg>
                  ) : (
                    Icon.play(12)
                  )}
                </button>
                <span className="time">
                  {formatTime(Math.round(pos * totalSec))} / {formatTime(totalSec)}
                </span>
              </div>
            </>
          )}
        </>
      ) : (
        <p className="t-small" style={{ fontStyle: 'italic', margin: '8px 0 14px' }}>
          Audio tidak tersedia (sudah dihapus dari arsip).
        </p>
      )}

      <label className="field-label">Nilai</label>
      <div className="nilai-grid">
        {(['hijau', 'kuning', 'merah'] as NilaiRekaman[]).map((n) => (
          <NilaiButton
            key={n}
            value={n}
            jenis={rekaman.jenis}
            selected={selected === n}
            onClick={() => setSelected(n)}
            disabled={disabled}
          />
        ))}
      </div>

      <label className="field-label" style={{ marginTop: 12 }}>
        Masukan
      </label>
      <textarea
        className="textarea"
        name={`masukan_${rekaman.jenis}`}
        defaultValue={rekaman.masukan ?? ''}
        placeholder={`Catatan untuk ${pengirim}…`}
        disabled={disabled}
      />
    </div>
  );
}

function NilaiButton({
  value,
  jenis,
  selected,
  onClick,
  disabled,
}: {
  value: NilaiRekaman;
  jenis: JenisRekaman;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <label className={`nilai ${value} ${selected ? 'on' : ''}`} style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input
        type="radio"
        name={`nilai_${jenis}`}
        value={value}
        defaultChecked={selected}
        onChange={onClick}
        disabled={disabled}
        required
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
      />
      <span className="dot" />
      {capitalize(value)}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary btn-block"
      style={{ marginTop: 16 }}
    >
      {pending ? 'Menyimpan…' : 'Simpan pemeriksaan'}
    </button>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
