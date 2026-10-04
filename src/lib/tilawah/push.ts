import 'server-only';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getPool } from '@/lib/pg-core';
import type { Gender, KsHariIdx, KsLibur, KsPeriode } from '@/types/db';
import { catatKs } from '@/lib/ketersediaan-log';
import {
  adalahRedirect,
  ambilHalaqahDetail,
  ambilIdBaru,
  cariGuru,
  cariHalaqah,
  cariMurid,
  cariMuridSemuaBatch,
  kirim,
  pastiTidakDiterima,
  tilawahTerkonfigurasi,
  TilawahError,
  type TilawahPertemuanRingkas,
} from './client';
import type {
  BuatHalaqahBody,
  BuatMuridBody,
  BuatPertemuanBody,
  EnrolMuridBody,
  TilawahEnvelope,
  TilawahUser,
} from './types';
import {
  langkahHilang,
  masukanPertemuan,
  namaSama,
  susunLangkahHarapan,
  susunRencanaPertemuan,
  waDipakaiBersama,
} from './map';
import { jumlahPertemuanUntuk, namaPertemuan } from '@/lib/ketersediaan-pertemuan';

/**
 * Pengiriman halaqah & peserta ke CMS tilawah.
 *
 * Bekerja lewat outbox per langkah, bukan satu transaksi besar. Alasannya nyata:
 * sesi Laravel dapat kedaluwarsa di tengah jalan, dan CMS tidak menyediakan
 * endpoint hapus — tidak ada cara membatalkan yang terlanjur terkirim. Jadi tiap
 * langkah harus aman diulang dan aman berhenti di tengah.
 *
 * Dua jebakan CMS yang ditangani di sini, keduanya terdokumentasi di API_MAP:
 *   · `halaqah` dan `users` menolak HTTP PUT (405) — update wajib POST ke /{id}
 *     dengan field `_method: "PUT"` (method spoofing Laravel).
 *   · `halaqah_id` pada payload CREATE user TIDAK meng-enrol murid. Enrolment
 *     adalah panggilan kedua, dan `move_reason` wajib diisi (422 bila kosong).
 *
 * Aturan keselamatan outbox:
 *   · Satu periode diproses satu pekerja: kunci advisory `ks_outbox:<periode>`,
 *     ditambah klaim baris bersyarat (`percobaan` lama) sebelum memanggil CMS.
 *   · Klaim meninggalkan penanda `respons.mulai_kirim`. Penanda yang masih ada
 *     pada putaran berikutnya berarti percobaan sebelumnya MUNGKIN sudah sampai
 *     ke CMS — langkah itu dipastikan lewat pembacaan ulang, tidak dikirim buta.
 *   · Mode percobaan tidak memanggil CMS, tidak menghitung kegagalan, dan tidak
 *     pernah menandai baris `gagal`.
 */

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ALASAN_PINDAH = 'Pembentukan halaqah dari sistem ketersediaan mengajar Maahir';

/** Batas percobaan kirim sebelum baris ditandai gagal. */
const BATAS_PERCOBAAN = 3;

// ── Penyusunan antrean ─────────────────────────────────────────────────────

/**
 * Susun (atau lengkapi) antrean pengiriman untuk satu usulan yang sudah
 * dikonfirmasi. Idempoten: memanggilnya berulang tidak menumpuk baris, dan
 * antrean yang terpotong dilengkapi langkah yang hilang.
 *
 * Seluruh sisipan berada dalam satu transaksi dengan baris usulan dikunci
 * (`for update`), sehingga dua pemanggilan bersamaan tidak saling mendahului.
 * Jadwal pertemuan dihitung di sini sekali dan disimpan di payload.
 *
 * @returns banyak langkah yang disisipkan.
 */
export async function antrekanPengiriman(usulanId: string): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      status: string;
      level: string;
      tanggal_mulai: string | null;
      label: string;
      hari_idx: KsHariIdx[];
      waktu_mulai: string;
      waktu_selesai: string;
      jumlah_pertemuan_dasar: number;
      jumlah_pertemuan_lanjutan: number;
      libur: KsLibur[] | null;
    }>(
      `select u.status, u.level, u.tanggal_mulai::text as tanggal_mulai,
              s.label, s.hari_idx, s.waktu_mulai::text as waktu_mulai, s.waktu_selesai::text as waktu_selesai,
              p.jumlah_pertemuan_dasar, p.jumlah_pertemuan_lanjutan, p.libur
         from ks_usulan u
         join ks_slot s on s.id = u.slot_id
         join ks_periode p on p.id = u.periode_id
        where u.id = $1
        for update of u`,
      [usulanId]
    );
    const u = rows[0];
    if (!u || !['dikonfirmasi', 'dikirim', 'gagal'].includes(u.status)) {
      await client.query('ROLLBACK');
      return 0;
    }

    const { rows: peserta } = await client.query<{ id: string }>(
      `select id from ks_usulan_peserta
        where usulan_id = $1 and status <> 'dikeluarkan'
        order by created_at, id`,
      [usulanId]
    );
    const { rows: ada } = await client.query<{
      aksi: string;
      peserta_id: string | null;
      urutan: number;
      payload: Record<string, unknown> | null;
    }>('select aksi, peserta_id, urutan, payload from ks_outbox where usulan_id = $1', [usulanId]);

    const jumlahPertemuan = jumlahPertemuanUntuk(u, u.level);
    // Bila jadwal tidak dapat dihitung (mis. tanggal mulai kosong), baris tetap
    // disisipkan dengan `{ke}` saja; penyusunan payload nanti melaporkan sebabnya.
    const { rencana } = susunRencanaPertemuan({
      tanggalMulai: u.tanggal_mulai,
      slot: u,
      jumlah: jumlahPertemuan,
      libur: u.libur ?? [],
    });

    const hilang = langkahHilang(
      ada,
      susunLangkahHarapan({ jumlahPertemuan, rencana, pesertaIds: peserta.map((p) => p.id) })
    );

    // Kegagalan menyisipkan TIDAK boleh lewat diam-diam. Pernah terjadi: batasan
    // `aksi` belum memuat 'buat_pertemuan', sisipannya gagal tanpa suara, dan
    // halaqah terkirim tanpa satu pun pertemuan. Di sini galat membatalkan
    // seluruh transaksi dan naik ke pemanggil.
    for (const l of hilang) {
      await client.query(
        `insert into ks_outbox (usulan_id, peserta_id, aksi, urutan, payload)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [usulanId, l.peserta_id, l.aksi, l.urutan, JSON.stringify(l.payload)]
      );
    }

    await client.query('COMMIT');
    return hilang.length;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw new Error(`gagal menyusun antrean pengiriman: ${(e as Error).message}`);
  } finally {
    client.release();
  }
}

// ── Kunci per periode ──────────────────────────────────────────────────────

/**
 * Jalankan `fn` sambil memegang kunci advisory tingkat sesi untuk `kunci`.
 * null bila kunci sedang dipegang proses lain (tidak menunggu).
 *
 * Kunci dipegang koneksi tersendiri, sehingga pool butuh minimal dua koneksi —
 * uji terhadap PGlite dengan PG_POOL_MAX=1 akan menggantung di sini.
 */
async function denganKunci<T>(kunci: string, fn: () => Promise<T>): Promise<T | null> {
  const client = await getPool().connect();
  let rusak = false;
  try {
    const { rows } = await client.query<{ dapat: boolean }>(
      'select pg_try_advisory_lock(hashtext($1)) as dapat',
      [kunci]
    );
    if (!rows[0]?.dapat) return null;
    try {
      return await fn();
    } finally {
      try {
        await client.query('select pg_advisory_unlock(hashtext($1))', [kunci]);
      } catch {
        // Koneksi yang gagal melepas kunci tidak boleh kembali ke pool.
        rusak = true;
      }
    }
  } finally {
    client.release(rusak);
  }
}

// ── Pemrosesan outbox ──────────────────────────────────────────────────────

export interface HasilProses {
  diproses: number;
  terkirim: number;
  gagal: number;
  /** Langkah yang belum dapat disusun/dikirim: menunggu langkah sebelumnya atau data belum lengkap. */
  ditahan: number;
  percobaan: boolean;
  pesan: string[];
}

interface BarisAntre {
  id: string;
  usulan_id: string;
  peserta_id: string | null;
  aksi: string;
  urutan: number;
  percobaan: number;
  payload: Record<string, unknown> | null;
  respons: Record<string, unknown> | null;
}

interface Konteks {
  periode: KsPeriode;
  batchId: number;
  percobaan: boolean;
  /** Boleh membaca CMS (GET) untuk mencocokkan guru/halaqah. */
  bacaCms: boolean;
  guru: Map<string, number>;
  pertemuanCms: Map<number, TilawahPertemuanRingkas[] | null>;
}

/** Nilai pengganti id CMS pada pratinjau mode percobaan. */
const PLACEHOLDER_ID = 0;

type Siap<T> =
  | { body: T; catatan?: string }
  | { menunggu: string; pratinjau: Record<string, unknown> };

/** Galat yang mengharuskan manusia memeriksa CMS sebelum langkah diulang. */
class PerluCek extends Error {}

/**
 * Proses antrean sebuah periode.
 *
 * Bila `periode.kirim_nyata` mati, fungsi ini tetap MENYUSUN payload lengkap dan
 * menyimpannya, tetapi tidak memanggil CMS sama sekali (kecuali `bacaCms`, yang
 * hanya membaca, dipakai skrip uji). Itulah mode kirim-percobaan: koordinator
 * dapat memeriksa persis apa yang akan dikirim sebelum ada yang tidak bisa
 * ditarik kembali. Id yang baru ada setelah pengiriman nyata diisi 0.
 */
export async function prosesOutbox(
  periode: KsPeriode,
  opts: { batas?: number; bacaCms?: boolean } = {}
): Promise<HasilProses> {
  const batas = opts.batas ?? 50;
  const percobaan = !periode.kirim_nyata;
  const hasil: HasilProses = { diproses: 0, terkirim: 0, gagal: 0, ditahan: 0, percobaan, pesan: [] };

  if (!percobaan && !tilawahTerkonfigurasi()) {
    hasil.pesan.push('Kredensial CMS tilawah belum diset — pengiriman dihentikan.');
    return hasil;
  }
  if (!periode.tilawah_batch_id) {
    hasil.pesan.push('Batch tujuan CMS tilawah belum ditetapkan.');
    return hasil;
  }

  const { data: usulanPeriode } = await supabaseAdmin
    .from('ks_usulan')
    .select('id, status')
    .eq('periode_id', periode.id)
    .in('status', ['dikonfirmasi', 'dikirim', 'gagal']);
  const usulan = (usulanPeriode ?? []) as { id: string; status: string }[];
  if (usulan.length === 0) return hasil;
  const usulanIds = usulan.map((u) => u.id);

  const jalan = await denganKunci(`ks_outbox:${periode.id}`, async () => {
    // Lengkapi antrean yang terpotong (mis. proses mati saat konfirmasi).
    for (const u of usulan.filter((x) => x.status === 'dikonfirmasi')) {
      try {
        await antrekanPengiriman(u.id);
      } catch (e) {
        hasil.pesan.push((e as Error).message);
      }
    }

    // Disaring per usulan periode ini DI DALAM kueri — bukan mengambil 500 baris
    // antre lintas periode lalu menyaring, yang membuat periode lain kelaparan.
    const { data: antre } = await supabaseAdmin
      .from('ks_outbox')
      .select('id, usulan_id, peserta_id, aksi, urutan, percobaan, payload, respons')
      .in('usulan_id', usulanIds)
      .eq('status', 'antre')
      .order('urutan', { ascending: true })
      .limit(batas);

    const ctx: Konteks = {
      periode,
      batchId: periode.tilawah_batch_id!,
      percobaan,
      bacaCms: percobaan ? Boolean(opts.bacaCms) && tilawahTerkonfigurasi() : true,
      guru: new Map(),
      pertemuanCms: new Map(),
    };

    // Usulan yang satu langkahnya tertahan/gagal: sisa langkahnya ditunda ke
    // putaran berikutnya supaya urutannya tetap (halaqah → pertemuan → enrol).
    const tertahan = new Set<string>();

    for (const b of (antre ?? []) as BarisAntre[]) {
      if (tertahan.has(b.usulan_id)) continue;
      const r = await prosesSatu(ctx, b);
      if (r.jenis === 'diklaim_lain') continue;
      hasil.diproses++;
      if (r.jenis === 'terkirim') hasil.terkirim++;
      else if (r.jenis === 'gagal') hasil.gagal++;
      else if (r.jenis === 'ditahan' || r.jenis === 'menunggu') hasil.ditahan++;

      if (r.pesan) hasil.pesan.push(r.pesan);
      // Mode percobaan tetap menyusun pratinjau seluruh baris.
      if (!percobaan && r.jenis !== 'terkirim' && r.jenis !== 'pratinjau') tertahan.add(b.usulan_id);
    }

    await tandaiUsulanSelesai(usulanIds);
    return true;
  });

  if (jalan === null) {
    hasil.pesan.push('Antrean periode ini sedang diproses oleh proses lain. Coba lagi sebentar lagi.');
    return hasil;
  }

  // Pesan kembar (satu sebab untuk puluhan pertemuan) diringkas.
  hasil.pesan = [...new Set(hasil.pesan)];

  await catatKs({
    periode_id: periode.id,
    entitas: 'ks_outbox',
    aksi: percobaan ? 'proses_outbox_percobaan' : 'proses_outbox',
    sesudah: { diproses: hasil.diproses, terkirim: hasil.terkirim, gagal: hasil.gagal, ditahan: hasil.ditahan },
  });

  return hasil;
}

type HasilSatu =
  | { jenis: 'terkirim' | 'pratinjau' | 'diklaim_lain'; pesan?: string }
  | { jenis: 'menunggu' | 'ditahan' | 'gagal'; pesan: string };

function teksGalat(e: unknown): string {
  return e instanceof TilawahError ? `${e.message} (${e.status})` : (e as Error).message;
}

async function prosesSatu(ctx: Konteks, b: BarisAntre): Promise<HasilSatu> {
  const sekarang = () => new Date().toISOString();
  const masukan = b.aksi === 'buat_pertemuan' ? masukanPertemuan(b.payload) : null;
  // Jadwal yang dihitung saat antrean disusun wajib ikut tersimpan kembali.
  const rencana: Record<string, unknown> | null = masukan
    ? { ke: masukan.ke, ...(masukan.jadwal ?? {}) }
    : null;
  const denganRencana = (x: Record<string, unknown>) => (rencana ? { ...x, rencana } : x);

  // 1. Susun payload. Galat di sini berarti data belum lengkap (slot belum
  //    dipetakan, guru belum terdaftar, dst.) — tidak ada tulisan ke CMS, jadi
  //    tidak dihitung sebagai percobaan kirim.
  let siap: Siap<unknown>;
  try {
    if (b.aksi === 'buat_halaqah') siap = await susunHalaqah(ctx, b.usulan_id);
    else if (b.aksi === 'buat_pertemuan') siap = await susunPertemuan(ctx, b.usulan_id, masukan!);
    else if (b.aksi === 'enrol' && b.peserta_id) siap = await susunEnrol(ctx, b.peserta_id);
    else throw new Error(`Aksi outbox "${b.aksi}" tidak dikenal.`);
  } catch (e) {
    const pesan = teksGalat(e);
    await supabaseAdmin
      .from('ks_outbox')
      .update({
        payload: denganRencana({ galat_susun: pesan }),
        error_terakhir: pesan,
        updated_at: sekarang(),
      })
      .eq('id', b.id)
      .eq('status', 'antre');
    return { jenis: 'ditahan', pesan: `${b.aksi}: ${pesan}` };
  }

  if ('menunggu' in siap) {
    await supabaseAdmin
      .from('ks_outbox')
      .update({
        payload: denganRencana({ menunggu: siap.menunggu, pratinjau: siap.pratinjau }),
        updated_at: sekarang(),
      })
      .eq('id', b.id)
      .eq('status', 'antre');
    return { jenis: 'menunggu', pesan: `${b.aksi}: ${siap.menunggu}` };
  }

  const payload = denganRencana({
    ...(siap.body as Record<string, unknown>),
    ...(siap.catatan ? { catatan: siap.catatan } : {}),
  });

  // 2. Mode percobaan berhenti di sini: payload tersimpan, nol panggilan tulis,
  //    nol penghitung kegagalan.
  if (ctx.percobaan) {
    await supabaseAdmin
      .from('ks_outbox')
      .update({ payload, error_terakhir: null, updated_at: sekarang() })
      .eq('id', b.id)
      .eq('status', 'antre');
    return { jenis: 'pratinjau' };
  }

  // 3. Klaim baris sebelum menyentuh CMS. Syarat `percobaan` lama membuat hanya
  //    satu pekerja yang menang; penanda `mulai_kirim` bertahan sampai hasilnya
  //    pasti, sehingga proses yang mati di tengah kiriman meninggalkan jejak.
  const ragu = Boolean(b.respons && typeof b.respons === 'object' && 'mulai_kirim' in b.respons);
  const mulaiKirim = sekarang();
  const { data: klaim } = await supabaseAdmin
    .from('ks_outbox')
    .update({
      payload,
      percobaan: b.percobaan + 1,
      respons: { mulai_kirim: mulaiKirim, ...(ragu ? { sebelumnya: b.respons } : {}) },
      updated_at: mulaiKirim,
    })
    .eq('id', b.id)
    .eq('status', 'antre')
    .eq('percobaan', b.percobaan)
    .select('id');
  if (!klaim || klaim.length === 0) return { jenis: 'diklaim_lain' };

  try {
    const terkirim =
      b.aksi === 'buat_halaqah'
        ? await kirimHalaqah(b.usulan_id, siap.body as BuatHalaqahBody)
        : b.aksi === 'buat_pertemuan'
          ? await kirimPertemuan(ctx, siap.body as BuatPertemuanBody, ragu)
          : await kirimEnrol(ctx, b.peserta_id!, siap.body as PayloadEnrol);

    // Jeda kecil antar-kiriman. Satu halaqah bisa berarti puluhan panggilan
    // pertemuan berturut-turut ke server produksi yang kecil.
    await tunggu(150);

    await supabaseAdmin
      .from('ks_outbox')
      .update({
        respons: { tilawah_id: terkirim.tilawahId, isi: terkirim.respons ?? null },
        status: 'terkirim',
        error_terakhir: null,
        terkirim_pada: sekarang(),
        updated_at: sekarang(),
      })
      .eq('id', b.id);
    return { jenis: 'terkirim' };
  } catch (e) {
    const pesan = teksGalat(e);
    const pasti = pastiTidakDiterima(e);

    // Pertemuan tidak dapat dipastikan lewat pembacaan ulang (tak ada daftar
    // pertemuan per halaqah yang terdokumentasi). Mengulangnya buta bisa
    // membuat P5 kembar, jadi berhenti dan minta manusia memeriksa CMS.
    if (e instanceof PerluCek || (!pasti && b.aksi === 'buat_pertemuan')) {
      const teks = e instanceof PerluCek
        ? `PERLU CEK: ${pesan}`
        : `PERLU CEK: kiriman ${(siap.body as BuatPertemuanBody).name} mungkin sudah sampai ke CMS (${pesan}). `
          + 'Periksa daftar pertemuan halaqah ini di CMS sebelum mengulang.';
      await supabaseAdmin
        .from('ks_outbox')
        .update({
          status: 'gagal',
          error_terakhir: teks,
          respons: { perlu_cek: true, mulai_kirim: mulaiKirim },
          updated_at: sekarang(),
        })
        .eq('id', b.id);
      return { jenis: 'gagal', pesan: `${b.aksi}: ${teks}` };
    }

    // Halaqah dan enrol memastikan dirinya lewat pembacaan ulang, jadi penanda
    // `mulai_kirim` dibiarkan bila hasilnya meragukan — putaran berikutnya
    // mencari dulu sebelum menulis.
    await supabaseAdmin
      .from('ks_outbox')
      .update({
        status: b.percobaan + 1 >= BATAS_PERCOBAAN ? 'gagal' : 'antre',
        error_terakhir: pesan,
        respons: pasti ? null : { mulai_kirim: mulaiKirim },
        updated_at: sekarang(),
      })
      .eq('id', b.id);
    return { jenis: 'gagal', pesan: `${b.aksi}: ${pesan}` };
  }
}

/**
 * Kembalikan baris `gagal` sebuah periode ke antrean, dengan jatah percobaan baru.
 *
 * Baris bertanda PERLU CEK (pertemuan yang mungkin sudah sampai ke CMS) hanya
 * ikut dikembalikan bila `termasukPerluCek` — artinya koordinator sudah memeriksa
 * CMS dan memastikan pertemuannya belum ada. Penandanya dihapus supaya langkah
 * itu dikirim ulang.
 */
export async function pulihkanOutboxGagal(
  periodeId: string,
  opts: { termasukPerluCek?: boolean } = {}
): Promise<{ dipulihkan: number; perluCekDilewati: number }> {
  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .select('id')
    .eq('periode_id', periodeId);
  const ids = ((usulan ?? []) as { id: string }[]).map((u) => u.id);
  if (ids.length === 0) return { dipulihkan: 0, perluCekDilewati: 0 };

  const { data: gagal } = await supabaseAdmin
    .from('ks_outbox')
    .select('id, usulan_id, respons')
    .in('usulan_id', ids)
    .eq('status', 'gagal');
  const baris = (gagal ?? []) as { id: string; usulan_id: string; respons: Record<string, unknown> | null }[];
  const perluCek = baris.filter((b) => b.respons?.perlu_cek === true);
  const biasa = baris.filter((b) => b.respons?.perlu_cek !== true);
  const sekarang = new Date().toISOString();

  let dipulihkan = 0;
  if (biasa.length > 0) {
    // Penanda `mulai_kirim` dipertahankan: halaqah/enrol yang meragukan tetap
    // dipastikan lewat pembacaan ulang sebelum menulis.
    const { data } = await supabaseAdmin
      .from('ks_outbox')
      .update({ status: 'antre', percobaan: 0, updated_at: sekarang })
      .in('id', biasa.map((b) => b.id))
      .eq('status', 'gagal')
      .select('id');
    dipulihkan += (data ?? []).length;
  }
  if (opts.termasukPerluCek && perluCek.length > 0) {
    const { data } = await supabaseAdmin
      .from('ks_outbox')
      .update({ status: 'antre', percobaan: 0, respons: null, updated_at: sekarang })
      .in('id', perluCek.map((b) => b.id))
      .eq('status', 'gagal')
      .select('id');
    dipulihkan += (data ?? []).length;
  }

  // Usulan yang ditandai gagal kembali ke status kerjanya.
  const usulanTerdampak = [
    ...new Set([...biasa, ...(opts.termasukPerluCek ? perluCek : [])].map((b) => b.usulan_id)),
  ];
  if (usulanTerdampak.length > 0) {
    await supabaseAdmin
      .from('ks_usulan')
      .update({ status: 'dikirim', updated_at: sekarang })
      .in('id', usulanTerdampak)
      .eq('status', 'gagal')
      .not('tilawah_halaqah_id', 'is', null);
    await supabaseAdmin
      .from('ks_usulan')
      .update({ status: 'dikonfirmasi', updated_at: sekarang })
      .in('id', usulanTerdampak)
      .eq('status', 'gagal')
      .is('tilawah_halaqah_id', null);
  }

  return { dipulihkan, perluCekDilewati: opts.termasukPerluCek ? 0 : perluCek.length };
}

// ── Penyusunan payload ─────────────────────────────────────────────────────

/** Tolak usulan yang pesertanya berbagi satu nomor WA dengan nama berbeda. */
async function pastikanWaTidakBersama(usulanId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('status, pendaftar:pendaftar_id(nama, wa_normal)')
    .eq('usulan_id', usulanId);
  const peserta = ((data ?? []) as {
    status: string;
    pendaftar?: { nama: string; wa_normal: string | null } | null;
  }[])
    .filter((p) => p.status !== 'dikeluarkan' && p.pendaftar)
    .map((p) => p.pendaftar!);
  const bersama = waDipakaiBersama(peserta);
  if (bersama.length > 0) {
    const rinci = bersama.map((x) => `${x.nama.join(' & ')} (nomor …${x.wa.slice(-4)})`).join('; ');
    throw new Error(
      `Peserta berbagi satu nomor WA dengan nama berbeda: ${rinci}. CMS memakai satu akun per nomor, `
        + 'jadi pengiriman ditahan agar tidak menimpa nama akun. Perbaiki nomor salah satu pendaftar '
        + 'atau keluarkan dari usulan, lalu jalankan lagi.'
    );
  }
}

async function guruIdUntuk(ctx: Konteks, nama: string, wa: string): Promise<number> {
  const kunci = `${nama}|${wa}`;
  const ada = ctx.guru.get(kunci);
  if (ada !== undefined) return ada;
  const id = await cariGuruId(ctx.batchId, nama, wa);
  ctx.guru.set(kunci, id);
  return id;
}

async function susunHalaqah(ctx: Konteks, usulanId: string): Promise<Siap<BuatHalaqahBody>> {
  const { periode, batchId } = ctx;
  const { data: u } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, level, nama_halaqah, slot_id, pengajar_id, slot:slot_id(label, mode, kelompok), pengajar:pengajar_id(name, whatsapp_number)'
    )
    .eq('id', usulanId)
    .maybeSingle();
  if (!u) throw new Error('Usulan tidak ditemukan.');

  const slot = u.slot as { label: string; mode: string; kelompok: Gender } | null;
  const pengajar = u.pengajar as { name: string; whatsapp_number: string } | null;
  if (!slot) throw new Error('Slot usulan tidak ditemukan.');
  if (!pengajar) throw new Error('Pengajar usulan belum ditetapkan.');

  await pastikanWaTidakBersama(usulanId);

  const { data: slotMap } = await supabaseAdmin
    .from('ks_tilawah_slot_map')
    .select('day_id, session_id, usulan_otomatis')
    .eq('tilawah_batch_id', batchId)
    .eq('slot_id', u.slot_id as string)
    .maybeSingle();
  if (!slotMap) {
    // Ditahan, bukan ditebak: nomor day_id/session_id tidak dapat diturunkan
    // dari teks, dan salah nomor berarti halaqah terjadwal pada hari yang keliru.
    throw new Error(`Slot "${slot.label}" belum dipetakan ke day_id/session_id CMS tilawah.`);
  }

  const { data: levelMap } = await supabaseAdmin
    .from('ks_tilawah_level_map')
    .select('level_id')
    .eq('tilawah_batch_id', batchId)
    .eq('level_nama', u.level as string)
    .maybeSingle();
  if (!levelMap) throw new Error(`Level "${u.level}" belum dipetakan ke level_id CMS tilawah.`);

  const guruId = ctx.bacaCms ? await guruIdUntuk(ctx, pengajar.name, pengajar.whatsapp_number) : PLACEHOLDER_ID;

  // Nama halaqah adalah kunci pencarian ulang di CMS, jadi harus STABIL antar
  // putaran. Pada pengiriman nyata nama yang baru dihitung langsung disimpan
  // (bersyarat masih kosong), lalu dibaca ulang.
  let nama = u.nama_halaqah as string | null;
  if (!nama) {
    const usul = await namaHalaqahBaru(periode, slot.kelompok);
    if (ctx.percobaan) nama = usul;
    else {
      await supabaseAdmin
        .from('ks_usulan')
        .update({ nama_halaqah: usul, updated_at: new Date().toISOString() })
        .eq('id', usulanId)
        .is('nama_halaqah', null);
      const { data: ulang } = await supabaseAdmin
        .from('ks_usulan')
        .select('nama_halaqah')
        .eq('id', usulanId)
        .maybeSingle();
      nama = (ulang?.nama_halaqah as string | null) ?? usul;
    }
  }

  return {
    body: {
      batch_id: batchId,
      name: nama,
      type: slot.mode === 'offline' ? 'offline' : 'online',
      level_id: levelMap.level_id as number,
      day_id: slotMap.day_id as number,
      session_id: slotMap.session_id as number,
      description: `Dibentuk dari ketersediaan mengajar Maahir — ${slot.label}`,
      user_id: guruId,
      status: 1,
    },
    catatan: ctx.bacaCms ? undefined : 'Pratinjau: user_id guru diisi 0 — dicocokkan saat pengiriman nyata.',
  };
}

/**
 * Payload satu pertemuan ke-`ke` (1-based).
 *
 * Jadwalnya diambil dari payload antrean (dihitung saat konfirmasi). Baris lama
 * tanpa jadwal tersimpan dihitung dari tanggal mulai + hari slot + libur periode.
 */
async function susunPertemuan(
  ctx: Konteks,
  usulanId: string,
  masukan: ReturnType<typeof masukanPertemuan>
): Promise<Siap<BuatPertemuanBody>> {
  const { periode, batchId } = ctx;
  const { ke } = masukan;
  if (ke < 1) throw new Error('Nomor pertemuan tidak sah.');

  const { data: u } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, level, tanggal_mulai, tilawah_halaqah_id, slot:slot_id(label, hari_idx, waktu_mulai, waktu_selesai, mode, lokasi), pengajar:pengajar_id(name, whatsapp_number)'
    )
    .eq('id', usulanId)
    .maybeSingle();
  if (!u) throw new Error('Usulan tidak ditemukan.');

  const slot = u.slot as {
    label: string;
    hari_idx: KsHariIdx[];
    waktu_mulai: string;
    waktu_selesai: string;
    mode: string;
    lokasi: string | null;
  } | null;
  const pengajar = u.pengajar as { name: string; whatsapp_number: string } | null;
  if (!slot) throw new Error('Slot usulan tidak ditemukan.');
  if (!pengajar) throw new Error('Pengajar usulan belum ditetapkan.');

  let jadwal = masukan.jadwal;
  if (!jadwal) {
    const jumlah = Math.max(ke, jumlahPertemuanUntuk(periode, String(u.level ?? '')));
    const { rencana, galat } = susunRencanaPertemuan({
      tanggalMulai: u.tanggal_mulai as string | null,
      slot,
      jumlah,
      libur: periode.libur ?? [],
    });
    if (galat) throw new Error(galat);
    jadwal = rencana[ke - 1] ?? null;
    if (!jadwal) throw new Error(`Tanggal pertemuan ke-${ke} tidak dapat dihitung.`);
  }

  const guruId = ctx.bacaCms ? await guruIdUntuk(ctx, pengajar.name, pengajar.whatsapp_number) : PLACEHOLDER_ID;
  const halaqahId = u.tilawah_halaqah_id as number | null;

  const body: Omit<BuatPertemuanBody, 'halaqah_id'> = {
    name: namaPertemuan(ke),
    order: ke,
    type: slot.mode === 'offline' ? 'offline' : 'online',
    start_session_date: jadwal.mulai,
    end_session_date: jadwal.selesai,
    guru_id: guruId,
    online_url: '',
    offline_place: slot.mode === 'offline' ? (slot.lokasi ?? '') : '',
    notes: '',
    task_name: '',
    task_description: '',
    task_due: null,
    status: 1,
    moduls: [],
    schedule_date: jadwal.tanggal,
    batch_id: batchId,
  };

  if (!halaqahId) {
    // Bukan kegagalan: id halaqah baru ada setelah langkah buat_halaqah terkirim.
    return {
      menunggu: 'Menunggu langkah sebelumnya — halaqah belum terbentuk di CMS tilawah.',
      pratinjau: { ...body, halaqah_id: null },
    };
  }
  return {
    body: { ...body, halaqah_id: halaqahId },
    catatan: ctx.bacaCms ? undefined : 'Pratinjau: guru_id diisi 0 — dicocokkan saat pengiriman nyata.',
  };
}

interface PayloadEnrol {
  nama: string;
  phone: string;
  gender: 1 | 2;
  email: string;
  halaqah_id: number | null;
  move_reason: string;
}

async function susunEnrol(ctx: Konteks, pesertaId: string): Promise<Siap<PayloadEnrol>> {
  const { data: p } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('id, usulan_id, pendaftar:pendaftar_id(nama, wa_normal, gender), usulan:usulan_id(tilawah_halaqah_id)')
    .eq('id', pesertaId)
    .maybeSingle();
  if (!p) throw new Error('Peserta tidak ditemukan.');

  const pendaftar = p.pendaftar as { nama: string; wa_normal: string | null; gender: Gender | null } | null;
  const usulan = p.usulan as { tilawah_halaqah_id: number | null } | null;
  if (!pendaftar) throw new Error('Data pendaftar tidak ditemukan.');
  if (!pendaftar.wa_normal) throw new Error(`Pendaftar "${pendaftar.nama}" tidak punya nomor WA yang sah.`);

  await pastikanWaTidakBersama(p.usulan_id as string);

  const phone = `62${pendaftar.wa_normal}`;
  const payload: PayloadEnrol = {
    nama: pendaftar.nama,
    phone,
    gender: pendaftar.gender === 'akhwat' ? 2 : 1,
    // Email dipalsukan karena CMS mewajibkannya (422 bila kosong) meski banyak
    // murid lama bernilai null hasil impor.
    email: `${phone}@murid.hits`,
    halaqah_id: usulan?.tilawah_halaqah_id ?? null,
    move_reason: ALASAN_PINDAH,
  };
  if (!payload.halaqah_id && !ctx.percobaan) {
    return {
      menunggu: 'Menunggu langkah sebelumnya — halaqah belum terbentuk di CMS tilawah.',
      pratinjau: { ...payload },
    };
  }
  return { body: payload };
}

/**
 * Nomor halaqah berikutnya untuk periode & kelompok ini. Mengikuti pola nama
 * yang sudah dipakai ("HITS 001 AKHWAT JUNI") sehingga tidak perlu diketik.
 */
async function namaHalaqahBaru(periode: KsPeriode, kelompok: Gender): Promise<string> {
  const { data } = await supabaseAdmin
    .from('ks_usulan')
    .select('id, nama_halaqah')
    .eq('periode_id', periode.id);
  const sudah = ((data ?? []) as { nama_halaqah: string | null }[]).filter((r) => r.nama_halaqah).length;
  const label = periode.nama.replace(/[^a-zA-Z0-9 ]+/g, '').trim().toUpperCase();
  return `HITS ${String(sudah + 1).padStart(3, '0')} ${kelompok === 'ikhwan' ? 'IKHWAN' : 'AKHWAT'} ${label}`;
}

/**
 * Cari user_id guru di CMS. Cocokkan lewat nomor telepon dulu — nama sering
 * berbeda ejaan antar sistem, nomor tidak.
 */
async function cariGuruId(batchId: number, nama: string, wa: string): Promise<number> {
  const digit = wa.replace(/\D/g, '').replace(/^62/, '').replace(/^0+/, '');
  const kandidat = [...(await cariGuru(batchId, digit)), ...(await cariGuru(batchId, nama))];
  const lewatNomor = kandidat.find((u) => (u.phone ?? '').replace(/\D/g, '').endsWith(digit));
  if (lewatNomor) return lewatNomor.id;
  const lewatNama = kandidat.find((u) => u.name.trim().toLowerCase() === nama.trim().toLowerCase());
  if (lewatNama) return lewatNama.id;
  throw new Error(
    `Guru "${nama}" belum terdaftar di batch CMS tilawah ini. Daftarkan dulu di CMS, lalu ulangi pengiriman.`
  );
}

// ── Pengiriman ─────────────────────────────────────────────────────────────

interface HasilKirim {
  respons: unknown;
  tilawahId: number | null;
}

/**
 * Buat halaqah — idempoten.
 *
 * Urutannya: (1) usulan sudah menyimpan id → selesai; (2) halaqah bernama sama
 * sudah ada di batch → id-nya diadopsi; (3) baru POST. Tanpa (1) dan (2), satu
 * kiriman yang jawabannya hilang lalu diulang menghasilkan halaqah kembar, dan
 * `DELETE /api/halaqah` CMS membalas 500.
 */
async function kirimHalaqah(usulanId: string, body: BuatHalaqahBody): Promise<HasilKirim> {
  const { data: u } = await supabaseAdmin
    .from('ks_usulan')
    .select('tilawah_halaqah_id')
    .eq('id', usulanId)
    .maybeSingle();
  const sudah = (u?.tilawah_halaqah_id as number | null | undefined) ?? null;
  if (sudah) return { respons: { sudah_ada: true }, tilawahId: sudah };

  const cariPersis = async () =>
    (await cariHalaqah(body.batch_id, body.name)).filter((h) => h.name.trim() === body.name.trim());
  const galatGanda = (n: number) =>
    new PerluCek(
      `Ada ${n} halaqah bernama "${body.name}" di batch ini — kemungkinan kiriman ganda. `
        + 'Bereskan manual di CMS sebelum melanjutkan.'
    );

  let respons: unknown;
  let id: number | null = null;
  const sebelum = await cariPersis();
  if (sebelum.length > 1) throw galatGanda(sebelum.length);
  if (sebelum.length === 1) {
    id = sebelum[0].id;
    respons = { diadopsi: true };
  } else {
    const res = await kirim<TilawahEnvelope<Record<string, unknown>>>('/api/halaqah', body);
    respons = res;
    // Redirect berarti mutasi bergaya Inertia yang biasanya BERHASIL. Pastikan
    // lewat pembacaan ulang berdasarkan nama.
    id = adalahRedirect(res) ? null : ambilIdBaru(res);
    if (!id) {
      const cocok = await cariPersis();
      if (cocok.length === 1) id = cocok[0].id;
      else if (cocok.length > 1) throw galatGanda(cocok.length);
    }
  }
  if (!id) {
    throw new Error(
      'CMS tilawah tidak mengembalikan id halaqah dan halaqahnya tidak ditemukan saat dibaca ulang. '
        + 'Periksa daftar halaqah di CMS sebelum mengulang.'
    );
  }

  await supabaseAdmin
    .from('ks_usulan')
    .update({
      tilawah_halaqah_id: id,
      nama_halaqah: body.name,
      status: 'dikirim',
      updated_at: new Date().toISOString(),
    })
    .eq('id', usulanId);
  return { respons, tilawahId: id };
}

/**
 * Buat satu pertemuan.
 *
 * Tidak ada endpoint daftar pertemuan per halaqah yang terdokumentasi. Bila
 * detail halaqah kebetulan memuat daftarnya, daftar itu dipakai untuk melewati
 * pertemuan yang sudah ada. Bila tidak, kiriman pertama tetap aman (belum
 * pernah dicoba), tetapi kiriman yang percobaan sebelumnya MUNGKIN sudah sampai
 * (`ragu`) tidak diulang — ditandai PERLU CEK untuk diperiksa manusia.
 */
async function kirimPertemuan(ctx: Konteks, body: BuatPertemuanBody, ragu: boolean): Promise<HasilKirim> {
  if (!ctx.pertemuanCms.has(body.halaqah_id)) {
    let daftar: TilawahPertemuanRingkas[] | null = null;
    try {
      daftar = (await ambilHalaqahDetail(body.halaqah_id))?.pertemuan ?? null;
    } catch (e) {
      if (ragu) throw e;
    }
    ctx.pertemuanCms.set(body.halaqah_id, daftar);
  }
  const daftar = ctx.pertemuanCms.get(body.halaqah_id) ?? null;

  if (daftar) {
    const cocok = daftar.filter((p) => p.order === body.order || p.name === body.name);
    if (cocok.length > 1) {
      throw new PerluCek(`Ada ${cocok.length} pertemuan ${body.name} di halaqah #${body.halaqah_id} — kemungkinan kiriman ganda.`);
    }
    if (cocok.length === 1) return { respons: { diadopsi: true }, tilawahId: cocok[0].id };
  } else if (ragu) {
    throw new PerluCek(
      `Percobaan sebelumnya untuk ${body.name} (halaqah #${body.halaqah_id}) mungkin sudah sampai ke CMS, `
        + 'dan daftar pertemuannya tidak dapat dibaca otomatis. Periksa di CMS: bila belum ada, '
        + 'kembalikan ke antrean lewat "Ulangi yang gagal" dengan pilihan perlu-cek.'
    );
  }

  const res = await kirim<TilawahEnvelope<unknown>>('/api/pertemuans', body);
  const tilawahId = adalahRedirect(res) ? null : ambilIdBaru(res);
  if (daftar) daftar.push({ id: tilawahId ?? -1, name: body.name, order: body.order });
  return { respons: res, tilawahId };
}

/** Murid ber-nomor/ber-email ini di CMS, lintas batch lalu batch tujuan. */
async function cariAkunMurid(batchId: number, digit: string, email: string): Promise<TilawahUser[]> {
  const hasil = new Map<number, TilawahUser>();
  const cocok = (u: TilawahUser) =>
    (u.phone ?? '').replace(/\D/g, '').endsWith(digit) || (u.email ?? '').toLowerCase() === email.toLowerCase();
  for (const cari of [
    () => cariMuridSemuaBatch(digit),
    () => cariMuridSemuaBatch(email),
    () => cariMurid(batchId, digit),
  ]) {
    let daftar: TilawahUser[];
    try {
      daftar = await cari();
    } catch (e) {
      // Pencarian lintas batch belum terverifikasi; bila CMS menolaknya (4xx),
      // pencarian per batch tetap berjalan. Galat jaringan tetap naik — lebih
      // baik berhenti daripada menyimpulkan "belum ada" lalu membuat akun ganda.
      if (e instanceof TilawahError && e.status >= 400 && e.status < 500) continue;
      throw e;
    }
    for (const u of daftar.filter(cocok)) hasil.set(u.id, u);
  }
  return [...hasil.values()];
}

async function kirimEnrol(ctx: Konteks, pesertaId: string, payload: PayloadEnrol): Promise<HasilKirim> {
  const { batchId } = ctx;

  // Halaqah harus sudah ada: baris enrol selalu berurutan setelah buat_halaqah.
  const { data: p } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('usulan:usulan_id(tilawah_halaqah_id)')
    .eq('id', pesertaId)
    .maybeSingle();
  const halaqahId = (p?.usulan as { tilawah_halaqah_id: number | null } | null)?.tilawah_halaqah_id;
  if (!halaqahId) throw new Error('Halaqah belum terbentuk di CMS tilawah — jalankan langkahnya lebih dulu.');

  const digit = payload.phone.replace(/\D/g, '').replace(/^62/, '');
  const ada = await cariAkunMurid(batchId, digit, payload.email);
  if (ada.length > 1) {
    throw new PerluCek(
      `Ada ${ada.length} akun murid dengan nomor berakhiran ${digit} — kemungkinan akun ganda. `
        + 'Bereskan manual di CMS sebelum melanjutkan.'
    );
  }

  let akun: TilawahUser;
  if (ada.length === 1) {
    akun = ada[0];
    // Akun lama milik nama lain: jangan diganti namanya dan jangan dipindah ke
    // halaqah ini. Kemungkinan besar saudara yang memakai nomor yang sama —
    // enrolmen akan mengeluarkannya dari halaqahnya sendiri.
    if (!namaSama(akun.name, payload.nama)) {
      throw new Error(
        `Nomor ${payload.phone} sudah dipakai akun CMS "${akun.name}" (#${akun.id}), bukan "${payload.nama}". `
          + 'Akun tidak diubah. Pastikan orangnya sama (samakan nama pendaftar) atau perbaiki nomor WA-nya.'
      );
    }
  } else {
    // Sandi acak dan tidak dibagikan: CMS tilawah hanya diakses pengajar.
    const sandi = randomBytes(18).toString('base64url');
    const body: BuatMuridBody = {
      name: payload.nama,
      email: payload.email,
      phone: payload.phone,
      user_code: '',
      gender: payload.gender,
      role: 'murid',
      bio: '',
      wag: 'Belum',
      halaqah_id: null,
      old_halaqah_id: null,
      move_reason: '',
      password: sandi,
      password_confirmation: sandi,
      batch_id: batchId,
      meta: { bio: '', wag: 'Belum' },
    };
    const res = await kirim<TilawahEnvelope<Record<string, unknown>>>('/api/users', body);

    // POST /api/users terbukti membalas 302 ke akar sambil tetap membuat akun.
    // Karena itu akun dipastikan lewat pencarian ulang, bukan badan respons.
    const idLangsung = adalahRedirect(res) ? null : ambilIdBaru(res);
    const cocok = await cariAkunMurid(batchId, digit, payload.email);
    if (cocok.length > 1) {
      throw new PerluCek(
        `Ada ${cocok.length} murid dengan nomor berakhiran ${digit} — kemungkinan akun ganda. `
          + 'Bereskan manual di CMS sebelum melanjutkan.'
      );
    }
    const temu = cocok[0] ?? (idLangsung ? ({ id: idLangsung, name: payload.nama, email: payload.email } as TilawahUser) : null);
    if (!temu) {
      throw new Error('Akun murid tidak ditemukan setelah dibuat. Periksa daftar murid di CMS sebelum mengulang.');
    }
    akun = temu;
  }

  // Panggilan kedua — inilah yang benar-benar meng-enrol. Nama & email akun yang
  // sudah ada dipakai apa adanya supaya enrolmen tidak mengubah identitasnya.
  const enrol: EnrolMuridBody = {
    _method: 'PUT',
    name: akun.name || payload.nama,
    email: akun.email || payload.email,
    phone: payload.phone,
    user_code: akun.user_code ?? '',
    gender: payload.gender,
    role: 'murid',
    bio: '',
    wag: 'Belum',
    batch_id: batchId,
    halaqah_id: halaqahId,
    old_halaqah_id: null,
    move_reason: payload.move_reason,
    meta: { bio: '', wag: 'Belum' },
  };
  const res = await kirim<TilawahEnvelope<unknown>>(`/api/users/${akun.id}`, enrol);

  // Bila CMS membalas redirect, badan respons tidak menyatakan apa pun tentang
  // keberhasilan. Jadi dibaca ulang.
  if (adalahRedirect(res)) {
    const detail = await ambilHalaqahDetail(halaqahId);
    const masuk = detail?.users.some((u) => u.id === akun.id) ?? false;
    if (!masuk) {
      throw new Error(
        `Murid #${akun.id} tidak terlihat di halaqah #${halaqahId} setelah enrolment. `
          + 'Periksa di CMS sebelum mengulang.'
      );
    }
  }

  await supabaseAdmin
    .from('ks_usulan_peserta')
    .update({ status: 'terenroll', tilawah_user_id: akun.id, updated_at: new Date().toISOString() })
    .eq('id', pesertaId);

  return { respons: res, tilawahId: akun.id };
}

/** Tandai usulan yang seluruh antreannya sudah tuntas. */
async function tandaiUsulanSelesai(usulanIds: readonly string[]): Promise<void> {
  for (const id of usulanIds) {
    const { data: sisa } = await supabaseAdmin
      .from('ks_outbox')
      .select('id, status')
      .eq('usulan_id', id);
    const baris = (sisa ?? []) as { status: string }[];
    if (baris.length === 0) continue;
    if (baris.some((b) => b.status === 'antre')) continue;
    const adaGagal = baris.some((b) => b.status === 'gagal');
    await supabaseAdmin
      .from('ks_usulan')
      .update({ status: adaGagal ? 'gagal' : 'dikirim', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['dikonfirmasi', 'dikirim', 'gagal']);
  }
}
