// Komputasi Matrix Skill Guru: 15 indikator per pengajar per bulan.
// Idempotent — aman dipanggil berulang, hasil di-upsert ke matrix_rekap.
//
// Sumber data (pengajar ↔ peserta di-link via nomor WA):
//   Hard skill : penilaian_masyaikh (bacaan), rekaman setoran (tajwid),
//                kehadiran_peserta via program_kelas_anggota (2 program: maahir, tibyan)
//   Bobot hard skill: 8 porsi (maahir 3, tibyan 3, bacaan 1, tajwid 1).
//   Inspeksi   : penilaian_pedagogis — Manajemen Halaqah (rata-rata kolom
//                skor_metode_pengajaran + skor_manajemen_halaqah yang kini
//                dilebur jadi satu indikator), Kepatuhan Silabus, Evaluasi &
//                Penguasaan (ketua kelompok), Kepatuhan SOP Teknis.
//   Soft skill : hits_keterangan_harian via hits_halaqah.
//                kedisiplinan_waktu = %pertemuan on-time (KMT/KBLA saja),
//                tanggung jawab = %latihan beres — pertemuan PTML tidak dinilai
//                karena tugas sudah diberikan.
//                komitmen_jadwal = rata-rata(Stabilitas Jadwal [%pertemuan tanpa JKG/BADAL],
//                Anti-Mangkir [JKG di-tabayyun & bukan udzur syar'i = teguran]).
//                Kedisiplinan Waktu & Komitmen Jadwal TIDAK boleh berbagi jenis
//                pelanggaran — lihat isPelanggaranOnTime().

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchInChunks } from '@/lib/hits-rekap';
import { isPelanggaranOnTime, isPelanggaranStabilitas } from '@/lib/hits-pelanggaran-kategori';
import {
  isKeteranganDinilai,
  todayJakartaISO,
  KETERANGAN_NILAI_COLS,
  type KeteranganNilaiFields,
} from '@/lib/hits-observasi';
import { cyclesInMonth } from '@/lib/week';
import { getLiburDatesForKelas } from '@/lib/maahir-libur';
import { KATEGORI_BOBOT } from '@/lib/matrix-indicators';
import { JENIS_REKAMAN } from '@/types/db';

// Bulan ≥ anchor ini dihitung live dari sumber data. Bulan < anchor (mis. 2026-05)
// adalah data historis yang di-seed manual ke matrix_rekap — JANGAN di-recompute,
// karena sumber live-nya kosong dan akan menimpa seed jadi null.
// Demo build: pushed past any month the demo will ever show, so every month is
// read from the matrix_rekap snapshot instead of recomputed.
//
// Live recomputation derives the fourteen indicators from attendance, class-monitor
// observations and reprimands. Seeding that whole chain convincingly is a far
// bigger job than the screen it feeds, and a demo that recomputes an empty chain
// shows a matrix of zeroes — which teaches a visitor nothing about the product.
// In production this is '2026-06' and the current month IS recomputed.
export const MATRIX_LIVE_ANCHOR = '2099-01';

/** True bila bulan ini dihitung live (≥ anchor), bukan data seed historis. */
export function isLiveMatrixMonth(yearMonth: string): boolean {
  return yearMonth >= MATRIX_LIVE_ANCHOR;
}

const RECOMPUTE_TTL_MS = 5 * 60 * 1000; // 5 menit

/**
 * Recompute matrix bulan ini HANYA bila perlu: bulan historis tak pernah dihitung
 * (lindungi seed), dan bulan live di-skip bila data masih segar (<5 menit) kecuali
 * `force` (tombol Sinkronkan). Hindari recompute berat tiap page-load.
 */
export async function syncMatrixIfStale(yearMonth: string, force = false): Promise<void> {
  if (!isLiveMatrixMonth(yearMonth)) return;
  if (!force) {
    const { data } = await supabaseAdmin
      .from('matrix_rekap')
      .select('updated_at')
      .eq('year_month', yearMonth)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.updated_at) {
      const age = Date.now() - new Date(data.updated_at).getTime();
      if (age < RECOMPUTE_TTL_MS) return; // masih segar
    }
  }
  await computeMatrixForMonth(yearMonth);
}

function pctTo4(pct: number): number {
  if (pct >= 0.9) return 4;
  if (pct >= 0.75) return 3;
  if (pct >= 0.5) return 2;
  if (pct >= 0.25) return 1;
  return 0;
}

/**
 * Pertemuan minimum sebelum Stabilitas Jadwal boleh dinilai. Di bawah ini
 * rasionya cuma derau: 1 pertemuan yang dibadalkan = 0%, padahal itu satu
 * kejadian, bukan pola.
 */
export const STABILITAS_MIN_PERTEMUAN = 4;

/**
 * Komitmen — Stabilitas Jadwal: proporsi pertemuan yang TIDAK dipindah hari
 * (JKG) atau dialihkan ke badal.
 *
 * Rasio, bukan hitungan absolut. Ambang absolut lama (0–4 JKG → 4) salah di dua
 * arah: pengajar 1 pertemuan yang membadalkan semuanya tetap dapat 4, sementara
 * pengajar 37 pertemuan dengan 7 JKG (19%) dapat 2 — makin rajin mengajar makin
 * besar peluang menabrak ambang. Skalanya kini sama dengan indikator lain
 * (pctTo4), jadi 4 berarti hal yang sama di seluruh matrix.
 *
 * null = belum cukup data untuk dinilai, BUKAN nilai 0. avg() melewatkan null,
 * jadi Komitmen bulan itu ditentukan Anti-Mangkir saja.
 */
function stabilitasTo4(totalPertemuan: number, jkgBadal: number): number | null {
  if (totalPertemuan < STABILITAS_MIN_PERTEMUAN) return null;
  return pctTo4((totalPertemuan - jkgBadal) / totalPertemuan);
}

// Komitmen — Anti-Mangkir: skor turun per pelanggaran (JKG di-tabayyun & BUKAN
// udzur syar'i, dihitung sebagai teguran). 0 pelanggaran = standar (4).
function tegTo4(n: number): number {
  if (n <= 0) return 4;
  if (n === 1) return 3;
  if (n === 2) return 2;
  if (n === 3) return 1;
  return 0;
}

function nilaiToSkor(n: string): number {
  if (n === 'hijau') return 4;
  if (n === 'kuning') return 2;
  return 0;
}

function avg(nums: Array<number | null>): number | null {
  const v = nums.filter((n): n is number => n !== null && n !== undefined);
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
}

/**
 * Rata-rata berbobot, null di-skip beserta bobotnya (re-normalisasi atas bobot
 * yang terisi). Dipakai hard skill: 8 porsi → maahir 3, tibyan 3, bacaan 1,
 * tajwid 1.
 */
function weightedAvg(parts: Array<{ v: number | null; w: number }>): number | null {
  let sum = 0;
  let wsum = 0;
  for (const { v, w } of parts) {
    if (v === null || v === undefined) continue;
    sum += v * w;
    wsum += w;
  }
  if (wsum === 0) return null;
  return Math.round((sum / wsum) * 100) / 100;
}

export type MatrixRow = {
  pengajar_id: string;
  year_month: string;
  skor_bacaan: number | null;
  skor_tajwid: number | null;
  skor_kehadiran_maahir: number | null;
  skor_kehadiran_tibyan: number | null;
  rata_rata_hard_skill: number | null;
  skor_metode_pengajaran: number | null;
  skor_kepatuhan_silabus: number | null;
  skor_manajemen_halaqah: number | null;
  skor_evaluasi_penguasaan: number | null;
  rata_rata_pedagogis: number | null;
  skor_kedisiplinan_waktu: number | null;
  skor_komitmen_jadwal: number | null;
  skor_tanggung_jawab: number | null;
  skor_kepatuhan_sop: number | null;
  rata_rata_soft_skill: number | null;
  rata_rata_keseluruhan: number | null;
  ranking: number | null;
};

/**
 * Hitung dan simpan matrix untuk semua pengajar aktif di bulan tertentu.
 * yearMonth format 'YYYY-MM'. Return rows sorted by ranking.
 */
export async function computeMatrixForMonth(yearMonth: string): Promise<MatrixRow[]> {
  const [yStr, mStr] = yearMonth.split('-');
  const year = parseInt(yStr);
  const month = parseInt(mStr);
  const monthStart = `${yearMonth}-01`;
  const nextMonth = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  // 1. Semua pengajar aktif
  const { data: pengajarList } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, whatsapp_number')
    .eq('active', true)
    .neq('matrix_exclude', true); // guru observasi-saja (mis. DPQ) tak masuk matrix
  const pengajars = pengajarList ?? [];
  if (!pengajars.length) return [];

  // 2. Link pengajar → peserta via WA
  const { data: pesertaList } = await supabaseAdmin
    .from('peserta')
    .select('id, whatsapp_number')
    .eq('active', true);
  const pesertaByWa = new Map((pesertaList ?? []).map((p) => [p.whatsapp_number, p.id]));
  const pesertaIdOf = new Map<string, string>(); // pengajar_id → peserta_id
  for (const pg of pengajars) {
    const pid = pesertaByWa.get(pg.whatsapp_number);
    if (pid) pesertaIdOf.set(pg.id, pid);
  }
  const linkedPesertaIds = [...pesertaIdOf.values()];

  // 3. Penilaian bacaan + hafalan dari penilaian_masyaikh (diisi syaikh/koordinator
  //    via /penilaian), di-key langsung per pengajar_id.
  const pengajarIds = pengajars.map((p) => p.id);
  const { data: masyaikhList } = await supabaseAdmin
    .from('penilaian_masyaikh')
    .select('pengajar_id, skor_bacaan')
    .eq('year_month', yearMonth)
    .in('pengajar_id', pengajarIds);
  const masyaikhByPengajar = new Map((masyaikhList ?? []).map((p) => [p.pengajar_id, p]));

  // 4. Tajwid: rata-rata nilai rekaman setoran checked di cycle-cycle bulan ini.
  // Jumlahnya tidak tetap sejak barnamij 2in1 jadi bulanan (28 → 27).
  const cyclesBulanIni = cyclesInMonth(year, month);
  const setoranList = linkedPesertaIds.length
    ? await fetchInChunks(linkedPesertaIds, (chunk) =>
        supabaseAdmin
          .from('setoran')
          .select('id, peserta_id')
          .eq('status', 'checked')
          .in('week_start', cyclesBulanIni.length ? cyclesBulanIni : ['1970-01-01'])
          .in('peserta_id', chunk)
      )
    : [];
  const setoranIds = setoranList.map((s) => s.id as string);
  const setoranPeserta = new Map(setoranList.map((s) => [s.id, s.peserta_id]));
  const rekamanList = await fetchInChunks(setoranIds, (chunk) =>
    supabaseAdmin
      .from('rekaman')
      .select('setoran_id, jenis, nilai')
      .in('setoran_id', chunk)
  );
  // nilai per (setoran, jenis); jenis yang hilang/ungraded di setoran checked
  // dihitung 0 (penalty) — peserta yang setor <3 rekaman menurunkan rata-rata.
  const nilaiBySetoranJenis = new Map<string, string | null>();
  for (const r of rekamanList ?? []) {
    nilaiBySetoranJenis.set(`${r.setoran_id}|${r.jenis}`, r.nilai ?? null);
  }
  const tajwidScores = new Map<string, number[]>(); // peserta_id → skor[]
  for (const s of setoranList ?? []) {
    const pid = setoranPeserta.get(s.id);
    if (!pid) continue;
    const arr = tajwidScores.get(pid) ?? [];
    for (const jenis of JENIS_REKAMAN) {
      const nilai = nilaiBySetoranJenis.get(`${s.id}|${jenis}`);
      arr.push(nilai ? nilaiToSkor(nilai) : 0);
    }
    tajwidScores.set(pid, arr);
  }

  // 5. Kehadiran 3 program (via program_kelas_anggota match WA)
  const { data: anggotaList } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, whatsapp_number')
    .eq('active', true);
  const anggotaByWa = new Map<string, string[]>(); // wa → anggota_id[]
  for (const a of anggotaList ?? []) {
    if (!a.whatsapp_number) continue;
    const arr = anggotaByWa.get(a.whatsapp_number) ?? [];
    arr.push(a.id);
    anggotaByWa.set(a.whatsapp_number, arr);
  }
  const { data: pertemuanList } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program, tanggal, program_kelas_id')
    .gte('tanggal', monthStart)
    .lt('tanggal', nextMonth);
  const programOfPertemuan = new Map((pertemuanList ?? []).map((p) => [p.id, p.program]));
  // Libur = tidak berpengaruh. Pertemuan pada tanggal libur kelasnya dikeluarkan
  // dari kehadiran matrix — sumber libur sama dengan rekap presensi peserta
  // (program_kelas_libur), jadi libur At-Tibyan/Maahir tidak menurunkan
  // skor_kehadiran pengajar. Dulu kehadiran dihitung mentah tanpa cek libur.
  //
  // Kuncinya program_kelas_id, BUKAN kelas_id: kolom kelas_id itu FK lama ke
  // tabel `kelas` (halaqah setoran) yang sejak 0020 nullable, sedangkan
  // program_kelas_libur di-key per program_kelas — sama seperti maahir-rekap.ts.
  const kelasIdsPertemuan = [
    ...new Set((pertemuanList ?? []).map((p) => p.program_kelas_id as string).filter(Boolean)),
  ];
  const liburByKelas = await getLiburDatesForKelas(kelasIdsPertemuan, monthStart, nextMonth);
  const liburPertemuan = new Set(
    (pertemuanList ?? [])
      .filter((p) => liburByKelas.get(p.program_kelas_id as string)?.has(p.tanggal as string))
      .map((p) => p.id as string)
  );
  const pertemuanIds = (pertemuanList ?? []).map((p) => p.id as string);
  const kehadiranList = await fetchInChunks(pertemuanIds, (chunk) =>
    supabaseAdmin
      .from('kehadiran_peserta')
      .select('pertemuan_id, anggota_id, status')
      .in('pertemuan_id', chunk)
      .not('anggota_id', 'is', null)
  );
  // anggota_id → program → {hadir, total}
  const kehadiranByAnggota = new Map<string, Map<string, { hadir: number; total: number }>>();
  for (const k of kehadiranList ?? []) {
    if (liburPertemuan.has(k.pertemuan_id)) continue; // libur → tak dihitung
    const program = programOfPertemuan.get(k.pertemuan_id);
    if (!program || !k.anggota_id) continue;
    const perProgram = kehadiranByAnggota.get(k.anggota_id) ?? new Map();
    const c = perProgram.get(program) ?? { hadir: 0, total: 0 };
    c.total += 1;
    if (k.status === 'hadir' || k.status === 'terlambat') c.hadir += 1;
    perProgram.set(program, c);
    kehadiranByAnggota.set(k.anggota_id, perProgram);
  }

  // 6. Pedagogis + SOP
  const { data: pedagogisList } = await supabaseAdmin
    .from('penilaian_pedagogis')
    .select('pengajar_id, skor_metode_pengajaran, skor_kepatuhan_silabus, skor_manajemen_halaqah, skor_evaluasi_penguasaan, skor_kepatuhan_sop')
    .eq('year_month', yearMonth)
    .in('pengajar_id', pengajarIds);
  const pedagogisByPengajar = new Map((pedagogisList ?? []).map((p) => [p.pengajar_id, p]));

  // 7. Soft skill dari keterangan harian HITS (batch-native):
  //    kedisiplinan = %KBBS, tanggung jawab = %latihan beres.
  const { data: halaqahList } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, pengajar_id')
    .not('pengajar_id', 'is', null);
  const pengajarOfHalaqah = new Map(
    (halaqahList ?? []).map((h) => [h.id as string, h.pengajar_id as string])
  );
  const halaqahIds = (halaqahList ?? []).map((h) => h.id as string);
  // Chunked: 421 halaqah dalam satu .in() → URL ~16KB → gagal gateway (414) →
  // data null → soft skill kosong. Lihat fetchInChunks (hits-rekap.ts).
  const keteranganAll = await fetchInChunks(halaqahIds, (chunk) =>
    supabaseAdmin
      .from('hits_keterangan_harian')
      .select(`id, halaqah_id, kondisi, latihan_diberikan, semua_selesai, status_latihan, pengajar_on_cam, ${KETERANGAN_NILAI_COLS}`)
      .gte('tanggal', monthStart)
      .lt('tanggal', nextMonth)
      .in('halaqah_id', chunk)
      .neq('kondisi', 'LIBUR')
  );
  // Buang pertemuan yang belum terjadi & baris pra-generate impor — kalau tidak,
  // pengajar dihukum untuk kelas yang belum berlangsung / belum diobservasi.
  const hariIni = todayJakartaISO();
  const keteranganList = (keteranganAll ?? []).filter((k) =>
    isKeteranganDinilai(k as unknown as KeteranganNilaiFields, hariIni)
  );

  // Pelanggaran multi (sumber kebenaran F1): kedisiplinan waktu & stabilitas
  // jadwal dihitung dari hits_pelanggaran, bukan lagi kolom kondisi tunggal.
  // Pembagian tegas antar-indikator (rapat Agustus 2026) — satu jenis pelanggaran
  // hanya boleh memengaruhi SATU indikator:
  //   - Kedisiplinan Waktu = %pertemuan tanpa KMT (>5 menit) & tanpa KBLA.
  //     Pertemuan JKG/BADAL keluar dari penyebut: kelasnya pindah hari / dibawakan
  //     badal, jadi jam mulai-selesai pengajar asli tak bisa dinilai.
  //   - Komitmen Jadwal = Stabilitas Jadwal (pertemuan JKG/BADAL) + Anti-Mangkir
  //     (tabayyun bukan udzur syar'i).
  //   - TIDAK_LATIHAN tak memengaruhi keduanya — masuk Tanggung Jawab via
  //     latihan_diberikan.
  const ketIds = (keteranganList ?? []).map((k) => k.id as string);
  const pelList = await fetchInChunks(ketIds, (chunk) =>
    supabaseAdmin
      .from('hits_pelanggaran')
      .select('keterangan_id, jenis, menit')
      .in('keterangan_id', chunk)
  );
  const jenisByKet = new Map<string, Set<string>>();
  // Menit ikut disimpan karena toleransi KMT 5 menit butuh nilainya.
  const pelByKet = new Map<string, { jenis: string; menit: number | null }[]>();
  for (const p of pelList ?? []) {
    const set = jenisByKet.get(p.keterangan_id) ?? new Set<string>();
    set.add(p.jenis as string);
    jenisByKet.set(p.keterangan_id, set);
    const arr = pelByKet.get(p.keterangan_id) ?? [];
    arr.push({ jenis: p.jenis as string, menit: (p.menit as number | null) ?? null });
    pelByKet.set(p.keterangan_id, arr);
  }

  const disiplinByPengajar = new Map<string, { baik: number; total: number }>();
  const latihanByPengajar = new Map<string, { done: number; total: number }>();
  const jkgByPengajar = new Map<string, number>(); // pengajar_id → jumlah pertemuan JKG/BADAL
  // Punya ≥1 keterangan non-libur = pengajar ini terdata di HITS. Dipakai sebagai
  // syarat penilaian Komitmen Jadwal, karena penyebut disiplin waktu kini bisa 0
  // (mis. semua pertemuannya JKG/BADAL) tanpa berarti datanya kosong.
  const hitsDataByPengajar = new Map<string, number>();
  // Kepatuhan SOP Teknis = %pertemuan pengajar on-cam saat KBM. Hanya dihitung
  // pada pertemuan yang benar dibawakan pengajar asli (bukan JKG/BADAL) & sudah
  // diobservasi (pengajar_on_cam terisi). null = tak masuk penyebut.
  const onCamByPengajar = new Map<string, { onCam: number; total: number }>();
  for (const k of keteranganList ?? []) {
    const pgId = pengajarOfHalaqah.get(k.halaqah_id);
    if (!pgId) continue;
    const jenis = jenisByKet.get(k.id as string) ?? new Set<string>();
    const dipindah = [...jenis].some(isPelanggaranStabilitas);
    hitsDataByPengajar.set(pgId, (hitsDataByPengajar.get(pgId) ?? 0) + 1);

    if (!dipindah) {
      const d = disiplinByPengajar.get(pgId) ?? { baik: 0, total: 0 };
      d.total += 1;
      if (!(pelByKet.get(k.id as string) ?? []).some(isPelanggaranOnTime)) d.baik += 1;
      disiplinByPengajar.set(pgId, d);

      const onCam = (k as { pengajar_on_cam?: boolean | null }).pengajar_on_cam;
      if (onCam !== null && onCam !== undefined) {
        const o = onCamByPengajar.get(pgId) ?? { onCam: 0, total: 0 };
        o.total += 1;
        if (onCam === true) o.onCam += 1;
        onCamByPengajar.set(pgId, o);
      }
    }

    // PTML = pengajar sudah memberi tugas, hanya pesertanya yang belum
    // mengerjakan. Bukan kelalaian pengajar → pertemuan itu tidak dinilai
    // (di-skip dari penyebut), bukan dihitung gagal.
    if (k.status_latihan !== 'PTML') {
      const l = latihanByPengajar.get(pgId) ?? { done: 0, total: 0 };
      l.total += 1;
      if (k.latihan_diberikan && (k.semua_selesai || k.status_latihan === 'SML')) l.done += 1;
      latihanByPengajar.set(pgId, l);
    }

    // Stabilitas Jadwal: pertemuan dgn pergantian jadwal (JKG) atau badal.
    if (dipindah) jkgByPengajar.set(pgId, (jkgByPengajar.get(pgId) ?? 0) + 1);
  }

  // 8. Komitmen — Anti-Mangkir: JKG yang di-tabayyun & diputus BUKAN udzur syar'i
  //    oleh koordinator ketua kelas = pelanggaran (dihitung seperti teguran).
  const tabayyunList = await fetchInChunks(pengajarIds, (chunk) =>
    supabaseAdmin
      .from('hits_tabayyun')
      .select('pengajar_id')
      .eq('status', 'decided')
      .eq('is_udzur_syari', false)
      .gte('decided_at', monthStart)
      .lt('decided_at', nextMonth)
      .in('pengajar_id', chunk)
  );
  const mangkirByPengajar = new Map<string, number>();
  for (const t of tabayyunList) {
    const pgId = t.pengajar_id as string | null;
    if (!pgId) continue;
    mangkirByPengajar.set(pgId, (mangkirByPengajar.get(pgId) ?? 0) + 1);
  }

  // 9. Compose rows
  const rows: MatrixRow[] = pengajars.map((pg) => {
    const pesertaId = pesertaIdOf.get(pg.id);
    const masyaikh = masyaikhByPengajar.get(pg.id);

    const tajwidArr = pesertaId ? tajwidScores.get(pesertaId) : undefined;
    const skorTajwid = tajwidArr?.length
      ? Math.round(tajwidArr.reduce((a, b) => a + b, 0) / tajwidArr.length)
      : null;

    // Kehadiran: gabung semua anggota_id dengan WA sama
    const anggotaIds = anggotaByWa.get(pg.whatsapp_number) ?? [];
    const programCounts = new Map<string, { hadir: number; total: number }>();
    for (const aid of anggotaIds) {
      const per = kehadiranByAnggota.get(aid);
      if (!per) continue;
      for (const [prog, c] of per) {
        const acc = programCounts.get(prog) ?? { hadir: 0, total: 0 };
        acc.hadir += c.hadir;
        acc.total += c.total;
        programCounts.set(prog, acc);
      }
    }
    const kehadiranSkor = (prog: string): number | null => {
      const c = programCounts.get(prog);
      if (!c || c.total === 0) return null;
      return pctTo4(c.hadir / c.total);
    };

    const ped = pedagogisByPengajar.get(pg.id);

    const disp = disiplinByPengajar.get(pg.id);
    const skorKedisiplinan = disp && disp.total > 0 ? pctTo4(disp.baik / disp.total) : null;

    // Kepatuhan SOP Teknis = %on-cam saat KBM (sumber: hits_keterangan_harian).
    const oc = onCamByPengajar.get(pg.id);
    const skorKepatuhanSop = oc && oc.total > 0 ? pctTo4(oc.onCam / oc.total) : null;

    const lat = latihanByPengajar.get(pg.id);
    // %latihan mandiri beres (report ketua kelas HITS). Dipakai Tanggung Jawab,
    // dan sebagai fallback Evaluasi & Penguasaan bila ketua kelompok belum isi.
    const skorLatihan = lat && lat.total > 0 ? pctTo4(lat.done / lat.total) : null;
    const skorTanggungJawab = skorLatihan;

    // Komitmen Jadwal = rata-rata(Stabilitas Jadwal, Anti-Mangkir). Hanya dinilai
    // bila pengajar punya data HITS (≥1 keterangan non-libur), selain itu null.
    // Pakai hitsDataByPengajar, BUKAN penyebut disiplin waktu — pengajar yang
    // semua pertemuannya JKG/BADAL punya penyebut disiplin 0 tapi tetap wajib
    // dinilai komitmennya (justru di situ pelanggarannya).
    const totalPertemuanHits = hitsDataByPengajar.get(pg.id) ?? 0;
    const skorKomitmen =
      totalPertemuanHits > 0
        ? avg([
            stabilitasTo4(totalPertemuanHits, jkgByPengajar.get(pg.id) ?? 0),
            tegTo4(mangkirByPengajar.get(pg.id) ?? 0),
          ])
        : null;

    const hard = {
      skor_bacaan: masyaikh?.skor_bacaan ?? null,
      skor_tajwid: skorTajwid,
      skor_kehadiran_maahir: kehadiranSkor('kelas_maahir'),
      skor_kehadiran_tibyan: kehadiranSkor('at_tibyan'),
    };
    // "Metode Pengajaran Modul" dilebur ke "Manajemen Halaqah": skornya
    // rata-rata dari kedua nilai lama (null diabaikan, jadi baris yang cuma
    // punya salah satu tetap terpakai apa adanya).
    const manajemenGabung = avg([
      ped?.skor_metode_pengajaran ?? null,
      ped?.skor_manajemen_halaqah ?? null,
    ]);
    // Kategori Inspeksi (dulu "Pedagogis").
    const inspeksi = {
      skor_kepatuhan_silabus: ped?.skor_kepatuhan_silabus ?? null,
      // Ketua kelompok isi manual → pakai itu. Belum diisi → sinkron dari
      // performa latihan mandiri (report ketua kelas).
      skor_evaluasi_penguasaan: ped?.skor_evaluasi_penguasaan ?? skorLatihan,
    };
    // Manajemen Halaqah dipindah ke Soft Skill per keputusan rapat Agustus 2026
    // (sumber tetap Penilaian Pedagogis). Kepatuhan SOP Teknis kini dihitung dari
    // status on-cam pengajar di hits_keterangan_harian (bukan lagi input manual
    // penilaian_pedagogis.skor_kepatuhan_sop yang tak pernah terisi).
    const soft = {
      skor_manajemen_halaqah: manajemenGabung,
      skor_kepatuhan_sop: skorKepatuhanSop,
      skor_kedisiplinan_waktu: skorKedisiplinan,
      skor_komitmen_jadwal: skorKomitmen,
      skor_tanggung_jawab: skorTanggungJawab,
    };

    // Hard skill berbobot 8 porsi: kehadiran maahir 3, kehadiran tibyan 3,
    // bacaan 1, tajwid 1. (Muallim Najih & Hafalan dihapus dari penilaian.)
    const rataHard = weightedAvg([
      { v: hard.skor_kehadiran_maahir, w: 3 },
      { v: hard.skor_kehadiran_tibyan, w: 3 },
      { v: hard.skor_bacaan, w: 1 },
      { v: hard.skor_tajwid, w: 1 },
    ]);
    const rataInspeksi = avg(Object.values(inspeksi));
    const rataSoft = avg(Object.values(soft));
    // Bobot keseluruhan (rapat Agustus 2026): Hard 40% · Observasi/Soft 40% ·
    // Inspeksi 20%. Kategori null di-skip beserta bobotnya (renormalisasi).
    const rataAll = weightedAvg([
      { v: rataHard, w: KATEGORI_BOBOT.hard },
      { v: rataSoft, w: KATEGORI_BOBOT.soft },
      { v: rataInspeksi, w: KATEGORI_BOBOT.inspeksi },
    ]);

    return {
      pengajar_id: pg.id,
      year_month: yearMonth,
      ...hard,
      rata_rata_hard_skill: rataHard,
      ...inspeksi,
      // Kolom DB tetap bernama rata_rata_pedagogis (data historis tak dimigrasi);
      // labelnya saja yang kini "Inspeksi".
      rata_rata_pedagogis: rataInspeksi,
      // Nilai mentah metode disimpan apa adanya untuk jejak audit, walau tak
      // lagi tampil sebagai indikator tersendiri.
      skor_metode_pengajaran: ped?.skor_metode_pengajaran ?? null,
      ...soft,
      rata_rata_soft_skill: rataSoft,
      rata_rata_keseluruhan: rataAll,
      ranking: null,
    };
  });

  // 10. Ranking: utamakan kelengkapan aspek (Hard/Pedagogis/Soft terisi) lalu
  //     rata-rata keseluruhan. Pengajar yang dinilai penuh 3 aspek di atas yang
  //     baru terisi 1-2 aspek, walau rata-ratanya lebih rendah.
  const aspekLengkap = (r: MatrixRow): number =>
    (r.rata_rata_hard_skill !== null ? 1 : 0) +
    (r.rata_rata_pedagogis !== null ? 1 : 0) +
    (r.rata_rata_soft_skill !== null ? 1 : 0);
  const ranked = [...rows].sort((a, b) => {
    if (a.rata_rata_keseluruhan === null && b.rata_rata_keseluruhan === null) return 0;
    if (a.rata_rata_keseluruhan === null) return 1;
    if (b.rata_rata_keseluruhan === null) return -1;
    const da = aspekLengkap(a);
    const db = aspekLengkap(b);
    if (da !== db) return db - da; // lebih lengkap dulu
    return b.rata_rata_keseluruhan - a.rata_rata_keseluruhan;
  });
  // Ranking DIPISAH per gender (ikhwan & akhwat punya papan sendiri, mulai dari 1).
  // Urutan tiebreak (aspek lengkap → rata) sudah di-sort di atas; tinggal hitung
  // nomor per gender mengikuti urutan itu.
  const genderOf = new Map(pengajars.map((p) => [p.id, p.gender]));
  const rankByGender: Record<string, number> = {};
  for (const r of ranked) {
    if (r.rata_rata_keseluruhan !== null) {
      const g = (genderOf.get(r.pengajar_id) as string) ?? 'akhwat';
      rankByGender[g] = (rankByGender[g] ?? 0) + 1;
      r.ranking = rankByGender[g];
    }
  }

  // 11. Kosongkan ranking basi milik pengajar non-aktif di bulan ini. Compute
  //     hanya iterasi pengajar aktif, jadi baris pengajar yang kini non-aktif
  //     menyimpan ranking lama dan bisa bentrok (rank duplikat) dgn ranking baru.
  await supabaseAdmin
    .from('matrix_rekap')
    .update({ ranking: null })
    .eq('year_month', yearMonth)
    .not('ranking', 'is', null);

  // 12. Upsert ke matrix_rekap (ranking pengajar aktif ditulis ulang di sini)
  const { error } = await supabaseAdmin
    .from('matrix_rekap')
    .upsert(
      ranked.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: 'pengajar_id,year_month' }
    );
  if (error) throw new Error(`matrix_rekap upsert: ${error.message}`);

  return ranked;
}
