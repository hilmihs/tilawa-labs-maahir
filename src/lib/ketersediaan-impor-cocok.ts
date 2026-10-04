import 'server-only';
import type { Gender } from '@/types/db';
import { normalWa } from '@/lib/ketersediaan-pendaftar';

/**
 * Cocokkan satu baris xlsx ke akun `pengajar`.
 *
 * Nomor WA dipakai bila ada — itu identitas login aplikasi ini. Nomor yang tidak
 * punya akun TIDAK jatuh ke pencocokan nama: nama mirip bukan bukti orang yang
 * sama, dan memasangkannya diam-diam lebih berbahaya daripada melewatinya.
 *
 * Sheet offline tidak punya kolom WA, jadi dicocokkan lewat nama pada pengajar
 * aktif segender. Pemasangan OTOMATIS sengaja ketat, karena salah pasang berarti
 * jam seseorang tercatat atas nama orang lain tanpa ada yang sadar:
 *  · nama persis setelah gelar dibuang; atau
 *  · setiap kata bermakna di xlsx cocok dengan kata akun, DAN (setiap kata akun
 *    cocok balik, ATAU nama xlsx punya ≥ 2 kata bermakna);
 *  · nama xlsx satu kata bermakna hanya dipasang bila akunnya juga nama yang
 *    setara utuh ("Durrotussyifa" ~ "Durrotusyifa").
 * Kata umum (Muhammad, Abdul, Siti, Nur, Ahmad, …) tidak dihitung bermakna:
 * "Ust. Ahmad" bukan bukti orangnya "Ahmad Fauzan". Selebihnya menjadi kandidat
 * yang dipilih koordinator.
 */

export interface PengajarRingkas {
  id: string;
  name: string;
  gender: Gender;
  whatsapp_number: string;
  active: boolean;
}

export type StatusCocok = 'cocok' | 'tanpa_akun' | 'gender_beda' | 'nama_tak_ketemu' | 'nama_ganda' | 'dilewati';

export interface HasilCocok {
  pengajar_id: string | null;
  status: StatusCocok;
  cara: 'wa' | 'nama' | 'manual' | null;
  /** Nama akun yang dipasangkan — ditampilkan supaya koordinator bisa memeriksa. */
  nama_akun: string | null;
  kandidat: { id: string; name: string }[];
}

const GELAR = new Set(['ustadz', 'ustadzah', 'ust', 'ustz', 'al', 'bin', 'binti']);

export function namaPengajarNormal(nama: string): string {
  return nama
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .split(' ')
    .filter((t) => t && !GELAR.has(t))
    .join(' ');
}

/**
 * Bentuk ejaan sebuah kata nama. Nama di xlsx ditulis tangan dan sering berbeda
 * ejaan dengan akunnya: "Khoiriyyah"/"Khoiriyah", "Durrotussyifa"/"Durrotusyifa",
 * "Lathifah"/"Latifah", "Rinnie"/"Rinny". Huruf ganda dirapatkan, th/dh jadi t/d,
 * y jadi i, dan akhiran -ie jadi -i.
 */
function ejaan(t: string): string {
  return t
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1')
    .replace(/ie$/, 'i');
}

function kata(nama: string): string[] {
  return [...new Set(namaPengajarNormal(nama).split(' ').filter((t) => t.length > 2).map(ejaan))];
}

/**
 * Kata nama yang dipakai begitu banyak orang sehingga tidak membedakan siapa pun.
 * Disimpan dalam bentuk `ejaan` supaya "Muhammad"/"Muhamad" sama-sama tertangkap.
 */
const KATA_UMUM = new Set(
  ['muhammad', 'muhamad', 'moh', 'mohammad', 'mohamad', 'abdul', 'abd', 'siti', 'nur', 'nurul', 'ahmad', 'al', 'bin', 'binti', 'ummu', 'abu'].map(ejaan)
);

function bermakna(k: readonly string[]): string[] {
  return k.filter((t) => !KATA_UMUM.has(t));
}

/**
 * Dua kata dianggap sama bila ejaannya sama, atau yang pendek awalan yang panjang
 * (≥ 5 huruf): "Chandra" ~ "Chandrawatty". Awalan tidak berlaku bila kata pendeknya
 * kata umum — "Abdul" bukan "Abdullah".
 */
function kataSama(a: string, b: string): boolean {
  if (a === b) return true;
  const [pendek, panjang] = a.length <= b.length ? [a, b] : [b, a];
  return pendek.length >= 5 && !KATA_UMUM.has(pendek) && panjang.startsWith(pendek);
}

function jumlahSama(a: readonly string[], b: readonly string[]): number {
  return a.filter((x) => b.some((y) => kataSama(x, y))).length;
}

function semuaCocok(a: readonly string[], b: readonly string[]): boolean {
  return a.every((x) => b.some((y) => kataSama(x, y)));
}

/** Aturan pemasangan otomatis lewat nama (lihat kepala berkas). */
function namaCukupCocok(namaXlsx: string, namaAkun: string): boolean {
  const semuaX = kata(namaXlsx);
  const semuaA = kata(namaAkun);
  const x = bermakna(semuaX);
  const a = bermakna(semuaA);
  if (x.length === 0 || !semuaCocok(x, a)) return false;
  if (x.length >= 2) return true;
  // Satu kata bermakna: seluruh nama — termasuk kata umumnya — harus setara dua arah.
  return semuaCocok(a, x) && semuaCocok(semuaX, semuaA) && semuaCocok(semuaA, semuaX);
}

/** Akun bernama mirip — hanya usulan untuk dipilih koordinator, tidak pernah dipasang otomatis. */
function kandidatNama(nama: string, segender: readonly PengajarRingkas[]): { id: string; name: string }[] {
  const k = kata(nama);
  return segender
    .map((p) => ({ p, n: jumlahSama(k, kata(p.name)) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name))
    .slice(0, 5)
    .map(({ p }) => ({ id: p.id, name: p.name }));
}

const hasil = (h: Partial<HasilCocok> & Pick<HasilCocok, 'status'>): HasilCocok => ({
  pengajar_id: null,
  cara: null,
  nama_akun: null,
  kandidat: [],
  ...h,
});

export function cocokkanPengajar(
  baris: { nama: string; wa: string | null; gender: Gender },
  daftar: readonly PengajarRingkas[],
  /** id pengajar pilihan koordinator, atau 'lewati'. */
  pilihan?: string
): HasilCocok {
  const aktif = daftar.filter((p) => p.active);

  if (pilihan === 'lewati') return hasil({ status: 'dilewati', cara: 'manual' });
  if (pilihan) {
    const p = aktif.find((x) => x.id === pilihan && x.gender === baris.gender);
    return p
      ? hasil({ status: 'cocok', cara: 'manual', pengajar_id: p.id, nama_akun: p.name })
      : hasil({ status: 'nama_tak_ketemu', cara: 'manual' });
  }

  if (baris.wa) {
    const p = aktif.find((x) => normalWa(x.whatsapp_number) === baris.wa);
    // Nomor di xlsx bisa berbeda dengan nomor akun (orang ganti nomor). Nama yang
    // mirip ditawarkan sebagai pilihan, tidak dipasang otomatis.
    if (!p) {
      return hasil({
        status: 'tanpa_akun',
        cara: 'wa',
        kandidat: kandidatNama(baris.nama, aktif.filter((x) => x.gender === baris.gender)),
      });
    }
    if (p.gender !== baris.gender) return hasil({ status: 'gender_beda', cara: 'wa', nama_akun: p.name });
    return hasil({ status: 'cocok', cara: 'wa', pengajar_id: p.id, nama_akun: p.name });
  }

  const segender = aktif.filter((p) => p.gender === baris.gender);
  const sasaran = namaPengajarNormal(baris.nama);
  let cocok = segender.filter((p) => namaPengajarNormal(p.name) === sasaran);
  if (cocok.length === 0) cocok = segender.filter((p) => namaCukupCocok(baris.nama, p.name));

  if (cocok.length === 1) {
    return hasil({ status: 'cocok', cara: 'nama', pengajar_id: cocok[0].id, nama_akun: cocok[0].name });
  }
  if (cocok.length > 1) {
    return hasil({ status: 'nama_ganda', cara: 'nama', kandidat: cocok.map(({ id, name }) => ({ id, name })) });
  }
  return hasil({ status: 'nama_tak_ketemu', cara: 'nama', kandidat: kandidatNama(baris.nama, segender) });
}
