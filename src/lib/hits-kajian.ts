// Fungsi MURNI presensi Kajian Adab F4. Tanpa I/O — dipakai server action (guard),
// UI (badge/label), dan rekap. Diuji: npm run test-kajian.
import { datesInRange, dayIndexOf } from './maahir-presensi';

export const KAJIAN_MULAI = '16:00';              // WIB
export const KAJIAN_GHOSTING_DAYS = 3;            // reminder → alpa
const MS_PER_DAY = 86_400_000;
const SUNDAY = 0;                                 // dayIndexOf: 0 = Ahad/Minggu

export type KajianStatus = 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpa';

export interface KajianRow {
  ketua_wa: string;
  tanggal: string;                 // YYYY-MM-DD (Minggu)
  status: KajianStatus | null;
  checkin_at: string | null;       // ISO
  reminder_sent_at: string | null; // ISO
}

export type KajianState =
  | 'akan-datang' | 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpa' | 'belum-isi';

/** Semua tanggal Minggu (YYYY-MM-DD) dalam [start, end] inklusif, urut menaik. */
export function sundaysInRange(start: string, end: string): string[] {
  return datesInRange(start, end).filter((d) => dayIndexOf(d) === SUNDAY);
}

/** Daftar bulan 'YYYY-MM' dari anchor s/d today, urut menurun (terbaru dulu). */
export function monthsInRange(anchor: string, today: string): string[] {
  const out: string[] = [];
  const end = today.slice(0, 7);
  let cur = anchor.slice(0, 7);
  while (cur <= end) {
    out.push(cur);
    const [y, m] = cur.split('-').map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return out.reverse();
}

/** Batas tanggal [start, end] untuk satu bulan 'YYYY-MM'. */
export function monthBounds(bulan: string): { start: string; end: string } {
  const [y, m] = bulan.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${bulan}-01`, end: `${bulan}-${String(lastDay).padStart(2, '0')}` };
}

/** true bila waktu check-in (ISO) melewati 16:00 WIB pada tanggal sesi. */
export function deriveTerlambat(checkinIso: string, tanggal: string): boolean {
  const [h, m] = KAJIAN_MULAI.split(':').map(Number);
  const start = new Date(
    `${tanggal}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`
  ).getTime();
  return new Date(checkinIso).getTime() > start;
}

/** Status pilihan user (Hadir/Izin/Sakit) → status tersimpan, hitung Terlambat dari waktu. */
export function statusOnCheckin(
  pilih: 'Hadir' | 'Izin' | 'Sakit',
  checkinIso: string,
  tanggal: string
): KajianStatus {
  if (pilih === 'Hadir' && deriveTerlambat(checkinIso, tanggal)) return 'Terlambat';
  return pilih;
}

/**
 * State efektif satu sel (ketua × Minggu).
 * @param row baris presensi bila ada, else null.
 * @param tanggal tanggal Minggu sesi (YYYY-MM-DD).
 * @param today tanggal hari ini WIB (YYYY-MM-DD).
 * @param nowIso waktu sekarang ISO (untuk countdown).
 */
export function deriveKajianState(
  row: KajianRow | null,
  tanggal: string,
  today: string,
  nowIso: string
): KajianState {
  if (tanggal > today) return 'akan-datang';
  if (row && row.status) {
    switch (row.status) {
      case 'Hadir': return 'hadir';
      case 'Terlambat': return 'terlambat';
      case 'Izin': return 'izin';
      case 'Sakit': return 'sakit';
      case 'Alpa': return 'alpa';
    }
  }
  // status null (atau tak ada baris)
  if (row && row.reminder_sent_at) {
    const deadline = new Date(row.reminder_sent_at).getTime() + KAJIAN_GHOSTING_DAYS * MS_PER_DAY;
    return new Date(nowIso).getTime() >= deadline ? 'alpa' : 'belum-isi';
  }
  return 'belum-isi';
}

export interface KajianRekap {
  ketua_wa: string;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  belumIsi: number;
  totalSesi: number;
  persen: number;   // (hadir + terlambat) / totalSesi * 100, dibulatkan
}

/**
 * Rekap per ketua atas semua Minggu non-libur dari anchor s/d Minggu terakhir yang lewat.
 * @param rows semua baris presensi (lintas ketua).
 * @param liburSet set tanggal Minggu libur (YYYY-MM-DD).
 * @param ketuaWaList daftar WA ketua yang direkap.
 * @param anchor Minggu pertama dihitung (YYYY-MM-DD).
 * @param today hari ini WIB.
 * @param nowIso waktu sekarang ISO.
 * @param periodEnd batas akhir periode (YYYY-MM-DD) bila rekap dibatasi per bulan;
 *                  di-clamp ke today (sesi mendatang tak pernah dihitung).
 */
export function computeKajianRekap(
  rows: KajianRow[],
  liburSet: Set<string>,
  ketuaWaList: string[],
  anchor: string,
  today: string,
  nowIso: string,
  periodEnd?: string
): KajianRekap[] {
  const end = periodEnd && periodEnd < today ? periodEnd : today;
  const sesi = sundaysInRange(anchor, end).filter((d) => !liburSet.has(d));
  const byKey = new Map<string, KajianRow>();
  for (const r of rows) byKey.set(`${r.ketua_wa}|${r.tanggal}`, r);

  return ketuaWaList.map((wa) => {
    const acc: KajianRekap = {
      ketua_wa: wa, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0,
      belumIsi: 0, totalSesi: sesi.length, persen: 0,
    };
    for (const tgl of sesi) {
      const st = deriveKajianState(byKey.get(`${wa}|${tgl}`) ?? null, tgl, today, nowIso);
      if (st === 'hadir') acc.hadir++;
      else if (st === 'terlambat') acc.terlambat++;
      else if (st === 'izin') acc.izin++;
      else if (st === 'sakit') acc.sakit++;
      else if (st === 'alpa') acc.alpa++;
      else if (st === 'belum-isi') acc.belumIsi++;
    }
    acc.persen = acc.totalSesi === 0 ? 0
      : Math.round(((acc.hadir + acc.terlambat) / acc.totalSesi) * 100);
    return acc;
  });
}
