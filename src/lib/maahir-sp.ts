// Pendataan SP (Surat Peringatan) — disiplin kehadiran PESERTA program Maahir.
// Aturan (Tata Tertib Program Maahir, poin 6), KUMULATIF selama program:
//   Alpa (tidak_ada_keterangan):  1×→SP1, 2×→SP2, ≥3×→SP3(diberhentikan)
//   Izin:                          2×→SP1, 3×→SP2, ≥4×→SP3(diberhentikan)
//   SP peserta = level tertinggi dari dua metrik.
//
// Scope hitung = pertemuan program 'kelas_maahir' DAN 'at_tibyan' (exclude
// tanggal libur). At-Tibyan sempat tak ikut dihitung, sehingga halaman ini
// melaporkan angka berbeda dari Rekap Kehadiran yang memang menggabung keduanya
// — peserta dengan tiga izin At-Tibyan terbaca "izin 0" di sini. Rekap dijadikan
// acuan; 'muallim_najih' tetap di luar.
//
// Awal akumulasi berbeda per kelas — lihat `spMulaiKelas`: hanya Maahir 6A & 6B
// Ikhwan yang menumpuk sejak PROGRAM_START, kelas lain mulai 1 Agustus 2026.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getLiburDatesForKelas } from '@/lib/maahir-libur';
import { fetchAllRows } from '@/lib/supabase-page';
import {
  diputihkanPada,
  getPemutihan,
  pemutihanKeysDari,
  periodeMonthOf,
  type Pemutihan,
} from '@/lib/maahir-pemutihan';
import { dalamPeriode, type AnggotaPeriode } from '@/lib/anggota-periode';
import type { Gender } from '@/types/db';

// Anchor rentang libur (program Maahir mulai ~awal 2026).
export const PROGRAM_START = '2026-01-01';

/**
 * Awal akumulasi SP untuk kelas pada umumnya. Hanya Maahir 6A & 6B Ikhwan yang
 * tetap dihitung sejak PROGRAM_START; kelas lain baru mulai menumpuk SP dari
 * tanggal ini — pelanggaran sebelumnya tak lagi berbobot SP (tetap terbaca di
 * Rekap Kehadiran, yang tak memakai batas ini).
 *
 * Batasnya tanggal kalender 1 Agustus, bukan awal periode 28 Juli: pertemuan
 * 28–31 Juli 2026 sengaja di luar hitungan.
 */
export const SP_START_UMUM = '2026-08-01';

/**
 * Sejak kapan SP kelas ini menumpuk. Pencocokan lewat nama + gender, bukan id,
 * supaya tak ada UUID produksi yang tertanam di kode; polanya longgar agar
 * "Maahir 6A - Ikhwan" tetap terkenali kalau kelak ditulis "Maahir 6A Ikhwan".
 * Kelas 6A/6B AKHWAT adalah kelas lain — tersaring oleh syarat gender.
 */
export function spMulaiKelas(name: string, gender: Gender): string {
  const kumulatifPenuh = gender === 'ikhwan' && /^\s*maahir\s*6\s*[ab]\b/i.test(name);
  return kumulatifPenuh ? PROGRAM_START : SP_START_UMUM;
}

const maxTgl = (a: string, b: string) => (a > b ? a : b);

/** Sesi yang ikut menentukan SP. `muallim_najih` sengaja di luar. */
export const SP_PROGRAMS = ['kelas_maahir', 'at_tibyan'] as const;

export type SPLevel = 0 | 1 | 2 | 3;

/** Level SP dari jumlah alpa & izin kumulatif (ambil yang tertinggi). */
export function spLevel(alpa: number, izin: number): SPLevel {
  const a: SPLevel = alpa >= 3 ? 3 : alpa >= 2 ? 2 : alpa >= 1 ? 1 : 0;
  const i: SPLevel = izin >= 4 ? 3 : izin >= 3 ? 2 : izin >= 2 ? 1 : 0;
  return (a >= i ? a : i);
}

/** Kapan seorang peserta menyentuh satu tingkat SP, dan sesi mana pemicunya. */
export type Penetapan = {
  level: 1 | 2 | 3;
  /** Tanggal pertemuan yang membuat hitungannya menembus ambang. */
  tanggal: string;
  pemicu: 'alpa' | 'izin';
};

/** Satu sesi yang menyumbang SP, dipakai menurunkan tanggal penetapan. */
type SesiSP = { tanggal: string; jenis: 'alpa' | 'izin' };

/** Program sesi yang ikut SP — lihat `SP_PROGRAMS`. */
export type SPProgram = (typeof SP_PROGRAMS)[number];

/** Sesi pelanggaran beserta konteks yang dibutuhkan laporan untuk menjelaskannya. */
type SesiSPLengkap = SesiSP & {
  program: SPProgram;
  kelasName: string;
  /** Alasan yang diisi ketua kelas saat presensi; null bila kosong. */
  catatan: string | null;
};

/**
 * Satu baris riwayat "kenapa dia kena SP": sesi pelanggaran yang MASIH dihitung
 * (sudah bersih dari pemutihan), kronologis, dengan penanda tingkat SP yang
 * tersentuh pada sesi itu.
 */
export type SesiRiwayatSP = SesiSPLengkap & {
  /** Tingkat SP yang dicapai TEPAT pada sesi ini; null bila belum menembus ambang baru. */
  menjadi: 1 | 2 | 3 | null;
};

const urutSesi = <T extends SesiSP & { program?: string }>(sesi: T[]): T[] =>
  [...sesi].sort(
    (x, y) =>
      (x.tanggal < y.tanggal ? -1 : x.tanggal > y.tanggal ? 1 : 0) ||
      (x.program ?? '').localeCompare(y.program ?? '')
  );

/**
 * Riwayat kronologis untuk laporan. Logika ambangnya sama persis dengan
 * `hitungPenetapan` — bedanya di sini setiap sesi tetap dilaporkan, dan sesi
 * yang membuat hitungan menembus ambang diberi tanda `menjadi`.
 */
export function susunRiwayat(sesi: SesiSPLengkap[]): SesiRiwayatSP[] {
  let alpa = 0;
  let izin = 0;
  let level: SPLevel = 0;
  return urutSesi(sesi).map((s) => {
    if (s.jenis === 'alpa') alpa++;
    else izin++;
    const baru = spLevel(alpa, izin);
    const menjadi = baru > level ? (baru as 1 | 2 | 3) : null;
    level = baru;
    return { ...s, menjadi };
  });
}

/**
 * Tanggal penetapan SP1/SP2/SP3 — diturunkan, bukan diinput. Sesi pelanggaran
 * diurutkan menaik lalu dihitung maju; tanggal pertemuan pertama yang membuat
 * `spLevel()` mencapai tiap tingkat itulah tanggal penetapannya.
 *
 * Karena masukannya sesi yang SUDAH bersih dari pemutihan, tanggal penetapan
 * ikut bergeser ketika koordinator memutihkan sesuatu — persis seperti levelnya.
 */
export function hitungPenetapan(sesi: SesiSP[]): Penetapan[] {
  const urut = urutSesi(sesi);
  const out: Penetapan[] = [];
  let alpa = 0;
  let izin = 0;
  let level: SPLevel = 0;
  for (const s of urut) {
    if (s.jenis === 'alpa') alpa++;
    else izin++;
    const baru = spLevel(alpa, izin);
    // while, bukan if: satu sesi tak pernah melompati dua tingkat sekaligus,
    // tapi kalau ambangnya diubah kelak, tak ada tingkat yang hilang catatannya.
    while (level < baru) {
      level = (level + 1) as SPLevel;
      out.push({ level: level as 1 | 2 | 3, tanggal: s.tanggal, pemicu: s.jenis });
    }
  }
  return out;
}

/** Satu tindakan pemutihan sebagaimana ditampilkan di daftar SP. */
export type PemutihanRingkas = {
  id: string;
  /** Baris keanggotaan yang diputihkan (seorang bisa punya beberapa). */
  anggotaId: string;
  /** null = seluruh bulan. */
  tanggal: string | null;
  month: string;
  alasan: string | null;
  oleh: string | null;
  pada: string;
};

export type SPPeserta = {
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: Gender;
  /** Angka EFEKTIF — sesudah pemutihan. */
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  /** SP efektif (sesudah pemutihan). */
  sp: SPLevel;
  /** SP sebelum pemutihan — sama dengan `sp` bila tak ada pemutihan. */
  spKotor: SPLevel;
  /** Kapan tiap tingkat SP tersentuh, menaik. Kosong bila sp = 0. */
  penetapan: Penetapan[];
  /** Pemutihan aktif milik orang ini; kosong = tak pernah diputihkan. */
  diputihkan: PemutihanRingkas[];
  /** Sesi izin/alpa yang membentuk SP-nya, kronologis, dengan alasan ketua kelas. */
  riwayat: SesiRiwayatSP[];
};

export type SPRekap = {
  /** sp >= 1, ATAU pernah kena SP tapi diputihkan (tetap disimpan sbg bank data). */
  list: SPPeserta[];
  summary: { total: number; sp1: number; sp2: number; sp3: number; diputihkan: number };
  /** Tanggal terakhir yang ikut dihitung (YYYY-MM-DD). */
  cutoff: string;
  /** Tanggal pertama yang ikut dihitung — PROGRAM_START bila kumulatif. */
  mulai: string;
  /** true = hanya satu periode bulan, bukan kumulatif sejak program berjalan. */
  perBulan: boolean;
  /**
   * Batas awal SARINGAN TAMPILAN, bila dipakai: hitungan tetap kumulatif, tapi
   * hanya peserta yang penetapan SP-nya jatuh pada/ sesudah tanggal ini yang
   * ditampilkan. null = tak menyaring.
   */
  dariTampilan: string | null;
};

function emptySP(cutoff: string, mulai = PROGRAM_START, perBulan = false, dariTampilan: string | null = null): SPRekap {
  return {
    list: [],
    summary: { total: 0, sp1: 0, sp2: 0, sp3: 0, diputihkan: 0 },
    cutoff,
    mulai,
    perBulan,
    dariTampilan,
  };
}

/**
 * Batas akhir periode laporan sebuah bulan 'YYYY-MM' — window 28–27, jadi
 * periode '2026-07' berakhir 2026-07-27 (kebalikan dari `periodeMonthOf`).
 */
export function periodeEndDate(month: string): string {
  return `${month}-27`;
}

/**
 * Awal periode laporan sebuah bulan 'YYYY-MM' — tanggal 28 bulan sebelumnya,
 * pasangan dari `periodeEndDate`. Dipakai saat SP dihitung untuk satu bulan saja.
 */
export function periodeStartDate(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${String(prevM).padStart(2, '0')}-28`;
}

/**
 * Periode (YYYY-MM) yang benar-benar punya pertemuan Maahir, terbaru dulu —
 * dipakai untuk mengisi dropdown filter bulan supaya tak ada bulan kosong.
 */
export async function getMaahirPeriodeMonths(): Promise<string[]> {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const { data } = await supabaseAdmin
    .from('pertemuan_program')
    .select('tanggal')
    .in('program', SP_PROGRAMS as unknown as string[])
    .lte('tanggal', today);
  const set = new Set((data ?? []).map((r) => periodeMonthOf(r.tanggal as string)));
  return [...set].sort().reverse();
}

/**
 * SP kumulatif sejak program mulai. `sampaiBulan` ('YYYY-MM') memotong
 * perhitungan di akhir periode bulan tsb — dipakai untuk melihat "per akhir
 * bulan ini, siapa sudah kena SP berapa". Tanpa opsi itu = s/d hari ini.
 *
 * `bulan` ('YYYY-MM') mengunci perhitungan pada SATU periode saja (28–27),
 * bukan kumulatif — itulah yang dipakai laporan bulanan Maahir: SP di sana
 * menggambarkan disiplin bulan itu, bukan tumpukan sejak program dimulai.
 *
 * `sampai` ('YYYY-MM-DD') memotong perhitungan pada tanggal bebas — pasangan
 * `dari` TIDAK memotong hitungan (SP tetap kumulatif), ia hanya menyaring
 * tampilan ke peserta yang penetapan SP-nya jatuh di dalam rentang.
 */
export async function getMaahirSP(opts?: {
  gender?: Gender;
  sampaiBulan?: string;
  bulan?: string;
  sampai?: string;
  dari?: string;
}): Promise<SPRekap> {
  const hariIni = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const batas = opts?.bulan
    ? periodeEndDate(opts.bulan)
    : opts?.sampai
      ? opts.sampai
      : opts?.sampaiBulan
        ? periodeEndDate(opts.sampaiBulan)
        : hariIni;
  // Bulan berjalan belum selesai — jangan mengklaim data s/d tanggal 27 kalau
  // hari ini masih tanggal 10.
  const today = batas < hariIni ? batas : hariIni;
  const mulaiWindow = opts?.bulan ? periodeStartDate(opts.bulan) : PROGRAM_START;

  let kq = supabaseAdmin.from('program_kelas').select('id, name, gender');
  if (opts?.gender) kq = kq.eq('gender', opts.gender);
  const { data: kelasRows } = await kq;
  const kelasList = (kelasRows ?? []) as Array<{ id: string; name: string; gender: Gender }>;
  // Batas awal per kelas: yang paling ketat antara jendela laporan dan awal
  // akumulasi SP kelas tsb. `mulai` yang dilaporkan ke UI = yang paling awal
  // di antaranya, supaya label "dihitung sejak …" tak mengklaim lebih luas
  // dari data yang benar-benar ikut untuk kelas mana pun.
  const mulaiByKelas = new Map(
    kelasList.map((k) => [k.id, maxTgl(mulaiWindow, spMulaiKelas(k.name, k.gender))])
  );
  const mulai = kelasList.length
    ? [...mulaiByKelas.values()].reduce((a, b) => (a < b ? a : b))
    : mulaiWindow;
  // Saringan tampilan, bukan batas hitung — abaikan bila mendahului awal data
  // atau melewati cutoff, supaya tak diam-diam mengosongkan daftar.
  const dariTampilan =
    opts?.dari && opts.dari > mulai && opts.dari <= today ? opts.dari : null;

  if (!kelasList.length) return emptySP(today, mulai, !!opts?.bulan, dariTampilan);
  const kelasById = new Map(kelasList.map((k) => [k.id, k]));
  const kelasIds = kelasList.map((k) => k.id);

  const { data: pertRowsRaw } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal')
    .in('program_kelas_id', kelasIds)
    .in('program', SP_PROGRAMS as unknown as string[])
    .gte('tanggal', mulai)
    .lte('tanggal', today);
  // Query dibatasi `mulai` (batas terlonggar); penyaringan tepatnya per kelas.
  const pertRows = (pertRowsRaw ?? []).filter(
    (p) => (p.tanggal as string) >= (mulaiByKelas.get(p.program_kelas_id as string) ?? mulai)
  );
  const pertById = new Map(
    pertRows.map((p) => [
      p.id as string,
      {
        kelasId: p.program_kelas_id as string,
        tanggal: p.tanggal as string,
        program: p.program as SPProgram,
      },
    ])
  );
  const pertIds = pertRows.map((p) => p.id as string);
  if (!pertIds.length) return emptySP(today, mulai, !!opts?.bulan, dariTampilan);

  const liburByKelas = await getLiburDatesForKelas(kelasIds, mulai, today);

  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name, whatsapp_number, mulai_tanggal, selesai_tanggal')
    .in('program_kelas_id', kelasIds)
    .eq('active', true);
  const anggotaList = (anggotaRows ?? []) as Array<{
    id: string;
    program_kelas_id: string;
    name: string;
    whatsapp_number: string | null;
    mulai_tanggal: string | null;
    selesai_tanggal: string | null;
  }>;
  // Sesi di luar rentang keanggotaan tak dihitung — aturan yang sudah dipakai
  // laporan bulanan. Tanpa ini, peserta yang pindah kelas terbaca beda SP di
  // dua halaman karena sesi kelas lamanya ikut/tak ikut terhitung.
  //
  // `created_at` sengaja TIDAK dipakai sebagai cadangan tanggal gabung di sini.
  // Cadangan itu masuk akal untuk laporan bulanan yang rentangnya sempit, tapi
  // SP kumulatif mulai dari PROGRAM_START — dan ratusan baris keanggotaan dibuat
  // belakangan saat data dimasukkan ke sistem, bukan saat orangnya bergabung.
  // Memakainya di sini akan diam-diam membuang pelanggaran bulan-bulan awal.
  const periodeByAnggota = new Map<string, AnggotaPeriode>(
    anggotaList.map((a) => [
      a.id,
      { mulai_tanggal: a.mulai_tanggal, selesai_tanggal: a.selesai_tanggal },
    ])
  );

  const kehadiranRows = await fetchAllRows<{
    pertemuan_id: string;
    anggota_id: string | null;
    status: string;
    catatan: string | null;
  }>((from, to) =>
    supabaseAdmin
      .from('kehadiran_peserta')
      .select('pertemuan_id, anggota_id, status, catatan')
      .in('pertemuan_id', pertIds)
      .not('diisi_at', 'is', null)
      .order('id')
      .range(from, to)
  );

  // Pemutihan koordinator (tanggal tertentu atau sebulan penuh).
  const pemutihanRows = await getPemutihan();
  const pemutihanKeys = pemutihanKeysDari(pemutihanRows);
  const pemutihanByAnggota = new Map<string, Pemutihan[]>();
  for (const r of pemutihanRows) {
    const arr = pemutihanByAnggota.get(r.anggotaId) ?? [];
    arr.push(r);
    pemutihanByAnggota.set(r.anggotaId, arr);
  }

  // Dua tally sekaligus: `kotor` = apa adanya, `bersih` = sesudah pemutihan.
  // Keduanya perlu karena orang yang SP-nya diputihkan tetap harus tampil di
  // daftar — dengan SP aslinya masih terbaca sebagai bank data.
  type Tally = { H: number; T: number; I: number; S: number; A: number };
  const kosong = (): Tally => ({ H: 0, T: 0, I: 0, S: 0, A: 0 });
  const kotorByAnggota = new Map<string, Tally>();
  const bersihByAnggota = new Map<string, Tally>();
  // Sesi pelanggaran yang masih berlaku: menurunkan tanggal penetapan SP dan
  // menjadi riwayat "kenapa kena SP" di laporan.
  const sesiByAnggota = new Map<string, SesiSPLengkap[]>();
  for (const k of kehadiranRows) {
    if (!k.anggota_id) continue;
    const p = pertById.get(k.pertemuan_id);
    if (!p) continue;
    if (liburByKelas.get(p.kelasId)?.has(p.tanggal)) continue; // anulir libur
    const per = periodeByAnggota.get(k.anggota_id);
    if (per && !dalamPeriode(per, p.tanggal, mulaiByKelas.get(p.kelasId) ?? mulai, today)) continue;

    const tambah = (m: Map<string, Tally>) => {
      let t = m.get(k.anggota_id as string);
      if (!t) {
        t = kosong();
        m.set(k.anggota_id as string, t);
      }
      switch (k.status) {
        case 'hadir': t.H++; break;
        case 'terlambat': t.T++; break;
        case 'izin': t.I++; break;
        case 'sakit': t.S++; break;
        default: t.A++; break; // tidak_ada_keterangan → alpa
      }
    };

    tambah(kotorByAnggota);
    if (!diputihkanPada(pemutihanKeys, k.anggota_id, p.tanggal)) {
      tambah(bersihByAnggota);
      const jenis: SesiSP['jenis'] | null =
        k.status === 'izin'
          ? 'izin'
          : k.status === 'hadir' || k.status === 'terlambat' || k.status === 'sakit'
            ? null
            : 'alpa';
      if (jenis) {
        const arr = sesiByAnggota.get(k.anggota_id) ?? [];
        arr.push({
          tanggal: p.tanggal,
          jenis,
          program: p.program,
          kelasName: kelasById.get(p.kelasId)?.name ?? '—',
          catatan: k.catatan?.trim() ? k.catatan.trim() : null,
        });
        sesiByAnggota.set(k.anggota_id, arr);
      }
    }
  }

  // SP melekat pada ORANG, bukan baris keanggotaan. Peserta yang pindah kelas
  // punya beberapa baris (kelas lama + kelas baru) — tallinya digabung lewat
  // nomor WA supaya pelanggaran tak terpecah dan lolos ambang SP. Kelas yang
  // ditampilkan = keanggotaan yang masih berjalan.
  type Gabung = {
    anggotaId: string;
    name: string;
    kelasName: string;
    gender: 'ikhwan' | 'akhwat';
    kotor: Tally;
    bersih: Tally;
    /** Sesi pelanggaran seluruh baris keanggotaan orang ini, belum diurutkan. */
    sesi: SesiSPLengkap[];
    diputihkan: PemutihanRingkas[];
    aktifSekarang: boolean;
  };
  const tambahTally = (dst: Tally, src: Tally) => {
    dst.H += src.H; dst.T += src.T; dst.I += src.I; dst.S += src.S; dst.A += src.A;
  };
  const ringkas = (r: Pemutihan): PemutihanRingkas => ({
    id: r.id,
    anggotaId: r.anggotaId,
    tanggal: r.tanggal,
    month: r.month,
    alasan: r.alasan,
    oleh: r.dibuatOleh,
    pada: r.createdAt,
  });

  const byOrang = new Map<string, Gabung>();
  for (const a of anggotaList) {
    const kelas = kelasById.get(a.program_kelas_id);
    if (!kelas) continue;
    const kotor = kotorByAnggota.get(a.id) ?? kosong();
    const bersih = bersihByAnggota.get(a.id) ?? kosong();
    // Pemutihan menempel pada baris keanggotaan, SP menempel pada orang — jadi
    // pemutihan dari kelas lama ikut terbawa saat baris digabung.
    const putih = (pemutihanByAnggota.get(a.id) ?? []).map(ringkas);
    const key = a.whatsapp_number ?? `id:${a.id}`;
    const masihBerjalan = !a.selesai_tanggal || a.selesai_tanggal >= today;
    const g = byOrang.get(key);
    if (!g) {
      byOrang.set(key, {
        anggotaId: a.id,
        name: a.name,
        kelasName: kelas.name,
        gender: kelas.gender,
        kotor: { ...kotor },
        bersih: { ...bersih },
        sesi: [...(sesiByAnggota.get(a.id) ?? [])],
        diputihkan: putih,
        aktifSekarang: masihBerjalan,
      });
      continue;
    }
    tambahTally(g.kotor, kotor);
    tambahTally(g.bersih, bersih);
    g.sesi.push(...(sesiByAnggota.get(a.id) ?? []));
    g.diputihkan.push(...putih);
    // Kelas yang ditampilkan diambil dari keanggotaan yang masih berjalan.
    if (masihBerjalan && !g.aktifSekarang) {
      g.anggotaId = a.id;
      g.kelasName = kelas.name;
      g.gender = kelas.gender;
      g.aktifSekarang = true;
    }
  }

  const list: SPPeserta[] = [];
  for (const g of byOrang.values()) {
    const sp = spLevel(g.bersih.A, g.bersih.I);
    const spKotor = spLevel(g.kotor.A, g.kotor.I);
    // Yang SP-nya luruh gara-gara pemutihan tetap disimpan sebagai bank data;
    // yang memang tak pernah menyentuh ambang tetap dibuang.
    if (sp === 0 && !(spKotor >= 1 && g.diputihkan.length > 0)) continue;
    list.push({
      anggotaId: g.anggotaId,
      name: g.name,
      kelasName: g.kelasName,
      gender: g.gender,
      hadir: g.bersih.H,
      terlambat: g.bersih.T,
      izin: g.bersih.I,
      sakit: g.bersih.S,
      alpa: g.bersih.A,
      sp,
      spKotor,
      penetapan: hitungPenetapan(g.sesi),
      riwayat: susunRiwayat(g.sesi),
      diputihkan: g.diputihkan.sort((a, b) =>
        (a.tanggal ?? a.month).localeCompare(b.tanggal ?? b.month)
      ),
    });
  }
  // Saringan rentang: hitungan tetap kumulatif, tapi hanya orang yang SP-nya
  // benar-benar bergerak di dalam rentang yang ditampilkan. Baris bank data
  // (sp 0 karena diputihkan) tak punya penetapan, jadi ikut tersaring keluar —
  // itu memang yang diinginkan saat koordinator bertanya "siapa yang kena SP
  // dalam rentang ini".
  const tersaring = dariTampilan
    ? list.filter((p) => p.penetapan.some((x) => x.tanggal >= dariTampilan))
    : list;
  tersaring.sort(
    (x, y) =>
      y.sp - x.sp ||
      y.spKotor - x.spKotor ||
      y.alpa - x.alpa ||
      y.izin - x.izin ||
      x.name.localeCompare(y.name)
  );

  return {
    list: tersaring,
    cutoff: today,
    mulai,
    perBulan: !!opts?.bulan,
    dariTampilan,
    summary: {
      // Ringkasan menghitung SP EFEKTIF saja — baris bank data tak ikut.
      total: tersaring.filter((p) => p.sp >= 1).length,
      sp1: tersaring.filter((p) => p.sp === 1).length,
      sp2: tersaring.filter((p) => p.sp === 2).length,
      sp3: tersaring.filter((p) => p.sp === 3).length,
      diputihkan: tersaring.filter((p) => p.diputihkan.length > 0).length,
    },
  };
}

// ============================================================
// Rincian satu peserta — dipakai halaman pemutihan per-tanggal
// ============================================================

/** Satu sesi yang menyumbang SP (izin / alpa). */
export type SesiPelanggaran = {
  /** Baris keanggotaan pemilik kehadiran ini — pemutihan menempel ke sini. */
  anggotaId: string;
  tanggal: string;
  kelasName: string;
  status: 'izin' | 'alpa';
  /** Pemutihan aktif yang menganulir sesi ini, bila ada. */
  pemutihan: PemutihanRingkas | null;
};

export type SPDetail = {
  /** Baris keanggotaan yang dipakai sebagai identitas tampilan. */
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: Gender;
  sp: SPLevel;
  spKotor: SPLevel;
  alpa: number;
  izin: number;
  /** Kapan tiap tingkat SP tersentuh, menaik. */
  penetapan: Penetapan[];
  /** Sesi izin/alpa, terbaru dulu. */
  sesi: SesiPelanggaran[];
  /** Seluruh riwayat pemutihan orang ini, TERMASUK yang sudah dibatalkan. */
  riwayat: Array<PemutihanRingkas & { dibatalkanPada: string | null; dibatalkanOleh: string | null }>;
};

/**
 * Rincian pelanggaran satu ORANG (bukan satu baris keanggotaan): baris kelas
 * lama ikut ditarik lewat nomor WA, sejalan dengan penggabungan di
 * `getMaahirSP`. Tanggal libur tetap dianulir seperti perhitungan SP.
 */
export async function getSPDetail(anggotaId: string): Promise<SPDetail | null> {
  const { data: aku } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name, whatsapp_number, mulai_tanggal, selesai_tanggal')
    .eq('id', anggotaId)
    .maybeSingle();
  if (!aku) return null;

  const wa = (aku.whatsapp_number as string | null) ?? null;
  let saudara: Array<Record<string, unknown>> = [aku as Record<string, unknown>];
  if (wa) {
    const { data } = await supabaseAdmin
      .from('program_kelas_anggota')
      .select('id, program_kelas_id, name, whatsapp_number, mulai_tanggal, selesai_tanggal')
      .eq('whatsapp_number', wa)
      .eq('active', true);
    if ((data ?? []).length) saudara = data as Array<Record<string, unknown>>;
  }
  const anggotaIds = saudara.map((s) => s.id as string);
  const kelasIds = [...new Set(saudara.map((s) => s.program_kelas_id as string))];

  const { data: kelasRows } = await supabaseAdmin
    .from('program_kelas')
    .select('id, name, gender')
    .in('id', kelasIds);
  const kelasById = new Map(
    ((kelasRows ?? []) as Array<{ id: string; name: string; gender: Gender }>).map((k) => [k.id, k])
  );

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const { data: pertRows } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, tanggal')
    .in('program_kelas_id', kelasIds)
    .in('program', SP_PROGRAMS as unknown as string[])
    .lte('tanggal', today);
  const pertById = new Map(
    ((pertRows ?? []) as Array<{ id: string; program_kelas_id: string; tanggal: string }>).map((p) => [
      p.id,
      p,
    ])
  );

  const liburByKelas = await getLiburDatesForKelas(kelasIds, PROGRAM_START, today);

  const kehadiran = await fetchAllRows<{
    pertemuan_id: string;
    anggota_id: string | null;
    status: string;
  }>((from, to) =>
    supabaseAdmin
      .from('kehadiran_peserta')
      .select('pertemuan_id, anggota_id, status')
      .in('anggota_id', anggotaIds)
      .not('diisi_at', 'is', null)
      .order('id')
      .range(from, to)
  );

  const semuaPemutihan = await getRiwayatPemutihanAnggota(anggotaIds);
  const aktif = semuaPemutihan.filter((r) => r.dibatalkanPada === null);
  const keys = pemutihanKeysDari(
    aktif.map((r) => ({
      id: r.id,
      anggotaId: r.anggotaId,
      month: r.month,
      tanggal: r.tanggal,
      alasan: r.alasan,
      dibuatOleh: r.oleh,
      createdAt: r.pada,
      dibatalkanPada: null,
      dibatalkanOleh: null,
    }))
  );

  // Rentang keanggotaan per baris — sejalan dengan getMaahirSP, termasuk
  // alasannya tak memakai `created_at` sebagai cadangan tanggal gabung.
  const periodeByAnggota = new Map<string, AnggotaPeriode>(
    saudara.map((s) => [
      s.id as string,
      {
        mulai_tanggal: (s.mulai_tanggal as string | null) ?? null,
        selesai_tanggal: (s.selesai_tanggal as string | null) ?? null,
      },
    ])
  );

  let alpa = 0;
  let izin = 0;
  let alpaKotor = 0;
  let izinKotor = 0;
  const sesi: SesiPelanggaran[] = [];
  const sesiBersih: SesiSP[] = [];
  for (const k of kehadiran) {
    if (!k.anggota_id) continue;
    const p = pertById.get(k.pertemuan_id);
    if (!p) continue;
    if (liburByKelas.get(p.program_kelas_id)?.has(p.tanggal)) continue;
    // Batas awal akumulasi SP kelas ybs — sejalan dengan getMaahirSP, kalau tidak
    // rincian akan menampilkan pelanggaran yang tak ikut membentuk SP di daftar.
    const kelas = kelasById.get(p.program_kelas_id);
    const mulaiKelas = kelas ? spMulaiKelas(kelas.name, kelas.gender) : PROGRAM_START;
    if (p.tanggal < mulaiKelas) continue;
    const per = periodeByAnggota.get(k.anggota_id);
    if (per && !dalamPeriode(per, p.tanggal, mulaiKelas, today)) continue;
    const status: 'izin' | 'alpa' | null =
      k.status === 'izin' ? 'izin' : k.status === 'hadir' || k.status === 'terlambat' || k.status === 'sakit' ? null : 'alpa';
    if (!status) continue;

    const putih = diputihkanPada(keys, k.anggota_id, p.tanggal);
    if (status === 'alpa') { alpaKotor++; if (!putih) alpa++; } else { izinKotor++; if (!putih) izin++; }
    if (!putih) sesiBersih.push({ tanggal: p.tanggal, jenis: status });
    sesi.push({
      anggotaId: k.anggota_id,
      tanggal: p.tanggal,
      kelasName: kelasById.get(p.program_kelas_id)?.name ?? '—',
      status,
      pemutihan:
        aktif.find(
          (r) =>
            r.anggotaId === k.anggota_id &&
            (r.tanggal === p.tanggal || (r.tanggal === null && r.month === periodeMonthOf(p.tanggal)))
        ) ?? null,
    });
  }
  sesi.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));

  const berjalan =
    saudara.find((s) => {
      const sel = s.selesai_tanggal as string | null;
      return !sel || sel >= today;
    }) ?? saudara[0];
  const kelasTampil = kelasById.get(berjalan.program_kelas_id as string);

  return {
    anggotaId: berjalan.id as string,
    name: (berjalan.name as string) ?? (aku.name as string),
    kelasName: kelasTampil?.name ?? '—',
    gender: kelasTampil?.gender ?? 'ikhwan',
    sp: spLevel(alpa, izin),
    spKotor: spLevel(alpaKotor, izinKotor),
    alpa,
    izin,
    penetapan: hitungPenetapan(sesiBersih),
    sesi,
    riwayat: semuaPemutihan,
  };
}

/** Riwayat pemutihan (aktif + dibatalkan) untuk sekumpulan baris keanggotaan. */
async function getRiwayatPemutihanAnggota(
  anggotaIds: string[]
): Promise<SPDetail['riwayat']> {
  if (anggotaIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('maahir_pemutihan')
    .select('id, anggota_id, month, tanggal, alasan, dibuat_oleh, created_at, dibatalkan_pada, dibatalkan_oleh')
    .in('anggota_id', anggotaIds);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({
      id: r.id as string,
      anggotaId: r.anggota_id as string,
      month: r.month as string,
      tanggal: (r.tanggal as string | null) ?? null,
      alasan: (r.alasan as string | null) ?? null,
      oleh: (r.dibuat_oleh as string | null) ?? null,
      pada: r.created_at as string,
      dibatalkanPada: (r.dibatalkan_pada as string | null) ?? null,
      dibatalkanOleh: (r.dibatalkan_oleh as string | null) ?? null,
    }))
    .sort((a, b) => (a.pada < b.pada ? 1 : -1));
}
