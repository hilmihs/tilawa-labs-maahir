'use client';

import { useEffect, useRef, useState } from 'react';
import { Waveform } from './icons';

/**
 * Visualisasi gelombang real-time dari MediaStream mikrofon. Membaca amplitudo
 * lewat Web Audio AnalyserNode dan menggambar bar simetris ke canvas tiap frame,
 * sehingga peserta tahu suaranya benar-benar masuk. Canvas di-render sesuai
 * devicePixelRatio supaya tajam (tidak tipis/blur saat di-stretch). Jika Web
 * Audio tidak tersedia / gagal, fallback ke <Waveform> statis lama.
 */
export function LiveWaveform({
  stream,
  paused,
  height = 60,
}: {
  stream: MediaStream | null;
  paused?: boolean;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const [failed, setFailed] = useState(false);
  const pausedRef = useRef(!!paused);

  useEffect(() => {
    pausedRef.current = !!paused;
    // Setelah layar terkunci / pindah aplikasi, browser (terutama iOS) bisa
    // men-suspend AudioContext; bangunkan lagi saat rekaman dilanjutkan agar
    // gelombang tidak diam padahal suara masuk.
    const ac = ctxRef.current;
    if (!paused && ac && ac.state === 'suspended') ac.resume().catch(() => {});
  }, [paused]);

  useEffect(() => {
    if (!stream) return;
    let analyser: AnalyserNode;
    let data: Uint8Array<ArrayBuffer>;
    try {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) throw new Error('no AudioContext');
      const ac = new AudioCtx();
      ctxRef.current = ac;
      // AudioContext yang dibuat di luar gestur pengguna bisa mulai 'suspended'.
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      const src = ac.createMediaStreamSource(stream);
      analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      src.connect(analyser);
      data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      setFailed(true);
      return;
    }

    const BARS = 24;
    const GAP = 3;
    const EASE = 0.12; // lerp factor — makin kecil makin lambat/santai
    const heights = new Array<number>(BARS).fill(0); // tinggi bar smooth (CSS px)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const c2d = canvas.getContext('2d');
      if (!c2d) return;

      // Sinkron ukuran piksel ke ukuran tampil (crisp di layar HiDPI).
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 300;
      const cssH = height;
      const pxW = Math.round(cssW * dpr);
      const pxH = Math.round(cssH * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      c2d.clearRect(0, 0, cssW, cssH);

      if (pausedRef.current) return; // freeze frame saat jeda

      analyser.getByteTimeDomainData(data);

      const barW = Math.max(2, (cssW - GAP * (BARS - 1)) / BARS);
      const step = Math.floor(data.length / BARS);
      const mid = cssH / 2;
      const accent =
        getComputedStyle(canvas).getPropertyValue('color').trim() || '#b45309';
      c2d.fillStyle = accent;
      for (let i = 0; i < BARS; i++) {
        const v = Math.abs((data[i * step] - 128) / 128);
        const target = Math.min(cssH, Math.max(3, v * cssH * 2.6));
        heights[i] += (target - heights[i]) * EASE; // ease menuju target
        const bh = heights[i];
        const x = i * (barW + GAP);
        const y = mid - bh / 2;
        const r = Math.min(barW / 2, 2);
        c2d.beginPath();
        c2d.roundRect(x, y, barW, bh, r);
        c2d.fill();
      }
    };
    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [stream, height]);

  if (failed || !stream) {
    return (
      <div className="wave rec">
        <Waveform full progress={1} height={height} />
      </div>
    );
  }

  return (
    <div className="wave rec" style={{ color: 'var(--accent-2)' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, display: 'block' }}
      />
    </div>
  );
}
