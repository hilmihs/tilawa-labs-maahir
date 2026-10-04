import 'server-only';
import { perkiraanSelesaiHalaqah } from '@/lib/ketersediaan-pertemuan';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { KsLibur, KsHariIdx, KsSlot } from '@/types/db';
import { PROGRAM_STAGE_DEFS } from '@/lib/hits-pertemuan';
import {
  bentrok,
  masihBerjalanPada,
  selesaiMenurutTahap,
  rentangDariHalaqah,
  rentangDariSlot,
  type RentangJadwal,
} from '@/lib/ketersediaan-slot';

/**
 * Deteksi tabrakan jadwal untuk satu pengajar.
 *
 * Sumbernya SENGAJA dua, bukan satu:
 *
 *  1. `hits_halaqah` aktif miliknya, LINTAS SEMUA BATCH. Delapan batch HITS
 *     berjalan bersamaan (Juni, Januari, April, Nurul Iman, Safar ×2, ABK),
 *     dan seorang pengajar lazim memegang halaqah di lebih dari satu batch.
 *
 *  2. `kelas_hits` — kelas Maahir yang dipegangnya. Butir verifikasi ketiga
 *     dokumen konsep menyebutnya terpisah dari HITS: "slot tidak bentrok dengan
 *     kelas Maahir dan program wajib Maahir".
 *
 *  3. Usulan hidup hasil sistem ini (usulan sampai terkirim), LINTAS SEMUA
 *     PERIODE. Ini wajib: halaqah yang dibentuk di sini masuk ke CMS tilawah,
 *     tetapi TIDAK otomatis muncul di `hits_halaqah` — tabel itu diisi dari
 *     Google Sheet yang disync manual per batch. Status 'usulan' ikut dihitung:
 *     dua periode (mis. tahap 5 dan 21 Oktober) dapat menjalankan alokasi
 *     berurutan sebelum koordinator sempat menyetujui apa pun, dan tanpa itu
 *     pengajar yang sama dijatah dua kali pada jam yang sama.
 */

/** Status usulan yang menempati jam pengajar. Sama dengan indeks unik uq_ks_usulan_hidup. */
export const STATUS_USULAN_HIDUP = ['usulan', 'disetujui', 'menunggu', 'dikonfirmasi', 'dikirim'] as const;

export interface JadwalTerpakai {
  sumber: 'hits' | 'maahir' | 'usulan';
  /** Nama halaqah, untuk menerangkan kenapa sebuah slot terkunci. */
  nama: string;
  batch: string | null;
  rentang: RentangJadwal;
  label: string;
  /** Tanggal pertemuan terakhir menurut kaldik; null bila tak diketahui atau bukan halaqah HITS. */
  selesai: string | null;
  /** Hanya untuk sumber 'usulan': level halaqahnya (menentukan lama jam terkunci). */
  level?: string | null;
  /** Hanya untuk sumber 'usulan': status usulannya. */
  status_usulan?: string;
  /** Hanya untuk sumber 'usulan': slot dan periode asalnya. */
  slot_id?: string;
  periode_id?: string;
}

interface HalaqahRow {
  id: string;
  name: string;
  batch_id: string | null;
  program: string | null;
  jadwal_raw: string | null;
  jadwal_hari: string[] | null;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  batch?: { name: string } | null;
}

interface UsulanRow {
  id: string;
  nama_halaqah: string | null;
  status: string;
  slot_id: string;
  periode_id: string;
  level: string | null;
  tanggal_mulai: string | null;
  periode?: {
    mulai: string;
    selesai: string;
    libur: KsLibur[] | null;
    jumlah_pertemuan_dasar: number;
    jumlah_pertemuan_lanjutan: number;
  } | null;
  slot?: {
    label: string;
    hari_idx: KsHariIdx[];
    waktu_mulai: string;
    waktu_selesai: string;
  } | null;
}

interface KelasRow {
  id: string;
  name: string;
  jadwal_hari: string | null;
  jadwal_waktu_mulai: string | null;
  jadwal_waktu_selesai: string | null;
}

/**
 * Tanggal pertemuan terakhir tiap halaqah HITS.
 *
 * `hits_halaqah` tidak punya kolom selesai, dan `active` tidak bisa dipercaya:
 * batch Januari dan April 2026 masih `active=true` jauh setelah kelasnya
 * berakhir, dan sinkronisasi sheet menghidupkannya lagi bila dimatikan manual.
 * Kalender pendidikan justru lengkap untuk semua batch aktif (diperiksa 16 Sep
 * 2026), jadi tanggal selesai = tanggal terakhir kaldik yang dipakai PROGRAM
 * halaqah itu (Dasar: QN lalu PB; Lanjutan: tanggal kaldik QN saja), atau
 * koreksi pertemuan halaqah itu bila lebih akhir. Batch tanpa kaldik level yang
 * cocok jatuh ke tanggal terbesar batch-nya (perilaku lama, aman).
 *
 * `cacheBatch` dipakai ulang oleh pemanggil yang memeriksa banyak pengajar
 * sekaligus, supaya kaldik satu batch hanya dibaca sekali. Kuncinya
 * `batch` (tanggal terbesar batch) dan `batch|level` (tanggal terbesar per level).
 */
export async function tanggalSelesaiHalaqah(
  halaqah: readonly { id: string; batch_id: string | null; program?: string | null }[],
  cacheBatch: Map<string, string | null> = new Map()
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (halaqah.length === 0) return out;

  const batchBaru = [
    ...new Set(halaqah.map((h) => h.batch_id).filter((b): b is string => Boolean(b))),
  ].filter((b) => !cacheBatch.has(b));
  if (batchBaru.length > 0) {
    const { data } = await supabaseAdmin
      .from('hits_kaldik_hari')
      .select('batch_id, level, tanggal')
      .in('batch_id', batchBaru);
    for (const b of batchBaru) cacheBatch.set(b, null);
    for (const r of (data ?? []) as { batch_id: string; level: string; tanggal: string }[]) {
      for (const kunci of [r.batch_id, `${r.batch_id}|${r.level}`]) {
        const lama = cacheBatch.get(kunci);
        if (!lama || r.tanggal > lama) cacheBatch.set(kunci, r.tanggal);
      }
    }
  }

  const { data: koreksi } = await supabaseAdmin
    .from('hits_kaldik_pertemuan')
    .select('halaqah_id, tanggal')
    .in(
      'halaqah_id',
      halaqah.map((h) => h.id)
    );
  const koreksiTerakhir = new Map<string, string>();
  for (const r of (koreksi ?? []) as { halaqah_id: string; tanggal: string }[]) {
    const lama = koreksiTerakhir.get(r.halaqah_id);
    if (!lama || r.tanggal > lama) koreksiTerakhir.set(r.halaqah_id, r.tanggal);
  }

  for (const h of halaqah) {
    const kandidat = [
      h.batch_id ? selesaiKaldikProgram(h.batch_id, h.program ?? null, cacheBatch) : null,
      koreksiTerakhir.get(h.id) ?? null,
    ].filter((x): x is string => Boolean(x));
    out.set(h.id, kandidat.sort().pop() ?? null);
  }
  return out;
}

function selesaiKaldikProgram(
  batchId: string,
  program: string | null,
  cacheBatch: Map<string, string | null>
): string | null {
  const tahap = PROGRAM_STAGE_DEFS[program ?? 'dasar'] ?? PROGRAM_STAGE_DEFS.dasar;
  const akhirPerLevel = new Map<string, string>();
  for (const t of tahap) {
    for (const level of [t.kaldikLevel, t.kaldikFallback]) {
      const tgl = level ? cacheBatch.get(`${batchId}|${level}`) : null;
      if (level && tgl) akhirPerLevel.set(level, tgl);
    }
  }
  return selesaiMenurutTahap(tahap, akhirPerLevel) ?? cacheBatch.get(batchId) ?? null;
}

/** Semua jam yang sudah terpakai oleh seorang pengajar, siap dipakai penguncian slot. */
export async function jadwalTerpakaiPengajar(
  pengajarId: string,
  opts: {
    /**
     * Tanggal mulai KBM periode yang sedang diisi (YYYY-MM-DD). Halaqah HITS yang
     * pertemuan terakhirnya lebih awal dari tanggal ini tidak mengunci apa pun.
     * Tanpa acuan, perilaku lama: setiap halaqah aktif mengunci.
     */
    acuan?: string | null;
    cacheSelesaiBatch?: Map<string, string | null>;
  } = {}
): Promise<JadwalTerpakai[]> {
  const [{ data: halaqah }, { data: kelas }, { data: usulan }] = await Promise.all([
    supabaseAdmin
      .from('hits_halaqah')
      .select('id, name, batch_id, program, jadwal_raw, jadwal_hari, waktu_mulai, waktu_selesai, batch:batch_id(name)')
      .eq('pengajar_id', pengajarId)
      .eq('active', true),
    supabaseAdmin
      .from('kelas_hits')
      .select('id, name, jadwal_hari, jadwal_waktu_mulai, jadwal_waktu_selesai')
      .eq('pengajar_id', pengajarId),
    supabaseAdmin
      .from('ks_usulan')
      .select(
        'id, nama_halaqah, status, slot_id, periode_id, level, tanggal_mulai, periode:periode_id(mulai, selesai, libur, jumlah_pertemuan_dasar, jumlah_pertemuan_lanjutan), slot:slot_id(label, hari_idx, waktu_mulai, waktu_selesai)'
      )
      .eq('pengajar_id', pengajarId)
      .in('status', [...STATUS_USULAN_HIDUP]),
  ]);

  const out: JadwalTerpakai[] = [];

  const halaqahRows = (halaqah ?? []) as HalaqahRow[];
  const selesai = opts.acuan
    ? await tanggalSelesaiHalaqah(halaqahRows, opts.cacheSelesaiBatch)
    : new Map<string, string | null>();

  for (const h of halaqahRows) {
    // Halaqah tanpa jam yang dapat dibaca tidak boleh mengunci slot apa pun —
    // tak ada dasar menyatakan bentrok. Baris observasi lama seperti
    // "HITS 6 (observasi)" hanya berisi "Selasa & Jum'at" tanpa jam.
    // Kelas dua waktu menghasilkan satu entri per jam.
    const tanggalSelesai = selesai.get(h.id) ?? null;
    if (opts.acuan && !masihBerjalanPada(tanggalSelesai, opts.acuan)) continue;
    for (const rentang of rentangDariHalaqah(h)) {
      out.push({
        sumber: 'hits',
        nama: h.name,
        batch: h.batch?.name ?? null,
        rentang,
        label: h.jadwal_raw ?? '',
        selesai: tanggalSelesai,
      });
    }
  }

  for (const k of (kelas ?? []) as KelasRow[]) {
    // kelas_hits menyimpan hari sebagai satu teks ("Senin, Rabu"), bukan larik.
    const semuaRentang = rentangDariHalaqah({
      jadwal_hari: k.jadwal_hari ? k.jadwal_hari.split(/[&,/]|\bdan\b/i) : null,
      waktu_mulai: k.jadwal_waktu_mulai,
      waktu_selesai: k.jadwal_waktu_selesai,
      jadwal_raw: k.jadwal_hari,
    });
    for (const rentang of semuaRentang) out.push({
      sumber: 'maahir',
      nama: k.name,
      batch: null,
      rentang,
      label: `${k.jadwal_hari ?? ''} ${(k.jadwal_waktu_mulai ?? '').slice(0, 5)}-${(k.jadwal_waktu_selesai ?? '').slice(0, 5)}`.trim(),
      selesai: null,
    });
  }

  for (const u of (usulan ?? []) as UsulanRow[]) {
    if (!u.slot) continue;
    // Jam terkunci sampai pertemuan terakhir SESUAI LEVEL, bukan sampai akhir
    // periode: Lanjutan (26 pertemuan) membebaskan jam pengajar berbulan-bulan
    // sebelum Dasar (50 pertemuan) di periode yang sama.
    const selesaiPeriode = u.periode
      ? perkiraanSelesaiHalaqah({
          mulai: u.tanggal_mulai,
          hari_idx: u.slot.hari_idx,
          level: u.level,
          periode: u.periode,
        })
      : null;
    if (opts.acuan && !masihBerjalanPada(selesaiPeriode, opts.acuan)) continue;
    // rentangDariSlot memecah jam per hari, jadi slot dua waktu terbaca utuh.
    for (const rentang of rentangDariSlot(u.slot)) {
      out.push({
        sumber: 'usulan',
        nama: u.nama_halaqah ?? 'Halaqah baru',
        batch: null,
        rentang,
        label: u.slot.label,
        selesai: selesaiPeriode,
        status_usulan: u.status,
        level: u.level,
        slot_id: u.slot_id,
        periode_id: u.periode_id,
      });
    }
  }

  return out;
}

export interface SlotTerkunci {
  slot_id: string;
  /** Jadwal yang menyebabkannya terkunci — dipakai menyusun kalimat di form. */
  oleh: JadwalTerpakai;
}

/**
 * Petakan slot mana yang terkunci bagi seorang pengajar.
 * Satu slot cukup bentrok dengan satu jadwal untuk terkunci; yang dilaporkan
 * adalah tabrakan pertama, karena itu yang perlu diterangkan ke pengajar.
 */
export function kunciSlot(
  slots: readonly Pick<KsSlot, 'id' | 'label' | 'hari_idx' | 'waktu_mulai' | 'waktu_selesai'>[],
  terpakai: readonly JadwalTerpakai[]
): Map<string, JadwalTerpakai> {
  const kunci = new Map<string, JadwalTerpakai>();
  for (const s of slots) {
    const rentang = rentangDariSlot(s);
    // Usulan pengajar di slot ITU sendiri bukan tabrakan: ia justru sedang
    // memegang jam itu, dan mengunci slotnya akan memaksa ketersediaannya dicabut.
    const tabrakan = terpakai.find(
      (t) => t.slot_id !== s.id && rentang.some((r) => bentrok(r, t.rentang))
    );
    if (tabrakan) kunci.set(s.id, tabrakan);
  }
  return kunci;
}

/**
 * Kalimat penjelas untuk slot terkunci. Bahasa sengaja menyebut nama halaqahnya
 * supaya pengajar bisa langsung menilai apakah datanya masih benar — `hits_halaqah`
 * bisa basi karena sheet disync manual, dan `active` bahkan bisa hidup lagi
 * sendiri setelah sync bila barisnya masih tercantum di sheet.
 */
export function alasanTerkunci(t: JadwalTerpakai): string {
  const dari = t.batch ? `${t.nama} (${t.batch})` : t.nama;
  if (t.sumber === 'usulan' && t.status_usulan !== 'dikonfirmasi' && t.status_usulan !== 'dikirim') {
    // Belum diumumkan ke pengajar: jangan sebut halaqahnya sudah ada.
    return 'Terisi — jam ini sedang disiapkan untuk halaqah Anda';
  }
  if (t.sumber === 'usulan') return `Terisi — halaqah baru Anda ${dari} berada di jam ini`;
  if (t.sumber === 'maahir') return `Terisi — Anda mengajar kelas Maahir ${dari} di jam ini`;
  return `Terisi — Anda mengajar ${dari} di jam ini`;
}
