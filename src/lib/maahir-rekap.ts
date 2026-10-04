// Rekap kehadiran anggota Maahir per bulan kalender.
// Dipakai dashboard ketua kelas & koordinator (read-only).

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-page';
import {
  PROGRAM_LABEL,
  anchorKelas,
  expectedPresensiInRange,
  filledKeyOf,
  todayJakarta,
  type MaahirProgram,
} from '@/lib/maahir-presensi';
import { getLiburDatesForKelas } from '@/lib/maahir-libur';
import { dalamPeriode } from '@/lib/anggota-periode';
import type { ProgramKelasRow } from '@/lib/program-kelas';

export type StatusCode = 'H' | 'I' | 'S' | 'A' | 'T' | '-';

const STATUS_TO_CODE: Record<string, StatusCode> = {
  hadir: 'H',
  izin: 'I',
  sakit: 'S',
  tidak_ada_keterangan: 'A',
  terlambat: 'T',
};

export type RekapPertemuan = {
  id: string;
  program: MaahirProgram;
  programLabel: string;
  tanggal: string; // YYYY-MM-DD
};

export type RekapAnggota = {
  anggotaId: string;
  name: string;
  whatsappNumber: string | null;
  isKetua: boolean;
  isWakil: boolean;
  perPertemuan: Record<string, StatusCode>; // pertemuanId → code ('-' jika tak ada data)
  /**
   * pertemuanId → catatan/alasan yang ditulis saat presensi. Terikat ke
   * pertemuannya, bukan digabung per orang: koordinator perlu tahu alasan izin
   * yang MANA untuk tanggal yang mana.
   */
  catatanPerPertemuan: Record<string, string>;
  /** Catatan/alasan yang tercatat pada sesi-sesi bulan ini (unik, digabung '; '). */
  keterangan: string;
  totals: { H: number; I: number; S: number; A: number; T: number };
  /**
   * (H+T)/(pertemuan terisi − sakit). Sakit = udzur, tak menggerus persen:
   * sesinya dikeluarkan dari penyebut. null bila belum ada pertemuan sama sekali;
   * 100 bila semua pertemuannya sakit (penyebut habis).
   */
  persenHadir: number | null;
};

export type RekapSession = {
  tanggal: string; // YYYY-MM-DD (mingguan: Senin kanonik)
  program: MaahirProgram;
  programLabel: string;
  mingguan: boolean;
  filled: boolean; // sudah ada kehadiran tersubmit?
};

export type RekapKelas = {
  kelasId: string;
  kelasName: string;
  gender: 'ikhwan' | 'akhwat';
  jadwalHari: string[];
  /** program_kelas.ketua_wa / wakil_wa — sumber akses pengisian presensi. */
  ketuaWa: string | null;
  wakilWa: string | null;
  pertemuan: RekapPertemuan[];
  anggota: RekapAnggota[];
  sessions: RekapSession[]; // SEMUA pertemuan diharapkan (terisi & belum) + tanggal
  belumDiisi: number; // hari program diharapkan (s/d hari ini) yang belum terisi
};

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // hari terakhir bulan
  let end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  // Cap di hari ini (hanya program yang sudah berjalan).
  const today = todayJakarta();
  if (end > today) end = today;
  return { start, end };
}

/**
 * Rekap kehadiran per kelas untuk bulan tertentu.
 * @param month 'YYYY-MM'
 * @param opts.kelasIds batasi ke kelas tertentu (ketua); kosong = semua.
 * @param opts.gender filter gender (koordinator).
 * @param opts.range ganti rentang bulan kalender dgn rentang lain (mis. periode
 *   laporan bulanan 28–27) supaya angkanya sebanding dengan laporan.
 */
export async function getMaahirRekap(
  month: string,
  opts?: {
    kelasIds?: string[];
    gender?: 'ikhwan' | 'akhwat';
    program?: MaahirProgram;
    range?: { start: string; end: string };
  }
): Promise<RekapKelas[]> {
  const { start, end } = opts?.range ?? monthRange(month);
  // Bulan di masa depan (start > today) → tak ada data.
  if (start > todayJakarta()) return [];

  // 1. Kelas
  let q = supabaseAdmin
    .from('program_kelas')
    .select('id, name, gender, jadwal_hari, waktu_mulai, waktu_selesai, ketua_wa, wakil_wa, self_attendance, presensi_sifat, mulai_tanggal, ikut_tibyan, presensi_via_halaqah_mulai')
    .order('gender')
    .order('name');
  if (opts?.kelasIds && opts.kelasIds.length > 0) q = q.in('id', opts.kelasIds);
  if (opts?.gender) q = q.eq('gender', opts.gender);
  const { data: kelasRows } = await q;
  const kelasList = (kelasRows ?? []) as ProgramKelasRow[];
  if (kelasList.length === 0) return [];

  const kelasIds = kelasList.map((k) => k.id);

  // Libur per kelas dalam rentang bulan (dikecualikan dari hari diharapkan).
  const liburByKelas = await getLiburDatesForKelas(kelasIds, start, end);

  // 2. Pertemuan dalam rentang bulan (opsional difilter per program).
  let pq = supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal')
    .in('program_kelas_id', kelasIds)
    .gte('tanggal', start)
    .lte('tanggal', end);
  if (opts?.program) pq = pq.eq('program', opts.program);
  const { data: pertemuanRows } = await pq.order('tanggal');

  const pertemuanIds = (pertemuanRows ?? []).map((p) => p.id);

  // 3. Anggota
  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select(
      'id, program_kelas_id, name, whatsapp_number, is_ketua, is_wakil, created_at, mulai_tanggal, selesai_tanggal'
    )
    .in('program_kelas_id', kelasIds)
    .eq('active', true)
    .order('name');

  // 4. Kehadiran (hanya yang sudah disubmit)
  const kehadiranByPertemuan = new Map<string, Map<string, StatusCode>>();
  const catatanByAnggota = new Map<string, Set<string>>();
  /** `${pertemuanId}|${anggotaId}` → catatan, supaya alasan tetap melekat pada tanggalnya. */
  const catatanByKey = new Map<string, string>();
  const filledPertemuan = new Set<string>();
  if (pertemuanIds.length > 0) {
    // Paginasi: rekap semua-kelas sebulan bisa >1000 baris (limit PostgREST).
    const kehadiranRows = await fetchAllRows<{
      pertemuan_id: string;
      anggota_id: string | null;
      status: string;
      catatan: string | null;
      diisi_at: string | null;
    }>((from, to) =>
      supabaseAdmin
        .from('kehadiran_peserta')
        .select('pertemuan_id, anggota_id, status, catatan, diisi_at')
        .in('pertemuan_id', pertemuanIds)
        .not('diisi_at', 'is', null)
        .order('id')
        .range(from, to)
    );
    for (const k of kehadiranRows) {
      if (!k.anggota_id) continue;
      filledPertemuan.add(k.pertemuan_id);
      let m = kehadiranByPertemuan.get(k.pertemuan_id);
      if (!m) {
        m = new Map();
        kehadiranByPertemuan.set(k.pertemuan_id, m);
      }
      m.set(k.anggota_id, STATUS_TO_CODE[k.status] ?? 'A');
      const c = typeof k.catatan === 'string' ? k.catatan.trim() : '';
      if (c) {
        let set = catatanByAnggota.get(k.anggota_id);
        if (!set) { set = new Set(); catatanByAnggota.set(k.anggota_id, set); }
        set.add(c);
        catatanByKey.set(`${k.pertemuan_id}|${k.anggota_id}`, c);
      }
    }
  }

  // Hanya tampilkan pertemuan yang sudah terisi (program yang sudah berjalan & dicatat).
  const pertemuanByKelas = new Map<string, RekapPertemuan[]>();
  for (const p of pertemuanRows ?? []) {
    if (!filledPertemuan.has(p.id)) continue;
    // Anulir: pertemuan pada tanggal libur tak dihitung (kolom & denominator %).
    if (liburByKelas.get(p.program_kelas_id)?.has(p.tanggal)) continue;
    const list = pertemuanByKelas.get(p.program_kelas_id) ?? [];
    list.push({
      id: p.id,
      program: p.program as MaahirProgram,
      programLabel: PROGRAM_LABEL[p.program] ?? p.program,
      tanggal: p.tanggal,
    });
    pertemuanByKelas.set(p.program_kelas_id, list);
  }

  // Hanya anggota yang keanggotaannya beririsan dengan rentang bulan. Kelas yang
  // dipensiunkan (semua anggotanya diberi selesai_tanggal — lihat saringKelasBubar
  // di program-kelas.ts) dengan begitu hilang dari rekap bulan-bulan sesudahnya,
  // tapi tetap utuh di bulan-bulan riwayatnya.
  const anggotaByKelas = new Map<string, typeof anggotaRows>();
  for (const a of anggotaRows ?? []) {
    if (a.selesai_tanggal && a.selesai_tanggal < start) continue;
    if (a.mulai_tanggal && a.mulai_tanggal > end) continue;
    const list = anggotaByKelas.get(a.program_kelas_id) ?? [];
    list.push(a);
    anggotaByKelas.set(a.program_kelas_id, list);
  }

  // 5. Susun per kelas
  const result: RekapKelas[] = [];
  for (const k of kelasList) {
    const pertemuan = (pertemuanByKelas.get(k.id) ?? []).sort((a, b) =>
      a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0
    );
    const anggota: RekapAnggota[] = (anggotaByKelas.get(k.id) ?? []).map((a) => {
      const perPertemuan: Record<string, StatusCode> = {};
      const catatanPerPertemuan: Record<string, string> = {};
      const totals = { H: 0, I: 0, S: 0, A: 0, T: 0 };
      let dihitung = 0; // pertemuan dalam rentang keanggotaan (denominator %)
      for (const p of pertemuan) {
        // Di luar rentang keanggotaan (belum masuk / sudah pindah kelas).
        if (!dalamPeriode(a, p.tanggal, start, end)) {
          perPertemuan[p.id] = '-';
          continue;
        }
        dihitung++;
        const code = kehadiranByPertemuan.get(p.id)?.get(a.id) ?? '-';
        perPertemuan[p.id] = code;
        if (code !== '-') totals[code]++;
        const c = catatanByKey.get(`${p.id}|${a.id}`);
        if (c) catatanPerPertemuan[p.id] = c;
      }
      // Sakit tak menghukum persen: sesi sakit dikeluarkan dari penyebut.
      // Semua sesi sakit → penyebut 0 tapi dianggap hadir penuh (100%).
      const denom = Math.max(0, dihitung - totals.S);
      const persenHadir =
        denom > 0
          ? Math.round(((totals.H + totals.T) / denom) * 100)
          : dihitung > 0
            ? 100
            : null;
      return {
        anggotaId: a.id,
        name: a.name,
        whatsappNumber: a.whatsapp_number ?? null,
        isKetua: a.is_ketua,
        isWakil: a.is_wakil,
        perPertemuan,
        catatanPerPertemuan,
        keterangan: Array.from(catatanByAnggota.get(a.id) ?? []).join('; '),
        totals,
        persenHadir,
      };
    });

    // belumDiisi: hari diharapkan (anchor bulan s/d min(akhir bulan, today)) − pertemuan terisi.
    // matchKey: harian per (program,tanggal); mingguan per pekan.
    // Kelas yang baru dibentuk di tengah periode tak dianggap "belum diisi"
    // untuk tanggal sebelum ia berjalan.
    // Kelas yang bubar di tengah bulan (semua anggotanya punya selesai_tanggal)
    // tak diharapkan presensi lewat dari tanggal selesai terakhir itu.
    const anggotaKelas = anggotaByKelas.get(k.id) ?? [];
    if (anggotaKelas.length === 0 && pertemuan.length === 0) continue;
    const akhirKelas =
      anggotaKelas.length > 0 && anggotaKelas.every((a) => !!a.selesai_tanggal)
        ? anggotaKelas.reduce((m, a) => (a.selesai_tanggal! > m ? a.selesai_tanggal! : m), '')
        : null;
    const mulaiKelas = anchorKelas(k);
    const expectedStart = mulaiKelas > start ? mulaiKelas : start;
    const expectedEnd = akhirKelas && akhirKelas < end ? akhirKelas : end;
    const expectedAll =
      expectedStart > expectedEnd ? [] : expectedPresensiInRange(k, expectedStart, expectedEnd, liburByKelas.get(k.id));
    // Filter ke program tertentu (mis. hanya At-Tibyan) bila diminta.
    const expected = opts?.program
      ? expectedAll.filter((e) => e.program === opts.program)
      : expectedAll;
    const filledKeys = new Set(
      (pertemuanRows ?? [])
        .filter((p) => p.program_kelas_id === k.id && filledPertemuan.has(p.id))
        .map((p) => filledKeyOf(k, p.program, p.tanggal))
    );
    const belumDiisi = expected.filter(
      (e) => !filledKeys.has(filledKeyOf(k, e.program, e.tanggal))
    ).length;

    const sessions: RekapSession[] = expected
      .map((e) => ({
        tanggal: e.tanggal,
        program: e.program,
        programLabel: PROGRAM_LABEL[e.program] ?? e.program,
        mingguan: e.mingguan,
        filled: filledKeys.has(filledKeyOf(k, e.program, e.tanggal)),
      }))
      .sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0));

    result.push({
      kelasId: k.id,
      kelasName: k.name,
      gender: k.gender,
      jadwalHari: k.jadwal_hari ?? [],
      ketuaWa: k.ketua_wa ?? null,
      wakilWa: k.wakil_wa ?? null,
      pertemuan,
      anggota,
      sessions,
      belumDiisi,
    });
  }

  return result;
}
