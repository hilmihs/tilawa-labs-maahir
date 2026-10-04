'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useRef, useState } from 'react';
import { Icon, Waveform } from '@/components/icons';
import {
  JENIS_REKAMAN_LABEL,
  type JenisRekaman,
  type NilaiRekaman,
} from '@/types/db';

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
  audioUrl: string | null;
  durationSec: number | null;
  nilai: NilaiRekaman | null;
  masukan: string | null;
}

export function CekForm({
  setoranId,
  rekamanList,
  alreadyChecked,
  action,
  backHref = '/musyrif',
  forwardLabel = 'Kirim hasil ke peserta',
}: {
  setoranId: string;
  rekamanList: RekamanView[];
  alreadyChecked: boolean;
  action: CekAction;
  backHref?: string;
  forwardLabel?: string;
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

  const filledCount = Object.values(selected).filter(Boolean).length;
  const total = rekamanList.length;

  if (state?.ok) {
    return (
      <div>
        <div className="banner banner-success" style={{ marginBottom: 14 }}>
          <div
            className="ic"
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="title">Pemeriksaan tersimpan</div>
            <div className="desc">
              Tap tombol di bawah untuk meneruskan hasil ke peserta via WhatsApp.
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

      <div className="t-small" style={{ marginBottom: 14 }}>
        {filledCount} / {total} dinilai
      </div>

      {rekamanList.map((r) => (
        <RekamanCard
          key={r.jenis}
          rekaman={r}
          selected={selected[r.jenis]}
          setSelected={(n) =>
            setSelected((prev) => ({ ...prev, [r.jenis]: n }))
          }
          disabled={alreadyChecked}
        />
      ))}

      {state?.error && (
        <div className="banner banner-error" style={{ marginTop: 12 }}>
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
      ) : (
        <SubmitButton />
      )}
    </form>
  );
}

function RekamanCard({
  rekaman,
  selected,
  setSelected,
  disabled,
}: {
  rekaman: RekamanView;
  selected: NilaiRekaman | null;
  setSelected: (n: NilaiRekaman) => void;
  disabled: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const totalSec = rekaman.durationSec ?? 0;

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play();
    else a.pause();
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
            style={{ display: 'none' }}
          />
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
        placeholder="Catatan untuk peserta…"
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
