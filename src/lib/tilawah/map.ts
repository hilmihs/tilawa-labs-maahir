import type { KsHariIdx, KsLibur, KsSlot } from '@/types/db';
import { hariKeIdxSet, sesiDariSlot, timeKeMenit, uraikanSlot } from '@/lib/ketersediaan-slot';
import { jamPadaTanggal, rentangPertemuan, tanggalPertemuan } from '@/lib/ketersediaan-pertemuan';
import type { TilawahDay, TilawahLevel, TilawahSession } from './types';

/**
 * Usulan pemetaan slot maahir → nomor master CMS tilawah.
 *
 * CMS tidak menerima teks jadwal; ia hanya menerima `day_id`, `session_id`, dan
 * `level_id`. Nomor-nomor itu TIDAK boleh ditebak buta:
 *
 *  · daftar days/sessions di-scope per program, jadi nomor yang benar pada satu
 *    program bisa salah pada program lain;
 *  · ada baris yang dipakai halaqah tetapi tidak muncul di daftar master —
 *    halaqah Nurul Iman memakai day_id 12 dan session_id 14;
 *  · sebagian baris `days` punya `int_days` pincang. Probe staging menemukan
 *    id 3 "Selasa, Jum'at" berisi [1] saja dan id 4 "Sabtu, Ahad" berisi [5]
 *    saja. Namanya terlihat benar, isinya tidak. Mencocokkan lewat nama akan
 *    memilih baris rusak; mencocokkan lewat int_days akan melewatkannya —
 *    dua-duanya diam-diam salah.
 *
 * Karena itu modul ini hanya MENGUSULKAN, lengkap dengan alasan dan peringatan.
 * Pengesahan ada di tangan koordinator, dan slot tanpa pemetaan sah membuat
 * halaqahnya ditahan alih-alih dikirim.
 */

export type Keyakinan = 'pasti' | 'ragu' | 'tidak_ada';

export interface UsulanHari {
  day_id: number | null;
  nama: string | null;
  keyakinan: Keyakinan;
  /** Kenapa usulan ini muncul / kenapa tidak ada. Ditampilkan apa adanya ke koordinator. */
  alasan: string;
  /** Kandidat lain yang juga mungkin, supaya koordinator bisa memilih. */
  kandidat: { day_id: number; nama: string; int_days: number[] }[];
}

export interface UsulanSesi {
  session_id: number | null;
  nama: string | null;
  keyakinan: Keyakinan;
  alasan: string;
  kandidat: { session_id: number; nama: string; jam: string }[];
}

function samaSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/** Hari yang tersirat dari NAMA baris master, terlepas dari int_days-nya. */
function hariDariNama(nama: string): KsHariIdx[] {
  return hariKeIdxSet(nama.split(/[&,/]|\bdan\b|\s-\s/i));
}

/**
 * Baris master yang `int_days`-nya tidak sesuai namanya. Ini bukan sekadar
 * kejanggalan data: memilih baris seperti ini membuat halaqah terjadwal pada
 * hari yang lebih sedikit daripada yang dimaksud, dan baru ketahuan setelah
 * murid mengeluh kelas tidak ada.
 */
export function hariTidakKonsisten(d: TilawahDay): boolean {
  const dariNama = hariDariNama(d.name);
  if (dariNama.length === 0) return false;
  return !samaSet(dariNama, d.int_days);
}

export function usulkanHari(slot: Pick<KsSlot, 'hari_idx' | 'label'>, days: readonly TilawahDay[]): UsulanHari {
  const aktif = days.filter((d) => d.status === 1);

  const cocokIsi = aktif.filter((d) => samaSet(d.int_days, slot.hari_idx));
  const kandidat = aktif
    .filter((d) => cocokIsi.includes(d) || samaSet(hariDariNama(d.name), slot.hari_idx))
    .map((d) => ({ day_id: d.id, nama: d.name, int_days: d.int_days }));

  if (cocokIsi.length === 1) {
    const d = cocokIsi[0];
    const rusak = hariTidakKonsisten(d);
    return {
      day_id: d.id,
      nama: d.name,
      keyakinan: rusak ? 'ragu' : 'pasti',
      alasan: rusak
        ? `int_days cocok, tapi nama "${d.name}" menyebut hari yang berbeda — periksa manual`
        : `int_days ${JSON.stringify(d.int_days)} sama persis dengan slot`,
      kandidat,
    };
  }

  if (cocokIsi.length > 1) {
    return {
      day_id: null,
      nama: null,
      keyakinan: 'ragu',
      alasan: `${cocokIsi.length} baris master punya int_days sama — pilih sendiri`,
      kandidat,
    };
  }

  // Tidak ada yang cocok lewat int_days. Coba lewat nama, tetapi jangan pernah
  // dianggap pasti: baris yang namanya benar justru yang int_days-nya pincang.
  const lewatNama = aktif.filter((d) => samaSet(hariDariNama(d.name), slot.hari_idx));
  if (lewatNama.length === 1) {
    const d = lewatNama[0];
    return {
      day_id: d.id,
      nama: d.name,
      keyakinan: 'ragu',
      alasan: `hanya cocok lewat nama; int_days-nya ${JSON.stringify(d.int_days)} tidak lengkap`,
      kandidat,
    };
  }

  return {
    day_id: null,
    nama: null,
    keyakinan: 'tidak_ada',
    alasan: `tidak ada baris master untuk ${slot.label} — buat dulu di CMS tilawah`,
    kandidat: aktif.map((d) => ({ day_id: d.id, nama: d.name, int_days: d.int_days })),
  };
}

export function usulkanSesi(
  slot: Pick<KsSlot, 'waktu_mulai' | 'waktu_selesai' | 'label'>,
  sessions: readonly TilawahSession[]
): UsulanSesi {
  const mulai = timeKeMenit(slot.waktu_mulai);
  const selesai = timeKeMenit(slot.waktu_selesai);
  const aktif = sessions.filter((s) => s.status === 1);
  const semua = aktif.map((s) => ({
    session_id: s.id,
    nama: s.name,
    jam: `${(s.start_hour ?? '').slice(0, 5)} - ${(s.end_hour ?? '').slice(0, 5)}`,
  }));

  if (mulai === null || selesai === null) {
    return { session_id: null, nama: null, keyakinan: 'tidak_ada', alasan: 'jam slot tidak terbaca', kandidat: semua };
  }

  // Kelas dua waktu tidak punya satu sesi yang benar. Jam sebenarnya tetap
  // terkirim per pertemuan, jadi halaqahnya cukup memakai sesi penampung.
  if (uraikanSlot(slot.label)?.duaWaktu) {
    return {
      session_id: null,
      nama: null,
      keyakinan: 'tidak_ada',
      alasan: 'kelas dua waktu — pilih sesi penampung (mis. 00:00 - 00:00); jam tiap hari ikut terkirim di setiap pertemuan',
      kandidat: semua,
    };
  }

  const cocok = aktif.filter(
    (s) => timeKeMenit(s.start_hour) === mulai && timeKeMenit(s.end_hour) === selesai
  );

  if (cocok.length === 1) {
    return {
      session_id: cocok[0].id,
      nama: cocok[0].name,
      keyakinan: 'pasti',
      alasan: 'jam mulai & selesai sama persis',
      kandidat: semua,
    };
  }
  if (cocok.length > 1) {
    return {
      session_id: null,
      nama: null,
      keyakinan: 'ragu',
      alasan: `${cocok.length} sesi punya jam sama — pilih sendiri`,
      kandidat: cocok.map((s) => ({
        session_id: s.id,
        nama: s.name,
        jam: `${s.start_hour.slice(0, 5)} - ${s.end_hour.slice(0, 5)}`,
      })),
    };
  }

  // Sengaja TIDAK mencari "yang paling mendekati". Banyak halaqah memakai sesi
  // placeholder 00:00-00:00 dengan jam sebenarnya disimpan per pertemuan, jadi
  // sesi terdekat sering justru sesi yang tidak berarti apa-apa.
  return {
    session_id: null,
    nama: null,
    keyakinan: 'tidak_ada',
    alasan: `tidak ada sesi ${slot.waktu_mulai.slice(0, 5)}–${slot.waktu_selesai.slice(0, 5)} di master — buat dulu di CMS tilawah`,
    kandidat: semua,
  };
}

export function usulkanLevel(
  levelNama: string,
  levels: readonly TilawahLevel[]
): { level_id: number | null; nama: string | null; keyakinan: Keyakinan; alasan: string } {
  const bersih = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const target = bersih(levelNama);
  const aktif = levels.filter((l) => l.status === 1);

  const persis = aktif.filter((l) => bersih(l.name) === target);
  if (persis.length === 1) {
    return { level_id: persis[0].id, nama: persis[0].name, keyakinan: 'pasti', alasan: 'nama level sama persis' };
  }
  if (persis.length > 1) {
    return { level_id: null, nama: null, keyakinan: 'ragu', alasan: `${persis.length} level bernama sama`, };
  }
  const sebagian = aktif.filter((l) => bersih(l.name).includes(target) || target.includes(bersih(l.name)));
  if (sebagian.length === 1) {
    return {
      level_id: sebagian[0].id,
      nama: sebagian[0].name,
      keyakinan: 'ragu',
      alasan: `hanya mirip: "${sebagian[0].name}" vs "${levelNama}"`,
    };
  }
  return { level_id: null, nama: null, keyakinan: 'tidak_ada', alasan: `level "${levelNama}" tidak ada di CMS tilawah` };
}

// ── Rencana outbox ─────────────────────────────────────────────────────────
//
// Fungsi murni di bawah dipakai `push.ts` untuk menyusun dan melengkapi antrean
// pengiriman. Dipisah dari push.ts supaya dapat diuji tanpa basis data.

/** Satu pertemuan yang sudah dijadwalkan saat antrean disusun. */
export interface RencanaPertemuan {
  ke: number;
  /** YYYY-MM-DD */
  tanggal: string;
  /** "YYYY-MM-DD HH:MM:SS" — format CMS. */
  mulai: string;
  selesai: string;
}

/**
 * Jadwal lengkap seluruh pertemuan sebuah halaqah, dihitung SEKALI saat antrean
 * disusun lalu disimpan di payload outbox.
 *
 * Menghitungnya ulang tiap kali outbox dijalankan membuat satu halaqah bisa
 * bercampur dua kalender: libur periode yang disunting di antara dua putaran
 * menggeser P10..P22, sementara P1..P9 sudah terkirim dengan kalender lama.
 */
export function susunRencanaPertemuan(input: {
  tanggalMulai: string | null;
  slot: { label: string; hari_idx: KsHariIdx[]; waktu_mulai: string; waktu_selesai: string };
  jumlah: number;
  libur: readonly KsLibur[];
}): { rencana: RencanaPertemuan[]; galat: string | null } {
  if (input.jumlah <= 0) return { rencana: [], galat: null };
  if (!input.tanggalMulai) return { rencana: [], galat: 'Tanggal mulai halaqah belum ditetapkan.' };
  const tanggal = tanggalPertemuan(input.tanggalMulai, input.slot.hari_idx, input.jumlah, input.libur);
  if (tanggal.length < input.jumlah) {
    return { rencana: [], galat: `Hanya ${tanggal.length} dari ${input.jumlah} tanggal pertemuan yang dapat dihitung.` };
  }
  const sesi = sesiDariSlot(input.slot);
  const rencana: RencanaPertemuan[] = [];
  for (let i = 0; i < tanggal.length; i++) {
    const jam = jamPadaTanggal(tanggal[i], sesi);
    if (!jam) {
      return { rencana: [], galat: `Jam pertemuan ke-${i + 1} (${tanggal[i]}) tidak dapat ditentukan dari "${input.slot.label}".` };
    }
    const r = rentangPertemuan(tanggal[i], jam.mulai, jam.selesai);
    if (!r) return { rencana: [], galat: `Jam selesai pertemuan ke-${i + 1} tidak lebih besar dari jam mulai.` };
    rencana.push({ ke: i + 1, tanggal: tanggal[i], mulai: r.mulai, selesai: r.selesai });
  }
  return { rencana, galat: null };
}

/**
 * Masukan langkah buat_pertemuan dari payload tersimpan.
 *
 * Tiga bentuk harus terbaca: payload baru `{ke,tanggal,mulai,selesai}`, payload
 * yang sudah dilengkapi pratinjau `{rencana:{…}, …}`, dan baris lama yang
 * payload-nya tertimpa badan kiriman (`order` alih-alih `ke`, tanpa jadwal).
 */
export function masukanPertemuan(payload: Record<string, unknown> | null | undefined): {
  ke: number;
  jadwal: { tanggal: string; mulai: string; selesai: string } | null;
} {
  const p = payload ?? {};
  const r = (p.rencana && typeof p.rencana === 'object' ? p.rencana : p) as Record<string, unknown>;
  const ke = Number(r.ke ?? p.ke ?? p.order ?? 0);
  const jadwal =
    typeof r.tanggal === 'string' && typeof r.mulai === 'string' && typeof r.selesai === 'string'
      ? { tanggal: r.tanggal, mulai: r.mulai, selesai: r.selesai }
      : null;
  return { ke: Number.isInteger(ke) && ke > 0 ? ke : 0, jadwal };
}

export type AksiOutbox = 'buat_halaqah' | 'buat_pertemuan' | 'enrol';

export interface LangkahHarapan {
  aksi: AksiOutbox;
  peserta_id: string | null;
  /** Nomor pertemuan; null untuk langkah lain. */
  ke: number | null;
  payload: Record<string, unknown>;
}

export interface BarisOutboxAda {
  aksi: string;
  peserta_id: string | null;
  urutan: number;
  payload: Record<string, unknown> | null;
}

function kunciLangkah(aksi: string, pesertaId: string | null, ke: number | null): string {
  if (aksi === 'buat_pertemuan') return `pertemuan:${ke}`;
  if (aksi === 'enrol') return `enrol:${pesertaId}`;
  return aksi;
}

/** Daftar langkah lengkap untuk satu usulan, urut sesuai urutan kirimnya. */
export function susunLangkahHarapan(input: {
  jumlahPertemuan: number;
  rencana: readonly RencanaPertemuan[];
  pesertaIds: readonly string[];
}): LangkahHarapan[] {
  const out: LangkahHarapan[] = [{ aksi: 'buat_halaqah', peserta_id: null, ke: null, payload: {} }];
  // Pertemuan dibuat SEBELUM enrolmen supaya kelasnya sudah utuh saat murid mendarat.
  for (let ke = 1; ke <= input.jumlahPertemuan; ke++) {
    const r = input.rencana.find((x) => x.ke === ke);
    out.push({ aksi: 'buat_pertemuan', peserta_id: null, ke, payload: r ? { ...r } : { ke } });
  }
  for (const id of input.pesertaIds) out.push({ aksi: 'enrol', peserta_id: id, ke: null, payload: {} });
  return out;
}

/**
 * Langkah yang belum ada di outbox, lengkap dengan nomor urut yang tidak
 * bertabrakan dengan baris yang sudah ada (`uq_ks_outbox_langkah`).
 *
 * Antrean yang terpotong di tengah (proses mati saat menyisipkan, atau peserta
 * bertambah) dilengkapi, bukan dilewati karena "sudah ada baris".
 */
export function langkahHilang(
  ada: readonly BarisOutboxAda[],
  harapan: readonly LangkahHarapan[]
): (LangkahHarapan & { urutan: number })[] {
  const sudah = new Set(
    ada.map((b) =>
      kunciLangkah(b.aksi, b.peserta_id, b.aksi === 'buat_pertemuan' ? masukanPertemuan(b.payload).ke : null)
    )
  );
  const terpakai = new Set(ada.map((b) => b.urutan));
  const jumlahPertemuan = harapan.filter((h) => h.aksi === 'buat_pertemuan').length;
  let berikut = Math.max(jumlahPertemuan, ...ada.map((b) => b.urutan), 0) + 1;

  const out: (LangkahHarapan & { urutan: number })[] = [];
  for (const h of harapan) {
    if (sudah.has(kunciLangkah(h.aksi, h.peserta_id, h.ke))) continue;
    const ingin = h.aksi === 'buat_halaqah' ? 0 : h.aksi === 'buat_pertemuan' ? h.ke : null;
    let urutan: number;
    if (ingin !== null && !terpakai.has(ingin)) urutan = ingin;
    else {
      while (terpakai.has(berikut)) berikut++;
      urutan = berikut++;
    }
    terpakai.add(urutan);
    out.push({ ...h, urutan });
  }
  return out;
}

function namaBaku(nama: string): string {
  return nama.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Peserta satu usulan yang memakai nomor WA yang sama dengan nama berbeda.
 *
 * CMS memakai satu akun per nomor (email palsunya `<nomor>@murid.hits`). Kakak
 * beradik yang didaftarkan dengan nomor orang tuanya akan berebut satu akun:
 * yang kedua mengganti nama akun yang pertama. Karena akun tidak dapat dihapus
 * atau dipisah lewat API, usulan seperti ini ditahan dan dilaporkan.
 */
export function waDipakaiBersama(
  peserta: readonly { nama: string; wa_normal: string | null }[]
): { wa: string; nama: string[] }[] {
  const perWa = new Map<string, Map<string, string>>();
  for (const p of peserta) {
    if (!p.wa_normal) continue;
    const m = perWa.get(p.wa_normal) ?? new Map<string, string>();
    m.set(namaBaku(p.nama), p.nama.trim());
    perWa.set(p.wa_normal, m);
  }
  return [...perWa]
    .filter(([, m]) => m.size > 1)
    .map(([wa, m]) => ({ wa, nama: [...m.values()] }));
}

/** Apakah dua nama merujuk orang yang sama (beda spasi/kapital saja). */
export function namaSama(a: string | null | undefined, b: string | null | undefined): boolean {
  return namaBaku(a ?? '') === namaBaku(b ?? '');
}
