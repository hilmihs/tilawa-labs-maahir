// Parser presensi HITS: satu tab CSV = satu halaqah. Header memuat
// JENIS KELAMIN | NAMA HALAQAH | JADWAL BELAJAR | NAMA GURU | MURID_ID |
// NAMA LENGKAP | STATUS PESERTA | ... | (kolom pertemuan 1..50) | tajwid.
// Tiap baris data = satu peserta.

import { parseCsv } from '@/lib/csv';
import { HARI_INDEX } from '@/lib/hits';
import type { Gender } from '@/types/db';

export type PresensiPeserta = {
  murid_id: string | null;
  nama: string;
  jenis_kelamin: string | null;
  status_peserta: string | null;
};

export type PresensiHalaqah = {
  name: string;
  jadwal_raw: string | null;
  jadwal_hari: string[];
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  gender: Gender | null;
  pengajar_nama_sheet: string | null;
  peserta: PresensiPeserta[];
};

function norm(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** "Online Senin & Rabu 20:00 - 21:30 WIB" -> {hari, mulai, selesai}. */
export function parseJadwal(raw: string): {
  hari: string[];
  mulai: string | null;
  selesai: string | null;
} {
  const hari: string[] = [];
  for (const name of Object.keys(HARI_INDEX)) {
    // hindari duplikat (Jumat & Jum'at), pakai nama kanonik ID
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(raw)) hari.push(name);
  }
  // dedupe by weekday index, simpan satu nama per hari
  const seen = new Set<number>();
  const hariUniq: string[] = [];
  for (const h of hari) {
    const idx = HARI_INDEX[h];
    if (!seen.has(idx)) {
      seen.add(idx);
      hariUniq.push(canonicalHari(idx));
    }
  }
  const times = raw.match(/(\d{1,2}[:.]\d{2})/g) ?? [];
  const mulai = times[0] ? times[0].replace('.', ':') : null;
  const selesai = times[1] ? times[1].replace('.', ':') : null;
  return { hari: hariUniq, mulai, selesai };
}

function canonicalHari(idx: number): string {
  const names: Record<number, string> = {
    0: 'Ahad', 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: "Jum'at", 6: 'Sabtu',
  };
  return names[idx];
}

function genderFrom(halaqahName: string, jkSamples: string[]): Gender | null {
  const n = halaqahName.toUpperCase();
  if (n.includes('IKHWAN')) return 'ikhwan';
  if (n.includes('AKHWAT')) return 'akhwat';
  // majority dari JENIS KELAMIN
  let l = 0;
  let p = 0;
  for (const jk of jkSamples) {
    const t = jk.toUpperCase();
    if (t.includes('LAKI')) l++;
    else if (t.includes('PEREMPUAN') || t.includes('WANITA')) p++;
  }
  if (l === 0 && p === 0) return null;
  return l >= p ? 'ikhwan' : 'akhwat';
}

export function parsePresensiTab(csv: string): PresensiHalaqah | null {
  const rows = parseCsv(csv);

  let headerIdx = -1;
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].map(norm);
    if (cells.includes('MURID_ID') && cells.includes('NAMA LENGKAP')) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx < 0) return null;

  const header = rows[headerIdx].map(norm);
  const col = (name: string) => header.indexOf(name);
  const ci = {
    jk: col('JENIS KELAMIN'),
    halaqah: col('NAMA HALAQAH'),
    jadwal: col('JADWAL BELAJAR'),
    guru: col('NAMA GURU'),
    murid: col('MURID_ID'),
    nama: col('NAMA LENGKAP'),
    status: col('STATUS PESERTA'),
  };

  const peserta: PresensiPeserta[] = [];
  const jkSamples: string[] = [];
  let halaqahName = '';
  let jadwalRaw = '';
  let guru = '';

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const nama = (row[ci.nama] ?? '').trim();
    if (!nama) continue;

    if (!halaqahName && ci.halaqah >= 0) halaqahName = (row[ci.halaqah] ?? '').trim();
    if (!jadwalRaw && ci.jadwal >= 0) jadwalRaw = (row[ci.jadwal] ?? '').trim();
    if (!guru && ci.guru >= 0) guru = (row[ci.guru] ?? '').trim();

    const jk = ci.jk >= 0 ? (row[ci.jk] ?? '').trim() : '';
    if (jk) jkSamples.push(jk);

    peserta.push({
      murid_id: ci.murid >= 0 ? (row[ci.murid] ?? '').trim() || null : null,
      nama,
      jenis_kelamin: jk || null,
      status_peserta: ci.status >= 0 ? (row[ci.status] ?? '').trim() || null : null,
    });
  }

  if (!halaqahName) return null;

  const jadwal = jadwalRaw ? parseJadwal(jadwalRaw) : { hari: [], mulai: null, selesai: null };

  return {
    name: halaqahName,
    jadwal_raw: jadwalRaw || null,
    jadwal_hari: jadwal.hari,
    waktu_mulai: jadwal.mulai,
    waktu_selesai: jadwal.selesai,
    gender: genderFrom(halaqahName, jkSamples),
    pengajar_nama_sheet: guru || null,
    peserta,
  };
}
