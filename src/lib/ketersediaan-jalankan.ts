import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getPool } from '@/lib/pg-core';
import type { Gender, KsHariIdx, KsPeriode, KsPitaUmur, KsPrioritasPreset, KsSlot } from '@/types/db';
import { listSlot } from '@/lib/ketersediaan-periode';
import { bentrokSalahSatu, masihBerjalanPada, rentangDariSlot, type RentangJadwal } from '@/lib/ketersediaan-slot';
import { jadwalTerpakaiPengajar, STATUS_USULAN_HIDUP } from '@/lib/ketersediaan-bentrok';
import {
  alokasikan,
  kelompokkanPendaftar,
  type GrupUsulan,
  type PendaftarAlokasi,
  type Penempatan,
  type SlotAlokasi,
} from '@/lib/ketersediaan-alokasi';
import { urutanDariWaktuIsi, urutanUntuk, type Urutan } from '@/lib/ketersediaan-prioritas';
import { catatKs } from '@/lib/ketersediaan-log';
import { identitasPendaftar } from '@/lib/ketersediaan-pendaftar';
import { identitasTerpakaiLintasPeriode } from '@/lib/ketersediaan-lintas-periode';

/**
 * Penghubung antara mesin alokasi yang murni dan basis data.
 *
 * Keluarannya adalah USULAN — belum halaqah. Tidak ada satu pun halaqah lahir
 * tanpa koordinator menyetujuinya, dan tidak ada pengajar dihubungi sebelum itu.
 * Ini yang membedakan "bergulir otomatis dengan persetujuan" dari "bergulir
 * penuh otomatis" yang berisiko melahirkan halaqah dari data yang belum sempat
 * dibersihkan.
 */

/** 'usulan' ikut: usulan yang belum disetujui pun sudah memegang jam pengajarnya. */
const STATUS_HIDUP: string[] = [...STATUS_USULAN_HIDUP];

/**
 * Kunci advisory untuk penulisan usulan. Sengaja SATU kunci untuk semua periode,
 * bukan per periode: tabrakan yang dicegah justru lintas periode — dua tahap
 * yang dijalankan bersamaan bisa menjatah pengajar yang sama di jam yang sama.
 */
export const KUNCI_ALOKASI = 'ks_alokasi';

export interface HasilJalan {
  usulanBaru: number;
  pesertaTerpakai: number;
  tanpaPengajar: number;
  putaran: number;
  /** Penempatan yang dibatalkan saat ditulis karena data berubah di tengah jalan. */
  dilewati: number;
  perGender: Record<Gender, { usulan: number; keterangan: string }>;
}

/**
 * Peringkat gabungan untuk mesin yang tidak mengenal sumber prioritas.
 *
 * Skala dua sumber tidak sebanding: prioritas xlsx per jam (1, 2, 3…) dan urutan
 * preset/waktu isi (1…n pengajar). Dulu keduanya dibandingkan mentah, sehingga
 * pengajar #3 di preset mengalahkan pengajar yang di xlsx tertulis prioritas 5.
 * Kini yang punya prioritas xlsx di jam itu selalu didahulukan, baru sisanya
 * menurut preset — digeser 1000 supaya tak pernah bercampur.
 */
export const GESER_PRESET = 1000;
export function peringkatGabungan(prioritasJam: number | undefined, peringkatPreset: number): number {
  return prioritasJam !== undefined ? prioritasJam : GESER_PRESET + peringkatPreset;
}

export async function jalankanAlokasi(
  periode: KsPeriode,
  opts: {
    presetIkhwan?: KsPrioritasPreset | null;
    presetAkhwat?: KsPrioritasPreset | null;
    aktor?: { wa: string | null; nama: string | null };
    sekarang?: Date;
  } = {}
): Promise<HasilJalan> {
  const sekarang = opts.sekarang ?? new Date();
  const slots = await listSlot(periode.id, { hanyaAktif: true });

  const urutan: Record<Gender, Urutan> = {
    ikhwan: opts.presetIkhwan
      ? await urutanUntuk(opts.presetIkhwan)
      : await urutanDariWaktuIsi(periode.id, 'ikhwan'),
    akhwat: opts.presetAkhwat
      ? await urutanUntuk(opts.presetAkhwat)
      : await urutanDariWaktuIsi(periode.id, 'akhwat'),
  };

  // ── Permintaan: pendaftar sah yang belum dialokasikan ──
  const [{ data: pendaftarRows }, terpakaiLain] = await Promise.all([
    supabaseAdmin
      .from('ks_pendaftar')
      .select('id, slot_id, level_pilihan, pita_umur, didaftar_pada, wa_normal, nama')
      .eq('periode_id', periode.id)
      .eq('status', 'valid'),
    identitasTerpakaiLintasPeriode(periode.id),
  ]);

  const pendaftar: PendaftarAlokasi[] = ((pendaftarRows ?? []) as {
    id: string;
    slot_id: string | null;
    level_pilihan: string | null;
    pita_umur: KsPitaUmur | null;
    didaftar_pada: string | null;
    wa_normal: string | null;
    nama: string;
  }[])
    .filter((p): p is typeof p & { slot_id: string } => Boolean(p.slot_id))
    .filter((p) => {
      // Sudah masuk usulan di periode lain dari formulir yang sama.
      const id = identitasPendaftar(p.wa_normal, p.nama);
      return !id || !terpakaiLain.has(id);
    })
    .map((p) => ({
      id: p.id,
      slot_id: p.slot_id,
      // Level kosong diperlakukan sebagai Dasar: itu bawaan program, dan
      // membiarkannya null akan memecah kelompok tanpa alasan.
      level: p.level_pilihan ?? 'HITS Dasar',
      pita_umur: p.pita_umur,
      didaftar_pada: p.didaftar_pada,
    }));

  // ── Pasokan: pengajar terverifikasi per slot ──
  // Dibaca lewat pengisian periode ini, bukan seluruh ks_ketersediaan.
  const { data: pengisianRows } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, pengajar_id, status')
    .eq('periode_id', periode.id);
  const pengisianById = new Map(
    ((pengisianRows ?? []) as { id: string; pengajar_id: string; status: string }[]).map((p) => [p.id, p])
  );
  const { data: ketRows } =
    pengisianById.size > 0
      ? await supabaseAdmin
          .from('ks_ketersediaan')
          .select('slot_id, status, prioritas, pengisian_id')
          .in('pengisian_id', [...pengisianById.keys()])
          .in('status', ['terverifikasi', 'diajukan'])
      : { data: [] };

  const slotIds = new Set(slots.map((s) => s.id));
  const tersedia = new Map<string, string[]>();
  const pengajarDipakai = new Set<string>();
  /** `${slot_id}|${pengajar_id}` → prioritas di jam itu. */
  const prioritasJam = new Map<string, number>();
  for (const k of (ketRows ?? []) as { slot_id: string; prioritas: number | null; pengisian_id: string }[]) {
    const p = pengisianById.get(k.pengisian_id);
    if (!p) continue;
    // 'nonaktif' berhenti ikut alokasi; 'basi' tetap ikut, hanya turun prioritas
    // lewat urutan — bukan dihapus dari kolam.
    if (p.status === 'nonaktif') continue;
    if (!slotIds.has(k.slot_id)) continue;
    if (k.prioritas !== null) prioritasJam.set(`${k.slot_id}|${p.pengajar_id}`, k.prioritas);
    if (!tersedia.has(k.slot_id)) tersedia.set(k.slot_id, []);
    if (!tersedia.get(k.slot_id)!.includes(p.pengajar_id)) {
      tersedia.get(k.slot_id)!.push(p.pengajar_id);
      pengajarDipakai.add(p.pengajar_id);
    }
  }

  // ── Halaqah yang sudah hidup pada periode ini ──
  const { data: usulanHidup } = await supabaseAdmin
    .from('ks_usulan')
    .select('slot_id, pengajar_id')
    .eq('periode_id', periode.id)
    .in('status', STATUS_HIDUP);
  const sudahDiSlot = new Map<string, Set<string>>();
  for (const u of (usulanHidup ?? []) as { slot_id: string; pengajar_id: string | null }[]) {
    if (!u.pengajar_id) continue;
    if (!sudahDiSlot.has(u.slot_id)) sudahDiSlot.set(u.slot_id, new Set());
    sudahDiSlot.get(u.slot_id)!.add(u.pengajar_id);
  }

  // ── Halaqah hidup tiap pengajar di semua periode aktif — benih pemerataan ──
  const sudahDapat = await hitungSudahDapat([...pengajarDipakai]);

  // ── Jadwal yang sudah terpakai tiap pengajar ──
  // Termasuk usulan hidup di periode mana pun (lihat jadwalTerpakaiPengajar);
  // usulannya di slot yang sama pada periode ini dijaga sudahDiSlot.
  const jadwalPengajar = new Map<string, RentangJadwal[]>();
  const cacheSelesaiBatch = new Map<string, string | null>();
  for (const id of pengajarDipakai) {
    const terpakai = await jadwalTerpakaiPengajar(id, { acuan: periode.mulai, cacheSelesaiBatch });
    jadwalPengajar.set(
      id,
      terpakai.map((t) => t.rentang)
    );
  }

  // ── Susun kelompok calon halaqah per slot ──
  const slotAlokasi: SlotAlokasi[] = [];
  for (const s of slots) {
    const milikSlot = pendaftar.filter((p) => p.slot_id === s.id);
    if (milikSlot.length === 0) continue;
    const grup = kelompokkanPendaftar(s.id, milikSlot, periode, sekarang);
    if (grup.length === 0) continue;
    slotAlokasi.push({
      slot: s,
      grup,
      antre: milikSlot.length,
      usia_tertua_hari: Math.max(...grup.map((g) => g.usia_tertua_hari), 0),
    });
  }

  const genderSlot = new Map(slots.map((s) => [s.id, s.kelompok]));

  const hasil = alokasikan({
    slots: slotAlokasi,
    tersedia,
    sudahDiSlot,
    jadwalPengajar,
    sudahDapat,
    peringkat: (id, slotId) => {
      const g = genderSlot.get(slotId);
      const u = g ? urutan[g] : null;
      const preset = u ? (u.peringkat.get(id) ?? u.peringkatSisa) : Number.MAX_SAFE_INTEGER / 2;
      return peringkatGabungan(prioritasJam.get(`${slotId}|${id}`), preset);
    },
  });

  // ── Tulis usulan ──
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const perGender: Record<Gender, { usulan: number; keterangan: string }> = {
    ikhwan: { usulan: 0, keterangan: urutan.ikhwan.keterangan },
    akhwat: { usulan: 0, keterangan: urutan.akhwat.keterangan },
  };

  const tulis = await tulisPenempatan(periode, hasil.penempatan, slotById, sekarang);
  for (const t of tulis.tertulis) {
    const g = genderSlot.get(t.slot_id);
    if (g) perGender[g].usulan += 1;
  }

  await catatKs({
    periode_id: periode.id,
    entitas: 'ks_usulan',
    aksi: 'jalankan_alokasi',
    sesudah: {
      usulan: tulis.tertulis.length,
      peserta: tulis.peserta,
      dilewati: tulis.dilewati,
      alasan_dilewati: tulis.alasan.slice(0, 20),
      tanpa_pengajar: hasil.tanpaPengajar.length,
      putaran: hasil.putaranTerpakai,
      urutan_ikhwan: urutan.ikhwan.keterangan,
      urutan_akhwat: urutan.akhwat.keterangan,
    },
    aktor_wa: opts.aktor?.wa ?? null,
    aktor_nama: opts.aktor?.nama ?? null,
  });

  return {
    usulanBaru: tulis.tertulis.length,
    pesertaTerpakai: tulis.peserta,
    tanpaPengajar: hasil.tanpaPengajar.length,
    putaran: hasil.putaranTerpakai,
    dilewati: tulis.dilewati,
    perGender,
  };
}

/** Jumlah usulan hidup tiap pengajar di semua periode aktif. */
async function hitungSudahDapat(pengajarIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (pengajarIds.length === 0) return out;
  const [{ data: aktif }, { data: usulan }] = await Promise.all([
    supabaseAdmin.from('ks_periode').select('id').eq('aktif', true),
    supabaseAdmin
      .from('ks_usulan')
      .select('pengajar_id, periode_id')
      .in('pengajar_id', [...pengajarIds])
      .in('status', STATUS_HIDUP),
  ]);
  const periodeAktif = new Set(((aktif ?? []) as { id: string }[]).map((p) => p.id));
  for (const u of (usulan ?? []) as { pengajar_id: string | null; periode_id: string }[]) {
    if (!u.pengajar_id || !periodeAktif.has(u.periode_id)) continue;
    out.set(u.pengajar_id, (out.get(u.pengajar_id) ?? 0) + 1);
  }
  return out;
}

export interface HasilTulis {
  tertulis: Penempatan[];
  peserta: number;
  dilewati: number;
  alasan: string[];
}

/**
 * Tulis tiap penempatan dalam transaksinya sendiri, di bawah kunci advisory.
 *
 * Rencana disusun dari bacaan tanpa kunci, jadi dua koordinator yang menekan
 * "Jalankan alokasi" bersamaan (atau dua tahap sekaligus) bisa merencanakan
 * pendaftar dan pengajar yang sama. Di dalam transaksi semuanya diperiksa ulang:
 *  · pendaftar DIKLAIM dengan `update … where status='valid' returning id` —
 *    bila tidak semuanya berhasil, usulan itu dibatalkan utuh (tidak ada
 *    halaqah setengah jadi dengan peserta kurang);
 *  · pengajar tidak boleh sudah punya usulan hidup yang bentrok jam, di periode
 *    mana pun, atau di slot yang sama pada periode ini.
 * Satu klien dipakai untuk seluruh penulisan, jadi berjalan juga dengan pool
 * berukuran satu koneksi.
 */
export async function tulisPenempatan(
  periode: KsPeriode,
  penempatan: readonly Penempatan[],
  slotById: ReadonlyMap<string, KsSlot>,
  sekarang: Date
): Promise<HasilTulis> {
  const out: HasilTulis = { tertulis: [], peserta: 0, dilewati: 0, alasan: [] };
  if (penempatan.length === 0) return out;

  const client = await getPool().connect();
  try {
    for (const p of penempatan) {
      const slot = slotById.get(p.slot_id);
      if (!slot) continue;
      const lewati = async (alasan: string) => {
        await client.query('ROLLBACK').catch(() => {});
        out.dilewati++;
        out.alasan.push(alasan);
      };

      try {
        await client.query('BEGIN');
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [KUNCI_ALOKASI]);

        const bentrokJam = await usulanBentrok(client, p.pengajar_id, periode, slot);
        if (bentrokJam) {
          await lewati(`${slot.label}: pengajar sudah memegang ${bentrokJam}`);
          continue;
        }

        const klaim = await client.query<{ id: string }>(
          `update ks_pendaftar set status = 'dialokasikan', updated_at = $2
            where id = any($1::uuid[]) and status = 'valid' and periode_id = $3
            returning id`,
          [p.grup.pendaftar_ids, sekarang.toISOString(), periode.id]
        );
        if ((klaim.rowCount ?? 0) !== p.grup.pendaftar_ids.length) {
          await lewati(`${slot.label}: ${p.grup.pendaftar_ids.length - (klaim.rowCount ?? 0)} pendaftar sudah tidak antre`);
          continue;
        }

        const { rows } = await client.query<{ id: string }>(
          `insert into ks_usulan
             (periode_id, slot_id, pengajar_id, nama_halaqah, level, pita_umur, pita_digabung, putaran, urutan_prioritas, status)
           values ($1, $2, $3, null, $4, $5, $6, $7, $8, 'usulan')
           returning id`,
          [
            periode.id,
            p.slot_id,
            p.pengajar_id,
            p.grup.level,
            p.grup.pita_umur,
            p.grup.pita_digabung,
            p.putaran,
            p.urutan_prioritas,
          ]
        );
        const usulanId = rows[0]?.id;
        if (!usulanId) throw new Error('usulan tidak kembali dari insert');

        await client.query(
          `insert into ks_usulan_peserta (usulan_id, pendaftar_id)
           select $1, unnest($2::uuid[])`,
          [usulanId, p.grup.pendaftar_ids]
        );

        await client.query('COMMIT');
        out.tertulis.push(p);
        out.peserta += p.grup.pendaftar_ids.length;
      } catch (e) {
        // Termasuk pelanggaran uq_ks_usulan_hidup bila alokasi lain menang lebih dulu.
        await lewati(`${slot.label}: ${(e as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
  return out;
}

/**
 * Nama usulan hidup milik pengajar yang bertabrakan dengan slot ini, atau null.
 * Dibaca di dalam transaksi berkunci supaya tulisan alokasi lain sudah terlihat.
 */
async function usulanBentrok(
  client: { query: <R extends Record<string, unknown>>(q: string, v?: unknown[]) => Promise<{ rows: R[] }> },
  pengajarId: string,
  periode: KsPeriode,
  slot: KsSlot
): Promise<string | null> {
  const { rows } = await client.query<{
    slot_id: string;
    periode_id: string;
    selesai: string | null;
    label: string;
    hari_idx: KsHariIdx[];
    waktu_mulai: string;
    waktu_selesai: string;
  }>(
    `select u.slot_id, u.periode_id, p.selesai::text as selesai, s.label, s.hari_idx,
            s.waktu_mulai::text as waktu_mulai, s.waktu_selesai::text as waktu_selesai
       from ks_usulan u
       join ks_slot s on s.id = u.slot_id
       join ks_periode p on p.id = u.periode_id
      where u.pengajar_id = $1 and u.status = any($2::text[])`,
    [pengajarId, STATUS_HIDUP]
  );
  const rentang = rentangDariSlot(slot);
  for (const r of rows) {
    if (r.periode_id === periode.id && r.slot_id === slot.id) return `halaqah di ${r.label}`;
    if (!masihBerjalanPada(r.selesai, periode.mulai)) continue;
    const lain = rentangDariSlot({ ...r, hari_idx: r.hari_idx.map(Number) as KsHariIdx[] });
    if (bentrokSalahSatu(lain, rentang)) return `halaqah di ${r.label}`;
  }
  return null;
}

/**
 * Nama halaqah baku. Nomor urut dihitung dari jumlah halaqah hidup pada periode
 * dan gender yang sama, supaya penamaan mengikuti pola yang sudah dipakai
 * ("HITS 001 AKHWAT JUNI") tanpa perlu diketik.
 */
export async function susunNamaHalaqah(
  periode: KsPeriode,
  slot: KsSlot,
  nomor: number
): Promise<string> {
  const kelompok = slot.kelompok === 'ikhwan' ? 'IKHWAN' : 'AKHWAT';
  const label = periode.nama.replace(/[^a-zA-Z0-9 ]+/g, '').trim().toUpperCase();
  return `HITS ${String(nomor).padStart(3, '0')} ${kelompok} ${label}`;
}

/** Ringkas kelompok untuk ditampilkan di kartu usulan. */
export function ringkasGrup(g: Pick<GrupUsulan, 'level' | 'pita_umur' | 'pita_digabung' | 'pendaftar_ids'>): string {
  const pita = g.pita_digabung ? 'pita digabung' : (g.pita_umur ?? 'umur tak diketahui');
  return `${g.level} · ${pita} · ${g.pendaftar_ids.length} murid`;
}

export { rentangDariSlot };
