'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, Waveform } from './icons';
import { LiveWaveform } from './LiveWaveform';
import {
  deletePartialRecording,
  loadPartialRecording,
  savePartialRecording,
} from '@/lib/recording-cache';

const DEFAULT_MAX_DURATION_SEC = 30 * 60;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// MediaRecorder menyerahkan potongan data tiap detik (bukan hanya saat stop),
// jadi rekaman bisa disimpan sebagian ke perangkat selama berjalan.
const TIMESLICE_MS = 1000;
// Jarak antar-simpan draf sebagian ke IndexedDB selama merekam.
const PARTIAL_SAVE_INTERVAL_MS = 10_000;
// Rekaman lebih pendek dari ini minta konfirmasi sebelum dihentikan
// (banyak rekaman < 30 detik di prod akibat tombol selesai tak sengaja).
const MIN_CONFIRM_SEC = 60;

// Ekstensi audio yang diterima saat MIME type kosong/tidak dikenal (umum di
// iPadOS/iOS: file dari app Files sering punya file.type = '').
const AUDIO_EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
  caf: 'audio/x-caf',
  amr: 'audio/amr',
  '3gp': 'audio/3gpp',
};

function audioExt(name: string): string | null {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m && m[1] in AUDIO_EXT_MIME ? m[1] : null;
}

export type UploadStatus = 'mengirim' | 'gagal' | 'terkirim' | null;

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; startedAt: number; base: number }
  // `auto` = dijeda otomatis karena layar terkunci / pindah aplikasi.
  | { kind: 'paused'; auto: boolean }
  | { kind: 'recorded'; blob: Blob | null; url: string; durationSec: number };

// Rekaman sebagian yang menunggu keputusan peserta (pakai / buang):
// - 'terputus'  : mikrofon terputus di tengah rekaman (mis. HP terkunci lama)
// - 'dipulihkan': draf berkala dari sesi sebelumnya (tab dimatikan sistem)
type Pending = {
  blob: Blob;
  url: string;
  durationSec: number;
  savedAt: number;
  reason: 'terputus' | 'dipulihkan';
};

export function AudioRecorder({
  label,
  onChange,
  disabled,
  submitted,
  initialRecording,
  initialAudioUrl,
  initialDurationSec,
  maxDurationSec = DEFAULT_MAX_DURATION_SEC,
  uploadStatus,
  uploadError,
  onRetryUpload,
  initialRecordingSavedAt,
  initialAudioRecordedAt,
  draftKey,
}: {
  label: string;
  onChange: (blob: Blob | null, durationSec: number | null) => void;
  disabled?: boolean;
  submitted?: boolean;
  initialRecording?: { blob: Blob; durationSec: number };
  // Rekaman yang sudah tersimpan di server — dipulihkan untuk diputar.
  // Tidak memicu onChange (sudah ada di server, jangan auto-submit ulang).
  initialAudioUrl?: string;
  initialDurationSec?: number;
  // Limit durasi maksimal rekaman (detik). Default 30 menit.
  maxDurationSec?: number;
  // Status kirim rekaman ini ke server, dikelola parent. null/undefined =
  // baru tersimpan di perangkat, belum dikonfirmasi server.
  uploadStatus?: UploadStatus;
  // Pesan galat yang ditampilkan saat uploadStatus === 'gagal'.
  uploadError?: string | null;
  // Tombol "Kirim ulang" saat uploadStatus === 'gagal'.
  onRetryUpload?: () => void;
  // ms epoch kapan draf IndexedDB (`initialRecording`) disimpan, bila diketahui.
  initialRecordingSavedAt?: number | null;
  // Waktu ISO rekaman server (`initialAudioUrl`) dibuat, bila diketahui.
  initialAudioRecordedAt?: string | null;
  // Kunci draf sebagian di IndexedDB (mis. `${cacheKey}/${jenis}`). Bila
  // kosong dipakai `${pathname}|${label}`.
  draftKey?: string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [mode, setMode] = useState<'rec' | 'upload'>('rec');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playPos, setPlayPos] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  // null = belum dicoba; true = layar dijaga menyala; false = tak didukung/gagal.
  const [wakeLockOk, setWakeLockOk] = useState<boolean | null>(null);
  // Draf lokal dipilih mengalahkan rekaman server (hidrasi). Selama aktif,
  // `submitted` dari parent TIDAK dianggap "terkirim" — yang tampil draf baru
  // yang belum sampai server. `submittedWas` = nilai `submitted` saat itu;
  // begitu parent mengubahnya (atau uploadStatus 'terkirim'), penanda gugur.
  const [draftOverServer, setDraftOverServer] = useState<{ submittedWas: boolean } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const elapsedRef = useRef(0);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const mimeRef = useRef('audio/webm');
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // Antrean operasi draf sebagian → simpan & hapus selalu berurutan, jadi
  // simpanan berkala yang telat tidak "menghidupkan" lagi draf yang sudah dihapus.
  const partialQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveQueuedRef = useRef(false);
  const lastPartialSaveRef = useRef(0);
  const forceSaveRef = useRef(false);
  const sessionCounterRef = useRef(0);
  const activeSessionRef = useRef<number | null>(null);
  // true → onstop berikutnya bukan "selesai" normal: simpan sebagai rekaman
  // terputus (tunggu keputusan peserta), jangan langsung onChange/kirim.
  const interruptedRef = useRef(false);
  const unmountedRef = useRef(false);
  // Peserta sudah berinteraksi (rekam/hapus/upload) → hidrasi susulan dilarang.
  const touchedRef = useRef(false);

  // Cermin nilai terbaru untuk dipakai di handler/effect ber-deps kosong.
  const stateRef = useRef(state);
  stateRef.current = state;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const hydratedRef = useRef<null | 'draft' | 'server'>(null);

  // Draf lokal yang lebih baru dari rekaman server menang; "terkirim" hanya
  // bila parent benar-benar mengonfirmasi (uploadStatus/submitted).
  const draftMenang =
    draftOverServer !== null &&
    uploadStatus !== 'terkirim' &&
    !!submitted === draftOverServer.submittedWas;
  const sent = uploadStatus === 'terkirim' || (!!submitted && !draftMenang);

  function partialKey(): string {
    if (draftKey) return draftKey;
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    return `${path}|${label}`;
  }

  function enqueuePartial(op: () => Promise<unknown>) {
    partialQueueRef.current = partialQueueRef.current.catch(() => {}).then(op);
  }

  // Jadwalkan simpan draf sebagian. Kalau sudah ada yang antre, cukup itu —
  // ia membaca potongan terbaru saat dieksekusi.
  function schedulePartialSave() {
    lastPartialSaveRef.current = Date.now();
    const session = activeSessionRef.current;
    if (session === null || saveQueuedRef.current) return;
    saveQueuedRef.current = true;
    const key = partialKey();
    enqueuePartial(async () => {
      saveQueuedRef.current = false;
      // Rekaman sudah final/terputus sejak dijadwalkan → jangan tulis lagi.
      if (activeSessionRef.current !== session) return;
      const chunks = chunksRef.current;
      if (chunks.length === 0) return;
      await savePartialRecording(
        key,
        new Blob(chunks, { type: mimeRef.current }),
        Math.max(1, elapsedRef.current)
      );
    });
  }

  function discardPendingSilently() {
    const p = pendingRef.current;
    if (!p) return;
    URL.revokeObjectURL(p.url);
    pendingRef.current = null;
    setPending(null);
    const key = partialKey();
    enqueuePartial(() => deletePartialRecording(key));
  }

  // --- Wake Lock: jaga layar tetap menyala selama merekam -----------------
  async function acquireWakeLock() {
    try {
      if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || !navigator.wakeLock) {
        setWakeLockOk(false);
        return;
      }
      if (document.visibilityState !== 'visible') return;
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        setWakeLockOk(true);
        return;
      }
      const sentinel = await navigator.wakeLock.request('screen');
      // Selama menunggu, rekaman bisa sudah dijeda/berhenti.
      const rec = recorderRef.current;
      if (!rec || rec.state !== 'recording') {
        sentinel.release().catch(() => {});
        return;
      }
      wakeLockRef.current = sentinel;
      setWakeLockOk(true);
      sentinel.addEventListener('release', () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
      });
    } catch {
      setWakeLockOk(false);
    }
  }

  function releaseWakeLock() {
    const s = wakeLockRef.current;
    wakeLockRef.current = null;
    if (s && !s.released) s.release().catch(() => {});
  }

  // Hidrasi rekaman awal. `initialRecording` datang ASYNC dari cache IndexedDB
  // (loadRecordings di parent), sedangkan `initialAudioUrl` (server) sudah ada
  // sejak render pertama. Jadi rekaman server bisa terpasang duluan, lalu draf
  // datang menyusul. Bila draf itu lebih baru (rekam ulang yang gagal terkirim),
  // draf menggantikan rekaman server — asalkan peserta belum menyentuh apa pun.
  useEffect(() => {
    const s = stateRef.current;
    const serverMs = initialAudioRecordedAt ? Date.parse(initialAudioRecordedAt) : NaN;
    const draftLebihBaru =
      !!initialRecording &&
      (Number.isNaN(serverMs) ||
        (initialRecordingSavedAt != null && initialRecordingSavedAt > serverMs));

    function pasangDraf(rec: { blob: Blob; durationSec: number }, gantikanServer: boolean) {
      hydratedRef.current = 'draft';
      const url = URL.createObjectURL(rec.blob);
      setState({ kind: 'recorded', blob: rec.blob, url, durationSec: rec.durationSec });
      setDraftOverServer(gantikanServer ? { submittedWas: !!submitted } : null);
      onChangeRef.current(rec.blob, rec.durationSec);
    }

    if (hydratedRef.current === null && s.kind === 'idle') {
      if (initialRecording && (!initialAudioUrl || draftLebihBaru)) {
        pasangDraf(initialRecording, !!initialAudioUrl);
      } else if (initialAudioUrl) {
        // Sudah tersimpan di server — tampilkan untuk diputar, JANGAN panggil onChange.
        hydratedRef.current = 'server';
        setState({ kind: 'recorded', blob: null, url: initialAudioUrl, durationSec: initialDurationSec ?? 0 });
      }
      return;
    }

    // Hidrasi susulan: rekaman server sudah tampil, draf lebih baru baru tiba.
    if (
      hydratedRef.current === 'server' &&
      !touchedRef.current &&
      s.kind === 'recorded' &&
      s.blob === null &&
      initialRecording &&
      draftLebihBaru
    ) {
      audioRef.current?.pause();
      setPlaying(false);
      setPlayPos(0);
      pasangDraf(initialRecording, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecording, initialAudioUrl, initialDurationSec, initialRecordingSavedAt, initialAudioRecordedAt]);

  // Penanda "draf menang" gugur begitu parent mengonfirmasi status baru.
  useEffect(() => {
    if (!draftOverServer) return;
    if (uploadStatus === 'terkirim' || !!submitted !== draftOverServer.submittedWas) {
      setDraftOverServer(null);
    }
  }, [uploadStatus, submitted, draftOverServer]);

  // Pulihkan draf sebagian dari sesi sebelumnya (tab dimatikan saat merekam).
  useEffect(() => {
    let cancelled = false;
    const key = partialKey();
    loadPartialRecording(key).then((p) => {
      if (cancelled || !p) return;
      const s = stateRef.current;
      if (s.kind === 'recording' || s.kind === 'paused' || pendingRef.current) return;
      const next: Pending = { ...p, url: URL.createObjectURL(p.blob), reason: 'dipulihkan' };
      pendingRef.current = next;
      setPending(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, label]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      const rec = recorderRef.current;
      // Rekaman masih jalan saat komponen dilepas (pindah halaman) → hentikan;
      // onstop menyimpannya sebagai draf sebagian, bisa dipulihkan nanti.
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          /* abaikan */
        }
      }
      stopStream();
      releaseWakeLock();
      if (tickRef.current) window.clearInterval(tickRef.current);
      const s = stateRef.current;
      // Rekaman server bukan objectURL — jangan di-revoke.
      if (s.kind === 'recorded' && s.blob) URL.revokeObjectURL(s.url);
      if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Layar terkunci / pindah aplikasi (mis. keluar untuk sholat saat adzan):
  // rekaman DIJEDA (bukan dihentikan) dan potongan terakhir disimpan ke
  // perangkat. Saat kembali, peserta melihat status jeda dan bisa melanjutkan.
  // Browser tanpa pause() → perilaku lama: hentikan & finalkan.
  // Handler dipanggil lewat ref supaya selalu memakai closure terbaru.
  const onVisibilityRef = useRef<() => void>(() => {});
  onVisibilityRef.current = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (document.visibilityState === 'hidden') {
      if (rec.state === 'recording') {
        if (typeof rec.pause === 'function') pause(true);
        else stop();
      } else if (rec.state === 'paused') {
        schedulePartialSave();
      }
    } else if (rec.state === 'paused' && streamEnded()) {
      // Sistem mematikan mikrofon selama di latar belakang — rekaman tak bisa
      // dilanjutkan. Simpan yang sudah ada sebagai rekaman terputus.
      interruptedRef.current = true;
      stop();
    }
  };
  const onBeforeUnloadRef = useRef<(e: BeforeUnloadEvent) => void>(() => {});
  onBeforeUnloadRef.current = (e) => {
    const rec = recorderRef.current;
    const recording = !!rec && rec.state !== 'inactive';
    const s = stateRef.current;
    const unsent = s.kind === 'recorded' && s.blob !== null && !sent;
    if (recording) schedulePartialSave();
    if (recording || unsent || uploadStatus === 'mengirim') {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  useEffect(() => {
    const onVisibility = () => onVisibilityRef.current();
    const onBeforeUnload = (e: BeforeUnloadEvent) => onBeforeUnloadRef.current(e);
    const onPageHide = () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        try {
          if (rec.state === 'recording') {
            forceSaveRef.current = true;
            rec.requestData();
          }
        } catch {
          /* abaikan */
        }
        schedulePartialSave();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function streamEnded(): boolean {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    return tracks.length === 0 || tracks.some((t) => t.readyState === 'ended');
  }

  function startTick(startedAt: number, base: number) {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      const total = base + Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(total);
      elapsedRef.current = total;
      if (total >= maxDurationSec) stop();
    }, 250);
  }

  function clearTick() {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function start() {
    if (
      pendingRef.current &&
      !window.confirm('Ada rekaman terputus yang belum dipakai. Mulai rekam baru akan membuangnya. Lanjutkan?')
    ) {
      return;
    }
    setError(null);
    touchedRef.current = true;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      discardPendingSilently();
      streamRef.current = stream;
      mimeRef.current = rec.mimeType || mime || 'audio/webm';
      chunksRef.current = [];
      interruptedRef.current = false;
      forceSaveRef.current = false;
      saveQueuedRef.current = false;
      const session = ++sessionCounterRef.current;
      activeSessionRef.current = session;
      lastPartialSaveRef.current = Date.now();

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        if (
          forceSaveRef.current ||
          Date.now() - lastPartialSaveRef.current >= PARTIAL_SAVE_INTERVAL_MS
        ) {
          forceSaveRef.current = false;
          schedulePartialSave();
        }
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || mimeRef.current || 'audio/webm',
        });
        const durationSec = Math.max(1, elapsedRef.current);
        const key = partialKey();
        if (recorderRef.current === rec) recorderRef.current = null;
        activeSessionRef.current = null;
        clearTick();
        stopStream();
        releaseWakeLock();

        if (blob.size === 0) {
          enqueuePartial(() => deletePartialRecording(key));
          if (unmountedRef.current) return;
          interruptedRef.current = false;
          setState({ kind: 'idle' });
          setError('Rekaman kosong — mikrofon tidak menangkap suara. Silakan rekam ulang.');
          return;
        }

        if (unmountedRef.current || interruptedRef.current) {
          interruptedRef.current = false;
          // Simpan versi lengkapnya sebagai draf sebagian; peserta memutuskan.
          enqueuePartial(() => savePartialRecording(key, blob, durationSec));
          if (unmountedRef.current) return;
          const next: Pending = {
            blob,
            url: URL.createObjectURL(blob),
            durationSec,
            savedAt: Date.now(),
            reason: 'terputus',
          };
          if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url);
          pendingRef.current = next;
          setPending(next);
          setState({ kind: 'idle' });
          return;
        }

        const url = URL.createObjectURL(blob);
        setState({ kind: 'recorded', blob, url, durationSec });
        onChangeRef.current(blob, durationSec);
        // Rekaman final sudah diserahkan ke parent (yang menyimpan drafnya
        // sendiri) → draf sebagian tidak diperlukan lagi.
        enqueuePartial(() => deletePartialRecording(key));
      };
      rec.onerror = () => {
        interruptedRef.current = true;
        stop();
      };
      stream.getAudioTracks().forEach((t) =>
        t.addEventListener('ended', () => {
          // Mikrofon diambil alih (telepon masuk) / dimatikan sistem.
          if (recorderRef.current === rec && rec.state !== 'inactive') {
            interruptedRef.current = true;
            stop();
          }
        })
      );

      recorderRef.current = rec;
      try {
        rec.start(TIMESLICE_MS);
      } catch {
        rec.start();
      }
      const startedAt = Date.now();
      elapsedRef.current = 0;
      setElapsed(0);
      setState({ kind: 'recording', startedAt, base: 0 });
      startTick(startedAt, 0);
      void acquireWakeLock();
    } catch (e: unknown) {
      stream?.getTracks().forEach((t) => t.stop());
      if (streamRef.current === stream) streamRef.current = null;
      recorderRef.current = null;
      activeSessionRef.current = null;
      const name = (e as { name?: string } | null)?.name;
      setError(
        name === 'NotAllowedError'
          ? 'Izin mikrofon ditolak. Aktifkan di pengaturan browser.'
          : 'Tidak bisa mengakses mikrofon.'
      );
    }
  }

  function pause(auto = false) {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording') return;
    // Minta potongan terakhir lalu simpan ke perangkat (lihat ondataavailable).
    try {
      forceSaveRef.current = true;
      rec.requestData();
    } catch {
      /* abaikan */
    }
    rec.pause();
    clearTick();
    setState({ kind: 'paused', auto });
    releaseWakeLock();
  }

  function resume() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'paused') return;
    if (streamEnded()) {
      interruptedRef.current = true;
      stop();
      return;
    }
    rec.resume();
    const startedAt = Date.now();
    const base = elapsedRef.current;
    setState({ kind: 'recording', startedAt, base });
    startTick(startedAt, base);
    void acquireWakeLock();
  }

  function stop() {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        if (rec.state === 'paused') rec.resume();
      } catch {
        /* mikrofon sudah mati → resume bisa gagal; tetap hentikan di bawah */
      }
      try {
        rec.stop();
      } catch {
        // Recorder sudah mati tanpa onstop → bereskan mikrofon & kunci layar.
        stopStream();
        releaseWakeLock();
      }
    }
    clearTick();
  }

  // Tombol "selesai": rekaman pendek minta konfirmasi (sering tak sengaja).
  function requestStop() {
    const secs = elapsedRef.current;
    if (
      secs < MIN_CONFIRM_SEC &&
      !window.confirm(
        `Rekaman baru ${secs} detik. Yakin sudah selesai?\n\nTekan "Batal" untuk melanjutkan merekam.`
      )
    ) {
      return;
    }
    stop();
  }

  function reset() {
    touchedRef.current = true;
    audioRef.current?.pause();
    setPlaying(false);
    setPlayPos(0);
    // Rekaman server (initialAudioUrl) bukan objectURL — jangan di-revoke.
    if (state.kind === 'recorded' && state.blob) URL.revokeObjectURL(state.url);
    setState({ kind: 'idle' });
    setDraftOverServer(null);
    setElapsed(0);
    elapsedRef.current = 0;
    onChangeRef.current(null, null);
    if (uploadRef.current) uploadRef.current.value = '';
  }

  // Rekam ulang. Untuk rekaman yang sudah terkirim, konfirmasi dulu karena
  // rekaman lama di server akan tergantikan saat rekaman baru dikirim.
  function reRecord() {
    if (
      sent &&
      typeof window !== 'undefined' &&
      !window.confirm('Rekaman ini sudah terkirim. Rekam ulang akan menggantikan rekaman sebelumnya. Lanjutkan?')
    ) {
      return;
    }
    reset();
  }

  function pakaiRekamanTerputus() {
    const p = pendingRef.current;
    if (!p) return;
    const s = stateRef.current;
    if (s.kind === 'recording' || s.kind === 'paused') return;
    if (
      s.kind === 'recorded' &&
      sent &&
      !window.confirm('Rekaman yang sudah terkirim akan digantikan rekaman ini. Lanjutkan?')
    ) {
      return;
    }
    touchedRef.current = true;
    if (s.kind === 'recorded') {
      audioRef.current?.pause();
      setPlaying(false);
      setPlayPos(0);
      if (s.blob) URL.revokeObjectURL(s.url);
      // Sama seperti rekam ulang: lepas rekaman lama dulu di parent.
      onChangeRef.current(null, null);
    }
    setError(null);
    setDraftOverServer(null);
    pendingRef.current = null;
    setPending(null);
    // objectURL kini dimiliki state 'recorded' — jangan di-revoke di sini.
    setState({ kind: 'recorded', blob: p.blob, url: p.url, durationSec: p.durationSec });
    onChangeRef.current(p.blob, p.durationSec);
    const key = partialKey();
    enqueuePartial(() => deletePartialRecording(key));
  }

  function buangRekamanTerputus() {
    if (!window.confirm('Buang rekaman terputus ini? Rekaman tidak bisa dikembalikan.')) return;
    discardPendingSilently();
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play();
    else a.pause();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // iPadOS/iOS sering kasih file.type kosong untuk file dari Files — fallback
    // ke ekstensi nama supaya mp3/m4a hasil rekam iPad tetap bisa di-upload.
    const ext = audioExt(file.name);
    const isAudio = file.type.startsWith('audio/') || ext !== null;
    if (!isAudio) {
      setError('Hanya file audio yang didukung (mp3, m4a, ogg, webm, wav).');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Ukuran file maks 25 MB.');
      return;
    }
    setError(null);
    touchedRef.current = true;
    // Tentukan content-type: pakai file.type bila valid audio, jika tidak tebak
    // dari ekstensi (default audio/mpeg untuk .mp3) supaya playback benar.
    const contentType = file.type.startsWith('audio/')
      ? file.type
      : (ext ? AUDIO_EXT_MIME[ext] : 'audio/mpeg');
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    const duration = await new Promise<number>((resolve) => {
      audio.onloadedmetadata = () => resolve(audio.duration || 0);
      audio.onerror = () => resolve(0);
    });
    const durationSec = Math.max(1, Math.round(duration));
    const blob = new Blob([await file.arrayBuffer()], { type: contentType });
    setDraftOverServer(null);
    setState({ kind: 'recorded', blob, url, durationSec });
    onChangeRef.current(blob, durationSec);
  }

  const live = state.kind === 'recording' || state.kind === 'paused';

  return (
    <div className={live ? 'rec rec-live' : 'rec'}>
      <div className="rec-head">
        <div className="title">{label}</div>
        <Status
          state={state.kind}
          elapsed={elapsed}
          durationSec={state.kind === 'recorded' ? state.durationSec : 0}
          sent={sent}
          uploadStatus={uploadStatus ?? null}
          localOnly={state.kind === 'recorded' && state.blob !== null}
        />
      </div>

      {error && (
        <p style={{ color: live ? '#F2A38F' : 'var(--merah-ink)', fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}

      {pending && !live && (
        <div
          role="alert"
          style={{
            background: 'var(--kuning-tint)',
            border: '1px solid var(--kuning-line)',
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--kuning-ink)', margin: 0 }}>
            {pending.reason === 'terputus'
              ? 'Rekaman terhenti di tengah jalan'
              : 'Ada rekaman yang belum selesai'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--kuning-ink)', margin: '2px 0 8px' }}>
            {pending.reason === 'terputus'
              ? 'Mikrofon terputus (layar terkunci terlalu lama, pindah aplikasi, atau ada telepon). '
              : 'Halaman tertutup saat merekam. '}
            Rekaman sebagian · {formatTime(pending.durationSec)}
            {pending.savedAt ? ` · ${formatWaktu(pending.savedAt)}` : ''}. Dengarkan dulu, lalu pilih
            pakai atau buang.
          </p>
          <audio
            controls
            preload="metadata"
            src={pending.url}
            style={{ width: '100%', height: 36, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={pakaiRekamanTerputus}
              disabled={uploadStatus === 'mengirim' || (!!disabled && !submitted)}
            >
              Pakai rekaman ini
            </button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={buangRekamanTerputus}>
              Buang
            </button>
            <a
              href={pending.url}
              download={downloadName(`${label}-sebagian`, pending.blob.type)}
              className="redo"
              style={{ textDecoration: 'none', fontSize: 11, marginLeft: 'auto' }}
            >
              ↓ unduh
            </a>
          </div>
        </div>
      )}

      {state.kind === 'idle' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setMode('rec')}
              className={mode === 'rec' ? 'btn btn-soft btn-xs active' : 'btn btn-ghost btn-xs'}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              {Icon.mic(12)} Rekam
            </button>
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={mode === 'upload' ? 'btn btn-soft btn-xs active' : 'btn btn-ghost btn-xs'}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              ↑ Upload
            </button>
          </div>
          {mode === 'rec' ? (
            <button
              type="button"
              onClick={start}
              disabled={disabled}
              className="rec-start"
            >
              <span className="ic">{Icon.mic(16)}</span>
              <span className="txt">Mulai rekam</span>
              <span className="hint">maks {Math.round(maxDurationSec / 60)} min</span>
            </button>
          ) : (
            <div>
              <input
                ref={uploadRef}
                type="file"
                // Ekstensi eksplisit selain audio/* — iPadOS Files mem-grey-out
                // file (mis. .mp3 dari app) bila hanya audio/*; daftar ekstensi
                // bikin file bisa dipilih.
                accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.webm,.caf,.mp4,.amr,.3gp"
                disabled={disabled}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                id={`upload-${label.replace(/\s+/g, '-')}`}
              />
              <label
                htmlFor={`upload-${label.replace(/\s+/g, '-')}`}
                className="rec-start"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span className="ic">↑</span>
                <span className="txt">Pilih file audio</span>
                <span className="hint">maks 25 MB · mp3, m4a, ogg</span>
              </label>
            </div>
          )}
        </div>
      )}

      {live && (
        <div>
          <LiveWaveform stream={streamRef.current} paused={state.kind === 'paused'} height={60} />
          <div className="rec-action">
            <button
              type="button"
              className="play"
              onClick={requestStop}
              style={{ background: 'var(--merah)' }}
              aria-label="Selesai merekam"
            >
              <span style={{ width: 10, height: 10, background: '#fff', borderRadius: 2, display: 'inline-block' }} />
            </button>
            <span className="time">{formatTime(elapsed)}</span>
            {state.kind === 'recording' ? (
              <button type="button" className="stop" onClick={() => pause(false)} aria-label="Jeda">
                ⏸ jeda
              </button>
            ) : (
              <button type="button" className="stop" onClick={resume} aria-label="Lanjut rekam">
                ▶ lanjut
              </button>
            )}
            <button type="button" className="stop" onClick={requestStop} style={{ marginLeft: 4 }}>
              ■ selesai
            </button>
          </div>
          {state.kind === 'paused' && state.auto ? (
            <p role="status" style={{ fontSize: 12, color: 'var(--emas)', margin: '8px 0 0', lineHeight: 1.45 }}>
              Rekaman dijeda otomatis karena layar terkunci atau pindah aplikasi. Rekaman sejauh ini
              aman — tekan <b>▶ lanjut</b> untuk meneruskan, atau <b>■ selesai</b> bila sudah.
            </p>
          ) : state.kind === 'recording' ? (
            <p style={{ fontSize: 11, color: 'var(--forest-ink)', opacity: 0.8, margin: '8px 0 0' }}>
              {wakeLockOk
                ? 'Layar dijaga tetap menyala selama merekam. Jangan pindah aplikasi.'
                : 'Jangan kunci layar atau pindah aplikasi selama merekam.'}
            </p>
          ) : null}
        </div>
      )}

      {state.kind === 'recorded' && (
        <div>
          <audio
            ref={audioRef}
            src={state.url}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setPlayPos(0); }}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration > 0) setPlayPos(el.currentTime / el.duration);
            }}
            style={{ display: 'none' }}
          />
          <div className="wave done">
            <Waveform progress={playPos || 1} height={36} />
          </div>
          <div className="rec-action">
            <button
              type="button"
              className="play"
              onClick={togglePlay}
              aria-label={playing ? 'Jeda' : 'Putar'}
            >
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
              {formatTime(Math.round(playPos * state.durationSec))} / {formatTime(state.durationSec)}
            </span>
            <a
              href={state.url}
              download={downloadName(label, state.blob?.type ?? 'audio/webm')}
              className="redo"
              style={{ textDecoration: 'none' }}
              title="Unduh rekaman ke perangkat"
            >
              ↓ unduh
            </a>
            <button
              type="button"
              className="redo"
              onClick={reRecord}
              // Saat sudah terkirim, tombol tetap aktif (disabled di-set true oleh
              // parent justru karena status 'terkirim') agar bisa rekam ulang.
              disabled={!(submitted || sent) && disabled}
            >
              {Icon.redo()} rekam ulang
            </button>
          </div>
          <StatusKirim
            sent={sent}
            uploadStatus={uploadStatus ?? null}
            uploadError={uploadError ?? null}
            onRetryUpload={onRetryUpload}
            retryDisabled={!!disabled}
            localOnly={state.blob !== null}
          />
        </div>
      )}
    </div>
  );
}

// Status kirim yang jujur: "terkirim" HANYA bila server sudah mengonfirmasi.
function StatusKirim({
  sent,
  uploadStatus,
  uploadError,
  onRetryUpload,
  retryDisabled,
  localOnly,
}: {
  sent: boolean;
  uploadStatus: UploadStatus;
  uploadError: string | null;
  onRetryUpload?: () => void;
  retryDisabled: boolean;
  localOnly: boolean;
}) {
  if (sent) {
    return (
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--hijau-ink)', margin: '6px 0 0' }}>
        ✓ Terkirim ke server
      </p>
    );
  }
  if (uploadStatus === 'mengirim') {
    return (
      <p
        role="status"
        aria-live="polite"
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--kuning-ink)',
          margin: '6px 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Spinner /> Mengirim… jangan tutup atau kunci layar.
      </p>
    );
  }
  if (uploadStatus === 'gagal') {
    return (
      <div role="alert" style={{ margin: '6px 0 0' }}>
        <p style={{ fontSize: 11, color: 'var(--merah-ink)', margin: 0, lineHeight: 1.45 }}>
          <b>✕ Gagal terkirim</b>
          {uploadError ? ` — ${uploadError}` : '. Rekaman masih tersimpan di perangkat ini.'}
        </p>
        {onRetryUpload && (
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={onRetryUpload}
            disabled={retryDisabled}
            style={{ marginTop: 6 }}
          >
            ↻ Kirim ulang
          </button>
        )}
      </div>
    );
  }
  // Rekaman dari server tanpa konfirmasi parent: jangan klaim apa-apa.
  if (!localOnly) return null;
  return (
    <p style={{ fontSize: 11, color: 'var(--kuning-ink)', margin: '6px 0 0' }}>
      ● Tersimpan di perangkat ini — belum terkirim.
    </p>
  );
}

function Spinner() {
  return (
    <svg className="spin" width={12} height={12} viewBox="0 0 12 12" aria-hidden>
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.6" />
      <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Status({
  state,
  elapsed,
  durationSec,
  sent,
  uploadStatus,
  localOnly,
}: {
  state: 'idle' | 'recording' | 'paused' | 'recorded';
  elapsed: number;
  durationSec: number;
  sent: boolean;
  uploadStatus: UploadStatus;
  localOnly: boolean;
}) {
  if (state === 'recording') {
    return (
      <span className="status rec">
        <span className="dot" />
        <span className="t-mono">{formatTime(elapsed)}</span>
      </span>
    );
  }
  if (state === 'paused') {
    return (
      <span className="status paused">
        <span className="dot" />
        <span className="t-mono">{formatTime(elapsed)} (jeda)</span>
      </span>
    );
  }
  if (state === 'recorded') {
    if (sent) {
      return (
        <span className="status done">
          <span style={{ fontSize: 11 }}>✓ terkirim</span>
        </span>
      );
    }
    if (uploadStatus === 'mengirim') {
      return (
        <span className="status paused">
          <Spinner />
          <span style={{ fontSize: 11 }}>mengirim…</span>
        </span>
      );
    }
    if (uploadStatus === 'gagal') {
      return (
        <span className="status" style={{ color: 'var(--merah-ink)' }}>
          <span className="dot" style={{ background: 'var(--merah)' }} />
          <span style={{ fontSize: 11 }}>gagal kirim</span>
        </span>
      );
    }
    // Rekaman lokal yang belum terkirim → kuning, bukan hijau.
    return (
      <span className={localOnly ? 'status paused' : 'status done'}>
        <span className="dot" />
        <span className="t-mono">{formatTime(durationSec)}</span>
      </span>
    );
  }
  return (
    <span className="status">
      <span className="dot" /> belum direkam
    </span>
  );
}

function downloadName(label: string, mime: string): string {
  const slug = label.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  let ext = 'webm';
  if (mime.includes('mp4')) ext = 'm4a';
  else if (mime.includes('ogg')) ext = 'ogg';
  else if (mime.includes('mpeg')) ext = 'mp3';
  return `rekaman-${slug || 'audio'}.${ext}`;
}

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatWaktu(ms: number): string {
  try {
    return new Date(ms).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
