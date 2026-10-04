// Pengelompokan tampilan kelas per sesi (`program_kelas.grup_sesi`, 0092).
//
// Halaqah Tahfizh & Takhassus akhwat disimpan sebagai satu kelas per hari
// (satu `jadwal_hari`) supaya tagihan presensi, laporan bulanan, dan SP tetap
// per hari. Bagi ketua dan koordinator, kelas-kelas itu satu sesi ("Halaqah
// Tahfizh Pagi"), jadi kelas dengan grup_sesi sama (dan gender sama) tampil
// sebagai SATU entri; kelas per hari turun jadi rincian hari. NULL = kelas
// berdiri sendiri, tampil seperti dulu.
//
// Murni (tanpa DB) supaya bisa dipakai halaman server mana pun dan diuji lewat
// `npm run test-grup-sesi`.
// Spec: docs/superpowers/specs/2026-10-02-presensi-sesi-akhwat-design.md

/** Urutan hari sesuai format `jadwal_hari` di seed. */
const URUTAN_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu', 'Ahad'];

/** Kata sesi di akhir nilai grup_sesi, mis. "Halaqah Tahfizh Pagi". */
const POLA_SESI = /^(.*?\S)\s+(?:sesi\s+)?(pagi|siang|sore|malam|subuh)$/i;

function rapikan(v: string): string {
  return v.trim().replace(/\s+/g, ' ');
}

/** Nilai grup_sesi yang berarti (string kosong = tak dikelompokkan). */
export function grupSesiBerlaku(v: string | null | undefined): string | null {
  if (v == null) return null;
  const r = rapikan(v);
  return r === '' ? null : r;
}

/**
 * Label tampilan dari nilai grup_sesi.
 * "Halaqah Tahfizh Pagi" → "Halaqah Tahfizh — Sesi Pagi". Nilai tanpa kata
 * sesi di akhir dikembalikan apa adanya (dirapikan).
 */
export function labelGrupSesi(value: string): string {
  const v = rapikan(value);
  const m = POLA_SESI.exec(v);
  if (!m) return v;
  const sesi = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
  if (m[1].toLowerCase() === 'sesi') return `Sesi ${sesi}`;
  return `${m[1]} — Sesi ${sesi}`;
}

/** Indeks hari (0 Senin … 6 Ahad); 99 bila tak dikenal. */
function indeksHari(hari: string): number {
  const i = URUTAN_HARI.indexOf(hari);
  return i === -1 ? 99 : i;
}

/** Indeks hari paling awal dalam jadwal — kunci urut kelas per hari. */
export function indeksHariPertama(jadwalHari: string[] | null | undefined): number {
  return Math.min(99, ...(jadwalHari ?? []).map(indeksHari));
}

/** "Senin, Kamis" — hari jadwal kelas, urut Senin → Ahad. '' bila tanpa jadwal. */
export function hariKelas(jadwalHari: string[] | null | undefined): string {
  return [...(jadwalHari ?? [])].sort((a, b) => indeksHari(a) - indeksHari(b)).join(', ');
}

/**
 * Nama kelas untuk layar ketua/koordinator. Kelas bergrup memakai label sesi;
 * `denganHari` menambahkan hari jadwalnya (pembeda antar kelas per hari, mis.
 * di pilihan kelas). Kelas tanpa grup tetap memakai namanya.
 */
export function namaTampilKelas(
  k: { name: string; grup_sesi?: string | null; jadwal_hari?: string[] | null },
  opsi?: { denganHari?: boolean }
): string {
  const g = grupSesiBerlaku(k.grup_sesi);
  if (!g) return k.name;
  const label = labelGrupSesi(g);
  const hari = hariKelas(k.jadwal_hari);
  return opsi?.denganHari && hari ? `${label} · ${hari}` : label;
}

export type CiriKelas = {
  id: string;
  grupSesi: string | null | undefined;
  gender: string;
  jadwalHari: string[] | null | undefined;
};

export type EntriKelas<T> =
  | { jenis: 'tunggal'; kunci: string; kelas: T }
  | {
      jenis: 'grup';
      kunci: string;
      /** Label tampilan, mis. "Halaqah Tahfizh — Sesi Pagi". */
      label: string;
      /** Nilai grup_sesi apa adanya (dirapikan). */
      grupSesi: string;
      gender: string;
      /** Kelas per hari, urut Senin → Ahad. */
      anggota: T[];
    };

/**
 * Satukan kelas segrup (grup_sesi + gender sama; huruf besar/kecil & spasi
 * diabaikan) jadi satu entri. Urutan entri mengikuti kemunculan pertama di
 * `rows`, jadi urutan bawaan pemanggil (mis. gender lalu nama) tetap terjaga.
 */
export function kelompokkanKelas<T>(rows: T[], ciri: (r: T) => CiriKelas): EntriKelas<T>[] {
  const out: EntriKelas<T>[] = [];
  const grupByKunci = new Map<string, Extract<EntriKelas<T>, { jenis: 'grup' }>>();
  for (const r of rows) {
    const c = ciri(r);
    const g = grupSesiBerlaku(c.grupSesi);
    if (!g) {
      out.push({ jenis: 'tunggal', kunci: c.id, kelas: r });
      continue;
    }
    const kunci = `grup:${c.gender}|${g.toLowerCase()}`;
    let e = grupByKunci.get(kunci);
    if (!e) {
      e = { jenis: 'grup', kunci, label: labelGrupSesi(g), grupSesi: g, gender: c.gender, anggota: [] };
      grupByKunci.set(kunci, e);
      out.push(e);
    }
    e.anggota.push(r);
  }
  for (const e of grupByKunci.values()) {
    e.anggota.sort(
      (a, b) => indeksHariPertama(ciri(a).jadwalHari) - indeksHariPertama(ciri(b).jadwalHari)
    );
  }
  return out;
}

/**
 * Ringkasan jadwal satu grup: hari dikumpulkan per rentang jam.
 * Mis. "Senin, Selasa, Rabu, Kamis · 07:30 – 09:30 / Jum'at · 07:00 – 08:30".
 */
export function ringkasJadwalGrup(
  anggota: Array<{ jadwalHari: string[] | null | undefined; waktuMulai: string | null; waktuSelesai: string | null }>
): string {
  const perJam = new Map<string, string[]>();
  const urut = [...anggota].sort(
    (a, b) => indeksHariPertama(a.jadwalHari) - indeksHariPertama(b.jadwalHari)
  );
  for (const k of urut) {
    const jam = k.waktuMulai
      ? `${k.waktuMulai.slice(0, 5)}${k.waktuSelesai ? ' – ' + k.waktuSelesai.slice(0, 5) : ''}`
      : '';
    const arr = perJam.get(jam) ?? [];
    for (const h of [...(k.jadwalHari ?? [])].sort((a, b) => indeksHari(a) - indeksHari(b))) {
      if (!arr.includes(h)) arr.push(h);
    }
    perJam.set(jam, arr);
  }
  return [...perJam.entries()]
    .map(([jam, hari]) => [hari.join(', '), jam].filter(Boolean).join(' · '))
    .join(' / ');
}
