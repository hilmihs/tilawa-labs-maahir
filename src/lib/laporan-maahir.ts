// Laporan Bulanan Maahir (keseluruhan) — agregat lintas-program untuk koordinator.
// Meniru template "Laporan Bulanan Maahir.xlsx": 3 blok (Takhassus, Maahir, At-Tibyan).
// Persen per peserta ikut konvensi maahir-rekap: (H+T)/(pertemuan_terisi − sakit)
// dalam scope — sakit dianggap udzur dan tak menggerus persen.
// Cakupan "Kehadiran peserta" tabel Takhassus & Maahir = sesi kelas_maahir saja;
// At-Tibyan (sesi at_tibyan, lintas kelas) dilaporkan di bloknya sendiri. DPQ tidak ada.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-page';
import { getLiburDatesForKelas } from '@/lib/maahir-libur';
import {
  anchorKelas,
  expectedDaysInRange,
  expectedPresensiInRange,
  filledKeyOf,
  todayJakarta,
} from '@/lib/maahir-presensi';
import { getMaahirSP, periodeStartDate, type SesiRiwayatSP, type SPRekap } from '@/lib/maahir-sp';
import { getPemutihan } from '@/lib/maahir-pemutihan';
import { getSetoranTargets, targetResolver } from '@/lib/setoran-target';
import { getLaporanNotes, type LaporanNote } from '@/lib/laporan-note';
import { isTakhassusKelas, type ProgramKelasRow } from '@/lib/program-kelas';
import { dalamPeriode, mulaiEfektif } from '@/lib/anggota-periode';

export { TAKHASSUS_IKHWAN, TAKHASSUS_AKHWAT } from '@/lib/program-kelas';

type Code = 'H' | 'I' | 'S' | 'A' | 'T';
const STATUS_TO_CODE: Record<string, Code> = {
  hadir: 'H',
  izin: 'I',
  sakit: 'S',
  tidak_ada_keterangan: 'A',
  terlambat: 'T',
};

type Gender = 'ikhwan' | 'akhwat';
type Scope = 'kelas_maahir' | 'at_tibyan';

export type PctCounts = { H: number; I: number; S: number; A: number; T: number };

/**
 * Satu sesi yang peserta TIDAK hadiri dalam periode, dengan alasan yang diisi
 * ketua kelas — bahan kolom "Keterangan" tabel peserta di bawah target.
 * `tanpa_keterangan` = pertemuan terisi untuk kelasnya tapi peserta ini tak
 * punya baris presensi sama sekali (kelalaian pengisian, bukan alpa).
 */
export type SesiTakHadir = {
  tanggal: string;
  status: 'izin' | 'sakit' | 'alpa' | 'tanpa_keterangan';
  catatan: string | null;
};

export type StudentAtt = {
  anggotaId: string;
  name: string;
  kelasName: string;
  gender: Gender;
  counts: PctCounts;
  /** Penyebut persen: pertemuan terisi di scope sejak bergabung, DIKURANGI sesi sakit. */
  filled: number;
  /** Jumlah pertemuan terisi sebelum sakit dikeluarkan (informasi mentah). */
  terisi: number;
  tidakHadir: number; // filled - (H+T): sesi tak hadir (sakit tak dihitung)
  /** (H+T)/filled * 100; null bila belum ada pertemuan; 100 bila semua sesinya sakit. */
  persen: number | null;
  keterangan: string; // catatan tergabung (bila ada)
  /**
   * Sesi tidak hadir dalam periode, kronologis. izin+alpa+tanpa_keterangan =
   * `tidakHadir`; sakit ikut dilaporkan walau tak menggerus persen.
   */
  riwayat: SesiTakHadir[];
  mulaiTanggal: string | null; // tgl gabung kelas bila di tengah periode (denominator dipotong)
  online: number; // sesi yang dihadiri secara online
  diputihkan: string | null; // alasan pemutihan (persen dianggap 100%) bila ada
};

/** Rincian setoran hafalan peserta Takhassus dalam periode laporan. */
export type SetoranPeserta = {
  anggotaId: string;
  name: string;
  gender: Gender;
  kelasName: string;
  halaman: number | null; // total halaman sebulan; null bila belum pernah isi
  pertemuanSetor: number; // jumlah pertemuan yang diisi setorannya
  rincian: string; // 'DD/MM: N hal · …' per pertemuan
  /** Sesi kelas_maahir yang ditagih ke dia (sesudah libur) — konteks, bukan penyebut. */
  sesiTarget: number;
  /** Target halaman/bulan, tanpa prorata. null = belum diatur / diputihkan. */
  target: number | null;
  /** halaman/target × 100. null bila tak ada target. */
  persen: number | null;
};

export type LaporanMaahir = {
  month: string; // YYYY-MM
  takhassus: {
    setoran: {
      /** Rata-rata target periode (halaman) atas peserta yang punya target. null = belum diatur. */
      benchmark: number | null;
      aktual: number | null; // rata-rata halaman per peserta yang sudah setor
      /** Σhalaman / Σtarget × 100 atas peserta bertarget. Tertimbang; non-penyetor dihitung 0. */
      persen: number | null;
      /** false = belum ada satu pun target diatur, kolom capaian tampil '—'. */
      adaTarget: boolean;
      peserta: SetoranPeserta[]; // semua anggota 2 kelas takhassus
    };
    kehadiran: { avgIkhwan: number | null; avgAkhwat: number | null; aktual: number | null; benchmark: number };
    dibawahTarget: { jumlah: number; list: StudentAtt[] }; // < 80%
    kehadiranPengajar: number; // 100 default
    pengajarDibawahTarget: number; // 0 default
    catatan: string | null; // poin menarik — kosong
  };
  maahir: {
    kehadiran: { avgIkhwan: number | null; avgAkhwat: number | null; aktual: number | null; benchmark: number };
    dibawahTarget: { jumlah: number; list: StudentAtt[] }; // < 80%
    kehadiranPengajar: number; // 100 default
    pengajarDibawahTarget: number; // 0 default
  };
  atTibyan: {
    kehadiran: { avgIkhwan: number | null; avgAkhwat: number | null; aktual: number | null; benchmark: number };
    dibawahTarget: { ikhwan: number; akhwat: number; total: number; list: StudentAtt[] }; // < 100%
  };
  /**
   * Sesi yang lewat tanpa presensi terisi. Peserta TIDAK dirugikan (tak ada
   * yang kena alpa gara-gara ketuanya lalai) — angka ini murni jejak kelalaian
   * pengisian, supaya koordinator tetap bisa menegur.
   */
  presensiTakTerisi: Array<{
    kelasName: string;
    gender: Gender;
    jumlah: number;
    tanggal: string[]; // 'YYYY-MM-DD Program'
  }>;
  /** Pendataan SP disiplin kehadiran (kumulatif sejak program berjalan). */
  sp: SPRekap;
  /** Catatan bebas koordinator untuk bulan ini. */
  notes: LaporanNote[];
};

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const LABEL_STATUS: Record<SesiTakHadir['status'], string> = {
  izin: 'izin',
  sakit: 'sakit (udzur)',
  alpa: 'alpa',
  tanpa_keterangan: 'tanpa ket.',
};

/** Satu baris riwayat tidak hadir — teks yang sama untuk halaman web & Excel. */
export function labelSesiTakHadir(r: SesiTakHadir): string {
  return `${ddmm(r.tanggal)} ${LABEL_STATUS[r.status]}${r.catatan ? ` — ${r.catatan}` : ''}`;
}

/** Satu baris riwayat SP: `04/09 Maahir · izin — alasan → SP1`. */
export function labelRiwayatSP(r: SesiRiwayatSP): string {
  const program = r.program === 'at_tibyan' ? 'At-Tibyan' : 'Maahir';
  return (
    `${ddmm(r.tanggal)} ${program} · ${r.jenis}` +
    (r.catatan ? ` — ${r.catatan}` : '') +
    (r.menjadi ? ` → SP${r.menjadi}` : '')
  );
}

/** Rentang periode laporan bulanan Maahir: tgl 28 bulan lalu s/d 27 bulan ini. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  // Periode Maahir bukan kalender penuh: tgl 28 bulan LALU s/d tgl 27 bulan ini.
  // mis. month=2026-06 → 2026-05-28 .. 2026-06-27.
  const startD = new Date(Date.UTC(y, m - 2, 28)); // m 1-based → bulan sebelumnya = m-2
  const start = `${startD.getUTCFullYear()}-${String(startD.getUTCMonth() + 1).padStart(2, '0')}-28`;
  let end = `${y}-${String(m).padStart(2, '0')}-27`;
  const today = todayJakarta();
  if (end > today) end = today; // cap di hari ini
  return { start, end };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** aktual = rata-rata dari avg gender yang ada (abaikan gender tanpa data). */
function avgOfGenders(a: number | null, b: number | null): number | null {
  const vals = [a, b].filter((v): v is number => v !== null);
  return mean(vals);
}

/** Rata-rata persen peserta suatu gender (abaikan yang belum ada data / persen null). */
function avgGender(students: StudentAtt[], gender: Gender): number | null {
  return mean(
    students.filter((s) => s.gender === gender && s.persen !== null).map((s) => s.persen as number)
  );
}

export async function getLaporanMaahir(month: string): Promise<LaporanMaahir> {
  const { start, end } = monthRange(month);

  const empty = (benchmark: number) => ({ avgIkhwan: null, avgAkhwat: null, aktual: null, benchmark });
  const emptyResult: LaporanMaahir = {
    month,
    takhassus: {
      setoran: { benchmark: null, aktual: null, persen: null, adaTarget: false, peserta: [] },
      kehadiran: empty(80),
      dibawahTarget: { jumlah: 0, list: [] },
      kehadiranPengajar: 100,
      pengajarDibawahTarget: 0,
      catatan: null,
    },
    maahir: {
      kehadiran: empty(80),
      dibawahTarget: { jumlah: 0, list: [] },
      kehadiranPengajar: 100,
      pengajarDibawahTarget: 0,
    },
    atTibyan: {
      kehadiran: empty(100),
      dibawahTarget: { ikhwan: 0, akhwat: 0, total: 0, list: [] },
    },
    presensiTakTerisi: [],
    sp: {
      list: [],
      summary: { total: 0, sp1: 0, sp2: 0, sp3: 0, diputihkan: 0 },
      cutoff: todayJakarta(),
      mulai: periodeStartDate(month),
      perBulan: true,
      dariTampilan: null,
    },
    notes: [],
  };

  // Bulan di masa depan → tak ada data.
  if (start > todayJakarta()) return emptyResult;

  // 1. Kelas
  const { data: kelasRows } = await supabaseAdmin
    .from('program_kelas')
    .select(
      'id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa, self_attendance, presensi_sifat, mulai_tanggal, ikut_tibyan, presensi_via_halaqah_mulai'
    )
    .order('gender')
    .order('name');
  const kelasList = (kelasRows ?? []) as unknown as Array<ProgramKelasRow>;
  if (kelasList.length === 0) return emptyResult;

  const kelasById = new Map(kelasList.map((k) => [k.id, k]));
  const kelasIds = kelasList.map((k) => k.id);

  // 2. Pertemuan dalam rentang bulan
  const { data: pertemuanRows } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal')
    .in('program_kelas_id', kelasIds)
    .gte('tanggal', start)
    .lte('tanggal', end);
  const pertemuanById = new Map(
    (pertemuanRows ?? []).map((p) => [
      p.id,
      { kelasId: p.program_kelas_id as string, program: p.program as string, tanggal: p.tanggal as string },
    ])
  );
  const pertemuanIds = (pertemuanRows ?? []).map((p) => p.id);

  // Tanggal libur per kelas (dianulir dari perhitungan % — pertemuan yang
  // sudah terisi pun tak dihitung bila tanggalnya diliburkan).
  const liburByKelas = await getLiburDatesForKelas(kelasIds, start, end);

  // 3. Anggota
  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name, whatsapp_number, created_at, mulai_tanggal, selesai_tanggal')
    .in('program_kelas_id', kelasIds)
    .eq('active', true)
    .order('name');
  // Baris yang baru dimulai SESUDAH periode ini tak ikut sama sekali (seperti
  // maahir-rekap). Tanpa saringan ini `mulaiEfektif` mengembalikan null untuk
  // mulai_tanggal > end — "anggota sejak sebelum periode" — sehingga, mis.,
  // peserta yang ditambahkan ke Takhassus via halaqah mulai 28 Sep tertagih
  // sesi Takhassus September dan baris halaqahnya lenyap dari blok Halaqah
  // September (diserap tanpa sesi).
  const anggotaList = ((anggotaRows ?? []) as Array<{
    id: string;
    program_kelas_id: string;
    name: string;
    whatsapp_number: string | null;
    created_at: string | null;
    mulai_tanggal: string | null;
    selesai_tanggal: string | null;
  }>).filter((a) => !a.mulai_tanggal || a.mulai_tanggal <= end);

  // Rentang keanggotaan: pertemuan sebelum ia masuk / sesudah ia pindah kelas
  // tak dihitung, tapi riwayat di dalam rentang tetap utuh.
  const joinDateOf = (a: (typeof anggotaList)[number]) => mulaiEfektif(a, start, end);
  const periodeByAnggota = new Map(anggotaList.map((a) => [a.id, a]));

  // Takhassus via halaqah (Takhassus akhwat, sejak 28 Sep 2026): sesi
  // kelas_maahir kelas Takhassus ber-`presensi_via_halaqah_mulai` tak dipresensi
  // sendiri; anggotanya dipresensi di kelas halaqah mereka (dicocokkan lewat WA).
  // Baris halaqah itu DISERAP ke baris Takhassus-nya — kehadiran, setoran, dan
  // sesi target digabung di blok Takhassus — dan tak tampil lagi di blok Halaqah.
  // Hanya scope kelas_maahir: At-Tibyan mereka tetap di kelas gabungan.
  type AnggotaRow = (typeof anggotaList)[number];
  const viaByTakh = new Map<string, { mulai: string; halaqah: AnggotaRow[] }>();
  const diserap = new Set<string>();
  {
    const takhByWa = new Map<string, { a: AnggotaRow; mulai: string }>();
    for (const a of anggotaList) {
      const mulai = kelasById.get(a.program_kelas_id)?.presensi_via_halaqah_mulai;
      if (!mulai) continue;
      // Semua anggotanya dialihkan, termasuk yang belum ditempatkan di halaqah
      // mana pun (mis. cuti): sesi Takhassus sesudah `mulai` tak menagih mereka.
      viaByTakh.set(a.id, { mulai, halaqah: [] });
      if (a.whatsapp_number) takhByWa.set(a.whatsapp_number, { a, mulai });
    }
    for (const a of anggotaList) {
      const t = a.whatsapp_number ? takhByWa.get(a.whatsapp_number) : undefined;
      if (!t || t.a.id === a.id) continue;
      // Kelas tanpa sesi kelas_maahir (mis. kelas At-Tibyan gabungan) tak ikut.
      const k = kelasById.get(a.program_kelas_id);
      if (!k || (k.jadwal_hari ?? []).length === 0) continue;
      viaByTakh.get(t.a.id)!.halaqah.push(a);
      diserap.add(a.id);
    }
  }

  // Pemutihan bulan ini (baris presensi tak diubah), dua bentuk:
  // - sebulan penuh → peserta dianggap hadir penuh (persen dipaksa 100);
  // - per-tanggal   → sesi tanggal itu dikeluarkan dari penyebut, seperti sakit.
  const pemutihanRows = await getPemutihan(month);
  const pemutihan = new Map(
    pemutihanRows.filter((r) => r.tanggal === null).map((r) => [r.anggotaId, r.alasan])
  );
  const pemutihanTanggal = new Set(
    pemutihanRows.filter((r) => r.tanggal).map((r) => `${r.anggotaId}|${r.tanggal}`)
  );

  // 4. Kehadiran terisi
  const filledByKelasScope = new Map<string, Set<string>>(); // key: kelasId|program → set pertemuanId
  // Baris presensi per anggota+scope, dipetakan per pertemuan — untuk menyusun
  // riwayat tidak hadir (sesi tanpa baris = 'tanpa_keterangan').
  const rowByAnggotaScope = new Map<
    string,
    Map<string, { code: Code; catatan: string | null; online: boolean }>
  >(); // key: anggotaId|program
  // Setoran hafalan per anggota (khusus scope kelas_maahir): tanggal → halaman.
  const setoranByAnggota = new Map<string, Array<{ tanggal: string; halaman: number }>>();

  if (pertemuanIds.length > 0) {
    // Paginasi: kehadiran sebulan lintas-kelas bisa >1000 baris (limit PostgREST).
    const kehadiranRows = await fetchAllRows<{
      pertemuan_id: string;
      anggota_id: string | null;
      status: string;
      catatan: string | null;
      diisi_at: string | null;
      setoran_halaman: number | null;
      mode: string | null;
    }>((from, to) =>
      supabaseAdmin
        .from('kehadiran_peserta')
        .select('pertemuan_id, anggota_id, status, catatan, diisi_at, setoran_halaman, mode')
        .in('pertemuan_id', pertemuanIds)
        .not('diisi_at', 'is', null)
        .order('id')
        .range(from, to)
    );

    for (const k of kehadiranRows) {
      if (!k.anggota_id) continue;
      const p = pertemuanById.get(k.pertemuan_id);
      if (!p) continue;
      // Anulir: lewati pertemuan yang tanggalnya diliburkan (kelas ini).
      if (liburByKelas.get(p.kelasId)?.has(p.tanggal)) continue;
      const program = p.program; // 'kelas_maahir' | 'at_tibyan' | 'muallim_najih'

      // pertemuan terisi per kelas+scope (denominator persen)
      const fKey = `${p.kelasId}|${program}`;
      let fset = filledByKelasScope.get(fKey);
      if (!fset) { fset = new Set(); filledByKelasScope.set(fKey, fset); }
      fset.add(k.pertemuan_id);

      // Sesi di luar rentang keanggotaan tak dihitung (denominator juga
      // dipotong di studentsFor) — mencegah persen >100% atau tergerus sesi
      // pra-gabung / sesi kelas lama setelah pindah.
      const per = periodeByAnggota.get(k.anggota_id);
      if (per && !dalamPeriode(per, p.tanggal, start, end)) continue;
      // Tanggal yang diputihkan untuk peserta ini: tak dihitung sama sekali
      // (penyebutnya juga dipotong di studentsFor).
      if (pemutihanTanggal.has(`${k.anggota_id}|${p.tanggal}`)) continue;

      // baris per anggota+scope (dihitung di studentsFor, per rentang tanggal)
      const sKey = `${k.anggota_id}|${program}`;
      const code = STATUS_TO_CODE[k.status] ?? 'A';
      let rows = rowByAnggotaScope.get(sKey);
      if (!rows) { rows = new Map(); rowByAnggotaScope.set(sKey, rows); }
      rows.set(k.pertemuan_id, {
        code,
        catatan: typeof k.catatan === 'string' && k.catatan.trim() ? k.catatan.trim() : null,
        online: k.mode === 'online' && (code === 'H' || code === 'T'),
      });

      // setoran halaman (diisi peserta saat presensi mandiri)
      if (program === 'kelas_maahir' && typeof k.setoran_halaman === 'number') {
        const arr = setoranByAnggota.get(k.anggota_id) ?? [];
        arr.push({ tanggal: p.tanggal, halaman: k.setoran_halaman });
        setoranByAnggota.set(k.anggota_id, arr);
      }
    }
  }

  /** Hitungan mentah satu baris anggota pada satu scope — belum jadi persen. */
  type Mentah = {
    counts: PctCounts;
    terisi: number;
    riwayat: SesiTakHadir[];
    online: number;
    catatan: Set<string>;
  };

  /**
   * Hitung mentah satu baris anggota. `rentang` memotong sesi per tanggal
   * (dari = inklusif, sebelum = eksklusif) — dipakai saat baris Takhassus dan
   * baris halaqahnya digabung di sekitar tanggal pengalihan.
   */
  function mentah(
    a: AnggotaRow,
    kelas: ProgramKelasRow,
    scope: Scope,
    rentang?: { dari?: string; sebelum?: string }
  ): Mentah {
    // Denominator: pertemuan terisi kelas ini — dipotong sejak tanggal gabung
    // bila peserta baru masuk di tengah periode (pertemuan sebelum ia
    // terdaftar tak boleh menggerus persentasenya).
    const fset = filledByKelasScope.get(`${kelas.id}|${scope}`);
    const pertemuanDitagih = !fset
      ? []
      : [...fset].filter((pid) => {
          const tgl = pertemuanById.get(pid)?.tanggal ?? '';
          if (rentang?.dari && tgl < rentang.dari) return false;
          if (rentang?.sebelum && tgl >= rentang.sebelum) return false;
          if (!dalamPeriode(a, tgl, start, end)) return false;
          return !pemutihanTanggal.has(`${a.id}|${tgl}`);
        });
    // Hitungan & riwayat tidak hadir dari penyebut yang sama — supaya jumlah
    // baris izin+alpa+tanpa keterangan selalu sama dengan angka `tidakHadir`.
    const rows = rowByAnggotaScope.get(`${a.id}|${scope}`);
    const counts: PctCounts = { H: 0, I: 0, S: 0, A: 0, T: 0 };
    const riwayat: SesiTakHadir[] = [];
    const catatan = new Set<string>();
    let online = 0;
    for (const pid of pertemuanDitagih) {
      const tgl = pertemuanById.get(pid)?.tanggal ?? '';
      const row = rows?.get(pid);
      if (!row) { riwayat.push({ tanggal: tgl, status: 'tanpa_keterangan', catatan: null }); continue; }
      counts[row.code]++;
      if (row.online) online++;
      if (row.catatan) catatan.add(row.catatan);
      if (row.code === 'H' || row.code === 'T') continue;
      riwayat.push({
        tanggal: tgl,
        status: row.code === 'I' ? 'izin' : row.code === 'S' ? 'sakit' : 'alpa',
        catatan: row.catatan,
      });
    }
    return { counts, terisi: pertemuanDitagih.length, riwayat, online, catatan };
  }

  /** Satukan satu/lebih hitungan mentah jadi satu baris StudentAtt. */
  function rakit(a: AnggotaRow, kelas: ProgramKelasRow, bagian: Mentah[]): StudentAtt {
    const counts: PctCounts = { H: 0, I: 0, S: 0, A: 0, T: 0 };
    let terisi = 0;
    let online = 0;
    const riwayat: SesiTakHadir[] = [];
    const catatan = new Set<string>();
    for (const b of bagian) {
      for (const c of ['H', 'I', 'S', 'A', 'T'] as const) counts[c] += b.counts[c];
      terisi += b.terisi;
      online += b.online;
      riwayat.push(...b.riwayat);
      for (const c of b.catatan) catatan.add(c);
    }
    riwayat.sort((p, q) => (p.tanggal < q.tanggal ? -1 : p.tanggal > q.tanggal ? 1 : 0));
    // Sakit = udzur: sesinya dikeluarkan dari penyebut, jadi tak menggerus
    // persen. Semua sesi sakit → penyebut habis, dianggap hadir penuh.
    const filled = Math.max(0, terisi - counts.S);
    const persenAsli =
      filled > 0
        ? Math.round(((counts.H + counts.T) / filled) * 100)
        : terisi > 0
          ? 100
          : null;
    // Tidak hadir = penyebut − (hadir+terlambat). Termasuk sesi yang peserta
    // tak punya catatan sama sekali (bukan hanya izin/alpa), supaya tak muncul
    // "0x" padahal di bawah target. Sakit tak masuk hitungan ini.
    const tidakHadirAsli = Math.max(0, filled - (counts.H + counts.T));
    // Diputihkan → dianggap hadir penuh untuk periode ini.
    const diputihkan = pemutihan.has(a.id) ? (pemutihan.get(a.id) ?? '') : null;
    const persen = diputihkan !== null && terisi > 0 ? 100 : persenAsli;
    const tidakHadir = diputihkan !== null ? 0 : tidakHadirAsli;
    return {
      anggotaId: a.id,
      name: a.name,
      kelasName: kelas.name,
      gender: kelas.gender,
      counts,
      filled,
      terisi,
      tidakHadir,
      persen,
      keterangan: Array.from(catatan).join('; '),
      // Diputihkan sebulan → dianggap hadir penuh, riwayatnya pun dikosongkan.
      riwayat: diputihkan !== null ? [] : riwayat,
      mulaiTanggal: joinDateOf(a),
      online,
      diputihkan,
    };
  }

  // Susun StudentAtt untuk kumpulan anggota tertentu pada scope tertentu.
  function studentsFor(
    filter: (kelasName: string) => boolean,
    scope: Scope
  ): StudentAtt[] {
    const out: StudentAtt[] = [];
    for (const a of anggotaList) {
      const kelas = kelasById.get(a.program_kelas_id);
      if (!kelas || !filter(kelas.name)) continue;
      const via = scope === 'kelas_maahir' ? viaByTakh.get(a.id) : undefined;
      if (scope === 'kelas_maahir' && diserap.has(a.id)) continue;
      const bagian = via
        ? [
            mentah(a, kelas, scope, { sebelum: via.mulai }),
            ...via.halaqah.map((h) =>
              mentah(h, kelasById.get(h.program_kelas_id)!, scope, { dari: via.mulai })
            ),
          ]
        : [mentah(a, kelas, scope)];
      out.push(rakit(a, kelas, bagian));
    }
    return out;
  }

  const isTakhassus = (name: string) => isTakhassusKelas(name);
  const isMaahir = (name: string) => !isTakhassusKelas(name);

  // ---- Takhassus (scope kelas_maahir) ----
  const takhStudents = studentsFor(isTakhassus, 'kelas_maahir');
  const takhAvgI = avgGender(takhStudents, 'ikhwan');
  const takhAvgA = avgGender(takhStudents, 'akhwat');
  const takhBawah = takhStudents
    .filter((s) => s.persen !== null && s.persen < 80)
    .sort((a, b) => (a.persen ?? 0) - (b.persen ?? 0));
  // Target setoran bulanan koordinator (halaman/bulan), per kelas dgn koreksi
  // per peserta. Hanya kelas takhassus yang punya setoran, jadi hanya itu yang
  // ditarik.
  const takhKelasIds = kelasList.filter((k) => isTakhassus(k.name)).map((k) => k.id);
  const targetBulananPada = targetResolver(await getSetoranTargets(takhKelasIds));

  /**
   * Penyebut capaian setoran seorang peserta: angka bulanan yang disetel
   * koordinator, apa adanya.
   *
   * Tidak diprorata. Sakit, libur, dan bergabung di tengah periode TIDAK
   * memotongnya — kebijakan koordinator (September 2026): peserta dituntut
   * sekian halaman dalam sebulan, bagaimanapun ia membagi hari-harinya, dan
   * angka yang disetel harus muncul apa adanya di laporan. Beda tajam dari
   * penyebut kehadiran di `studentsFor`, yang justru memotong semua itu.
   *
   * Sesi tetap disusuri untuk dua hal yang bukan prorata: memastikan periode ini
   * memang menagih peserta tsb sama sekali, dan memutuskan versi target mana
   * yang berlaku (versi pada sesi TERAKHIR yang ditagih — bila koordinator
   * menaikkan target di tengah periode, yang baru itulah yang ditagih).
   */
  function targetPeserta(
    a: (typeof anggotaList)[number],
    kelas: ProgramKelasRow
  ): { sesiTarget: number; target: number | null } {
    // Pemutihan sebulan penuh → tak ada target sama sekali, bukan 100%.
    // Pemutihan menghapus KETIDAKHADIRAN; memaksa setoran jadi penuh akan
    // mengarang hafalan yang tak pernah disetorkan.
    if (pemutihan.has(a.id)) return { sesiTarget: 0, target: null };

    // Sesi yang menagih: sesi kelas Takhassus sendiri, ditambah — bagi peserta
    // yang dipresensi lewat halaqah — sesi kelas halaqahnya sejak tanggal
    // pengalihan. Targetnya tetap dicari di kelas & baris Takhassus.
    const via = viaByTakh.get(a.id);
    const sumber: Array<{ row: AnggotaRow; k: ProgramKelasRow; dari?: string; sebelum?: string }> = [
      { row: a, k: kelas, sebelum: via?.mulai },
      ...(via?.halaqah ?? []).map((h) => ({
        row: h,
        k: kelasById.get(h.program_kelas_id)!,
        dari: via!.mulai,
      })),
    ];

    let sesiTarget = 0;
    let tanggalTerakhir: string | null = null;
    for (const src of sumber) {
      const mulaiKelas = anchorKelas(src.k);
      const dari = mulaiKelas > start ? mulaiKelas : start;
      if (dari > end) continue;
      for (const d of expectedDaysInRange(src.k, dari, end, liburByKelas.get(src.k.id))) {
        // WAJIB: kelas takhassus ber-presensi_sifat 'harian', dan
        // expectedDaysInRange menyelipkan satu sesi at_tibyan tiap Sabtu. Tanpa
        // saringan ini hitungan sesinya membengkak ~4 sesi/periode.
        if (d.program !== 'kelas_maahir') continue;
        if (src.dari && d.tanggal < src.dari) continue;
        if (src.sebelum && d.tanggal >= src.sebelum) continue;
        if (!dalamPeriode(src.row, d.tanggal, start, end)) continue;
        if (pemutihanTanggal.has(`${src.row.id}|${d.tanggal}`)) continue;
        if (targetBulananPada(kelas.id, a.id, d.tanggal) === null) continue; // target belum berlaku
        sesiTarget += 1;
        if (tanggalTerakhir === null || d.tanggal > tanggalTerakhir) tanggalTerakhir = d.tanggal;
      }
    }
    // Tak satu pun sesi menagih peserta ini (belum bergabung, kelas belum mulai,
    // atau target belum berlaku sepanjang periode) → '—', bukan 0%.
    if (tanggalTerakhir === null) return { sesiTarget: 0, target: null };

    return { sesiTarget, target: targetBulananPada(kelas.id, a.id, tanggalTerakhir) };
  }

  // Setoran: list semua anggota 2 kelas takhassus (ikhwan dulu, lalu akhwat, lalu nama).
  const takhPeserta = anggotaList
    .map((a) => ({ a, kelas: kelasById.get(a.program_kelas_id) }))
    .filter((x) => x.kelas && isTakhassus(x.kelas.name))
    .sort((x, y) => {
      if (x.kelas!.gender !== y.kelas!.gender) return x.kelas!.gender === 'ikhwan' ? -1 : 1;
      return x.a.name.localeCompare(y.a.name);
    })
    .map((x): SetoranPeserta => {
      // Peserta via halaqah: setoran sebelum pengalihan dari kelas Takhassus,
      // sesudahnya dari baris-baris halaqahnya.
      const via = viaByTakh.get(x.a.id);
      const rows = [
        ...(setoranByAnggota.get(x.a.id) ?? []).filter((rw) => !via || rw.tanggal < via.mulai),
        ...(via?.halaqah ?? []).flatMap((h) =>
          (setoranByAnggota.get(h.id) ?? []).filter((rw) => rw.tanggal >= via!.mulai)
        ),
      ].sort((p, q) =>
        p.tanggal < q.tanggal ? -1 : p.tanggal > q.tanggal ? 1 : 0
      );
      const halaman = rows.reduce((s, rw) => s + rw.halaman, 0);
      const { sesiTarget, target } = targetPeserta(x.a, x.kelas!);
      return {
        anggotaId: x.a.id,
        name: x.a.name,
        gender: x.kelas!.gender,
        kelasName: x.kelas!.name,
        halaman: rows.length ? halaman : null,
        pertemuanSetor: rows.length,
        rincian: rows
          .map((rw) => `${rw.tanggal.slice(8, 10)}/${rw.tanggal.slice(5, 7)}: ${rw.halaman} hal`)
          .join(' · '),
        sesiTarget,
        target,
        persen: target !== null && target > 0 ? Math.round((halaman / target) * 100) : null,
      };
    });
  const takhSetoranAktual = mean(
    takhPeserta.filter((p) => p.halaman !== null).map((p) => p.halaman as number)
  );
  // Capaian agregat: tertimbang atas peserta BERTARGET. Beda semantik dari
  // `aktual` yang hanya merata-rata penyetor — di sini peserta bertarget yang
  // tak menyetor apa pun dihitung sebagai 0, dan memang itu maksudnya.
  const bertarget = takhPeserta.filter((p) => p.target !== null && p.target > 0);
  const totalTarget = bertarget.reduce((s, p) => s + (p.target as number), 0);
  const totalHalaman = bertarget.reduce((s, p) => s + (p.halaman ?? 0), 0);
  const takhSetoranPersen = totalTarget > 0 ? Math.round((totalHalaman / totalTarget) * 100) : null;
  const takhSetoranBenchmark = mean(bertarget.map((p) => Math.round(p.target as number)));

  // ---- Maahir (non-takhassus, scope kelas_maahir) ----
  const maahirStudents = studentsFor(isMaahir, 'kelas_maahir');
  const maahirAvgI = avgGender(maahirStudents, 'ikhwan');
  const maahirAvgA = avgGender(maahirStudents, 'akhwat');
  const maahirBawah = maahirStudents
    .filter((s) => s.persen !== null && s.persen < 80)
    .sort((a, b) => (a.persen ?? 0) - (b.persen ?? 0));

  // ---- At-Tibyan (semua kelas, scope at_tibyan) ----
  const tibyanStudents = studentsFor(() => true, 'at_tibyan');
  const tibyanAvgI = avgGender(tibyanStudents, 'ikhwan');
  const tibyanAvgA = avgGender(tibyanStudents, 'akhwat');
  const tibyanBawah = tibyanStudents
    .filter((s) => s.persen !== null && s.persen < 100)
    .sort((a, b) => (a.persen ?? 0) - (b.persen ?? 0));
  const tibyanBawahI = tibyanBawah.filter((s) => s.gender === 'ikhwan').length;
  const tibyanBawahA = tibyanBawah.filter((s) => s.gender === 'akhwat').length;

  // ---- Sesi yang lewat tanpa presensi terisi ----
  // Sejak periode dikunci tiap tanggal 28, sesi begini tak bisa disusulkan lagi.
  // Peserta sengaja tak dirugikan (tak ada alpa otomatis); yang dicatat hanya
  // kelalaian pengisiannya, per kelas, supaya koordinator bisa menindak.
  const terisiKeys = new Set<string>();
  for (const [key, set] of filledByKelasScope) {
    const [kelasId, program] = key.split('|');
    const kelas = kelasById.get(kelasId);
    if (!kelas) continue;
    for (const pid of set) {
      const tgl = pertemuanById.get(pid)?.tanggal;
      if (tgl) terisiKeys.add(`${kelasId}|${filledKeyOf(kelas, program, tgl)}`);
    }
  }
  const presensiTakTerisi: LaporanMaahir['presensiTakTerisi'] = [];
  for (const kelas of kelasList) {
    const mulai = anchorKelas(kelas);
    const dari = mulai > start ? mulai : start;
    if (dari > end) continue;
    const hilang = expectedPresensiInRange(kelas, dari, end, liburByKelas.get(kelas.id))
      .filter((d) => !terisiKeys.has(`${kelas.id}|${filledKeyOf(kelas, d.program, d.tanggal)}`));
    if (hilang.length === 0) continue;
    presensiTakTerisi.push({
      kelasName: kelas.name,
      gender: kelas.gender,
      jumlah: hilang.length,
      tanggal: hilang.map((d) => `${d.tanggal} ${d.namaKegiatan}`),
    });
  }
  presensiTakTerisi.sort((a, b) => b.jumlah - a.jumlah || a.kelasName.localeCompare(b.kelasName));

  // Pendataan SP periode bulan ini saja — laporan bulanan menggambarkan disiplin
  // bulan berjalan; angka kumulatif sejak program berjalan tetap tersedia di
  // halaman SP koordinator. Plus catatan bebas koordinator untuk bulan ini.
  const [sp, notes] = await Promise.all([getMaahirSP({ bulan: month }), getLaporanNotes(month)]);

  return {
    month,
    takhassus: {
      setoran: {
        benchmark: takhSetoranBenchmark,
        aktual: takhSetoranAktual,
        persen: takhSetoranPersen,
        adaTarget: bertarget.length > 0,
        peserta: takhPeserta,
      },
      kehadiran: { avgIkhwan: takhAvgI, avgAkhwat: takhAvgA, aktual: avgOfGenders(takhAvgI, takhAvgA), benchmark: 80 },
      dibawahTarget: { jumlah: takhBawah.length, list: takhBawah },
      kehadiranPengajar: 100,
      pengajarDibawahTarget: 0,
      catatan: null,
    },
    maahir: {
      kehadiran: { avgIkhwan: maahirAvgI, avgAkhwat: maahirAvgA, aktual: avgOfGenders(maahirAvgI, maahirAvgA), benchmark: 80 },
      dibawahTarget: { jumlah: maahirBawah.length, list: maahirBawah },
      kehadiranPengajar: 100,
      pengajarDibawahTarget: 0,
    },
    atTibyan: {
      kehadiran: { avgIkhwan: tibyanAvgI, avgAkhwat: tibyanAvgA, aktual: avgOfGenders(tibyanAvgI, tibyanAvgA), benchmark: 100 },
      dibawahTarget: { ikhwan: tibyanBawahI, akhwat: tibyanBawahA, total: tibyanBawah.length, list: tibyanBawah },
    },
    presensiTakTerisi,
    sp,
    notes,
  };
}
