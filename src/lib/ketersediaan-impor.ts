import 'server-only';
import { getPool } from '@/lib/pg-core';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsHariIdx, KsModePengajar, KsPeriode } from '@/types/db';
import { kunciJamMaster, lokasiBaku, sesiDariSlot, type SesiSlot } from '@/lib/ketersediaan-slot';
import { listPeriode } from '@/lib/ketersediaan-periode';
import { alasanTerkunci, jadwalTerpakaiPengajar, kunciSlot, type JadwalTerpakai } from '@/lib/ketersediaan-bentrok';
import { bacaKetersediaanXlsx, type BarisImpor } from '@/lib/ketersediaan-impor-xlsx';
import { cocokkanPengajar, type HasilCocok, type PengajarRingkas } from '@/lib/ketersediaan-impor-cocok';

/**
 * Impor ketersediaan pengajar dari xlsx: pratinjau dulu, lalu simpan.
 *
 * Aturan tulis (spec §4.2):
 *  · satu ks_pengisian per (periode, pengajar) bersumber 'impor', status aktif;
 *  · satu ks_ketersediaan per jam, 'terverifikasi', membawa prioritas per jam;
 *  · jam yang belum ada di master periode dibuatkan;
 *  · impor ulang MENGGANTIKAN hasil impor sebelumnya — jam dan pengajar yang tak
 *    ada lagi di berkas dihapus, tetapi HANYA dalam mode (online/offline) yang
 *    bagiannya ada di berkas untuk periode itu: berkas berisi sheet online saja
 *    tidak menghapus hasil impor offline. Isian bersumber 'form' tidak pernah disentuh;
 *  · pengajar tidak dihapus sama sekali bila bagian periode itu masih memuat
 *    baris yang belum siap (jam tak terbaca, nama/WA belum dipasangkan): baris
 *    itu bisa jadi milik pengajar yang akan terhapus;
 *  · bentrok jadwal hanya DICATAT, tidak mengunci: koordinator yang menyusun xlsx
 *    sudah menyaring jadwal;
 *  · satu transaksi per periode — gagal di tengah, tak ada yang tersimpan.
 */

export interface PilihanImpor {
  /** kunci bagian → id periode tujuan */
  tujuan: Record<string, string>;
  /** kunci baris → id pengajar, atau 'lewati' */
  manual: Record<string, string>;
}

export interface BarisPratinjau extends BarisImpor {
  cocok: HasilCocok;
  siap: boolean;
}

export interface BagianPratinjau {
  kunci: string;
  judul: string;
  batch: string;
  baris: number;
  pengajar: number;
  siap: number;
  bermasalah: number;
  /** Pilihan koordinator, atau tebakan dari nama bulan bila hanya satu periode cocok. */
  tujuan: string | null;
}

export interface Pratinjau {
  bagian: BagianPratinjau[];
  baris: BarisPratinjau[];
  pengajar: Record<Gender, { id: string; name: string }[]>;
  periode: { id: string; nama: string; mulai: string }[];
}

export interface HasilPeriode {
  id: string;
  nama: string;
  pengajar: number;
  jam: number;
  slotBaru: number;
  /** Jam milik pengajar terimpor yang tak ada lagi di berkas. */
  dihapus: number;
  /** Pengajar hasil impor lama yang tak ada lagi di berkas. */
  pengajarDihapus: number;
  /** Pengajar yang dilewati karena sudah mengisi sendiri. */
  dilindungi: number;
  /** Alasan penghapusan pengajar dilewati, bila ada — tampilkan ke koordinator. */
  catatan?: string;
}

export interface HasilSimpan {
  periode: HasilPeriode[];
  /** Baris yang tidak diimpor: bermasalah, tanpa akun, atau dilewati. */
  dilewati: number;
}

export function barisSiap(r: Pick<BarisPratinjau, 'masalah' | 'slot' | 'cocok'>): boolean {
  return r.masalah.length === 0 && r.slot !== null && r.cocok.status === 'cocok' && r.cocok.pengajar_id !== null;
}

function tebakTujuan(batch: string, periode: readonly KsPeriode[]): string | null {
  const bulan = batch.split(/\s+/)[0]?.toLowerCase();
  if (!bulan) return null;
  const cocok = periode.filter((p) => p.nama.toLowerCase().includes(bulan));
  return cocok.length === 1 ? cocok[0].id : null;
}

const urutNama = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export async function susunPratinjau(data: ArrayBuffer, pilihan: PilihanImpor): Promise<Pratinjau> {
  const [{ bagian }, periode, { data: pengajarRows }] = await Promise.all([
    bacaKetersediaanXlsx(data),
    listPeriode(),
    supabaseAdmin.from('pengajar').select('id, name, gender, whatsapp_number, active'),
  ]);
  const daftar = (pengajarRows ?? []) as PengajarRingkas[];

  const baris: BarisPratinjau[] = bagian.flatMap((b) =>
    b.baris.map((r) => {
      const cocok = cocokkanPengajar(r, daftar, pilihan.manual[r.kunci]);
      return { ...r, cocok, siap: barisSiap({ masalah: r.masalah, slot: r.slot, cocok }) };
    })
  );

  const ringkasBagian: BagianPratinjau[] = bagian.map((b) => {
    const milik = baris.filter((r) => r.bagian === b.kunci);
    const siap = milik.filter((r) => r.siap).length;
    return {
      kunci: b.kunci,
      judul: b.judul,
      batch: b.batch,
      baris: milik.length,
      pengajar: new Set(milik.map((r) => r.cocok.pengajar_id ?? `?${r.nama}`)).size,
      siap,
      bermasalah: milik.length - siap,
      tujuan: pilihan.tujuan[b.kunci] ?? tebakTujuan(b.batch, periode),
    };
  });

  const aktif = daftar.filter((p) => p.active);
  return {
    bagian: ringkasBagian,
    baris,
    pengajar: {
      ikhwan: aktif.filter((p) => p.gender === 'ikhwan').map(({ id, name }) => ({ id, name })).sort(urutNama),
      akhwat: aktif.filter((p) => p.gender === 'akhwat').map(({ id, name }) => ({ id, name })).sort(urutNama),
    },
    periode: periode.map((p) => ({ id: p.id, nama: p.nama, mulai: p.mulai })),
  };
}

export async function simpanImpor(
  data: ArrayBuffer,
  pilihan: PilihanImpor,
  aktor: { wa: string | null; nama: string },
  namaBerkas: string
): Promise<HasilSimpan> {
  const pratinjau = await susunPratinjau(data, pilihan);

  const tanpaTujuan = pratinjau.bagian.filter((b) => b.siap > 0 && !b.tujuan);
  if (tanpaTujuan.length > 0) {
    throw new Error(`Pilih periode tujuan untuk: ${tanpaTujuan.map((b) => b.judul).join(', ')}.`);
  }

  const tujuanBagian = new Map(pratinjau.bagian.map((b) => [b.kunci, b.tujuan]));
  const perPeriode = new Map<string, BarisPratinjau[]>();
  for (const r of pratinjau.baris) {
    const t = r.siap ? tujuanBagian.get(r.bagian) : null;
    if (!t) continue;
    if (!perPeriode.has(t)) perPeriode.set(t, []);
    perPeriode.get(t)!.push(r);
  }

  const periodeById = new Map((await listPeriode()).map((p) => [p.id, p]));
  const hasil: HasilSimpan = { periode: [], dilewati: pratinjau.baris.filter((r) => !r.siap).length };
  for (const [periodeId, rows] of perPeriode) {
    const periode = periodeById.get(periodeId);
    if (!periode) throw new Error('Periode tujuan tidak ditemukan. Muat ulang halaman.');
    // Seluruh baris berkas yang diarahkan ke periode ini, siap atau tidak.
    const milikPeriode = pratinjau.baris.filter((r) => tujuanBagian.get(r.bagian) === periodeId);
    const cakupan = {
      modes: [...new Set(milikPeriode.map((r) => r.mode))],
      // Baris yang sengaja dilewati koordinator sudah diputuskan, jadi tidak menahan.
      belumSiap: milikPeriode.filter((r) => !r.siap && r.cocok.status !== 'dilewati').length,
    };
    hasil.periode.push(await simpanSatuPeriode(periode, rows, cakupan, aktor, namaBerkas));
  }
  return hasil;
}

/**
 * Kunci satu jam master — `kunciJamMaster`, sama dengan penyaring pendaftar dan
 * penambah jam dari formulir. Lokasi hanya ikut untuk offline dan selalu lewat
 * `lokasiBaku`, sehingga ejaan xlsx ("Masjid Al-Kautsar Matraman") dan formulir
 * ("Masjid Al Kautsar Matraman Jakarta Timur") tetap satu jam, sementara Pejaten
 * dan Matraman di jam yang sama tetap dua jam.
 */
function kunciJam(g: Gender, mode: string, sesi: readonly SesiSlot[], lokasi: string | null): string {
  return kunciJamMaster(g, mode, sesi, lokasi);
}

async function simpanSatuPeriode(
  periode: KsPeriode,
  rows: readonly BarisPratinjau[],
  cakupan: { modes: readonly string[]; belumSiap: number },
  aktor: { wa: string | null; nama: string },
  namaBerkas: string
): Promise<HasilPeriode> {
  // 1. Kelompokkan per pengajar. Jam kembar untuk orang yang sama: prioritas terkecil.
  const perPengajar = new Map<string, Map<string, BarisPratinjau>>();
  for (const r of rows) {
    const pid = r.cocok.pengajar_id!;
    const k = kunciJam(r.gender, r.mode, r.slot!.sesi, r.lokasi);
    if (!perPengajar.has(pid)) perPengajar.set(pid, new Map());
    const jam = perPengajar.get(pid)!;
    const lama = jam.get(k);
    if (!lama || (r.prioritas ?? Number.MAX_SAFE_INTEGER) < (lama.prioritas ?? Number.MAX_SAFE_INTEGER)) {
      jam.set(k, r);
    }
  }

  // 2. Bentrok dibaca SEBELUM transaksi, lewat koneksi terpisah, supaya
  //    transaksinya pendek dan tidak menunggu koneksi lain.
  const cacheSelesaiBatch = new Map<string, string | null>();
  const terpakai = new Map<string, JadwalTerpakai[]>();
  for (const pid of perPengajar.keys()) {
    terpakai.set(pid, await jadwalTerpakaiPengajar(pid, { acuan: periode.mulai, cacheSelesaiBatch }));
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const { rows: slotRows } = await client.query<{
      id: string;
      kelompok: Gender;
      mode: string;
      label: string;
      hari_idx: KsHariIdx[];
      waktu_mulai: string;
      waktu_selesai: string;
      lokasi: string | null;
      urutan: number;
    }>(
      `select id, kelompok::text as kelompok, mode, label, hari_idx, waktu_mulai::text as waktu_mulai,
              waktu_selesai::text as waktu_selesai, lokasi, urutan
         from ks_slot where periode_id = $1`,
      [periode.id]
    );
    const slotId = new Map(slotRows.map((s) => [kunciJam(s.kelompok, s.mode, sesiDariSlot(s), s.lokasi), s.id]));
    let urutan = slotRows.reduce((m, s) => Math.max(m, s.urutan), 0);

    let slotBaru = 0;
    let jam = 0;
    let dihapus = 0;
    let dilindungi = 0;
    const tersimpan: string[] = [];

    for (const [pid, jamMilik] of perPengajar) {
      const semua = [...jamMilik.values()];
      const modes = new Set(semua.map((r) => r.mode));
      const mode: KsModePengajar = modes.size > 1 ? 'keduanya' : semua[0].mode;
      const offline = semua.find((r) => r.mode === 'offline');
      const lokasi = offline ? lokasiBaku(offline.lokasi) : null;

      const { rows: pengisian } = await client.query<{ id: string }>(
        `insert into ks_pengisian (periode_id, pengajar_id, mode, lokasi, komitmen, submitted_at, status, sumber)
         values ($1, $2, $3, $4, true, now(), 'aktif', 'impor')
         on conflict (periode_id, pengajar_id) do update
           set mode = excluded.mode, lokasi = excluded.lokasi, komitmen = true, status = 'aktif',
               submitted_at = now(), updated_at = now()
           where ks_pengisian.sumber = 'impor'
         returning id`,
        [periode.id, pid, mode, lokasi]
      );
      if (pengisian.length === 0) {
        dilindungi++;
        continue;
      }
      const pengisianId = pengisian[0].id;
      tersimpan.push(pid);

      const slotMilik: string[] = [];
      for (const [k, r] of jamMilik) {
        const s = r.slot!;
        let sid = slotId.get(k);
        if (!sid) {
          const { rows: baru } = await client.query<{ id: string }>(
            `insert into ks_slot (periode_id, kelompok, mode, label, hari, hari_idx, waktu_mulai, waktu_selesai, lokasi, urutan)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             returning id`,
            [
              periode.id,
              r.gender,
              r.mode,
              s.label,
              s.hari,
              s.hari_idx,
              s.waktu_mulai,
              s.waktu_selesai,
              r.mode === 'offline' ? lokasiBaku(r.lokasi) : null,
              ++urutan,
            ]
          );
          sid = baru[0].id;
          slotId.set(k, sid);
          slotBaru++;
        }
        slotMilik.push(sid);

        const tabrakan = kunciSlot(
          [{ id: sid, label: s.label, hari_idx: s.hari_idx, waktu_mulai: s.waktu_mulai, waktu_selesai: s.waktu_selesai }],
          terpakai.get(pid) ?? []
        ).get(sid);

        await client.query(
          `insert into ks_ketersediaan (pengisian_id, slot_id, status, prioritas, bentrok_alasan)
           values ($1, $2, 'terverifikasi', $3, $4)
           on conflict (pengisian_id, slot_id) do update
             set status = 'terverifikasi', prioritas = excluded.prioritas,
                 bentrok_alasan = excluded.bentrok_alasan, updated_at = now()`,
          [pengisianId, sid, r.prioritas, tabrakan ? alasanTerkunci(tabrakan) : null]
        );
        jam++;
      }

      // Hanya jam bermode yang bagiannya ada di berkas: impor sheet online tidak
      // menghapus jam offline orang yang sama dari impor sebelumnya.
      const hapusJam = await client.query(
        `delete from ks_ketersediaan k
          using ks_slot s
          where s.id = k.slot_id and k.pengisian_id = $1
            and not (k.slot_id = any($2::uuid[])) and s.mode = any($3::text[])`,
        [pengisianId, slotMilik, cakupan.modes]
      );
      dihapus += hapusJam.rowCount ?? 0;

      // Mode & lokasi pengisian mengikuti jam yang tersisa, termasuk jam mode lain
      // yang tidak disentuh berkas ini.
      const { rows: sisa } = await client.query<{ mode: string; lokasi: string | null }>(
        `select distinct s.mode, s.lokasi from ks_ketersediaan k join ks_slot s on s.id = k.slot_id
          where k.pengisian_id = $1`,
        [pengisianId]
      );
      const modeSisa = new Set(sisa.map((x) => x.mode));
      if (modeSisa.size > 1 && mode !== 'keduanya') {
        const lokasiSisa = sisa.find((x) => x.mode === 'offline')?.lokasi ?? null;
        await client.query(`update ks_pengisian set mode = 'keduanya', lokasi = $2, updated_at = now() where id = $1`, [
          pengisianId,
          lokasi ?? lokasiBaku(lokasiSisa),
        ]);
      }
    }

    // Pengajar hasil impor lama yang tak ada lagi di berkas. Dua pengaman:
    //  · hanya pengisian yang seluruh jamnya bermode yang ada di berkas ini;
    //  · tidak sama sekali bila bagian periode ini masih punya baris belum siap —
    //    baris "nama tak ketemu" bisa jadi justru milik pengajar yang akan dihapus.
    let pengajarDihapus = 0;
    let catatan: string | undefined;
    if (cakupan.belumSiap > 0) {
      catatan = `Pengajar lama tidak dihapus: ${cakupan.belumSiap} baris berkas untuk periode ini belum siap (belum dipasangkan atau jamnya tak terbaca).`;
    } else {
      const hapusPengajar = await client.query(
        `delete from ks_pengisian i
          where i.periode_id = $1 and i.sumber = 'impor' and not (i.pengajar_id = any($2::uuid[]))
            and (i.mode = any($3::text[]) or (i.mode = 'keduanya' and cardinality($3::text[]) >= 2))
            and not exists (
              select 1 from ks_ketersediaan k join ks_slot s on s.id = k.slot_id
               where k.pengisian_id = i.id and not (s.mode = any($3::text[]))
            )`,
        [periode.id, [...perPengajar.keys()], cakupan.modes]
      );
      pengajarDihapus = hapusPengajar.rowCount ?? 0;
    }

    await client.query(
      `insert into ks_log (periode_id, entitas, aksi, sesudah, aktor_wa, aktor_nama)
       values ($1, 'ks_pengisian', 'impor_ketersediaan', $2::jsonb, $3, $4)`,
      [
        periode.id,
        JSON.stringify({ berkas: namaBerkas, pengajar: tersimpan.length, jam, slot_baru: slotBaru, dihapus, pengajar_dihapus: pengajarDihapus, dilindungi, catatan: catatan ?? null }),
        aktor.wa,
        aktor.nama,
      ]
    );

    await client.query('COMMIT');
    return { id: periode.id, nama: periode.nama, pengajar: tersimpan.length, jam, slotBaru, dihapus, pengajarDihapus, dilindungi, ...(catatan ? { catatan } : {}) };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
