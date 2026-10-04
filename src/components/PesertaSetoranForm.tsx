'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioRecorder } from './AudioRecorder';
import { Icon, Initials } from './icons';
import {
  JENIS_REKAMAN,
  JENIS_REKAMAN_LABEL,
  JENIS_REKAMAN_MAX_DURASI_SEC,
  type JenisRekaman,
  type NilaiRekaman,
} from '@/types/db';
import {
  saveRecording,
  deleteRecording,
  loadRecordings,
  clearRecordings,
} from '@/lib/recording-cache';
import { buildWaMeUrl } from '@/lib/whatsapp';
import { ADMIN_WA } from '@/lib/constants';

type Rec = { blob: Blob; durationSec: number };
type Recordings = Record<JenisRekaman, Rec | null>;
// Draf dari IndexedDB. `savedAt` (ms epoch) hanya ada pada entri yang disimpan
// sejak kolom itu ditambahkan — entri lama tak punya.
type CachedRec = Rec & { savedAt?: number };

const EMPTY: Recordings = {
  tuhfatul_athfal: null,
  jazariyyah: null,
  syawahid: null,
};

const JENIS_LABEL_FORM: Record<JenisRekaman, string> = {
  tuhfatul_athfal: 'Tuhfatul Athfal',
  jazariyyah: 'Al-Jazariyyah',
  syawahid: 'Asy-Syawahid',
};

export interface ExistingSetoran {
  id: string;
  status: 'submitted' | 'checked';
  musyrifWaUrl: string | null;
  rekaman: Array<{ jenis: JenisRekaman; nilai: NilaiRekaman | null; masukan: string | null }>;
}

// Status kirim per jenis. 'idle' = ada/tidak ada rekaman lokal, belum
// dikonfirmasi server. Hanya 'terkirim' yang boleh ditampilkan sebagai terkirim.
type StatusKirim = 'idle' | 'mengirim' | 'gagal' | 'terkirim';
type GalatKirim = { pesan: string; bisaUlang: boolean };

// ---------------------------------------------------------------------------
// Pengiriman andal: timeout sebanding ukuran file + ulang otomatis.
// ---------------------------------------------------------------------------

// Jeda sebelum percobaan ulang ke-1, ke-2, ke-3 (total 4 percobaan).
const JEDA_ULANG_MS = [2_000, 5_000, 15_000];
const TIMEOUT_DASAR_MS = 60_000;
const TIMEOUT_MAKS_MS = 15 * 60_000;

// 60 detik + 1 detik per 50 KB, maksimal 15 menit. File median 6,7 MB → ±3 menit.
function timeoutUntuk(ukuranByte: number): number {
  return Math.min(TIMEOUT_DASAR_MS + Math.ceil(ukuranByte / (50 * 1024)) * 1000, TIMEOUT_MAKS_MS);
}

type RespJson = { error?: string; wa_url?: string | null };

type HasilKirim =
  | { ok: true; status: number; json: RespJson; percobaan: number }
  | {
      ok: false;
      status: number | null;
      pesan: string;
      bisaUlang: boolean;
      percobaan: number;
      dibatalkan?: boolean;
    };

function tidur(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Bila perangkat sedang offline, tunggu sinyal kembali (maks `maksMs`) sebelum
// mencoba lagi — percuma mengirim saat jelas-jelas tak ada jaringan.
function tungguOnline(maksMs: number): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve) => {
    const selesai = () => {
      window.removeEventListener('online', selesai);
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(selesai, maksMs);
    window.addEventListener('online', selesai);
  });
}

function pesanHttp(status: number, json: RespJson): string {
  if (status === 413) return 'Ukuran rekaman terlalu besar untuk diterima server (HTTP 413).';
  if (status === 408 || status === 504) {
    return 'Server terlalu lama merespons. Rekaman masih aman di perangkat ini — ketuk Kirim ulang.';
  }
  if (status === 429) return 'Server sedang sibuk. Rekaman masih aman di perangkat ini — coba kirim ulang sebentar lagi.';
  if (status >= 500) {
    return `${json.error ?? 'Server sedang bermasalah'} (HTTP ${status}). Rekaman masih aman di perangkat ini — ketuk Kirim ulang.`;
  }
  return json.error ?? `Gagal mengirim (HTTP ${status}).`;
}

/**
 * POST FormData dengan timeout (AbortController) dan ulang otomatis bertahap.
 * Diulang hanya untuk galat jaringan, timeout, 5xx, 408, dan 429. Galat bisnis
 * 4xx (mis. 409 "sudah dicek musyrif", 400 periode tidak valid) langsung
 * dikembalikan apa adanya — mengulang tak akan mengubah jawabannya.
 */
async function kirimDenganUlang(
  url: string,
  fd: FormData,
  ukuranByte: number,
  opts: {
    onUlang?: (percobaanKe: number, total: number) => void;
    masihBerlaku?: () => boolean;
  } = {}
): Promise<HasilKirim> {
  const total = JEDA_ULANG_MS.length + 1;
  let status: number | null = null;
  let pesan = 'Gagal mengirim';
  for (let i = 0; i < total; i++) {
    if (opts.masihBerlaku && !opts.masihBerlaku()) {
      return { ok: false, status, pesan, bisaUlang: true, percobaan: i, dibatalkan: true };
    }
    const ctrl = new AbortController();
    let habisWaktu = false;
    const timer = setTimeout(() => {
      habisWaktu = true;
      ctrl.abort();
    }, timeoutUntuk(ukuranByte));
    let bisaUlang = false;
    try {
      const res = await fetch(url, { method: 'POST', body: fd, signal: ctrl.signal });
      status = res.status;
      let json: RespJson = {};
      try {
        json = await res.json();
      } catch {
        /* body bukan JSON (mis. 413/502 dari nginx) → biarkan json kosong */
      }
      if (res.ok) return { ok: true, status: res.status, json, percobaan: i + 1 };
      pesan = pesanHttp(res.status, json);
      bisaUlang = res.status >= 500 || res.status === 408 || res.status === 429;
      if (!bisaUlang) return { ok: false, status, pesan, bisaUlang: false, percobaan: i + 1 };
    } catch {
      // TypeError "Failed to fetch"/"Load failed" = jaringan putus; AbortError = timeout kita.
      status = null;
      pesan = habisWaktu
        ? 'Pengiriman terlalu lama (sinyal lemah). Rekaman masih aman di perangkat ini — ketuk Kirim ulang saat sinyal bagus.'
        : 'Koneksi terputus saat mengirim. Rekaman masih aman di perangkat ini — ketuk Kirim ulang saat sinyal bagus.';
      bisaUlang = true;
    } finally {
      clearTimeout(timer);
    }
    if (i < total - 1) {
      opts.onUlang?.(i + 2, total);
      await tidur(JEDA_ULANG_MS[i]);
      await tungguOnline(60_000);
    }
  }
  return { ok: false, status, pesan, bisaUlang: true, percobaan: total };
}

// Periode yang dirender halaman ini. `periodWeekStart` bila diberikan; kalau
// tidak, diturunkan dari `cacheKey` (form utama 2in1 = `YYYY-MM-DD`, setoran
// musyrif = `m-YYYY-MM-DD`). Kunci lain (mis. `ujian:<id>`) → null: endpoint
// itu tidak berbasis periode.
function periodeDariProps(periodWeekStart?: string, cacheKey?: string): string | null {
  if (periodWeekStart) return periodWeekStart;
  const m = cacheKey?.match(/^(?:m-)?(\d{4}-\d{2}-\d{2})$/);
  return m ? m[1] : null;
}

export function PesertaSetoranForm({
  musyrifName,
  musyrifInitials,
  existing,
  endpoint = '/api/setoran/submit',
  singleSubmitEndpoint,
  targetRoleLabel = 'Musyrif kelas Anda',
  cacheKey,
  periodWeekStart,
  submittedJenis,
  restored,
  pesertaName,
  pesertaId,
  kelasName,
  extraFields,
  singleOnly = false,
  nounLabel = 'setoran',
}: {
  musyrifName: string;
  musyrifInitials: string;
  existing: ExistingSetoran | null;
  endpoint?: string;
  singleSubmitEndpoint?: string;
  targetRoleLabel?: string;
  cacheKey?: string;
  periodWeekStart?: string;
  submittedJenis?: JenisRekaman[];
  // Identitas peserta → dipakai isi laporan gagal upload ke support (WA).
  pesertaName?: string;
  pesertaId?: string;
  kelasName?: string;
  // Rekaman yang sudah tersimpan di server → dipulihkan untuk diputar.
  // `recordedAt` (ISO) = kapan rekaman server itu di-upload, bila diketahui.
  restored?: Partial<
    Record<JenisRekaman, { audioUrl: string; durationSec: number; recordedAt?: string | null }>
  >;
  // Field tambahan tiap kiriman (mis. `periode_id` untuk ujian).
  extraFields?: Record<string, string>;
  // Sembunyikan tombol kirim-3-sekaligus; hanya mode satu-satu yang dipakai.
  singleOnly?: boolean;
  // Kata benda di teks tombol & laporan: "setoran" / "ujian".
  nounLabel?: string;
}) {
  const [recordings, setRecordings] = useState<Recordings>(EMPTY);
  const [initialRecordings, setInitialRecordings] = useState<Partial<Record<JenisRekaman, CachedRec>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkBisaUlang, setBulkBisaUlang] = useState(false);
  const [infoUlangBulk, setInfoUlangBulk] = useState<string | null>(null);
  const [resultWaUrl, setResultWaUrl] = useState<string | null>(
    existing?.status === 'submitted' ? existing.musyrifWaUrl : null
  );
  // Layar sukses kirim-3-sekaligus (mode tanpa kirim satu-satu).
  const [bulkSelesai, setBulkSelesai] = useState(
    existing?.status === 'submitted' && !!existing.musyrifWaUrl
  );

  // Periode tempat semua kiriman form ini dicatat — dikunci saat halaman
  // dirender, supaya upload yang baru selesai lewat 00:00 di batas periode
  // tetap masuk periode yang sedang diisi peserta, bukan periode berikutnya.
  const weekStart = periodeDariProps(periodWeekStart, cacheKey);

  // Status kirim per jenis (mode satu-satu). Jenis yang sudah ada di server
  // periode ini langsung 'terkirim' agar tak dikirim ulang.
  const awal: Record<JenisRekaman, StatusKirim> = {
    tuhfatul_athfal: submittedJenis?.includes('tuhfatul_athfal') ? 'terkirim' : 'idle',
    jazariyyah: submittedJenis?.includes('jazariyyah') ? 'terkirim' : 'idle',
    syawahid: submittedJenis?.includes('syawahid') ? 'terkirim' : 'idle',
  };
  const [statusKirim, setStatusKirimState] = useState<Record<JenisRekaman, StatusKirim>>(awal);
  // Cermin sinkron — dibaca di callback async/onChange tanpa ikut basi.
  const statusRef = useRef<Record<JenisRekaman, StatusKirim>>(awal);
  function aturStatus(jenis: JenisRekaman, s: StatusKirim) {
    statusRef.current = { ...statusRef.current, [jenis]: s };
    setStatusKirimState(statusRef.current);
  }

  const [galatKirim, setGalatKirim] = useState<Partial<Record<JenisRekaman, GalatKirim>>>({});
  // Info "sedang mencoba ulang otomatis" per jenis.
  const [infoUlang, setInfoUlang] = useState<Partial<Record<JenisRekaman, string>>>({});
  // Catatan: ada draf lokal yang belum terkirim padahal server sudah punya rekaman.
  const [catatanDraf, setCatatanDraf] = useState<Partial<Record<JenisRekaman, string>>>({});
  const [singleWaUrl, setSingleWaUrl] = useState<string | null>(null);
  const [bulkSingleSukses, setBulkSingleSukses] = useState(false);
  // WA link "lapor ke support" — terisi saat upload gagal, berisi diagnostik.
  const [perJenisReportUrl, setPerJenisReportUrl] = useState<Partial<Record<JenisRekaman, string>>>({});
  const [reportUrl, setReportUrl] = useState<string | null>(null);

  // Generasi rekaman per jenis. Naik setiap rekaman berubah; kiriman yang
  // generasinya sudah basi tidak boleh menandai rekaman baru sebagai terkirim
  // atau menghapus drafnya.
  const genRef = useRef<Record<JenisRekaman, number>>({
    tuhfatul_athfal: 0,
    jazariyyah: 0,
    syawahid: 0,
  });
  // Janji simpan/hapus draf IndexedDB terakhir per jenis — ditunggu sebelum
  // draf dihapus setelah sukses, agar hapus tak kalah cepat dari simpan.
  const drafRef = useRef<Partial<Record<JenisRekaman, Promise<void>>>>({});

  // Bangun teks laporan diagnostik + WA URL ke ADMIN_WA (technical support).
  function buildReportUrl(ctx: {
    jenisLabel: string;
    sizeBytes?: number;
    mime?: string;
    durationSec?: number;
    httpStatus?: number | null;
    percobaan?: number;
    errorMsg: string;
  }): string {
    const mb =
      ctx.sizeBytes != null ? `${(ctx.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : '-';
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '-';
    const now =
      typeof Date !== 'undefined' ? new Date().toLocaleString('id-ID') : '-';
    const msg = [
      `*LAPORAN GAGAL UPLOAD ${nounLabel.toUpperCase()}*`,
      `Peserta: ${pesertaName ?? '-'}${pesertaId ? ` (${pesertaId})` : ''}`,
      `Kelas: ${kelasName ?? '-'} → ${musyrifName}`,
      `Rekaman: ${ctx.jenisLabel}`,
      `Periode: ${weekStart ?? cacheKey ?? '-'}`,
      `Durasi: ${ctx.durationSec ?? '-'} detik`,
      `Ukuran: ${mb}`,
      `Format: ${ctx.mime || '-'}`,
      `Status: ${
        ctx.httpStatus == null ? 'TIDAK ADA RESPON (kemungkinan jaringan)' : ctx.httpStatus
      }`,
      `Percobaan: ${ctx.percobaan ?? '-'}`,
      `Error: ${ctx.errorMsg}`,
      `Waktu: ${now}`,
      `Device: ${ua}`,
      '',
      'Mohon dibantu ustadz/ustadzah. Jazaakumullahu khairan.',
    ].join('\n');
    return buildWaMeUrl(ADMIN_WA, msg);
  }

  useEffect(() => {
    if (!cacheKey) return;
    loadRecordings(cacheKey).then((r) => setInitialRecordings(r as Partial<Record<JenisRekaman, CachedRec>>));
  }, [cacheKey]);

  const adaMengirim = Object.values(statusKirim).some((s) => s === 'mengirim');
  const sedangSibuk = submitting || adaMengirim;

  // Peringatkan sebelum menutup/refresh tab selagi ada upload berjalan —
  // upload yang terputus = rekaman tak sampai ke server.
  useEffect(() => {
    if (!sedangSibuk) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [sedangSibuk]);

  const hasSingleMode = !!singleSubmitEndpoint;
  const checked = existing?.status === 'checked';
  // Rekaman yang sudah dinilai musyrif terkunci di server (submit-single → 409),
  // apa pun status setorannya — di mode satu-satu tampil sebagai kartu nilai,
  // bukan perekam. Setoran 'checked' yang masih kurang rekaman tetap bisa
  // dilengkapi (server membukanya ulang ke 'submitted'); hanya yang lengkap
  // yang menjadi ringkasan baca-saja.
  const dinilaiPerJenis = new Map(
    (existing?.rekaman ?? []).filter((r) => r.nilai).map((r) => [r.jenis, r] as const)
  );
  const jenisDiServer = new Set((existing?.rekaman ?? []).map((r) => r.jenis));
  const checkedLengkap = checked && JENIS_REKAMAN.every((j) => jenisDiServer.has(j));
  const jenisKurangSetelahDicek = checked
    ? JENIS_REKAMAN.filter((j) => !jenisDiServer.has(j))
    : [];
  const allRecorded = JENIS_REKAMAN.every((j) => !!recordings[j]);
  // "Selesai" = ada rekaman lokal ATAU sudah terkirim ke server.
  const doneCount = JENIS_REKAMAN.filter(
    (j) => !!recordings[j] || (hasSingleMode && statusKirim[j] === 'terkirim')
  ).length;

  function simpanDraf(jenis: JenisRekaman, rec: Rec | null) {
    if (!cacheKey) return;
    const sebelumnya = drafRef.current[jenis] ?? Promise.resolve();
    drafRef.current[jenis] = sebelumnya.then(() =>
      rec ? saveRecording(cacheKey, jenis, rec.blob, rec.durationSec) : deleteRecording(cacheKey, jenis)
    );
  }

  function hapusDrafSetelahTerkirim(jenis: JenisRekaman, gen: number) {
    if (!cacheKey) return;
    const sebelumnya = drafRef.current[jenis] ?? Promise.resolve();
    drafRef.current[jenis] = sebelumnya.then(() =>
      // Rekaman sudah berganti selagi mengirim → draf yang baru jangan dihapus.
      genRef.current[jenis] === gen ? deleteRecording(cacheKey, jenis) : undefined
    );
  }

  function handleRecordingChange(jenis: JenisRekaman, blob: Blob | null, durationSec: number | null) {
    const rec = blob && durationSec ? { blob, durationSec } : null;
    genRef.current[jenis] += 1;
    setRecordings((prev) => ({ ...prev, [jenis]: rec }));
    simpanDraf(jenis, rec);
    setGalatKirim((p) => ({ ...p, [jenis]: undefined }));
    setPerJenisReportUrl((p) => ({ ...p, [jenis]: undefined }));
    setInfoUlang((p) => ({ ...p, [jenis]: undefined }));
    setCatatanDraf((p) => ({ ...p, [jenis]: undefined }));

    const statusSekarang = statusRef.current[jenis];

    // Rekam ulang (blob null) → status kembali idle agar bisa dikirim lagi.
    if (!rec) {
      if (statusSekarang !== 'idle') aturStatus(jenis, 'idle');
      return;
    }
    if (!singleSubmitEndpoint) return;

    // Onchange berblob saat jenis ini sudah 'terkirim' hanya datang dari hidrasi
    // draf IndexedDB (perekam terkunci selama terkirim). Artinya ada rekaman di
    // perangkat ini yang belum sampai ke server. Kirim otomatis hanya bila jelas
    // lebih baru daripada rekaman server; bila tak bisa dipastikan, biarkan
    // peserta yang memutuskan (tombol kirim) — jangan menimpa diam-diam.
    if (statusSekarang === 'terkirim') {
      aturStatus(jenis, 'idle');
      const savedAt = initialRecordings[jenis]?.savedAt ?? null;
      const recordedAtStr = restored?.[jenis]?.recordedAt ?? null;
      const recordedAt = recordedAtStr ? Date.parse(recordedAtStr) : NaN;
      const drafLebihBaru = savedAt != null && Number.isFinite(recordedAt) && savedAt > recordedAt;
      if (drafLebihBaru) {
        void submitSingle(jenis, rec);
      } else {
        setCatatanDraf((p) => ({
          ...p,
          [jenis]:
            'Rekaman di perangkat ini belum terkirim; server masih menyimpan rekaman sebelumnya. Ketuk kirim bila ingin menggantinya.',
        }));
      }
      return;
    }

    // Kirim otomatis begitu rekaman selesai (mode satu-satu).
    if (statusSekarang !== 'mengirim') void submitSingle(jenis, rec);
  }

  async function submitSingle(jenis: JenisRekaman, recOverride?: Rec): Promise<boolean> {
    if (!singleSubmitEndpoint) return false;
    const rec = recOverride ?? recordings[jenis];
    if (!rec) return false;
    if (statusRef.current[jenis] === 'mengirim') return false;
    const gen = genRef.current[jenis];
    aturStatus(jenis, 'mengirim');
    setGalatKirim((p) => ({ ...p, [jenis]: undefined }));
    setPerJenisReportUrl((p) => ({ ...p, [jenis]: undefined }));
    setInfoUlang((p) => ({ ...p, [jenis]: undefined }));
    setCatatanDraf((p) => ({ ...p, [jenis]: undefined }));

    const fd = new FormData();
    fd.append('jenis', jenis);
    fd.append('audio_file', rec.blob, `${jenis}.webm`);
    fd.append('duration_sec', String(rec.durationSec));
    if (weekStart) fd.append('week_start', weekStart);
    for (const [k, v] of Object.entries(extraFields ?? {})) fd.append(k, v);

    const masihBerlaku = () => genRef.current[jenis] === gen;
    const hasil = await kirimDenganUlang(singleSubmitEndpoint, fd, rec.blob.size, {
      masihBerlaku,
      onUlang: (ke, total) => {
        if (!masihBerlaku()) return;
        setInfoUlang((p) => ({
          ...p,
          [jenis]: `Koneksi bermasalah — mencoba kirim ulang otomatis (percobaan ${ke} dari ${total})…`,
        }));
      },
    });

    // Rekaman sudah diganti selagi mengirim → hasil ini milik rekaman lama.
    if (!masihBerlaku()) return false;
    setInfoUlang((p) => ({ ...p, [jenis]: undefined }));

    if (hasil.ok) {
      hapusDrafSetelahTerkirim(jenis, gen);
      aturStatus(jenis, 'terkirim');
      if (hasil.json.wa_url) setSingleWaUrl((prev) => prev ?? hasil.json.wa_url ?? null);
      return true;
    }

    // Draf lokal TIDAK dihapus → "Kirim ulang" dan refresh halaman tetap bisa.
    aturStatus(jenis, 'gagal');
    setGalatKirim((p) => ({ ...p, [jenis]: { pesan: hasil.pesan, bisaUlang: hasil.bisaUlang } }));
    setPerJenisReportUrl((p) => ({
      ...p,
      [jenis]: buildReportUrl({
        jenisLabel: JENIS_LABEL_FORM[jenis],
        sizeBytes: rec.blob.size,
        mime: rec.blob.type,
        durationSec: rec.durationSec,
        httpStatus: hasil.status,
        percobaan: hasil.percobaan,
        errorMsg: hasil.pesan,
      }),
    }));
    return false;
  }

  // Kirim 3 sekaligus lewat endpoint bulk (butuh ketiga rekaman).
  async function onSubmit() {
    if (!allRecorded || sedangSibuk) return;
    setSubmitting(true);
    setError(null);
    setReportUrl(null);
    setBulkBisaUlang(false);
    let totalBytes = 0;
    let firstMime = '';
    const gens = { ...genRef.current };
    const fd = new FormData();
    for (const j of JENIS_REKAMAN) {
      const r = recordings[j]!;
      totalBytes += r.blob.size;
      if (!firstMime) firstMime = r.blob.type;
      fd.append(`audio_${j}`, r.blob, `${j}.webm`);
      fd.append(`duration_${j}`, String(r.durationSec));
    }
    if (weekStart) fd.append('week_start', weekStart);
    for (const [k, v] of Object.entries(extraFields ?? {})) fd.append(k, v);

    if (hasSingleMode) {
      for (const j of JENIS_REKAMAN) {
        aturStatus(j, 'mengirim');
        setGalatKirim((p) => ({ ...p, [j]: undefined }));
        setPerJenisReportUrl((p) => ({ ...p, [j]: undefined }));
        setCatatanDraf((p) => ({ ...p, [j]: undefined }));
      }
    }

    try {
      const hasil = await kirimDenganUlang(endpoint, fd, totalBytes, {
        onUlang: (ke, total) => {
          setInfoUlangBulk(`Koneksi bermasalah — mencoba kirim ulang otomatis (percobaan ${ke} dari ${total})…`);
        },
      });
      setInfoUlangBulk(null);

      if (hasil.ok) {
        for (const j of JENIS_REKAMAN) hapusDrafSetelahTerkirim(j, gens[j]);
        if (hasSingleMode) {
          for (const j of JENIS_REKAMAN) aturStatus(j, 'terkirim');
          if (hasil.json.wa_url) setSingleWaUrl(hasil.json.wa_url);
          setBulkSingleSukses(true);
        } else {
          setResultWaUrl(hasil.json.wa_url ?? null);
          setBulkSelesai(true);
        }
        return;
      }

      setError(hasil.pesan);
      setBulkBisaUlang(hasil.bisaUlang);
      const laporan = buildReportUrl({
        jenisLabel: 'Semua rekaman (3 sekaligus)',
        sizeBytes: totalBytes,
        mime: firstMime,
        httpStatus: hasil.status,
        percobaan: hasil.percobaan,
        errorMsg: hasil.pesan,
      });
      setReportUrl(laporan);
      if (hasSingleMode) {
        // Tiap jenis bisa dikirim ulang sendiri-sendiri (file lebih kecil).
        for (const j of JENIS_REKAMAN) {
          aturStatus(j, 'gagal');
          setGalatKirim((p) => ({ ...p, [j]: { pesan: hasil.pesan, bisaUlang: hasil.bisaUlang } }));
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  // "Kirim sisa": hanya jenis yang punya rekaman lokal & belum dikonfirmasi
  // server, satu per satu lewat endpoint satu-satu.
  const jenisSisa = JENIS_REKAMAN.filter((j) => !!recordings[j] && statusKirim[j] !== 'terkirim');
  async function kirimSisa() {
    if (sedangSibuk) return;
    setError(null);
    setReportUrl(null);
    let semuaOk = true;
    for (const j of jenisSisa) {
      const ok = await submitSingle(j);
      if (!ok) semuaOk = false;
    }
    if (semuaOk && JENIS_REKAMAN.every((j) => statusRef.current[j] === 'terkirim')) {
      setBulkSingleSukses(true);
    }
  }

  // --- already checked: read-only summary ---
  // (Mode satu-satu + masih kurang rekaman → jatuh ke form di bawah, supaya
  // peserta bisa menyusulkan rekaman yang belum disetor.)
  if (checked && existing && (!hasSingleMode || checkedLengkap)) {
    return (
      <div>
        <div className="banner banner-success" style={{ marginBottom: 16 }}>
          <div className="ic" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="title">Setoran pekan ini sudah diperiksa</div>
            <div className="desc">
              {musyrifName} sudah memberi nilai. Lihat di bawah.
            </div>
          </div>
        </div>
        {existing.rekaman.map((r) => (
          <div key={r.jenis} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div className="rec-head" style={{ marginBottom: 6 }}>
              <div className="title">{JENIS_LABEL_FORM[r.jenis] ?? JENIS_REKAMAN_LABEL[r.jenis]}</div>
              {r.nilai && (
                <span className={`badge badge-${r.nilai}`}>
                  <span className="dot" />
                  {capitalize(r.nilai)}
                </span>
              )}
            </div>
            {r.masukan ? (
              <p className="t-body">{r.masukan}</p>
            ) : (
              <p className="t-small" style={{ fontStyle: 'italic' }}>(tidak ada catatan)</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // --- success after bulk submit (mode tanpa kirim satu-satu) ---
  if (bulkSelesai && !hasSingleMode) {
    return (
      <div>
        <div className="banner banner-success" style={{ marginBottom: 16 }}>
          <div className="ic" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="title">Setoran terkirim</div>
            <div className="desc">
              Rekamanmu sudah masuk ke {musyrifName}. Beri tahu beliau di WhatsApp
              agar segera diperiksa.
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="row" style={{ padding: 0 }}>
            <div className="avatar">{musyrifInitials}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{musyrifName}</div>
              <div className="t-small">{targetRoleLabel}</div>
            </div>
          </div>
        </div>

        {resultWaUrl && (
          <a
            href={resultWaUrl}
            target="_blank"
            rel="noopener"
            className="btn btn-wa btn-block"
          >
            {Icon.wa(14)} Buka WhatsApp untuk kirim
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            if (cacheKey) clearRecordings(cacheKey);
            for (const j of JENIS_REKAMAN) genRef.current[j] += 1;
            setRecordings(EMPTY);
            setInitialRecordings({});
            setResultWaUrl(null);
            setBulkSelesai(false);
          }}
          className="btn btn-ghost btn-block"
          style={{ marginTop: 12 }}
        >
          Rekam ulang setoran
        </button>
        <p
          className="t-small"
          style={{ textAlign: 'center', marginTop: 16, color: 'var(--muted-2)' }}
        >
          Selama belum diperiksa musyrif, kamu masih boleh rekam ulang.
        </p>
      </div>
    );
  }

  const anySubmitted = hasSingleMode && JENIS_REKAMAN.some((j) => statusKirim[j] === 'terkirim');
  const allSingleSubmitted = hasSingleMode && JENIS_REKAMAN.every((j) => statusKirim[j] === 'terkirim');

  // Tombol bawah. Mode satu-satu: sebelum ada yang terkirim = kirim 3 sekaligus
  // (endpoint bulk butuh ketiganya); setelahnya = "Kirim sisa" hanya jenis yang
  // belum dikonfirmasi server. Nonaktif selama ada upload berjalan.
  const modeSisa = hasSingleMode && anySubmitted;
  const bisaKirimBawah = !sedangSibuk && (modeSisa ? jenisSisa.length > 0 : allRecorded);
  const labelBawah = submitting
    ? 'Mengirim…'
    : adaMengirim
      ? 'Menunggu rekaman selesai terkirim…'
      : modeSisa
        ? `Kirim sisa rekaman${jenisSisa.length ? ` (${jenisSisa.length})` : ''}`
        : `Kirim ${nounLabel}`;

  // --- main: form ---
  return (
    <div>
      <p className="t-small" style={{ marginBottom: 14 }}>
        {singleOnly ? 'Rekam tiap matan — rekaman langsung terkirim begitu selesai.' : hasSingleMode ? 'Rekam dan kirim satu per satu, atau langsung 3 sekaligus.' : '3 rekaman · maks 30 menit (Al-Jazariyyah 45) per rekaman'}
      </p>

      <div className="section-row">
        <div className="t-tiny">Rekaman</div>
        <div
          className="t-small"
          style={{ color: doneCount === 3 ? 'var(--hijau-ink)' : undefined }}
        >
          {doneCount} / 3 selesai
        </div>
      </div>

      {/* WA banner setelah kiriman satu-satu pertama (sebelum semuanya terkirim) */}
      {singleWaUrl && !allSingleSubmitted && (
        <div className="banner banner-success" style={{ marginBottom: 12 }}>
          <div className="ic" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div className="title">Rekaman terkirim ke {musyrifName}</div>
            <div className="desc">Rekaman lain bisa dikirim sendiri-sendiri.</div>
          </div>
          <a href={singleWaUrl} target="_blank" rel="noopener" className="btn btn-wa btn-xs" style={{ whiteSpace: 'nowrap' }}>
            {Icon.wa(12)} WA
          </a>
        </div>
      )}

      {hasSingleMode && checked && jenisKurangSetelahDicek.length > 0 && (
        <div
          className="banner"
          style={{ marginBottom: 12, background: 'var(--kuning-tint)', borderColor: 'var(--kuning)' }}
        >
          <div>
            <div className="title">Sebagian rekaman sudah dinilai {musyrifName}</div>
            <div className="desc">
              {jenisKurangSetelahDicek.map((j) => JENIS_LABEL_FORM[j]).join(', ')} belum disetor.
              Rekam dan kirim di bawah — setoran akan diperiksa lagi.
            </div>
          </div>
        </div>
      )}

      {sedangSibuk && (
        <p className="t-small" style={{ marginBottom: 10, color: 'var(--kuning-ink)' }}>
          Sedang mengirim — jangan tutup halaman atau kunci layar sampai tertulis terkirim.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {JENIS_REKAMAN.map((j) => {
          const st = statusKirim[j];
          const isTerkirim = hasSingleMode && st === 'terkirim';
          const isMengirim = hasSingleMode && st === 'mengirim';
          const rec = recordings[j];
          const galat = galatKirim[j];

          // Sudah dinilai musyrif → terkunci di server; tampilkan nilainya saja.
          const dinilai = hasSingleMode ? dinilaiPerJenis.get(j) : undefined;
          if (dinilai?.nilai) {
            return (
              <div key={j} className="card" style={{ padding: 14 }}>
                <div className="rec-head" style={{ marginBottom: 6 }}>
                  <div className="title">{JENIS_LABEL_FORM[j] ?? JENIS_REKAMAN_LABEL[j]}</div>
                  <span className={`badge badge-${dinilai.nilai}`}>
                    <span className="dot" />
                    {capitalize(dinilai.nilai)}
                  </span>
                </div>
                {dinilai.masukan ? (
                  <p className="t-body">{dinilai.masukan}</p>
                ) : (
                  <p className="t-small" style={{ fontStyle: 'italic' }}>
                    Sudah dinilai — rekaman ini tidak bisa diganti.
                  </p>
                )}
              </div>
            );
          }

          // Status untuk AudioRecorder: hanya 'terkirim' yang boleh diklaim terkirim.
          let uploadStatus: 'mengirim' | 'gagal' | 'terkirim' | null;
          let uploadError: string | null = null;
          let onRetryUpload: (() => void) | undefined;
          if (hasSingleMode) {
            uploadStatus = st === 'idle' ? null : st;
            if (st === 'gagal' && galat) {
              uploadError = galat.pesan;
              if (galat.bisaUlang && rec) onRetryUpload = () => void submitSingle(j);
            }
          } else if (submitting) {
            uploadStatus = 'mengirim';
          } else if (error && rec) {
            uploadStatus = 'gagal';
            uploadError = 'Belum terkirim — lihat pesan di bawah.';
            if (bulkBisaUlang && allRecorded) onRetryUpload = () => void onSubmit();
          } else {
            uploadStatus = null;
          }

          return (
            <div key={j}>
              <AudioRecorder
                label={JENIS_LABEL_FORM[j] ?? JENIS_REKAMAN_LABEL[j]}
                maxDurationSec={JENIS_REKAMAN_MAX_DURASI_SEC[j]}
                disabled={submitting || isMengirim || isTerkirim}
                submitted={isTerkirim}
                uploadStatus={uploadStatus}
                uploadError={uploadError}
                onRetryUpload={onRetryUpload}
                initialRecording={initialRecordings[j] ?? undefined}
                initialRecordingSavedAt={initialRecordings[j]?.savedAt ?? null}
                initialAudioUrl={restored?.[j]?.audioUrl}
                initialAudioRecordedAt={restored?.[j]?.recordedAt ?? null}
                initialDurationSec={restored?.[j]?.durationSec}
                // Kunci draf sebagian per periode+jenis — tanpa ini form utama
                // dan form periode terlewat di halaman yang sama berbagi kunci.
                draftKey={cacheKey ? `${cacheKey}/${j}` : undefined}
                onChange={(blob, durationSec) => handleRecordingChange(j, blob, durationSec)}
              />
              {hasSingleMode && isMengirim && infoUlang[j] && (
                <p style={{ fontSize: 11, color: 'var(--kuning-ink)', marginTop: 4 }}>{infoUlang[j]}</p>
              )}
              {hasSingleMode && rec && st === 'gagal' && perJenisReportUrl[j] && (
                <a
                  href={perJenisReportUrl[j]}
                  target="_blank"
                  rel="noopener"
                  className="btn btn-wa btn-xs"
                  style={{ width: '100%', marginTop: 6, justifyContent: 'center' }}
                >
                  {Icon.wa(12)} Laporkan gagal ke Technical Support
                </a>
              )}
              {hasSingleMode && rec && st === 'idle' && (
                <div style={{ marginTop: 6 }}>
                  {catatanDraf[j] && (
                    <p style={{ fontSize: 11, color: 'var(--kuning-ink)', marginBottom: 4 }}>{catatanDraf[j]}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => void submitSingle(j)}
                    disabled={submitting}
                    className="btn btn-xs btn-primary"
                    style={{ width: '100%' }}
                  >
                    Kirim rekaman {JENIS_LABEL_FORM[j]}
                  </button>
                </div>
              )}
              {isTerkirim && (
                <p style={{ fontSize: 11, color: 'var(--hijau-ink)', marginTop: 4 }}>
                  ✓ Rekaman {JENIS_LABEL_FORM[j]} terkirim
                </p>
              )}
            </div>
          );
        })}
      </div>

      {infoUlangBulk && submitting && (
        <p className="t-small" style={{ marginTop: 12, color: 'var(--kuning-ink)' }}>{infoUlangBulk}</p>
      )}

      {error && (
        <div className="banner banner-error" style={{ marginTop: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="title">Gagal mengirim</div>
            <div className="desc">{error}</div>
            {reportUrl && (
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener"
                className="btn btn-wa btn-xs"
                style={{ marginTop: 8, justifyContent: 'center' }}
              >
                {Icon.wa(12)} Laporkan gagal ke Technical Support
              </a>
            )}
          </div>
        </div>
      )}

      {!allSingleSubmitted && !singleOnly && (
        <button
          type="button"
          onClick={() => void (modeSisa ? kirimSisa() : onSubmit())}
          disabled={!bisaKirimBawah}
          className={`btn btn-block ${bisaKirimBawah ? 'btn-primary' : 'btn-soft'}`}
          style={{ marginTop: 20 }}
        >
          {labelBawah}
          {bisaKirimBawah && Icon.arrow(14)}
        </button>
      )}

      {allSingleSubmitted && (
        <div className="banner banner-success" style={{ marginTop: 16 }}>
          <div className="ic" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.3l2.4 2.4L9.5 3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div className="title">
              {bulkSingleSukses ? `${capitalize(nounLabel)} terkirim ke ${musyrifName}` : 'Semua rekaman terkirim'}
            </div>
            <div className="desc">
              Ketiga rekaman sudah tersimpan di server. Selama belum diperiksa, kamu masih bisa rekam ulang.
            </div>
            {singleWaUrl && (
              <a
                href={singleWaUrl}
                target="_blank"
                rel="noopener"
                className="btn btn-wa btn-xs"
                style={{ marginTop: 8, justifyContent: 'center' }}
              >
                {Icon.wa(12)} Beri tahu {musyrifName} di WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
