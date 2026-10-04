'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Gender } from '@/types/db';
import { HALAQAH_COOKIE } from '@/lib/evaluasi-cookie';
import {
  ALL_LAHN,
  scoreOf,
  tierOf,
  initials,
  emptyCounts,
  JALIY,
  KHAFIY,
  AMBANG,
  JENIS,
  TRACKS,
  trackOfUjianSesi,
  type Jenis,
  type LahnCounts,
  type Track,
} from '@/lib/evaluasi';
import { Setup } from './screens/Setup';
import { Daftar } from './screens/Daftar';
import { Nilai } from './screens/Nilai';
import { Ringkasan } from './screens/Ringkasan';
import { KelolaPeserta } from './screens/KelolaPeserta';
import { KelolaHalaqah } from './screens/KelolaHalaqah';
import { PusatRapot } from './screens/PusatRapot';
import { RekapSesi, type RekapSesiOpsi } from './screens/RekapSesi';
import { labelSesi, susunRekapSesi } from '@/lib/evaluasi-rekap-sesi';
import RapotTrack from './screens/RapotTrack';
import RapotTrackA4 from './rapot/RapotTrackA4';
import RapotPrintStyle from './rapot/RapotPrintStyle';
import {
  alasanBelumTerbit,
  buildTrackRapotPayload,
  type RapotPayloadTrack,
  type SesiNilaiInput,
} from '@/lib/rapot';

// ── Types shared with the RSC page ──
export interface EvPeserta {
  id: string;
  nama: string;
  is_ketua: boolean;
  urutan: number;
}
export interface EvSesi {
  id: string;
  jenis: Jenis;
  nomor_sesi: number;
  tgl_jadwal: string | null;
  surat: string;
  ayat_mulai: number;
  ayat_selesai: number;
  ambang: number;
  status: 'draft' | 'terkirim';
  dihapus: boolean;
}
export interface EvWork {
  counts: LahnCounts;
  catatan: string;
  ayat: number | null;
  done: boolean;
  confirmed: boolean;
  hadir: boolean;
}
export interface EvConfig {
  nama_qn: string;
  nama_pb: string;
  ujian_attempts: number;
  jadwal: { qn: string[]; pb: string[]; ujian: string[] };
}
export interface EvaluasiInitial {
  pengajarName: string;
  /** Semua halaqah pengajar (untuk switcher bila >1). */
  halaqahOptions: { id: string; nama: string }[];
  halaqah: {
    id: string;
    nama: string;
    gender: Gender;
    mustawa: number | null;
    level: string | null;
    ambang_ujian: number;
    pesertaCount: number;
    /** Nama batch (dari eval_batch) — dicetak di kop rapot. */
    batch: string | null;
    /** Batch HITS Januari (0058): rapot Ujian QN & PB terpisah, nilai akhir murni skor ujian. */
    rapotUjianTerpisah: boolean;
  };
  config: EvConfig;
  peserta: EvPeserta[];
  sesiList: EvSesi[];
  work: Record<string, EvWork>;
  /** Versi (updated_at) tiap baris nilai, key sama dengan `work`. Penjaga tulis basi. */
  versi: Record<string, string>;
  currentSession: Record<Jenis, number>;
  /** Rapot berstatus 'aktif' milik halaqah ini — sumber token yang bisa dibuka lagi. */
  rapotTerbit: RapotTerbit[];
}

/** Satu rapot resmi yang sedang berlaku (ber-QR), diringkas untuk layar pengajar. */
export interface RapotTerbit {
  token: string;
  peserta_id: string;
  track: Track;
  nilai_akhir: number | null;
  lulus: boolean | null;
  diterbitkan_at: string | null;
}

export type Screen =
  | 'p-home'
  | 'p-setup'
  | 'p-daftar'
  | 'p-nilai'
  | 'p-ringkasan'
  | 'p-rapor'
  | 'p-peserta'
  | 'p-halaqah'
  | 'p-rapot'
  | 'p-rekap';
/**
 * Status simpan satu isian (peserta × sesi).
 * - pending  : ada perubahan di HP yang belum berangkat (jendela debounce / antre)
 * - saving   : sedang dikirim
 * - saved    : server sudah menerima versi terakhir
 * - error    : gagal — dicoba ulang otomatis bila galatnya sementara
 * - conflict : baris diubah di perangkat lain; isi terbaru sudah dimuat
 * - coba     : Mode Coba — sengaja tidak disimpan
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict' | 'coba';

/** Status yang berarti "isian ini belum aman di server". */
function belumAman(st: SaveStatus | undefined): boolean {
  return st === 'pending' || st === 'saving' || st === 'error';
}

// Coba ulang otomatis untuk galat sementara (jaringan putus, server 5xx):
// 1s, 2s, 4s, 8s, 16s, 30s — lalu berhenti dan menunggu "Coba lagi" / sinyal kembali.
const MAKS_ULANG_OTOMATIS = 6;
function jedaUlang(ke: number): number {
  return Math.min(30_000, 1000 * 2 ** ke);
}

/** Pecah key `work` → (peserta, jenis, sesi). Id peserta boleh memuat ':' ('manual:…'). */
function uraiKey(key: string): { id: string; j: Jenis; session: number } {
  const parts = key.split('|');
  const session = Number(parts.pop());
  const j = parts.pop() as Jenis;
  return { id: parts.join('|'), j, session };
}

/**
 * Sidik isi satu isian — untuk mengenali kiriman kita sendiri yang jawabannya
 * hilang di jalan (sinyal putus SETELAH server menulis). Tanpa ini kiriman
 * ulangnya terbaca sebagai "diubah di perangkat lain".
 */
function sidikIsi(w: { hadir: boolean; counts: LahnCounts; catatan: string | null; confirmed: boolean; done: boolean }): string {
  return JSON.stringify([
    w.hadir !== false,
    ALL_LAHN.map((d) => Math.max(0, Math.floor(Number(w.counts?.[d.key]) || 0))),
    w.catatan ?? '',
    !!w.confirmed,
    !!w.done,
  ]);
}

/** Bentuk `current` dari 409 konflik /api/evaluasi/nilai/upsert. */
interface NilaiServer {
  hadir: boolean;
  counts: LahnCounts;
  catatan: string;
  confirmed: boolean;
  done: boolean;
  updated_at: string;
}

// Tile-color arrays (presentation, ported from mockup).
export const JALIY_SHADES = ['oklch(0.97 0.02 25)', 'oklch(0.93 0.05 25)', 'oklch(0.88 0.08 25)', 'oklch(0.82 0.11 25)', 'oklch(0.75 0.14 25)'];
export const JALIY_BORDERS = ['oklch(0.86 0.07 25)', 'oklch(0.80 0.09 25)', 'oklch(0.74 0.11 25)', 'oklch(0.68 0.13 25)', 'oklch(0.60 0.15 25)'];
export const KHAFIY_SHADES = ['#ffffff', 'oklch(0.96 0.02 85)', 'oklch(0.92 0.04 85)', 'oklch(0.87 0.06 85)', 'oklch(0.82 0.08 85)'];
export const KHAFIY_BORDERS = ['var(--line)', 'oklch(0.88 0.05 85)', 'oklch(0.84 0.07 85)', 'oklch(0.78 0.09 85)', 'oklch(0.72 0.11 85)'];

export interface Tile {
  key: string;
  label: string;
  count: number;
  tileBg: string;
  tileBorder: string;
  textColor: string;
  showMinus: boolean;
  tap: () => void;
  minus: (e: React.MouseEvent) => void;
  setCount: (e: React.ChangeEvent<HTMLInputElement>) => void;
  stop: (e: React.MouseEvent) => void;
}

const JENIS_SHORT: Record<Jenis, string> = { qn: 'QN', pb: 'PB', ujian: 'Ujian' };
// Ujian akhir bukan sesi berurutan — dua ujian terpisah: QN & PB.
const UJIAN_SESI_LABELS = ['Ujian QN', 'Ujian PB'];

/**
 * Dokumen rapot yang bisa dicetak pengajar (0062) = SATU TRACK. Hanya ada dua:
 * Rapot QN dan Rapot PB, masing-masing memuat 4 sesi berkala track itu + ujiannya.
 * Sumbu "berkala vs ujian" sudah tidak ada — itu era sebelum rotasi.
 */
export type DokCetak = Track;

/**
 * Track pemilik sebuah sesi — dipakai tiap kali cetak berangkat dari SESI (baris
 * riwayat, tombol PDF di layar sesi/ringkasan). `nomor` hanya berarti untuk sesi
 * ujian, dan diserap DI SINI lewat `trackOfUjianSesi`; yang disimpan ke state
 * cetak sudah berupa track, jadi baris riwayat "Ujian QN" tak lagi bisa nyasar
 * ke dokumen PB.
 */
function dokDariSesi(j: Jenis, nomor: number): DokCetak | null {
  if (j !== 'ujian') return j;
  // Baris ujian bernomor di luar 1/2 hanya ada di data era lama. Dulu diam-diam
  // jatuh ke 'pb' — tombol Cetak-nya lalu membuka dokumen PB yang sama sekali
  // bukan miliknya. Lebih baik tak punya dokumen daripada salah dokumen.
  return trackOfUjianSesi(nomor);
}

// Label sesi utk riwayat & menu PDF. Ujian dinamai per jenisnya ("Ujian PB"),
// bukan "Ujian Sesi 2" — pada batch terpisah nomor sesi menentukan dokumennya.
function sesiLabelPendek(j: Jenis, nomor: number): string {
  if (j === 'ujian') return UJIAN_SESI_LABELS[nomor - 1] ?? `Ujian ${nomor}`;
  return `${JENIS_SHORT[j]} Sesi ${nomor}`;
}

// useLayoutEffect memicu peringatan saat dirender di server; di sana cukup useEffect.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function genderLabel(g: Gender): string {
  return g === 'ikhwan' ? 'Ikhwan' : 'Akhwat';
}
function fmtTgl(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtBulan(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}
function workKey(id: string, jenis: Jenis, session: number): string {
  return `${id}|${jenis}|${session}`;
}
function defaultWork(ayat: number): EvWork {
  return { counts: emptyCounts(), catatan: '', ayat, done: false, confirmed: false, hadir: true };
}

export function EvaluasiPengajarApp({ initial }: { initial: EvaluasiInitial }) {
  const { halaqah, config, peserta } = initial;

  const [screen, setScreen] = useState<Screen>('p-home');
  const [jenis, setJenis] = useState<Jenis>('qn');
  const [activeSession, setActiveSession] = useState<number>(initial.currentSession.qn);
  const [activeIdx, setActiveIdx] = useState(0);
  const [work, setWork] = useState<Record<string, EvWork>>(initial.work);
  const [raporId, setRaporId] = useState<string | null>(null);
  // Rapot mana yang sedang dibuka di layar 'p-rapor'. Satu rapot = satu track
  // (0062), jadi ini SATU-SATUNYA penentu dokumen — bukan `jenis`/`activeSession`.
  const [rapotTrack, setRapotTrack] = useState<Track>('qn');
  // Sesi yang sedang dibuka di layar Rekap Sesi; null = sesi pertama yang ada.
  const [rekapSel, setRekapSel] = useState<{ jenis: Jenis; nomor: number } | null>(null);
  const [terbitStatus, setTerbitStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  // Token rapot yang baru terbit — satu-satunya jejaknya di aplikasi, jadi ia
  // harus tampil di layar, bukan cuma dibawa `window.open` yang bisa diblokir.
  const [terbitToken, setTerbitToken] = useState<string | null>(null);
  // Pesan galat dari server ditampilkan apa adanya; endpoint terbitkan
  // mengembalikan kalimat Indonesia yang jelas ("Sesi evaluasi QN baru 2 dari 4")
  // dan membuangnya jadi "Gagal · ulangi" membuat pengajar tak pernah tahu sebabnya.
  const [terbitPesan, setTerbitPesan] = useState<string | null>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [surat, setSurat] = useState('Al-Baqarah');
  const [ayatMulai, setAyatMulai] = useState<number>(142);
  const [ayatSelesai, setAyatSelesai] = useState<number>(157);
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const [sentSesi, setSentSesi] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const s of initial.sesiList) if (s.status === 'terkirim') out[`${s.jenis}|${s.nomor_sesi}`] = true;
    return out;
  });
  const [kirimStatus, setKirimStatus] = useState<SaveStatus>('idle');
  // Pesan kirim dari server/penjaga lokal — dulu cuma "Gagal mengirim".
  const [kirimPesan, setKirimPesan] = useState<string | null>(null);
  // Isian yang gagal tersimpan: key → pesan. Cermin state dari `gagalRef`
  // (ref dibaca penangan beforeunload/pagehide yang tak ikut render).
  const [gagal, setGagal] = useState<Record<string, string>>({});
  // Pemberitahuan konflik (baris diubah di perangkat lain) — tampil sampai ditutup.
  const [konflik, setKonflik] = useState<string | null>(null);
  // Reset satu peserta (layar Nilai).
  const [resetPesertaBusy, setResetPesertaBusy] = useState(false);
  const [resetPesertaError, setResetPesertaError] = useState<string | null>(null);
  // Tinggi pita atas yang menempel (Mode Coba + peringatan simpan), supaya
  // kepala layar Nilai yang juga menempel tidak tertutup olehnya.
  const pitaRef = useRef<HTMLDivElement | null>(null);
  const [pitaTinggi, setPitaTinggi] = useState(0);
  // Reset sesi: tombol dikunci selama permintaan berjalan, galat ditampilkan di
  // layar daftar (dulu fire-and-forget — kegagalan diam-diam).
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // Buka kunci sesi terkirim (riwayat): kunci per sesi supaya dua kartu tak
  // saling mematikan tombol, konfirmasi dua ketukan seperti tombol Reset.
  const [bukaKonfirmasi, setBukaKonfirmasi] = useState<string | null>(null);
  const [bukaBusy, setBukaBusy] = useState<string | null>(null);
  // Reset dari kartu riwayat (mengosongkan nilai, termasuk Ujian QN/PB).
  const [resetKonfirmasi, setResetKonfirmasi] = useState<string | null>(null);
  const [resetBusyId, setResetBusyId] = useState<string | null>(null);
  // Satu tempat pesan untuk kedua aksi riwayat — keduanya ditolak alasan yang
  // sama (rapot masih aktif), jadi memisahkannya cuma menggandakan kotak galat.
  const [riwayatError, setRiwayatError] = useState<string | null>(null);
  // Cetak rapot: Pusat Rapot (layar 'p-rapot') → render lembar A4 → print.
  const [printReq, setPrintReq] = useState<{ dok: DokCetak; ids: string[] } | null>(null);
  // Rapot resmi yang sedang berlaku. Dimuat dari server (page.tsx) DAN diperbarui
  // di sini tiap penerbitan berhasil, supaya tokennya langsung terlihat di baris
  // peserta — tak bergantung pada `window.open` yang diblokir peramban HP.
  const [rapotTerbit, setRapotTerbit] = useState<RapotTerbit[]>(initial.rapotTerbit);
  // peserta_id yang penerbitannya sedang berjalan (dipakai Pusat Rapot).
  const [terbitBusyId, setTerbitBusyId] = useState<string | null>(null);
  // Sesi ujian yang di-soft-delete pengajar (per nomor_sesi).
  const [ujianDihapus, setUjianDihapus] = useState<Set<number>>(
    () => new Set(initial.sesiList.filter((s) => s.jenis === 'ujian' && s.dihapus).map((s) => s.nomor_sesi))
  );

  const maxSessions: Record<Jenis, number> = {
    qn: 4,
    pb: 4,
    ujian: config.ujian_attempts,
  };

  // Nomor sesi yang bisa dipilih untuk sebuah jenis (ujian: tanpa yang dihapus).
  const sesiOptionsFor = (j: Jenis): number[] => {
    const all = Array.from({ length: maxSessions[j] }, (_, i) => i + 1);
    return j === 'ujian' ? all.filter((n) => !ujianDihapus.has(n)) : all;
  };

  // `workRef` = sumber kebenaran SINKRON untuk isian. Setiap perubahan lewat
  // `ubahWork` menulis ref DULU lalu state, sehingga pengirim (yang membaca
  // ref) selalu melihat isi terbaru — termasuk `done: true` dari tombol
  // "Simpan & lanjut" yang langsung dikirim tanpa menunggu render.
  const workRef = useRef(work);
  const ubahWork = useCallback((fn: (prev: Record<string, EvWork>) => Record<string, EvWork>) => {
    workRef.current = fn(workRef.current);
    setWork(workRef.current);
  }, []);
  // Mode Coba: eksperimen tanpa menyentuh server. Snapshot work saat ON → restore saat OFF.
  const [coba, setCoba] = useState(false);
  const cobaRef = useRef(coba);
  cobaRef.current = coba;
  const cobaSnapshot = useRef<{
    work: Record<string, EvWork>;
    ujianDihapus: Set<number>;
    sentSesi: Record<string, boolean>;
  } | null>(null);
  const sentSesiRef = useRef(sentSesi);
  sentSesiRef.current = sentSesi;
  const sesiIdRef = useRef<Record<string, string>>(
    Object.fromEntries(initial.sesiList.map((s) => [`${s.jenis}|${s.nomor_sesi}`, s.id]))
  );
  // Satu permintaan pembuatan sesi per (jenis, nomor) — beberapa peserta sesi
  // baru yang tersimpan bersamaan tak lagi memicu beberapa sesi/upsert.
  const sesiIdJanji = useRef<Record<string, Promise<string | null>>>({});
  const setupRef = useRef({ surat, ayatMulai, ayatSelesai });
  setupRef.current = { surat, ayatMulai, ayatSelesai };

  // ── Antrean simpan per isian ──
  // Aturan: untuk satu key paling banyak SATU permintaan di jalan; perubahan
  // yang datang selama itu ditandai `kotor` dan dikirim sesudahnya dengan isi
  // TERBARU (yang terbaru menang, urutan tiba tak bisa terbalik).
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}); // debounce 700ms
  const kotor = useRef<Set<string>>(new Set()); // perlu dikirim
  const diJalan = useRef<Record<string, Promise<void>>>({}); // sedang dikirim
  const timerUlang = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const hitungUlang = useRef<Record<string, number>>({});
  const gagalRef = useRef<Record<string, string>>({});
  // Versi baris di server (updated_at) per key; tak ada = baris belum ada.
  const versiRef = useRef<Record<string, string>>({ ...initial.versi });
  // Isi kiriman yang nasibnya tak diketahui (putus di jalan) per key.
  const belumPasti = useRef<Record<string, string>>({});

  const getWork = useCallback(
    (id: string, j: Jenis, session: number): EvWork => {
      const sesi = initial.sesiList.find((s) => s.jenis === j && s.nomor_sesi === session);
      return workRef.current[workKey(id, j, session)] ?? defaultWork(sesi?.ayat_mulai ?? ayatMulai);
    },
    [initial.sesiList, ayatMulai]
  );

  // Kehadiran = satu-satunya sumber kebenaran: work.hadir per (id, jenis, sesi).
  // Menghindari bug lama di mana `included` per-peserta bocor lintas sesi.
  const isIncluded = useCallback(
    (id: string) => getWork(id, jenis, activeSession).hadir !== false,
    [getWork, jenis, activeSession]
  );

  const setStatus = useCallback((key: string, st: SaveStatus) => {
    setStatuses((prev) => (prev[key] === st ? prev : { ...prev, [key]: st }));
  }, []);

  const setGagalKey = useCallback((key: string, pesan: string | null) => {
    const next = { ...gagalRef.current };
    if (pesan === null) {
      if (!(key in next)) return;
      delete next[key];
    } else {
      next[key] = pesan;
    }
    gagalRef.current = next;
    setGagal(next);
  }, []);

  // Pastikan sesi ada di server; kembalikan sesi_id (atau null bila gagal).
  const ensureSesiId = useCallback(
    async (j: Jenis, session: number): Promise<string | null> => {
      const skey = `${j}|${session}`;
      const cached = sesiIdRef.current[skey];
      if (cached) return cached;
      const berjalan = sesiIdJanji.current[skey];
      if (berjalan) return berjalan;
      const janji = (async (): Promise<string | null> => {
        try {
          // Silabus: utamakan default sesi (j, session) dari sesiList — bukan
          // setupRef (layar aktif) — agar save tertunda utk sesi lain tak salah
          // silabus. Fallback ke setupRef hanya utk sesi yang belum ada di silabus.
          const known = initial.sesiList.find((s) => s.jenis === j && s.nomor_sesi === session);
          const su = setupRef.current;
          const res = await fetch('/api/evaluasi/sesi/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              halaqah_id: halaqah.id,
              jenis: j,
              nomor_sesi: session,
              tgl_jadwal: config.jadwal?.[j]?.[session - 1] || null,
              surat: known?.surat ?? su.surat,
              ayat_mulai: known?.ayat_mulai ?? su.ayatMulai,
              ayat_selesai: known?.ayat_selesai ?? su.ayatSelesai,
              ambang: j === 'ujian' ? halaqah.ambang_ujian : AMBANG,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.sesi_id) return null;
          sesiIdRef.current[skey] = json.sesi_id;
          return json.sesi_id as string;
        } catch {
          return null;
        } finally {
          delete sesiIdJanji.current[skey];
        }
      })();
      sesiIdJanji.current[skey] = janji;
      return janji;
    },
    [halaqah.id, halaqah.ambang_ujian, config.jadwal, initial.sesiList]
  );

  const namaPeserta = useCallback(
    (id: string) => peserta.find((p) => p.id === id)?.nama ?? 'Peserta',
    [peserta]
  );

  // `drain` dan `kirimSatu` saling memanggil (coba ulang terjadwal) — lewat ref.
  const drainRef = useRef<(key: string, keepalive?: boolean) => Promise<void>>(() => Promise.resolve());

  /** Catat kegagalan; galat sementara dijadwalkan ulang otomatis dengan jeda bertambah. */
  const tandaiGagal = useCallback(
    (key: string, pesan: string, sementara: boolean) => {
      setStatus(key, 'error');
      setGagalKey(key, pesan);
      if (!sementara) return;
      kotor.current.add(key);
      const ke = hitungUlang.current[key] ?? 0;
      if (ke >= MAKS_ULANG_OTOMATIS) return; // berhenti; tunggu "Coba lagi" / sinyal kembali
      hitungUlang.current[key] = ke + 1;
      if (timerUlang.current[key]) clearTimeout(timerUlang.current[key]);
      timerUlang.current[key] = setTimeout(() => {
        delete timerUlang.current[key];
        void drainRef.current(key);
      }, jedaUlang(ke));
    },
    [setStatus, setGagalKey]
  );

  /**
   * Kirim SATU isian ke server. `true` = tersimpan (atau tak perlu), `false` =
   * berhenti (gagal/konflik/Mode Coba) — pemanggil tak boleh mengulang segera.
   *
   * Bila sesi_id sudah dikenal, fetch dipanggil SINKRON (tanpa await sebelum
   * fetch) sehingga `keepalive` dari penangan pagehide benar-benar berangkat.
   */
  const kirimSatu = useCallback(
    async (key: string, keepalive = false): Promise<boolean> => {
      const { id, j, session } = uraiKey(key);
      if (cobaRef.current) {
        // Mode Coba: isian asli yang masih antre jangan dibuang — kembalikan
        // ke antrean, dikirim lagi saat Mode Coba dimatikan.
        kotor.current.add(key);
        return false;
      }
      const skey = `${j}|${session}`;
      const sesiId = sesiIdRef.current[skey] ?? (await ensureSesiId(j, session));
      if (!sesiId) {
        tandaiGagal(key, 'Sesi belum bisa dibuat di server — periksa koneksi.', true);
        return false;
      }
      const w = getWork(id, j, session);
      const sidik = sidikIsi(w);
      setStatus(key, 'saving');
      let res: Response;
      try {
        res = await fetch('/api/evaluasi/nilai/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive,
          body: JSON.stringify({
            sesi_id: sesiId,
            peserta_id: id,
            hadir: w.hadir !== false,
            counts: w.counts,
            catatan: w.catatan,
            confirmed: w.confirmed,
            done: w.done,
            expected_updated_at: versiRef.current[key] ?? null,
          }),
        });
      } catch {
        // Bisa jadi server SUDAH menulis lalu jawabannya hilang — ingat isinya.
        belumPasti.current[key] = sidik;
        tandaiGagal(key, 'Koneksi terputus — dicoba lagi otomatis.', true);
        return false;
      }
      const json = (await res.json().catch(() => null)) as
        | { updated_at?: string; error?: string; conflict?: boolean; terkirim?: boolean; current?: NilaiServer | null }
        | null;

      if (res.ok) {
        delete belumPasti.current[key];
        if (json?.updated_at) versiRef.current[key] = json.updated_at;
        hitungUlang.current[key] = 0;
        if (timerUlang.current[key]) {
          clearTimeout(timerUlang.current[key]);
          delete timerUlang.current[key];
        }
        setGagalKey(key, null);
        setStatus(key, kotor.current.has(key) ? 'pending' : 'saved');
        return true;
      }

      if (res.status === 409 && json?.conflict) {
        // Baris berubah di perangkat lain: JANGAN timpa. Muat isi terbarunya
        // ke layar, buang perubahan lokal yang basi, dan beri tahu pengajar.
        const cur = json.current ?? null;
        if (cur && belumPasti.current[key] && belumPasti.current[key] === sidikIsi(cur)) {
          // Yang "mengubah" ternyata kiriman kita sendiri yang jawabannya
          // hilang. Pakai versinya, lalu kirim isi terbaru lagi.
          delete belumPasti.current[key];
          versiRef.current[key] = cur.updated_at;
          kotor.current.add(key);
          return true;
        }
        delete belumPasti.current[key];
        kotor.current.delete(key);
        if (cur) {
          versiRef.current[key] = cur.updated_at;
          ubahWork((prev) => ({
            ...prev,
            [key]: {
              counts: cur.counts,
              catatan: cur.catatan,
              ayat: prev[key]?.ayat ?? null,
              done: cur.done,
              confirmed: cur.confirmed,
              hadir: cur.hadir,
            },
          }));
        } else {
          delete versiRef.current[key];
          ubahWork((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
        setGagalKey(key, null);
        setStatus(key, 'conflict');
        setKonflik(
          `Nilai ${namaPeserta(id)} (${sesiLabelPendek(j, session)}) diubah di perangkat lain. ` +
            'Data terbarunya sudah dimuat — periksa lagi, lalu ubah bila perlu.'
        );
        return false;
      }

      if (res.status === 409 && json?.terkirim) {
        // Sesi ternyata sudah terkirim (mis. dari perangkat lain): kunci layar.
        setSentSesi((prev) => ({ ...prev, [skey]: true }));
        tandaiGagal(key, json.error || 'Sesi ini sudah dikirim — perubahan tidak tersimpan.', false);
        return false;
      }

      if (res.status === 401) {
        tandaiGagal(key, 'Sesi login habis — muat ulang halaman lalu masuk lagi.', false);
        return false;
      }
      const sementara = res.status >= 500 || res.status === 408 || res.status === 429;
      tandaiGagal(
        key,
        json?.error || `Gagal menyimpan (kode ${res.status}).`,
        sementara
      );
      return false;
    },
    [ensureSesiId, getWork, setStatus, setGagalKey, tandaiGagal, ubahWork, namaPeserta]
  );

  /** Kirim isian `key` selama masih kotor; satu permintaan di jalan per key. */
  const drain = useCallback(
    (key: string, keepalive = false): Promise<void> => {
      const ada = diJalan.current[key];
      if (ada) return ada;
      // eslint-disable-next-line prefer-const
      let janji: Promise<void>;
      janji = (async () => {
        while (kotor.current.has(key)) {
          kotor.current.delete(key);
          let ok = false;
          try {
            ok = await kirimSatu(key, keepalive);
          } catch {
            tandaiGagal(key, 'Galat tak terduga saat menyimpan — dicoba lagi otomatis.', true);
          }
          if (!ok) break;
        }
      })().finally(() => {
        if (diJalan.current[key] === janji) delete diJalan.current[key];
      });
      diJalan.current[key] = janji;
      return janji;
    },
    [kirimSatu, tandaiGagal]
  );
  drainRef.current = drain;

  const scheduleSave = useCallback(
    (id: string, j: Jenis, session: number) => {
      const key = workKey(id, j, session);
      if (timers.current[key]) clearTimeout(timers.current[key]);
      if (cobaRef.current) {
        // Mode Coba: tak ada yang dikirim — katakan terus terang di status.
        setStatus(key, 'coba');
        return;
      }
      kotor.current.add(key);
      setStatus(key, 'pending');
      timers.current[key] = setTimeout(() => {
        delete timers.current[key];
        void drain(key);
      }, 700);
    },
    [drain, setStatus]
  );

  /** Kirim satu isian sekarang juga (lewati debounce). */
  const simpanSekarang = useCallback(
    (key: string): Promise<void> => {
      if (timers.current[key]) {
        clearTimeout(timers.current[key]);
        delete timers.current[key];
      }
      if (cobaRef.current) {
        setStatus(key, 'coba');
        return Promise.resolve();
      }
      kotor.current.add(key);
      return drain(key);
    },
    [drain, setStatus]
  );

  /**
   * Segera kirim semua yang tertunda (pindah peserta/sesi/layar, sebelum Kirim,
   * tutup tab). Promise selesai setelah SEMUA permintaan yang sedang jalan
   * tuntas — `await flushSaves()` sebelum Kirim benar-benar menunggu antrean.
   *
   * `keepalive` (pagehide / tab disembunyikan): permintaan tetap berangkat
   * walau halaman dibuang. Isian yang sedang di jalan dilewati — mengirim kedua
   * kalinya akan membawa versi lama dan ditolak sebagai konflik.
   */
  const flushSaves = useCallback(
    (keepalive = false): Promise<void> => {
      for (const key of Object.keys(timers.current)) {
        clearTimeout(timers.current[key]);
        delete timers.current[key];
      }
      if (keepalive) {
        for (const key of Object.keys(timerUlang.current)) {
          clearTimeout(timerUlang.current[key]);
          delete timerUlang.current[key];
        }
      }
      const tunggu = Array.from(kotor.current).map((k) => drain(k, keepalive));
      tunggu.push(...Object.values(diJalan.current));
      return Promise.all(tunggu).then(() => undefined);
    },
    [drain]
  );

  /** Ada isian yang belum aman di server? (dibaca penangan beforeunload) */
  const adaBelumTersimpan = useCallback(
    () =>
      kotor.current.size > 0 ||
      Object.keys(diJalan.current).length > 0 ||
      Object.keys(gagalRef.current).length > 0,
    []
  );

  /** Tombol "Coba lagi": kirim ulang semua isian yang gagal, hitungan ulang dari nol. */
  const cobaLagiSemua = useCallback(() => {
    for (const key of Object.keys(gagalRef.current)) {
      hitungUlang.current[key] = 0;
      if (timerUlang.current[key]) {
        clearTimeout(timerUlang.current[key]);
        delete timerUlang.current[key];
      }
      kotor.current.add(key);
      setStatus(key, 'pending');
    }
    void flushSaves();
  }, [flushSaves, setStatus]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushSaves(true);
    };
    const onPageHide = () => {
      void flushSaves(true);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void flushSaves(true);
      // Masih ada isian yang belum sampai server → minta konfirmasi peramban.
      if (adaBelumTersimpan()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onOnline = () => cobaLagiSemua();
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flushSaves, adaBelumTersimpan, cobaLagiSemua]);

  // Ingat halaqah yang sedang dibuka (termasuk lewat tautan ?halaqah=) supaya
  // kunjungan berikutnya tanpa parameter mendarat di halaqah yang sama.
  useEffect(() => {
    try {
      document.cookie = `${HALAQAH_COOKIE}=${encodeURIComponent(halaqah.id)}; path=/evaluasi; max-age=31536000; samesite=lax`;
    } catch {
      /* cookie diblokir — jatuh ke halaqah pertama, seperti dulu */
    }
  }, [halaqah.id]);

  // Ukur pita atas yang menempel (Mode Coba / peringatan simpan). Elemennya
  // selalu dirender (kosong = tinggi 0), jadi cukup dipasang sekali.
  useIsoLayoutEffect(() => {
    const el = pitaRef.current;
    if (!el) return;
    const ukur = () => setPitaTinggi(el.getBoundingClientRect().height);
    ukur();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Setelah overlay rapot rinci ter-render (dipicu tombol PDF), buka dialog cetak.
  // Tunggu font & gambar (logo) selesai dulu — kalau tidak, kop bisa tercetak kosong.
  useEffect(() => {
    if (!printReq) return;
    let batal = false;
    const jalan = async () => {
      try {
        await document.fonts?.ready;
      } catch {
        /* abaikan */
      }
      const belum = Array.from(document.images).filter((im) => !im.complete);
      if (belum.length) {
        await Promise.race([
          Promise.all(
            belum.map(
              (im) =>
                new Promise<void>((res) => {
                  im.addEventListener('load', () => res(), { once: true });
                  im.addEventListener('error', () => res(), { once: true });
                })
            )
          ),
          new Promise<void>((res) => setTimeout(res, 2500)),
        ]);
      }
      if (batal) return;
      requestAnimationFrame(() => {
        window.print();
        // JANGAN `setPrintReq(null)` di sini. Di Safari iOS `window.print()`
        // TIDAK memblokir: ia kembali seketika lalu lembar cetak dibuka
        // belakangan, dan snapshot dokumennya diambil PADA SAAT ITU. Menutup
        // overlay tepat setelah print() membuat React sempat memasang kembali
        // layar aplikasi lebih dulu — yang tercetak lalu halaman awal Evaluasi,
        // bukan rapotnya. Overlay dibiarkan terbuka dan ditutup pengajar lewat
        // tombol "← Tutup"; 'afterprint' sengaja TIDAK dipakai untuk menutup
        // otomatis, sebab dukungannya di Safari iOS tak bisa diandalkan dan
        // kegagalannya berbentuk halaman salah cetak lagi.
      });
    };
    void jalan();
    return () => {
      batal = true;
    };
  }, [printReq]);

  const updateWork = useCallback(
    (
      id: string,
      j: Jenis,
      session: number,
      patch: Partial<EvWork> | ((existing: EvWork) => Partial<EvWork>),
      opts: { save?: boolean } = { save: true }
    ) => {
      const key = workKey(id, j, session);
      // Sesi terkirim = hanya-baca. Server menolak penulisannya (409), jadi
      // suntingan yang lolos di sini cuma akan "hilang" saat dimuat ulang.
      if (sentSesiRef.current[`${j}|${session}`]) return;
      ubahWork((prev) => {
        const sesi = initial.sesiList.find((s) => s.jenis === j && s.nomor_sesi === session);
        const existing = prev[key] ?? defaultWork(sesi?.ayat_mulai ?? ayatMulai);
        const p = typeof patch === 'function' ? patch(existing) : patch;
        return { ...prev, [key]: { ...existing, ...p } };
      });
      if (opts.save !== false) scheduleSave(id, j, session);
    },
    [initial.sesiList, ayatMulai, scheduleSave, ubahWork]
  );

  const bump = useCallback(
    (id: string, j: Jenis, session: number, k: string, d: number) => {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
      // Hitung count berikutnya DI DALAM updater — cegah tap cepat kehilangan increment.
      updateWork(id, j, session, (existing) => ({
        counts: { ...existing.counts, [k]: Math.max(0, (existing.counts[k] || 0) + d) },
      }));
    },
    [updateWork]
  );
  const setCount = useCallback(
    (id: string, j: Jenis, session: number, k: string, v: string) => {
      const n = Math.max(0, parseInt(v, 10) || 0);
      updateWork(id, j, session, { counts: { ...getWork(id, j, session).counts, [k]: n } });
    },
    [getWork, updateWork]
  );

  function tileRow(
    id: string,
    j: Jenis,
    session: number,
    k: string,
    label: string,
    shades: string[],
    borders: string[],
    textColor: string
  ): Tile {
    const count = getWork(id, j, session).counts[k] || 0;
    const i = Math.min(count, 4);
    return {
      key: k,
      label,
      count,
      tileBg: shades[i],
      tileBorder: borders[i],
      textColor,
      showMinus: count > 0,
      tap: () => bump(id, j, session, k, 1),
      minus: (e) => {
        e.stopPropagation();
        bump(id, j, session, k, -1);
      },
      setCount: (e) => {
        const digits = String(e.target.value).replace(/[^0-9]/g, '');
        setCount(id, j, session, k, digits === '' ? '0' : digits);
      },
      stop: (e) => e.stopPropagation(),
    };
  }

  // Toggle Mode Coba. ON → snapshot work bersih; OFF → buang eksperimen, kembalikan.
  const toggleCoba = async () => {
    if (!coba) {
      await flushSaves(); // pastikan simpanan asli tuntas dulu
      cobaSnapshot.current = {
        work: workRef.current,
        ujianDihapus: new Set(ujianDihapus),
        sentSesi: { ...sentSesi },
      };
      cobaRef.current = true;
      setCoba(true);
    } else {
      const snap = cobaSnapshot.current;
      if (snap) {
        ubahWork(() => snap.work);
        setUjianDihapus(snap.ujianDihapus);
        // "Buka kunci"/reset di Mode Coba cuma lokal — kembalikan tanda terkirim.
        setSentSesi(snap.sentSesi);
      }
      cobaSnapshot.current = null;
      cobaRef.current = false;
      setStatuses({});
      setCoba(false);
      // Isian asli yang tertahan selama Mode Coba (mis. gagal sebelum ON) dikirim lagi.
      for (const key of Object.keys(gagalRef.current)) setStatus(key, 'error');
      void flushSaves();
    }
  };

  // Buang simpanan tertunda milik satu sesi. Tanpa ini, timer debounce 700ms
  // yang masih antre akan menyala SESUDAH reset, membaca defaultWork, lalu
  // menulis ulang baris yang barusan dihapus di server (baris kosong hantu).
  //
  // `pesertaId` → hanya isian satu peserta. Promise selesai setelah permintaan
  // simpan yang terlanjur di jalan untuk isian itu tuntas, supaya DELETE tidak
  // disusul upsert yang menghidupkan barisnya lagi.
  const batalkanSimpanTertunda = useCallback(
    async (j: Jenis, session: number, pesertaId?: string): Promise<void> => {
      const akhiran = `|${j}|${session}`;
      const kena = (key: string) =>
        pesertaId ? key === workKey(pesertaId, j, session) : key.endsWith(akhiran);
      for (const key of Object.keys(timers.current)) {
        if (!kena(key)) continue;
        clearTimeout(timers.current[key]);
        delete timers.current[key];
      }
      for (const key of Object.keys(timerUlang.current)) {
        if (!kena(key)) continue;
        clearTimeout(timerUlang.current[key]);
        delete timerUlang.current[key];
      }
      for (const key of Array.from(kotor.current)) if (kena(key)) kotor.current.delete(key);
      for (const key of Object.keys(gagalRef.current)) if (kena(key)) setGagalKey(key, null);
      const jalan = Object.entries(diJalan.current)
        .filter(([key]) => kena(key))
        .map(([, p]) => p);
      if (jalan.length) await Promise.all(jalan);
      // Permintaan yang barusan tuntas bisa saja menandai kotor lagi (galat sementara).
      for (const key of Array.from(kotor.current)) if (kena(key)) kotor.current.delete(key);
      for (const key of Object.keys(timerUlang.current)) {
        if (!kena(key)) continue;
        clearTimeout(timerUlang.current[key]);
        delete timerUlang.current[key];
      }
      for (const key of Object.keys(gagalRef.current)) if (kena(key)) setGagalKey(key, null);
    },
    [setGagalKey]
  );

  /**
   * Bersihkan jejak satu sesi di sisi klien: nilai, simpanan tertunda, dan
   * penanda "sudah terkirim". Dipakai setelah server menghapus nilainya.
   */
  const bersihkanSesiLokal = (j: Jenis, nomor: number) => {
    if (!cobaRef.current) {
      void batalkanSimpanTertunda(j, nomor);
      for (const p of peserta) delete versiRef.current[workKey(p.id, j, nomor)];
    }
    ubahWork((prev) => {
      const next = { ...prev };
      for (const p of peserta) delete next[workKey(p.id, j, nomor)];
      return next;
    });
    setSentSesi((prev) => {
      const next = { ...prev };
      delete next[`${j}|${nomor}`];
      return next;
    });
  };

  /**
   * Isian sesi (atau satu peserta) yang masih menunggu dikirim. Dicatat sebelum
   * reset membatalkan antrean, supaya bila server MENOLAK reset (mis. rapot
   * masih aktif) isian itu bisa diantrekan lagi — bukan ikut hilang diam-diam.
   */
  const antreanDari = (j: Jenis, session: number, pesertaId?: string): string[] => {
    const akhiran = `|${j}|${session}`;
    const kena = (key: string) =>
      pesertaId ? key === workKey(pesertaId, j, session) : key.endsWith(akhiran);
    const semua = new Set<string>([
      ...Array.from(kotor.current),
      ...Object.keys(timers.current),
      ...Object.keys(diJalan.current),
      ...Object.keys(gagalRef.current),
    ]);
    return Array.from(semua).filter(kena);
  };
  const antreLagi = (keys: string[]) => {
    if (!keys.length) return;
    for (const k of keys) {
      kotor.current.add(k);
      setStatus(k, 'pending');
    }
    void flushSaves();
  };
  /** Hapus status simpan milik satu sesi saja (status sesi lain tetap). */
  const hapusStatusSesi = (j: Jenis, session: number) => {
    const akhiran = `|${j}|${session}`;
    setStatuses((prev) => {
      const next: Record<string, SaveStatus> = {};
      for (const [k, v] of Object.entries(prev)) if (!k.endsWith(akhiran)) next[k] = v;
      return next;
    });
  };

  /** Kirim permintaan reset. `null` = berhasil, selain itu pesan galat siap tampil. */
  const kirimReset = async (sesiId: string, pesertaId?: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/evaluasi/nilai/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pesertaId ? { sesi_id: sesiId, peserta_id: pesertaId } : { sesi_id: sesiId }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        return json?.error || 'Gagal mereset sesi. Coba lagi.';
      }
      return null;
    } catch {
      return 'Gagal mereset sesi — periksa koneksi lalu coba lagi.';
    }
  };

  // Reset semua nilai sesi (jenis+sesi) aktif — kembali persis seperti belum
  // dinilai: skor hilang, semua peserta tercentang hadir lagi, progres 0.
  // Server dulu baru lokal: kalau server menolak (mis. rapot masih aktif),
  // tampilan tak boleh terlanjur kosong — nilai akan muncul lagi saat muat
  // ulang dan pengajar mengira resetnya berhasil. Mode Coba → lokal saja.
  const resetSesi = async () => {
    if (resetBusy) return;
    setResetError(null);

    const bersihkanLokal = () => {
      bersihkanSesiLokal(jenis, activeSession);
      hapusStatusSesi(jenis, activeSession);
      setActiveIdx(0);
      setKirimStatus('idle');
    };

    if (cobaRef.current) {
      bersihkanLokal();
      return;
    }

    const sesiId = sesiIdRef.current[`${jenis}|${activeSession}`];
    if (!sesiId) {
      // Sesi belum pernah dibuat di server → tak ada yang perlu dihapus.
      bersihkanLokal();
      return;
    }

    setResetBusy(true);
    // Batalkan simpanan tertunda SEBELUM permintaan berangkat, supaya tak ada
    // upsert yang menyusul di belakang DELETE dan menghidupkan baris lagi.
    const antre = antreanDari(jenis, activeSession);
    await batalkanSimpanTertunda(jenis, activeSession);
    const galat = await kirimReset(sesiId);
    if (galat) {
      setResetError(galat);
      antreLagi(antre);
    } else bersihkanLokal();
    setResetBusy(false);
  };

  /**
   * Reset dari kartu riwayat — sesi mana pun yang sudah terkirim, termasuk
   * Ujian QN dan Ujian PB.
   *
   * Sebelumnya mengosongkan ujian akhir menuntut perjalanan buta: Ujian Akhir →
   * pilih sesi ujiannya → layar daftar → Reset, sementara baris riwayatnya
   * sendiri hanya menawarkan "Buka kunci". Server membuka kuncinya sendiri
   * (lihat /api/evaluasi/nilai/reset), jadi satu ketukan di sini cukup.
   */
  const resetSesiRiwayat = async (sesiId: string, j: Jenis, nomor: number) => {
    if (resetBusyId) return;
    setRiwayatError(null);

    if (cobaRef.current) {
      bersihkanSesiLokal(j, nomor);
      setResetKonfirmasi(null);
      return;
    }

    setResetBusyId(sesiId);
    const antre = antreanDari(j, nomor);
    await batalkanSimpanTertunda(j, nomor);
    const galat = await kirimReset(sesiId);
    if (galat) {
      setRiwayatError(galat);
      antreLagi(antre);
    } else {
      bersihkanSesiLokal(j, nomor);
      hapusStatusSesi(j, nomor);
      setResetKonfirmasi(null);
    }
    setResetBusyId(null);
  };

  /**
   * Kosongkan nilai SATU peserta di sesi aktif — bawaan reset sekarang. Dulu
   * satu-satunya Reset menghapus nilai seluruh peserta sesi, padahal hampir
   * selalu yang dimaksud cuma membetulkan satu orang.
   */
  const resetPesertaAktif = async (pesertaId: string) => {
    if (resetPesertaBusy) return;
    setResetPesertaError(null);
    const key = workKey(pesertaId, jenis, activeSession);
    const bersihkanLokal = () => {
      ubahWork((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete versiRef.current[key];
      setStatuses((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    };
    if (cobaRef.current) {
      bersihkanLokal();
      return;
    }
    setResetPesertaBusy(true);
    const antre = antreanDari(jenis, activeSession, pesertaId);
    await batalkanSimpanTertunda(jenis, activeSession, pesertaId);
    const sesiId = sesiIdRef.current[`${jenis}|${activeSession}`];
    const galat = sesiId ? await kirimReset(sesiId, pesertaId) : null;
    if (galat) {
      setResetPesertaError(galat);
      antreLagi(antre);
    } else {
      bersihkanLokal();
    }
    setResetPesertaBusy(false);
  };

  // Buka kunci sesi terkirim dari kartu riwayat: status server kembali 'draft'
  // sehingga nilainya bisa disunting (dan direset) lagi. Nilai lamanya utuh —
  // "kosongkan dari nol" tetap lewat tombol Reset di layar daftar.
  const bukaKunciSesi = async (sesiId: string, jenis: Jenis, nomor: number) => {
    if (bukaBusy) return;
    setRiwayatError(null);

    const lepasKunciLokal = () => {
      setSentSesi((prev) => {
        const next = { ...prev };
        delete next[`${jenis}|${nomor}`];
        return next;
      });
      setBukaKonfirmasi(null);
    };

    if (cobaRef.current) {
      lepasKunciLokal();
      return;
    }

    setBukaBusy(sesiId);
    try {
      const res = await fetch('/api/evaluasi/sesi/buka-kunci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sesi_id: sesiId }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        // Penolakan karena rapot masih aktif datang lewat sini — pesannya
        // menyebut nama peserta, jadi tampilkan apa adanya.
        setRiwayatError(json?.error || 'Gagal membuka kunci sesi. Coba lagi.');
        return;
      }
      lepasKunciLokal();
      // Isian yang tadi ditolak karena sesinya terkirim kini bisa masuk.
      cobaLagiSemua();
    } catch {
      setRiwayatError('Gagal membuka kunci sesi — periksa koneksi lalu coba lagi.');
    } finally {
      setBukaBusy(null);
    }
  };

  const nav = (s: Screen) => {
    void flushSaves();
    setResetPesertaError(null);
    setResetError(null);
    setRiwayatError(null);
    setBukaKonfirmasi(null);
    // Galat penerbitan tak boleh ikut pindah layar: pesannya menyebut peserta
    // dan sesi tertentu, dan menempel di layar berikutnya cuma membingungkan.
    if (terbitStatus === 'error') {
      setTerbitStatus('idle');
      setTerbitPesan(null);
    }
    setScreen(s);
  };

  // Mulai penilaian dari kartu home: set jenis+sesi, muat surat/ayat dari sesi bila ada.
  const startJenis = (j: Jenis) => {
    void flushSaves();
    const opts = sesiOptionsFor(j);
    // Sesi awal: sesi terkecil yang BELUM terkirim (sama dengan label kartu
    // beranda). Dulu memakai currentSession dari server, yang bisa menunjuk
    // sesi terkirim — pengajar lalu menyunting sesi terkunci tanpa sadar.
    const preferred = initial.currentSession[j];
    const firstUnsent = opts.find((n) => !sentSesi[`${j}|${n}`]);
    const session = firstUnsent ?? (opts.includes(preferred) ? preferred : opts[0] ?? 1);
    const sesi = initial.sesiList.find((s) => s.jenis === j && s.nomor_sesi === session);
    setJenis(j);
    setActiveSession(session);
    // Surat/ayat tak lagi dipilih pengajar — pakai default sesi (silabus). Sesi
    // tetap dibuat lazy oleh ensureSesiId saat nilai pertama disimpan.
    setSurat(sesi?.surat ?? 'Al-Baqarah');
    setAyatMulai(sesi?.ayat_mulai ?? 142);
    setAyatSelesai(sesi?.ayat_selesai ?? 157);
    // Pengajar pilih sesi dulu (bisa hapus sesi ujian) sebelum daftar peserta.
    setScreen('p-setup');
  };

  const pickSession = (n: number) => {
    void flushSaves();
    setResetError(null);
    const sesi = initial.sesiList.find((s) => s.jenis === jenis && s.nomor_sesi === n);
    setActiveSession(n);
    if (sesi) {
      setSurat(sesi.surat);
      setAyatMulai(sesi.ayat_mulai);
      setAyatSelesai(sesi.ayat_selesai);
    }
  };

  // Pulihkan satu sesi ujian akhir (optimistic). PENGHAPUSAN SUDAH TIDAK ADA:
  // sejak rotasi rapot per-track (0062) Ujian QN & Ujian PB dua-duanya wajib —
  // masing-masing menyumbang 70% nilai akhir rapot track-nya. Server menolak
  // penghapusan dengan 409, jadi jangan kirim permintaan yang pasti gagal:
  // tombolnya cuma akan berkedip lalu balik tanpa penjelasan.
  const toggleSesiUjian = async (n: number, dihapus: boolean) => {
    // Penjaga: UI tidak lagi menawarkan penghapusan (tombolnya dibuang di Setup),
    // dan server membalas 409. Kalau toh terpanggil, berhenti di sini daripada
    // mengirim permintaan yang pasti gagal lalu me-revert diam-diam.
    if (dihapus) return;
    setUjianDihapus((prev) => {
      const nx = new Set(prev);
      if (dihapus) nx.add(n);
      else nx.delete(n);
      return nx;
    });
    // Bila sesi aktif ikut terhapus, pindah ke sesi ujian yang masih ada.
    if (dihapus && jenis === 'ujian' && activeSession === n) {
      const rest = Array.from({ length: maxSessions.ujian }, (_, i) => i + 1).filter(
        (m) => m !== n && !ujianDihapus.has(m)
      );
      if (rest.length) setActiveSession(rest[0]);
    }
    if (cobaRef.current) return; // Mode Coba: perubahan sesi lokal saja.
    try {
      const res = await fetch('/api/evaluasi/sesi/hapus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ halaqah_id: halaqah.id, nomor_sesi: n, dihapus }),
      });
      if (!res.ok) throw new Error('gagal');
    } catch {
      // Revert bila gagal.
      setUjianDihapus((prev) => {
        const nx = new Set(prev);
        if (dihapus) nx.delete(n);
        else nx.add(n);
        return nx;
      });
    }
  };

  const toggleIncluded = (id: string) => {
    const next = !isIncluded(id);
    // Simpan hadir ke work (sumber kebenaran) + persist; per (jenis, sesi) aktif.
    updateWork(id, jenis, activeSession, { hadir: next });
  };

  // ── Derived values (mirror renderVals) ──
  const isUjian = jenis === 'ujian';
  const trackName = (j: Jenis): string =>
    j === 'ujian' ? 'Ujian Akhir' : j === 'qn' ? config.nama_qn : config.nama_pb;
  const jl = trackName(jenis);
  const ambangJenis = isUjian ? halaqah.ambang_ujian : AMBANG;

  const includedPeserta = peserta.filter((p) => isIncluded(p.id));
  const selesaiCount = includedPeserta.filter((p) => getWork(p.id, jenis, activeSession).done).length;

  const activeP = peserta[activeIdx] ?? peserta[0];

  // Sesi aktif sudah terkirim → layar daftar & nilai hanya-baca.
  const currentSesiKey = `${jenis}|${activeSession}`;
  const alreadySent = !!sentSesi[currentSesiKey];
  const terkunci = alreadySent;

  // Status simpan lintas SEMUA peserta & sesi — bukan cuma peserta yang sedang
  // dibuka. `gagal` = belum tersimpan dan butuh perhatian; `proses` = sedang
  // antre/dikirim.
  const akhiranSesiAktif = `|${jenis}|${activeSession}`;
  const kunciGagal = Object.keys(gagal);
  const kunciProses = Object.entries(statuses)
    .filter(([k, st]) => (st === 'pending' || st === 'saving') && !(k in gagal))
    .map(([k]) => k);
  const gagalSesiIni = kunciGagal.filter((k) => k.endsWith(akhiranSesiAktif)).length;
  const belumTersimpanSesiIni =
    gagalSesiIni + kunciProses.filter((k) => k.endsWith(akhiranSesiAktif)).length;
  const ringkasGagal = kunciGagal.slice(0, 3).map((k) => {
    const { id, j, session } = uraiKey(k);
    return { key: k, teks: `${namaPeserta(id)} · ${sesiLabelPendek(j, session)}`, pesan: gagal[k] };
  });
  const multiHalaqah = initial.halaqahOptions.length > 1;

  const levelLabel = halaqah.level ?? (halaqah.mustawa != null ? `Mustawa ${halaqah.mustawa}` : '—');
  const headerMeta = `${halaqah.nama} · ${genderLabel(halaqah.gender)} · ${levelLabel} · ${halaqah.pesertaCount} peserta`;

  // Home cards.
  const dotColorsDone = { qn: 'var(--accent)', pb: 'oklch(0.55 0.10 210)', ujian: 'var(--accent)' };
  const homeCards = (['qn', 'pb', 'ujian'] as Jenis[]).map((j) => {
    const opts = sesiOptionsFor(j);
    const max = opts.length;
    const sentKeyOf = (n: number) => sentSesi[`${j}|${n}`];
    const preferred = initial.currentSession[j];
    // Sesi berjalan = sesi terkecil yang belum terkirim (live), fallback ke server.
    // Label & titik dibaca dari sumber sama (sentSesi) supaya tak divergen.
    const firstUnsent = opts.find((n) => !sentKeyOf(n));
    const cur = firstUnsent ?? (opts.includes(preferred) ? preferred : opts[opts.length - 1] ?? 1);
    const dots = opts.map((n) => ({
      key: `d${n}`,
      color: sentKeyOf(n) ? dotColorsDone[j] : n === cur ? 'oklch(0.78 0.10 80)' : 'var(--line)',
    }));
    const bg = j === 'qn' ? 'var(--accent-tint)' : j === 'pb' ? 'oklch(0.96 0.03 210)' : 'oklch(0.96 0.035 85)';
    const border = j === 'qn' ? 'var(--accent-line)' : j === 'pb' ? 'oklch(0.87 0.05 210)' : 'oklch(0.88 0.07 82)';
    return {
      key: j,
      icon: j === 'qn' ? '📖' : j === 'pb' ? '📝' : '🎓',
      title: trackName(j),
      desc:
        j === 'ujian'
          ? `${opts.length} sesi ujian · ${fmtTgl(config.jadwal[j]?.[cur - 1])}`
          : `Sesi ${cur} dari ${max} · ${fmtTgl(config.jadwal[j]?.[cur - 1])}`,
      bg,
      border,
      dots,
      start: () => startJenis(j),
    };
  });

  // Riwayat: sesi terkirim.
  const riwayat = initial.sesiList
    .filter((s) => sentSesi[`${s.jenis}|${s.nomor_sesi}`])
    .sort((a, b) => (a.jenis === b.jenis ? a.nomor_sesi - b.nomor_sesi : a.jenis.localeCompare(b.jenis)))
    .map((s) => {
      const rows = peserta
        .map((p) => getWork(p.id, s.jenis, s.nomor_sesi))
        .filter((w) => w.done && w.hadir !== false);
      const scores = rows.map((w) => scoreOf(w.counts).skor);
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      // Jumlah peserta yang punya isian — disebut di konfirmasi reset sesi.
      const terisi = peserta.filter((p) => !!workRef.current[workKey(p.id, s.jenis, s.nomor_sesi)]).length;
      return {
        terisi,
        key: s.id,
        jenis: s.jenis,
        nomor: s.nomor_sesi,
        label: `${sesiLabelPendek(s.jenis, s.nomor_sesi)} — ${fmtBulan(s.tgl_jadwal)}`,
        hadirCount: rows.length,
        total: peserta.length,
        avg,
      };
    });

  // Daftar items.
  const daftarItems = peserta.map((p, i) => {
    const rec = getWork(p.id, jenis, activeSession);
    const sc = scoreOf(rec.counts);
    const tier = tierOf(sc.skor);
    const inc = isIncluded(p.id);
    const k = workKey(p.id, jenis, activeSession);
    const simpan: 'gagal' | 'proses' | null =
      k in gagal ? 'gagal' : belumAman(statuses[k]) ? 'proses' : null;
    return {
      key: p.id,
      simpan,
      nama: p.nama,
      ketua: p.is_ketua ? ' 👑' : '',
      initial: initials(p.nama),
      toggle: () => {
        if (!terkunci) toggleIncluded(p.id);
      },
      checkMark: inc ? '✓' : '',
      checkBg: inc ? 'var(--accent)' : '#ffffff',
      checkBorder: inc ? 'var(--accent)' : 'var(--line-2)',
      rowOpacity: inc ? 1 : 0.45,
      buka: () => {
        setActiveIdx(i);
        setScreen('p-nilai');
      },
      statusText: !inc ? 'Tidak hadir' : rec.done ? tier.label : 'Belum dinilai',
      showSkor: inc && rec.done,
      skor: sc.skor,
      skorColor: tier.color,
    };
  });

  // Nilai (peserta aktif).
  const nilaiRec = getWork(activeP.id, jenis, activeSession);
  const nilaiSc = scoreOf(nilaiRec.counts);
  const nilaiTier = tierOf(nilaiSc.skor);
  const jaliyRows = JALIY.map((d) =>
    tileRow(activeP.id, jenis, activeSession, d.key, d.label, JALIY_SHADES, JALIY_BORDERS, 'oklch(0.46 0.14 25)')
  );
  const khafiyRows = KHAFIY.map((d) =>
    tileRow(activeP.id, jenis, activeSession, d.key, d.label, KHAFIY_SHADES, KHAFIY_BORDERS, 'oklch(0.48 0.10 75)')
  );
  const lulus = nilaiSc.skor >= ambangJenis;

  // Ringkasan.
  const ringkasanItems = includedPeserta
    .filter((p) => getWork(p.id, jenis, activeSession).done)
    .map((p) => {
      const r = getWork(p.id, jenis, activeSession);
      const scc = scoreOf(r.counts);
      const t = tierOf(scc.skor);
      return {
        key: p.id,
        nama: p.nama,
        initial: initials(p.nama),
        skor: scc.skor,
        skorColor: t.color,
        tierLabel: t.label,
        lihat: () => {
          setRaporId(p.id);
          // Sesi yang sedang dibuka cuma menentukan rapot mana yang PERTAMA
          // ditampilkan; setelah itu pengajar bebas pindah QN ⇄ PB di layarnya.
          const dok = dokDariSesi(jenis, activeSession);
          if (dok) setRapotTrack(dok);
          setTerbitStatus('idle');
          setTerbitToken(null);
          setTerbitPesan(null);
          setScreen('p-rapor');
        },
      };
    });
  const ringkasanScores = ringkasanItems.map((x) => x.skor);
  const rataRata = ringkasanScores.length
    ? Math.round(ringkasanScores.reduce((a, b) => a + b, 0) / ringkasanScores.length)
    : 0;
  const waText =
    `Rekap ${jl} — Halaqah ${halaqah.nama}\n` +
    `${fmtBulan(config.jadwal[jenis]?.[activeSession - 1]) || ''}\n\n` +
    ringkasanItems.map((x) => `• ${x.nama}: ${x.skor}`).join('\n') +
    `\n\nRata-rata: ${rataRata}`;

  // Jumlah peserta yang punya isian di sesi aktif — disebut di konfirmasi reset sesi.
  const terisiSesiAktif = peserta.filter((p) => !!workRef.current[workKey(p.id, jenis, activeSession)]).length;

  const kirim = async () => {
    if (cobaRef.current) return; // Mode Coba: tak mengirim ke koordinator.
    setKirimStatus('saving');
    setKirimPesan(null);
    // Tunggu antrean simpan tuntas DULU. Dulu Kirim bisa berangkat selagi
    // isian terakhir masih di jalan / gagal, lalu sesinya terkunci dan isian
    // itu ditolak 409 tanpa jejak.
    await flushSaves();
    const akhiran = `|${jenis}|${activeSession}`;
    const sisa = new Set<string>(
      [
        ...Array.from(kotor.current),
        ...Object.keys(diJalan.current),
        ...Object.keys(gagalRef.current),
      ].filter((k) => k.endsWith(akhiran))
    );
    if (sisa.size) {
      setKirimStatus('error');
      setKirimPesan(
        `${sisa.size} isian belum tersimpan — ketuk "Coba lagi" di pita merah atas, lalu kirim ulang.`
      );
      return;
    }
    const sesiId = await ensureSesiId(jenis, activeSession);
    if (!sesiId) {
      setKirimStatus('error');
      setKirimPesan('Sesi belum bisa dibuat di server — periksa koneksi lalu coba lagi.');
      return;
    }
    try {
      const res = await fetch('/api/evaluasi/kirim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sesi_id: sesiId }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setKirimStatus('error');
        setKirimPesan(json?.error || 'Gagal mengirim — coba lagi.');
        return;
      }
      setSentSesi((prev) => ({ ...prev, [currentSesiKey]: true }));
      setKirimStatus('saved');
      nav('p-home'); // terkirim → kembali ke awal
    } catch {
      setKirimStatus('error');
      setKirimPesan('Gagal mengirim — periksa koneksi lalu coba lagi.');
    }
  };

  // Ganti halaqah: ingat pilihan, tuntaskan antrean simpan, baru pindah halaman.
  const gantiHalaqah = async (id: string) => {
    try {
      document.cookie = `${HALAQAH_COOKIE}=${encodeURIComponent(id)}; path=/evaluasi; max-age=31536000; samesite=lax`;
    } catch {
      /* abaikan */
    }
    await flushSaves();
    window.location.href = `/evaluasi/pengajar?halaqah=${encodeURIComponent(id)}`;
  };

  // Rapot (peserta terpilih) — payload dari builder murni (identik dgn snapshot server).
  const rId = raporId ?? activeP.id;
  const rPeserta = peserta.find((p) => p.id === rId) ?? activeP;
  const assembleSesi = (pid: string): SesiNilaiInput[] => {
    const out: SesiNilaiInput[] = [];
    const push = (j: Jenis, maxN: number) => {
      for (let n = 1; n <= maxN; n++) {
        const w = getWork(pid, j, n);
        const sesi = initial.sesiList.find((s) => s.jenis === j && s.nomor_sesi === n);
        out.push({ jenis: j, nomor_sesi: n, counts: w.counts, catatan: w.catatan, tgl: sesi?.tgl_jadwal ?? null, done: w.done, hadir: w.hadir });
      }
    };
    push('qn', 4);
    push('pb', 4);
    push('ujian', maxSessions.ujian);
    return out;
  };
  const rIdentitas = {
    peserta: rPeserta.nama,
    halaqah: halaqah.nama,
    level: halaqah.level,
    mustawa: halaqah.mustawa,
    gender: halaqah.gender,
    batch: halaqah.batch,
  };
  const rSesi = assembleSesi(rId);
  // Batch `rapot_ujian_terpisah` tidak menjalankan sesi berkala sama sekali, jadi
  // nilai akhir kedua track murni skor ujiannya (`ujianSaja`).
  const terpisah = halaqah.rapotUjianTerpisah;
  const namaTrack = (t: Track): string => (t === 'qn' ? config.nama_qn : config.nama_pb);

  // Rekap Sesi: satu tabel semua peserta untuk satu sesi, dari state `work`
  // yang hidup (sama sumbernya dengan Ringkasan). Hanya sesi yang sudah ada.
  const URUT_JENIS: Record<Jenis, number> = { qn: 0, pb: 1, ujian: 2 };
  const rekapOpsi: RekapSesiOpsi[] = initial.sesiList
    .filter((s) => !s.dihapus)
    .sort((a, b) => (a.jenis === b.jenis ? a.nomor_sesi - b.nomor_sesi : URUT_JENIS[a.jenis] - URUT_JENIS[b.jenis]))
    .map((s) => ({
      jenis: s.jenis,
      nomor: s.nomor_sesi,
      label: labelSesi(s.jenis, s.nomor_sesi, namaTrack),
      tgl: s.tgl_jadwal,
      terkirim: !!sentSesi[`${s.jenis}|${s.nomor_sesi}`],
    }));
  const rekapAktif =
    (rekapSel && rekapOpsi.some((o) => o.jenis === rekapSel.jenis && o.nomor === rekapSel.nomor) ? rekapSel : null) ??
    (rekapOpsi[0] ? { jenis: rekapOpsi[0].jenis, nomor: rekapOpsi[0].nomor } : null);
  const rekapAmbang = rekapAktif?.jenis === 'ujian' ? halaqah.ambang_ujian : AMBANG;
  const rekapData = rekapAktif
    ? susunRekapSesi(
        peserta,
        Object.fromEntries(peserta.map((p) => [p.id, getWork(p.id, rekapAktif.jenis, rekapAktif.nomor)])),
        rekapAmbang
      )
    : null;
  const rekapXlsxUrl = (semua: boolean): string => {
    const q = new URLSearchParams({ halaqah: halaqah.id });
    if (semua) q.set('semua', '1');
    else if (rekapAktif) {
      q.set('jenis', rekapAktif.jenis);
      q.set('nomor', String(rekapAktif.nomor));
    }
    return `/api/evaluasi/rekap?${q.toString()}`;
  };
  const trackShort = (t: Track): string => (t === 'qn' ? 'QN' : 'PB');

  // Builder murni & murah — dua-duanya dibangun tiap render, yang dipilih saat
  // render adalah `rapotTrack`. Tak ada cabang tersembunyi lewat jenis/sesi aktif.
  const buildTrackPayload = (
    idn: typeof rIdentitas,
    sesi: SesiNilaiInput[],
    t: Track,
  ): RapotPayloadTrack =>
    buildTrackRapotPayload({
      track: t,
      identitas: idn,
      penerbit: initial.pengajarName,
      // Pratinjau & cetak cepat memakai tanggal hari ini. Sebelumnya string
      // kosong, dan lembar A4-nya mencetak baris tanggal yang benar-benar kosong
      // tepat di atas garis tanda tangan "Penguji".
      tanggal: new Date().toISOString(),
      sesi,
      namaTrack: namaTrack(t),
      ambangUjianSesi: halaqah.ambang_ujian,
      ujianSaja: terpisah,
    });

  const rapotQn = buildTrackPayload(rIdentitas, rSesi, 'qn');
  const rapotPb = buildTrackPayload(rIdentitas, rSesi, 'pb');
  const rapotAktif = rapotTrack === 'qn' ? rapotQn : rapotPb;

  // Rapot rinci sembarang peserta, untuk dicetak sebagai lembar A4.
  const buildRapotFor = (pid: string, track: Track): RapotPayloadTrack => {
    const nama = peserta.find((p) => p.id === pid)?.nama ?? '';
    const idn = { peserta: nama, halaqah: halaqah.nama, level: halaqah.level, mustawa: halaqah.mustawa, gender: halaqah.gender, batch: halaqah.batch };
    return buildTrackPayload(idn, assembleSesi(pid), track);
  };

  // `pesertaUntukDok` DIHAPUS bersama menu cetak lama: ambangnya (cukup SATU
  // sesi dinilai) tak pernah sama dengan syarat terbit, dan itulah yang membuat
  // "2 peserta siap dicetak" di beranda tak berarti apa-apa. Kelayakan sekarang
  // dihitung satu pintu lewat `alasanBelumTerbit`.

  /**
   * Buka Pusat Rapot dari sebuah sesi. Track hanya diganti bila sesi itu memang
   * punya dokumen — sesi ujian lawas (nomor di luar 1/2) membuka Pusat Rapot apa
   * adanya, tanpa memaksa dokumen yang bukan miliknya.
   */
  const bukaPusatRapot = (j: Jenis, nomor: number) => {
    const dok = dokDariSesi(j, nomor);
    if (dok) setRapotTrack(dok);
    nav('p-rapot');
  };

  /**
   * Ringkasan untuk kartu beranda. Memakai `alasanBelumTerbit` — aturan yang SAMA
   * dengan tombol Terbitkan dan guard server. Kartu lama memakai
   * `pesertaUntukDok` (cukup SATU sesi dinilai), jadi "2 peserta siap dicetak"
   * bisa berarti nol peserta yang benar-benar bisa diterbitkan.
   */
  const ringkasRapot = TRACKS.reduce(
    (acc, t) => {
      for (const p of peserta) {
        const lengkap = alasanBelumTerbit(buildRapotFor(p.id, t).trackRapot).length === 0;
        if (lengkap) acc.siap += 1;
        else acc.belum += 1;
      }
      acc.terbit += rapotTerbit.filter((r) => r.track === t).length;
      return acc;
    },
    { siap: 0, belum: 0, terbit: 0 }
  );

  /**
   * Terbitkan rapot resmi (ber-QR) satu peserta.
   *
   * `pesertaId` diberikan pemanggil: layar detail memakai peserta yang sedang
   * dibuka, Pusat Rapot memakai baris yang di-tap. Dulu terikat mati ke `rId`,
   * sehingga penerbitan hanya mungkin dari satu layar.
   */
  const terbitkanRapot = async (jenis_rapot: Track, pesertaId: string) => {
    if (cobaRef.current) {
      // Dulu `return` senyap: tombol ditekan, tak ada yang terjadi, tak ada
      // penjelasan. Sekarang sebabnya disebut.
      setTerbitStatus('error');
      setTerbitPesan('Mode Coba menyala — matikan dulu untuk menerbitkan rapot resmi.');
      return;
    }
    setTerbitBusyId(pesertaId);
    setTerbitStatus('saving');
    setTerbitPesan(null);
    try {
      const res = await fetch('/api/evaluasi/rapot/terbitkan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ halaqah_id: halaqah.id, peserta_id: pesertaId, jenis_rapot }),
      });
      const json = await res.json();
      if (!res.ok || !json.token) throw new Error(json.error || 'gagal');
      // Daftar rapot terbit diperbarui di tempat: satu rapot aktif per
      // (peserta, halaqah, track) — terbit ulang MENGGANTI, bukan menambah.
      setRapotTerbit((prev) => [
        ...prev.filter((r) => !(r.peserta_id === pesertaId && r.track === jenis_rapot)),
        {
          token: json.token as string,
          peserta_id: pesertaId,
          track: jenis_rapot,
          nilai_akhir: null,
          lulus: null,
          diterbitkan_at: new Date().toISOString(),
        },
      ]);
      // Token disimpan ke state DULU, baru tab dibuka. `window.open` di sini
      // dipanggil setelah `await`, jadi gesture pengguna sudah habis dan Safari
      // maupun Chrome HP memblokirnya. Kini itu tak lagi fatal: tokennya sudah
      // masuk `rapotTerbit` dan selalu bisa ditemukan lagi di Pusat Rapot.
      setTerbitToken(json.token);
      setTerbitStatus('done');
      window.open(`/evaluasi/pengajar/rapot/${json.token}`, '_blank');
    } catch (e) {
      setTerbitPesan(e instanceof Error && e.message !== 'gagal' ? e.message : null);
      setTerbitStatus('error');
    } finally {
      setTerbitBusyId(null);
    }
  };

  // Tinggi shell dipasang lewat class `.ev-shell` (100vh → 100dvh) supaya di
  // browser mobile bertoolbar-bawah dasar shell tak tertelan toolbar.
  const shellStyle: React.CSSProperties = {
    maxWidth: 460,
    margin: '0 auto',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 0 0 1px var(--line)',
  };

  // Overlay cetak: render lembar A4 tiap peserta terpilih, lalu useEffect memicu print.
  // Sengaja memakai komponen A4 (bukan layar rapot versi HP) supaya hasil cetak rapi
  // satu peserta = satu halaman, bukan kartu 460px yang meluber ke mana-mana.
  if (printReq) {
    const built = printReq.ids.map((pid) => ({ pid, payload: buildRapotFor(pid, printReq.dok) }));
    return (
      <div className="a4-print-wrap eval-print-wrap">
        <RapotPrintStyle />
        <div
          className="noprint"
          style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '0 0 14px' }}
        >
          <button
            type="button"
            onClick={() => setPrintReq(null)}
            style={{ height: 38, padding: '0 14px', borderRadius: 8, border: '1px solid var(--line-2)', background: '#ffffff', font: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}
          >
            ← Tutup
          </button>
          <button
            type="button"
            onClick={() => {
              // `document.title` jadi nama berkas bawaan saat "Simpan sebagai
              // PDF". Tanpa disetel, seluruh cetakan tersimpan sebagai
              // "Tilawa Labs.pdf" dan saling bertumpuk.
              const judulLama = document.title;
              const satu = built.length === 1 ? peserta.find((p) => p.id === built[0].pid)?.nama : null;
              document.title = [
                `Rapot ${trackShort(printReq.dok)}`,
                satu ?? `${built.length} peserta`,
                halaqah.nama,
              ]
                .filter(Boolean)
                .join(' - ');
              // Judul dikembalikan lewat 'afterprint', BUKAN tepat setelah
              // print(). Di Safari iOS `window.print()` tak memblokir: lembar
              // cetaknya dibuka belakangan dan membaca judul PADA SAAT ITU —
              // mengembalikannya seketika membuat berkasnya bernama
              // "Tilawa Labs.pdf" lagi. Timeout jadi jaring
              // pengaman untuk peramban yang tak pernah mengirim 'afterprint'.
              let dipulihkan = false;
              const pulihkan = () => {
                if (dipulihkan) return;
                dipulihkan = true;
                document.title = judulLama;
                window.removeEventListener('afterprint', pulihkan);
              };
              window.addEventListener('afterprint', pulihkan);
              setTimeout(pulihkan, 60_000);
              window.print();
            }}
            style={{ height: 38, padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', font: 'inherit', fontSize: 13, fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}
          >
            ⬇ Cetak / Simpan PDF
          </button>
        </div>
        <div className="a4-stack">
          {built.map((b) => (
            <RapotTrackA4 key={b.pid} payload={b.payload} logoSrc="/logo-mpt.png" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <style>{`
        .ev-shell { min-height: 100vh; min-height: 100dvh; }
        .ev-press { transition: transform 0.06s ease; }
        .ev-press:active { transform: scale(0.96); }
        .ev-tile:active { transform: scale(0.95); }
        .ev-tile-sm:active { transform: scale(0.96); }
        .ev-step:active { transform: scale(0.92); }
        .ev-minus:active { transform: scale(0.88); }
        .ev-dark:hover { background: #2a2722 !important; }
        .ev-ghost:hover { background: var(--surface-2) !important; }
        .ev-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
      {/* Pita atas yang menempel: Mode Coba + peringatan simpan. Selalu
          dirender (kosong = tinggi 0) supaya tingginya bisa diukur, dan kepala
          layar Nilai yang juga menempel diturunkan sebanyak itu. */}
      <div ref={pitaRef} style={{ position: 'sticky', top: 0, zIndex: 40 }}>
        {coba && (
          <div
            style={{
              background: 'oklch(0.95 0.05 85)',
              borderBottom: '1px solid oklch(0.85 0.09 85)',
              color: 'oklch(0.42 0.09 75)',
              textAlign: 'center',
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.03em',
            }}
          >
            🧪 MODE COBA — perubahan TIDAK disimpan
          </div>
        )}
        {kunciGagal.length > 0 && (
          <div
            role="alert"
            style={{
              background: 'oklch(0.96 0.03 25)',
              borderBottom: '1px solid oklch(0.85 0.08 25)',
              color: 'oklch(0.42 0.14 25)',
              padding: '8px 12px',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            <div style={{ maxWidth: 460, margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>
                  ⚠ {kunciGagal.length} isian belum tersimpan
                </div>
                {ringkasGagal.map((g) => (
                  <div key={g.key} style={{ fontSize: 11, marginTop: 2 }}>
                    <b>{g.teks}</b> — {g.pesan}
                  </div>
                ))}
                {kunciGagal.length > ringkasGagal.length && (
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    dan {kunciGagal.length - ringkasGagal.length} lainnya. Jangan tutup halaman ini dulu.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={cobaLagiSemua}
                style={{ flexShrink: 0, height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: 'oklch(0.55 0.16 25)', color: '#ffffff', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Coba lagi
              </button>
            </div>
          </div>
        )}
        {konflik && (
          <div
            role="status"
            style={{
              background: 'oklch(0.96 0.04 85)',
              borderBottom: '1px solid oklch(0.86 0.08 85)',
              color: 'oklch(0.40 0.09 70)',
              padding: '8px 12px',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            <div style={{ maxWidth: 460, margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>{konflik}</div>
              <button
                type="button"
                onClick={() => setKonflik(null)}
                aria-label="Tutup pemberitahuan"
                style={{ flexShrink: 0, height: 26, padding: '0 10px', borderRadius: 7, border: '1px solid oklch(0.84 0.08 85)', background: '#ffffff', color: 'inherit', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="ev-shell" style={shellStyle}>
        {screen === 'p-home' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: '#ffffff', borderBottom: '1px solid var(--line)' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--surface-3)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                {initials(initial.pengajarName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{initial.pengajarName}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{headerMeta}</div>
              </div>
              <button
                type="button"
                onClick={toggleCoba}
                title="Mode Coba: eksperimen tanpa menyimpan"
                style={{
                  flexShrink: 0,
                  padding: '7px 12px',
                  borderRadius: 999,
                  border: `1.5px solid ${coba ? 'oklch(0.75 0.12 85)' : 'var(--line)'}`,
                  background: coba ? 'oklch(0.95 0.05 85)' : '#ffffff',
                  color: coba ? 'oklch(0.42 0.09 75)' : 'var(--muted)',
                  font: 'inherit',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {coba ? '🧪 Coba: ON' : 'Mode Coba'}
              </button>
            </div>

            {/* Pengajar ber-halaqah >1: halaqah aktif harus terlihat jelas.
                Dulu pemilih kecil di bawah kepala; pengajar menilai di halaqah
                yang salah lalu mengira isian di halaqah lain "hilang". */}
            {multiHalaqah && (
              <div style={{ padding: '14px 16px 0' }}>
                <div style={{ background: 'var(--accent-tint)', border: '1.5px solid var(--accent-line)', borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                    Halaqah aktif · {initial.halaqahOptions.findIndex((h) => h.id === halaqah.id) + 1} dari {initial.halaqahOptions.length}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{halaqah.nama}</div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 10, marginBottom: 4 }}>
                    Nilai tersimpan per halaqah. Ganti halaqah:
                  </label>
                  <select
                    value={halaqah.id}
                    onChange={(e) => void gantiHalaqah(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: '#ffffff', fontSize: 14, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}
                  >
                    {initial.halaqahOptions.map((h) => (
                      <option key={h.id} value={h.id}>{h.nama}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Kelola peserta — pengajar sering menerima peserta baru sebelum data
                pusat menyusul. Tanpa jalur ini orangnya tak bisa dinilai sama sekali. */}
            <div style={{ padding: '18px 16px 0' }}>
              <button
                onClick={() => nav('p-peserta')}
                className="ev-press"
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: '#ffffff', font: 'inherit', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>👥</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Peserta halaqah</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 1 }}>
                    {peserta.length} peserta · tambah, betulkan nama, keluarkan
                  </div>
                </div>
                <span style={{ fontSize: 15, color: 'var(--line-2)' }}>›</span>
              </button>

              {/* Nama & level halaqah ikut tercetak di kop rapot, jadi salah ejaan
                  dari data pusat harus bisa dibetulkan pengajar sendiri. */}
              <button
                onClick={() => nav('p-halaqah')}
                className="ev-press"
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 14px', marginTop: 10, borderRadius: 12, border: '1px solid var(--line)', background: '#ffffff', font: 'inherit', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>🏷</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Data halaqah</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 1 }}>
                    {halaqah.nama} · {levelLabel}
                  </div>
                </div>
                <span style={{ fontSize: 15, color: 'var(--line-2)' }}>›</span>
              </button>
            </div>

            <div style={{ padding: '18px 16px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
                Mulai penilaian · 4 sesi tiap level
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {homeCards.map((hc) => (
                  <button
                    key={hc.key}
                    onClick={hc.start}
                    className="ev-press"
                    style={{ textAlign: 'left', width: '100%', padding: 16, borderRadius: 14, border: `1.5px solid ${hc.border}`, background: hc.bg, cursor: 'pointer', font: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{hc.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{hc.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{hc.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {hc.dots.map((d) => (
                        <span key={d.key} style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 18, color: 'var(--muted-2)' }}>→</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rapot akhir — SATU pintu. Dulu dua kartu "Cetak rapot" yang hanya
                membuka pratinjau tanpa QR, sementara "Terbitkan" tersembunyi di
                ujung sesi → daftar → ringkasan → ketuk peserta. */}
            <div style={{ padding: '20px 16px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Rapot akhir</div>
              <button
                onClick={() => nav('p-rapot')}
                className="ev-press"
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: 16, borderRadius: 14, border: '1.5px solid oklch(0.85 0.06 150)', background: 'oklch(0.96 0.035 150)', font: 'inherit', cursor: 'pointer' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎓</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Rapot Akhir QN &amp; PB</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>
                    {ringkasRapot.siap} siap terbit · {ringkasRapot.belum} belum lengkap ·{' '}
                    {ringkasRapot.terbit} sudah terbit
                  </div>
                </div>
                <span style={{ fontSize: 18, color: 'var(--muted-2)' }}>→</span>
              </button>
              <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 8, lineHeight: 1.45 }}>
                Cetak PDF dan terbitkan lembar resmi ber-QR dari satu tempat. Ujian akhir sudah
                termasuk di dalam rapot tiap track.
              </div>
            </div>

            {/* Rekap per sesi — satu tabel semua peserta + rincian lahn, cetak/XLSX. */}
            <div style={{ padding: '20px 16px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Rekap nilai</div>
              <button
                onClick={() => nav('p-rekap')}
                className="ev-press"
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: 16, borderRadius: 14, border: '1.5px solid var(--line)', background: '#ffffff', cursor: 'pointer', font: 'inherit' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📊</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Rekap nilai per sesi</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.45 }}>
                    Satu tabel semua peserta beserta rincian lahn · cetak PDF atau unduh XLSX
                  </div>
                </div>
                <span style={{ fontSize: 18, color: 'var(--muted-2)' }}>→</span>
              </button>
            </div>

            <div style={{ padding: '20px 16px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Riwayat sesi</div>
              {riwayat.length === 0 ? (
                <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, padding: '14px', fontSize: 12, color: 'var(--muted-2)' }}>
                  Belum ada sesi yang dikirim.
                </div>
              ) : (
                <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
                  {riwayat.map((r, i) => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: i < riwayat.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.62 0.11 150)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 1 }}>
                          {r.hadirCount}/{r.total} peserta · rata-rata {r.avg ?? '—'}
                        </div>
                      </div>
                      {bukaKonfirmasi === r.key ? (
                        <>
                          <button
                            disabled={bukaBusy === r.key}
                            onClick={() => bukaKunciSesi(r.key, r.jenis, r.nomor)}
                            style={{ height: 28, padding: '0 10px', borderRadius: 7, border: 'none', background: 'oklch(0.55 0.16 25)', font: 'inherit', fontSize: 11, fontWeight: 700, color: '#fff', cursor: bukaBusy === r.key ? 'default' : 'pointer', opacity: bukaBusy === r.key ? 0.6 : 1, whiteSpace: 'nowrap' }}
                          >
                            {bukaBusy === r.key ? 'Membuka…' : 'Ya, buka'}
                          </button>
                          <button
                            disabled={bukaBusy === r.key}
                            onClick={() => { setBukaKonfirmasi(null); setRiwayatError(null); }}
                            style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid var(--line)', background: '#fff', font: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}
                          >
                            Batal
                          </button>
                        </>
                      ) : resetKonfirmasi === r.key ? (
                        <>
                          {/* Mengosongkan tak bisa dibatalkan — sebut akibatnya, jangan
                              cuma "Ya". */}
                          <span style={{ fontSize: 10.5, color: 'oklch(0.46 0.14 25)', lineHeight: 1.3, textAlign: 'right' }}>
                            Hapus nilai
                            <br />
                            {r.terisi} peserta?
                          </span>
                          <button
                            disabled={resetBusyId === r.key}
                            onClick={() => resetSesiRiwayat(r.key, r.jenis, r.nomor)}
                            style={{ height: 28, padding: '0 10px', borderRadius: 7, border: 'none', background: 'oklch(0.55 0.16 25)', font: 'inherit', fontSize: 11, fontWeight: 700, color: '#fff', cursor: resetBusyId === r.key ? 'default' : 'pointer', opacity: resetBusyId === r.key ? 0.6 : 1, whiteSpace: 'nowrap' }}
                          >
                            {resetBusyId === r.key ? 'Mereset…' : `Ya, hapus ${r.terisi}`}
                          </button>
                          <button
                            disabled={resetBusyId === r.key}
                            onClick={() => { setResetKonfirmasi(null); setRiwayatError(null); }}
                            style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid var(--line)', background: '#fff', font: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}
                          >
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            title="Kembalikan sesi ini jadi draft supaya nilainya bisa diperbaiki"
                            onClick={() => { setBukaKonfirmasi(r.key); setResetKonfirmasi(null); setRiwayatError(null); }}
                            style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid oklch(0.85 0.08 25)', background: '#ffffff', font: 'inherit', fontSize: 11, fontWeight: 600, color: 'oklch(0.46 0.14 25)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            🔓 Buka
                          </button>
                          {/* Reset di sini, bukan cuma di layar daftar: mengosongkan
                              Ujian QN/PB dulu menuntut menelusuri Ujian Akhir → pilih
                              sesi → daftar, padahal baris sesinya ada di depan mata. */}
                          <button
                            title="Kosongkan seluruh nilai sesi ini — sesi terkirim ikut dibuka"
                            onClick={() => { setResetKonfirmasi(r.key); setBukaKonfirmasi(null); setRiwayatError(null); }}
                            style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid oklch(0.85 0.08 25)', background: '#ffffff', font: 'inherit', fontSize: 11, fontWeight: 600, color: 'oklch(0.46 0.14 25)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            ♻ Reset
                          </button>
                          <button
                            onClick={() => bukaPusatRapot(r.jenis, r.nomor)}
                            style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid var(--line-2)', background: '#ffffff', font: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}
                          >
                            🖨 Cetak
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {riwayatError ? (
                <div style={{ marginTop: 8, fontSize: 11, color: 'oklch(0.46 0.14 25)', background: 'oklch(0.97 0.02 25)', border: '1px solid oklch(0.85 0.08 25)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.4 }}>
                  {riwayatError}
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.4 }}>
                  <b>Buka</b> mengembalikan sesi jadi draft — nilai lama tetap ada, tinggal disunting.
                  <b> Reset</b> mengosongkan nilai SEMUA peserta sesi itu dari nol, termasuk Ujian QN &amp;
                  Ujian PB. Untuk satu peserta saja: Buka dulu, lalu kosongkan dari layar nilai peserta itu.
                  Rapot yang sudah terbit harus dicabut lebih dulu.
                </div>
              )}
            </div>
            <div style={{ height: 24 }} />
          </>
        )}

        {screen === 'p-peserta' && (
          <KelolaPeserta
            halaqahId={halaqah.id}
            halaqahNama={halaqah.nama}
            peserta={peserta.map((p) => ({ id: p.id, nama: p.nama }))}
            coba={coba}
            back={() => nav('p-home')}
          />
        )}

        {screen === 'p-halaqah' && (
          <KelolaHalaqah
            halaqahId={halaqah.id}
            nama={halaqah.nama}
            level={halaqah.level}
            mustawa={halaqah.mustawa}
            coba={coba}
            back={() => nav('p-home')}
          />
        )}

        {screen === 'p-setup' && (
          <Setup
            judul={`${jl} — Pilih sesi`}
            sesiLabel={
              isUjian
                ? `${UJIAN_SESI_LABELS[activeSession - 1] ?? `Ujian ${activeSession}`} · dijadwalkan ${fmtTgl(config.jadwal[jenis]?.[activeSession - 1])}`
                : `Sesi ${activeSession} dari ${maxSessions[jenis]} · dijadwalkan ${fmtTgl(config.jadwal[jenis]?.[activeSession - 1])}`
            }
            halaqahLine={`${halaqah.nama} · ${genderLabel(halaqah.gender)} · ${levelLabel}`}
            pesertaCount={halaqah.pesertaCount}
            isUjian={isUjian}
            ambangUjian={halaqah.ambang_ujian}
            mustawa={halaqah.mustawa}
            sesiOptions={sesiOptionsFor(jenis)}
            activeSession={activeSession}
            sesiOptionLabels={isUjian ? UJIAN_SESI_LABELS : undefined}
            pickSession={pickSession}
            deletedOptions={
              isUjian
                ? Array.from({ length: maxSessions.ujian }, (_, i) => i + 1).filter((n) => ujianDihapus.has(n))
                : undefined
            }
            onToggleSesi={isUjian ? toggleSesiUjian : undefined}
            sesiTerkirim={sesiOptionsFor(jenis).filter((n) => !!sentSesi[`${jenis}|${n}`])}
            terkunci={terkunci}
            lanjutLabel={terkunci ? 'Lihat nilai (hanya-baca) →' : 'Lanjut ke daftar peserta →'}
            back={() => nav('p-home')}
            lanjut={async () => {
              if (!terkunci) await ensureSesiId(jenis, activeSession);
              nav('p-daftar');
            }}
          />
        )}

        {screen === 'p-daftar' && (
          <Daftar
            judul={jl}
            sub={
              (isUjian
                ? `${UJIAN_SESI_LABELS[activeSession - 1] ?? `Ujian ${activeSession}`}`
                : `Sesi ${activeSession} dari ${maxSessions[jenis]}`) +
              (multiHalaqah ? ` · ${halaqah.nama}` : '') +
              (terkunci ? ' · terkirim' : '')
            }
            items={daftarItems}
            selesai={selesaiCount}
            total={includedPeserta.length}
            progressPct={includedPeserta.length ? Math.round((selesaiCount / includedPeserta.length) * 100) : 0}
            tombolLabel={
              terkunci || (selesaiCount === includedPeserta.length && includedPeserta.length > 0)
                ? 'Lihat ringkasan sesi'
                : selesaiCount === 0
                ? 'Mulai menilai'
                : 'Lanjutkan menilai'
            }
            back={() => nav('p-home')}
            mulai={() => {
              if (terkunci || (selesaiCount === includedPeserta.length && includedPeserta.length > 0)) {
                nav('p-ringkasan');
                return;
              }
              const nextIdx = peserta.findIndex(
                (p) => isIncluded(p.id) && !getWork(p.id, jenis, activeSession).done
              );
              setActiveIdx(nextIdx >= 0 ? nextIdx : 0);
              setScreen('p-nilai');
            }}
            onReset={terkunci ? undefined : resetSesi}
            resetJumlah={terisiSesiAktif}
            resetBusy={resetBusy}
            resetError={resetError}
            onPdf={() => bukaPusatRapot(jenis, activeSession)}
            belumTersimpan={gagalSesiIni}
            terkunci={
              terkunci
                ? {
                    konfirmasi: bukaKonfirmasi === sesiIdRef.current[currentSesiKey],
                    busy: !!bukaBusy,
                    error: riwayatError,
                    minta: () => {
                      setRiwayatError(null);
                      setBukaKonfirmasi(sesiIdRef.current[currentSesiKey] ?? null);
                    },
                    batal: () => {
                      setBukaKonfirmasi(null);
                      setRiwayatError(null);
                    },
                    buka: () => {
                      const id = sesiIdRef.current[currentSesiKey];
                      if (id) void bukaKunciSesi(id, jenis, activeSession);
                    },
                  }
                : null
            }
          />
        )}

        {screen === 'p-nilai' && (
          <Nilai
            key={workKey(activeP.id, jenis, activeSession)}
            nama={activeP.nama}
            pos={activeIdx + 1}
            totalPeserta={peserta.length}
            halaqahNama={multiHalaqah ? halaqah.nama : null}
            stickyTop={pitaTinggi}
            terkunci={terkunci}
            gagalLain={kunciGagal.filter((k) => k !== workKey(activeP.id, jenis, activeSession)).length}
            onCobaLagi={cobaLagiSemua}
            adaNilai={!!workRef.current[workKey(activeP.id, jenis, activeSession)]}
            onResetPeserta={() => resetPesertaAktif(activeP.id)}
            resetPesertaBusy={resetPesertaBusy}
            resetPesertaError={resetPesertaError}
            ringGradient={`conic-gradient(${nilaiTier.color} ${nilaiSc.skor}%, var(--line) 0)`}
            skor={nilaiSc.skor}
            skorColor={nilaiTier.color}
            tierLabel={nilaiTier.label}
            hitungan={`${nilaiSc.jaliyCount} jaliy (−${nilaiSc.jaliyCount * 6}) · ${nilaiSc.khafiyCount} khafiy (−${nilaiSc.khafiyCount * 2})`}
            ambang={ambangJenis}
            isUjian={isUjian}
            lulusLabel={lulus ? 'LULUS' : 'MENGULANG'}
            lulusBg={lulus ? 'oklch(0.96 0.035 150)' : 'oklch(0.96 0.03 25)'}
            lulusBorder={lulus ? 'oklch(0.85 0.06 150)' : 'oklch(0.86 0.07 25)'}
            lulusColor={lulus ? 'oklch(0.40 0.10 150)' : 'oklch(0.46 0.14 25)'}
            confirmed={!!nilaiRec.confirmed}
            toggleConfirm={() =>
              updateWork(activeP.id, jenis, activeSession, { confirmed: !nilaiRec.confirmed })
            }
            jaliy={jaliyRows}
            khafiy={khafiyRows}
            catatan={nilaiRec.catatan}
            setCatatan={(v) => updateWork(activeP.id, jenis, activeSession, { catatan: v })}
            isFirst={activeIdx === 0}
            prevPeserta={() => {
              void flushSaves();
              setResetPesertaError(null);
              setActiveIdx(Math.max(0, activeIdx - 1));
            }}
            simpanDisabled={!terkunci && isUjian && !nilaiRec.confirmed}
            simpanLabel={
              terkunci
                ? activeIdx === peserta.length - 1
                  ? 'Kembali ke daftar'
                  : 'Peserta berikutnya →'
                : activeIdx === peserta.length - 1
                ? 'Simpan & selesai'
                : 'Simpan & peserta berikutnya →'
            }
            status={statuses[workKey(activeP.id, jenis, activeSession)] ?? 'idle'}
            gagalPesan={gagal[workKey(activeP.id, jenis, activeSession)] ?? null}
            simpanLanjut={() => {
              setResetPesertaError(null);
              if (terkunci) {
                // Hanya-baca: cuma pindah peserta, tak ada yang disimpan.
                if (activeIdx < peserta.length - 1) setActiveIdx(activeIdx + 1);
                else nav('p-daftar');
                return;
              }
              // Tandai selesai lalu kirim SEKARANG (tanpa debounce). Kegagalan
              // tak lagi senyap: status per peserta, pita merah di atas, dan
              // penanda di daftar — plus coba ulang otomatis.
              updateWork(activeP.id, jenis, activeSession, { done: true }, { save: false });
              void simpanSekarang(workKey(activeP.id, jenis, activeSession));
              void flushSaves();
              let nextIdx = -1;
              for (let j = activeIdx + 1; j < peserta.length; j++) {
                if (isIncluded(peserta[j].id)) {
                  nextIdx = j;
                  break;
                }
              }
              if (nextIdx >= 0) setActiveIdx(nextIdx);
              else nav('p-daftar');
            }}
            back={() => nav('p-daftar')}
          />
        )}

        {screen === 'p-ringkasan' && (
          <Ringkasan
            rata={rataRata}
            standarCount={ringkasanScores.filter((x) => x >= AMBANG).length}
            bawahCount={ringkasanScores.filter((x) => x < AMBANG).length}
            items={ringkasanItems}
            waOpen={waOpen}
            openWa={() => setWaOpen(true)}
            closeWa={() => setWaOpen(false)}
            waText={waText}
            kirim={kirim}
            kirimDisabled={
              coba ||
              selesaiCount < includedPeserta.length ||
              alreadySent ||
              kirimStatus === 'saving' ||
              belumTersimpanSesiIni > 0
            }
            kirimLabel={alreadySent || kirimStatus === 'saved' ? 'Terkirim ke sistem ✓' : kirimStatus === 'saving' ? 'Mengirim…' : 'Kirim semua ke sistem'}
            offlineNote={
              alreadySent
                ? 'Sesi ini sudah dikirim — hanya-baca. Buka kunci dari daftar peserta bila perlu diperbaiki.'
                : coba
                ? 'Mode Coba menyala — tidak ada yang dikirim.'
                : kirimStatus === 'error'
                ? kirimPesan ?? 'Gagal mengirim — periksa koneksi lalu coba lagi.'
                : belumTersimpanSesiIni > 0
                ? `${belumTersimpanSesiIni} isian belum tersimpan di server — tunggu sebentar atau ketuk "Coba lagi".`
                : selesaiCount < includedPeserta.length
                ? 'Beberapa peserta belum dinilai — belum bisa dikirim.'
                : 'Semua data tersimpan, siap dikirim.'
            }
            offlineNoteError={kirimStatus === 'error' || belumTersimpanSesiIni > 0}
            back={() => nav('p-daftar')}
            onCetak={() => bukaPusatRapot(jenis, activeSession)}
            onRekap={() => {
              setRekapSel({ jenis, nomor: activeSession });
              nav('p-rekap');
            }}
          />
        )}

        {screen === 'p-rekap' && (
          <RekapSesi
            halaqahNama={halaqah.nama}
            halaqahMeta={`${genderLabel(halaqah.gender)} · ${levelLabel} · ${halaqah.pesertaCount} peserta`}
            pengajarName={initial.pengajarName}
            batch={halaqah.batch}
            opsi={rekapOpsi}
            aktif={rekapAktif}
            onPilih={(j, n) => setRekapSel({ jenis: j, nomor: n })}
            rekap={rekapData}
            ambang={rekapAmbang}
            xlsxUrl={rekapXlsxUrl}
            back={() => nav('p-home')}
          />
        )}

        {screen === 'p-rapot' && (
          <PusatRapot
            halaqahNama={halaqah.nama}
            track={rapotTrack}
            onPilihTrack={(t) => {
              setRapotTrack(t);
              setTerbitStatus('idle');
              setTerbitPesan(null);
            }}
            namaTrack={namaTrack}
            ujianSaja={terpisah}
            peserta={peserta.map((p) => ({ id: p.id, nama: p.nama }))}
            build={buildRapotFor}
            rapotTerbit={rapotTerbit}
            coba={coba}
            onCetak={(ids) => setPrintReq({ dok: rapotTrack, ids })}
            onTerbitkan={(pid) => void terbitkanRapot(rapotTrack, pid)}
            terbitBusy={terbitBusyId}
            terbitError={terbitStatus === 'error' ? terbitPesan ?? 'Gagal menerbitkan — coba lagi.' : null}
            back={() => nav('p-home')}
          />
        )}

        {screen === 'p-rapor' && (
          <RapotTrack
            payload={rapotAktif}
            onBack={() => nav('p-ringkasan')}
            onTerbitkan={() => void terbitkanRapot(rapotTrack, rId)}
            terbitStatus={terbitStatus}
            terbitToken={terbitToken}
            terbitPesan={terbitPesan}
            onCetak={() => setPrintReq({ dok: rapotTrack, ids: [rId] })}
            onPilihTrack={(t) => {
              setRapotTrack(t);
              setTerbitStatus('idle');
              setTerbitToken(null);
              setTerbitPesan(null);
            }}
          />
        )}
      </div>

    </div>
  );
}
