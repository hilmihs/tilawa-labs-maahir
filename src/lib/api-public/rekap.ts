// rekap.ts — 6 builder rekap; semua lewat sanitize(). Lihat spec §5.
import { getLaporanMaahir, monthRange } from '@/lib/laporan-maahir';
import { getMaahirSP } from '@/lib/maahir-sp';
import { getMaahirRekap } from '@/lib/maahir-rekap';
import { getTibyanView } from '@/lib/tibyan-rekap';
import { getHitsKoordinatorRekap } from '@/lib/hits-koordinator-rekap';
import { getShakwaRekap } from '@/lib/shakwa-rekap';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sanitize } from './sanitize';

export async function rekapLaporanMaahir(bulan: string) {
  const raw = await getLaporanMaahir(bulan);
  const { start, end } = monthRange(bulan);
  return { data: sanitize(raw), meta: { bulan, mulai: start, sampai: end } };
}

export async function rekapSP(opts: Parameters<typeof getMaahirSP>[0]) {
  const raw = await getMaahirSP(opts);
  return { data: sanitize(raw), meta: { cutoff: raw.cutoff } };
}

export async function rekapKehadiran(bulan: string, opts: Parameters<typeof getMaahirRekap>[1]) {
  const raw = await getMaahirRekap(bulan, opts);
  const { start, end } = monthRange(bulan);
  return { data: sanitize(raw), meta: { bulan, mulai: start, sampai: end } };
}

export async function rekapTibyan(bulan: string, opts: Parameters<typeof getTibyanView>[1]) {
  const raw = await getTibyanView(bulan, opts);
  const { start, end } = monthRange(bulan);
  return { data: sanitize(raw), meta: { bulan, mulai: start, sampai: end } };
}

/**
 * Rekap Shakwa (default: hari ini WIB). Nomor WA pelapor dibuang sanitize();
 * lampiran hanya dilaporkan jumlahnya — berkasnya tak pernah keluar lewat API.
 */
export async function rekapShakwa(opts: Parameters<typeof getShakwaRekap>[0]) {
  const raw = await getShakwaRekap(opts);
  // Field paginasi khusus dashboard (page/limit/totalItems/totalHalaman) dibuang
  // dari keluaran API — tak relevan bagi konsumen agregat.
  const { items, page: _page, limit: _limit, totalItems: _totalItems, totalHalaman: _totalHalaman, ...ringkas } = raw;
  const data = {
    ...ringkas,
    items: items.map(({ lampiran: _lampiran, ...rest }) => rest),
  };
  return { data: sanitize(data), meta: { mulai: raw.mulai, sampai: raw.sampai, total: raw.total } };
}

export async function rekapHitsDisiplin(opts: Parameters<typeof getHitsKoordinatorRekap>[0]) {
  const raw = await getHitsKoordinatorRekap(opts);
  return {
    data: sanitize(raw),
    meta: { mode: raw.mode, mulai: raw.start, sampai: raw.end, periode: raw.periodeLabel },
  };
}

/** Akhir bulan kalender (batas kesegaran snapshot), akhir hari UTC. */
function endOfMonthISO(bulan: string): string {
  const [y, m] = bulan.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)); // hari 0 bulan berikutnya = hari terakhir bulan ini
  const mm = String(last.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(last.getUTCDate()).padStart(2, '0');
  return `${last.getUTCFullYear()}-${mm}-${dd}T23:59:59.999Z`;
}

/**
 * Matrix Skill Guru — MEMBACA snapshot `matrix_rekap` (tidak menghitung ulang).
 * Meniru join pada src/app/api/matrix/download/route.ts:
 *   kelompok_pengajar (nama kelompok) + pengajar (nama, matrix_exclude) + matrix_rekap (year_month=bulan).
 * Kesegaran snapshot dihitung dari max(updated_at) baris matrix_rekap.
 */
export async function rekapMatrixGuru(bulan: string, gender?: string) {
  // Nama kelompok (opsional difilter gender).
  let kq = supabaseAdmin.from('kelompok_pengajar').select('id, name');
  if (gender) kq = kq.eq('gender', gender);
  const { data: kelompokList } = await kq;
  const kelompokMap = new Map((kelompokList ?? []).map((k) => [k.id, k.name]));

  // Pengajar (guru observasi-saja spt DPQ tak masuk matrix), opsional difilter gender.
  let pq = supabaseAdmin
    .from('pengajar')
    .select('id, name, kelompok_id, active, gender')
    .neq('matrix_exclude', true);
  if (gender) pq = pq.eq('gender', gender);
  const { data: pengajarList } = await pq.order('name');

  const pengajarIds = (pengajarList ?? []).map((p) => p.id);
  const { data: matrixData } = pengajarIds.length
    ? await supabaseAdmin
        .from('matrix_rekap')
        .select('*')
        .eq('year_month', bulan)
        .in('pengajar_id', pengajarIds)
    : { data: [] as Record<string, unknown>[] };

  const rows = matrixData ?? [];
  const matrixByPengajar = new Map(rows.map((m) => [m.pengajar_id as string, m]));

  // Kesegaran: snapshot terakhir = max(updated_at); basi bila belum pernah dihitung
  // atau snapshot lebih tua dari akhir bulan.
  const updatedAts = rows
    .map((m) => m.updated_at as string | null | undefined)
    .filter((v): v is string => !!v);
  const snapshotTerakhir = updatedAts.length
    ? updatedAts.reduce((a, b) => (a > b ? a : b))
    : null;
  const basi = snapshotTerakhir === null || snapshotTerakhir < endOfMonthISO(bulan);

  // Tanpa baris matrix_rekap untuk bulan ini → data kosong (bukan nol), basi: true.
  const pengajar = rows.length
    ? (pengajarList ?? []).map((p) => ({
        pengajar_id: p.id,
        nama: p.name,
        kelompok: kelompokMap.get(p.kelompok_id ?? '') ?? '',
        gender: p.gender,
        active: p.active,
        matrix: matrixByPengajar.get(p.id) ?? null,
      }))
    : [];

  const data = sanitize({ pengajar });
  return { data, meta: { bulan, snapshot_terakhir: snapshotTerakhir, basi } };
}
