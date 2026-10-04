import 'server-only';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getPool } from '@/lib/pg-core';
import type { KsHariIdx, KsPeriode } from '@/types/db';
import { catatKs } from '@/lib/ketersediaan-log';
import { jadwalTerpakaiPengajar } from '@/lib/ketersediaan-bentrok';
import { bentrok, rentangDariSlot, type RentangJadwal } from '@/lib/ketersediaan-slot';

/**
 * Konfirmasi pengajar atas halaqah yang sudah dinyatakan penuh.
 *
 * Alurnya: koordinator menyetujui usulan → sistem menerbitkan token → koordinator
 * mengirim tautan lewat wa.me → pengajar membuka, menyetujui atau menolak →
 * daftar peserta baru terbuka setelah setuju.
 *
 * Pola tokennya sama dengan /tabayyun/[token] dan /hits/pindah-halaqah/[token]
 * yang sudah berjalan. Konsekuensinya juga sama: pemegang token bertindak atas
 * nama pengajar, jadi kolomnya wajib berada di FORBIDDEN_COLUMNS api-public.
 */

/** 32 byte acak base64url (~43 karakter). */
export function terbitkanToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tanggal mulai bawaan: hari ini + jeda periode, dalam zona Jakarta. */
export function tanggalMulaiBawaan(periode: KsPeriode, sekarang: Date): string {
  const t = new Date(sekarang.getTime() + periode.jeda_mulai_hari * 86400000);
  return t.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

export function tenggatDari(periode: KsPeriode, sekarang: Date): string {
  return new Date(sekarang.getTime() + periode.tenggat_konfirmasi_jam * 3600000).toISOString();
}

/** Status usulan yang masih "hidup" — memegang slot, pengajar, dan pesertanya. */
export const STATUS_USULAN_HIDUP = ['usulan', 'disetujui', 'menunggu', 'dikonfirmasi', 'dikirim'] as const;

// ── Masa berlaku tautan setelah konfirmasi ─────────────────────────────────

/** Berapa hari setelah halaqah mulai tautan konfirmasi masih membuka data peserta. */
export const MASA_AKSES_SETELAH_MULAI_HARI = 30;

/**
 * Apakah tautan konfirmasi (dan undangan peserta) sudah habis masa berlakunya.
 *
 * Tautan yang sudah dikonfirmasi tidak pernah dicabut — tanpa batas, siapa pun
 * yang menerima tautan terusan tetap dapat membaca nama & nomor calon murid dan
 * mengganti tautan grup. Batasnya: tanggal mulai halaqah + 30 hari; bila tanggal
 * mulai kosong, tanggal konfirmasi + 30 hari. Tanpa keduanya dianggap masih
 * berlaku (usulan belum sampai tahap itu).
 */
export function aksesTokenBerakhir(
  u: { status: string; tanggal_mulai: string | null; dikonfirmasi_pada?: string | null },
  sekarang: Date
): boolean {
  if (!['dikonfirmasi', 'dikirim', 'gagal'].includes(u.status)) return false;
  const acuan = (u.tanggal_mulai ?? u.dikonfirmasi_pada ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acuan)) return false;
  // Akhir hari acuan, WIB.
  const batas = Date.parse(`${acuan}T23:59:59+07:00`) + MASA_AKSES_SETELAH_MULAI_HARI * 86_400_000;
  return Number.isFinite(batas) && sekarang.getTime() > batas;
}

// ── Pengganti pengajar ─────────────────────────────────────────────────────

export interface KandidatPengganti {
  pengajar_id: string;
  periode_id: string;
  status: string;
  submitted_at: string | null;
  prioritas: number | null;
}

/**
 * Saring & urutkan kandidat pengganti (murni).
 *
 * Yang dibuang: pengisian periode lain atau nonaktif, dan siapa pun yang PERNAH
 * mendapat usulan di slot ini pada periode ini — apa pun statusnya. Pengajar
 * yang menolak atau membiarkan tenggat lewat tidak ditawari ulang slot yang
 * sama; tanpa aturan ini dua pengajar bisa saling bergantian tanpa ujung.
 */
export function urutkanKandidatPengganti(
  kandidat: readonly KandidatPengganti[],
  opts: { periodeId: string; pernahDiusulkan: ReadonlySet<string>; kecuali: string | null }
): KandidatPengganti[] {
  const unik = new Map<string, KandidatPengganti>();
  for (const k of kandidat) {
    if (k.periode_id !== opts.periodeId || k.status === 'nonaktif') continue;
    if (k.pengajar_id === opts.kecuali || opts.pernahDiusulkan.has(k.pengajar_id)) continue;
    const lama = unik.get(k.pengajar_id);
    if (!lama || (k.prioritas ?? Infinity) < (lama.prioritas ?? Infinity)) unik.set(k.pengajar_id, k);
  }
  // Prioritas di jam ini dulu; pemutus seri dokumen konsep: pengisi form lebih awal.
  return [...unik.values()].sort(
    (a, b) =>
      (a.prioritas ?? Number.MAX_SAFE_INTEGER) - (b.prioritas ?? Number.MAX_SAFE_INTEGER) ||
      (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')
  );
}

/** Apakah salah satu rentang slot bentrok dengan salah satu rentang terpakai. */
export function slotBentrokDengan(slot: readonly RentangJadwal[], terpakai: readonly RentangJadwal[]): boolean {
  return slot.some((s) => terpakai.some((t) => bentrok(s, t)));
}

/**
 * Pengajar berikutnya di slot yang sama: ketersediaannya terverifikasi, belum
 * pernah diusulkan di slot ini pada periode ini, dan jadwalnya tidak bentrok —
 * baik dengan halaqah HITS/kelas Maahir/halaqah terkonfirmasi
 * (`jadwalTerpakaiPengajar`), maupun dengan usulan lain yang masih hidup di
 * periode MANA PUN pada jam yang beririsan.
 */
async function cariPengganti(
  periode: KsPeriode,
  slotId: string,
  kecuali: string | null
): Promise<string | null> {
  const [{ data: slotRow }, { data: ket }, { data: pernah }] = await Promise.all([
    supabaseAdmin
      .from('ks_slot')
      .select('label, hari_idx, waktu_mulai, waktu_selesai')
      .eq('id', slotId)
      .maybeSingle(),
    supabaseAdmin
      .from('ks_ketersediaan')
      .select('slot_id, prioritas, pengisian:pengisian_id(pengajar_id, periode_id, status, submitted_at)')
      .eq('slot_id', slotId)
      .eq('status', 'terverifikasi'),
    supabaseAdmin
      .from('ks_usulan')
      .select('pengajar_id')
      .eq('periode_id', periode.id)
      .eq('slot_id', slotId),
  ]);
  if (!slotRow) return null;
  const rentangSlot = rentangDariSlot(
    slotRow as { label: string; hari_idx: KsHariIdx[]; waktu_mulai: string; waktu_selesai: string }
  );

  const pernahDiusulkan = new Set(
    ((pernah ?? []) as { pengajar_id: string | null }[])
      .map((h) => h.pengajar_id)
      .filter((x): x is string => Boolean(x))
  );

  const kandidat = urutkanKandidatPengganti(
    ((ket ?? []) as {
      prioritas: number | null;
      pengisian?: { pengajar_id: string; periode_id: string; status: string; submitted_at: string | null } | null;
    }[])
      .filter((k) => Boolean(k.pengisian))
      .map((k) => ({ ...k.pengisian!, prioritas: k.prioritas })),
    { periodeId: periode.id, pernahDiusulkan, kecuali }
  );

  const cacheSelesaiBatch = new Map<string, string | null>();
  for (const k of kandidat) {
    const terpakai = await jadwalTerpakaiPengajar(k.pengajar_id, { acuan: periode.mulai, cacheSelesaiBatch });
    if (slotBentrokDengan(rentangSlot, terpakai.map((t) => t.rentang))) continue;

    // `jadwalTerpakaiPengajar` hanya menghitung usulan dikonfirmasi/dikirim.
    // Usulan yang baru diusulkan/menunggu jawaban di periode lain juga memegang
    // jam itu — menawarinya dua halaqah di jam yang sama memaksa salah satunya ditolak.
    const { data: hidup } = await supabaseAdmin
      .from('ks_usulan')
      .select('id, slot:slot_id(label, hari_idx, waktu_mulai, waktu_selesai)')
      .eq('pengajar_id', k.pengajar_id)
      .in('status', [...STATUS_USULAN_HIDUP]);
    const rentangHidup = ((hidup ?? []) as {
      slot?: { label: string; hari_idx: KsHariIdx[]; waktu_mulai: string; waktu_selesai: string } | null;
    }[]).flatMap((h) => (h.slot ? rentangDariSlot(h.slot) : []));
    if (slotBentrokDengan(rentangSlot, rentangHidup)) continue;

    return k.pengajar_id;
  }
  return null;
}

// ── Pengalihan usulan yang tidak dikonfirmasi ──────────────────────────────

export interface UsulanDialihkan {
  id: string;
  slot_id: string;
  pengajar_id: string | null;
  level: string;
  pita_umur: string | null;
  pita_digabung?: boolean | null;
  putaran: number;
  urutan_prioritas: number | null;
}

export type HasilPengalihan =
  | { hasil: 'digeser'; usulanBaru: string; pengganti: string }
  | { hasil: 'dilepas'; peserta: number }
  | { hasil: 'terlewat' };

/**
 * Tutup usulan `menunggu` (lewat tenggat atau ditolak pengajar), lalu:
 *  · ada pengganti → usulan baru untuk pengajar berikutnya, peserta ikut pindah;
 *  · tidak ada     → peserta DILEPAS: baris usulan_peserta dihapus dan pendaftarnya
 *                    kembali `valid`, supaya tidak terkunci `dialokasikan`
 *                    selamanya (dan terblokir di periode lain).
 *
 * Seluruhnya satu transaksi, diawali perubahan status BERSYARAT
 * `status = 'menunggu'`: sapuan berkala yang berjalan bersamaan, atau pengajar
 * yang menekan setuju di detik yang sama, tidak dapat menggandakan pengganti.
 */
export async function alihkanAtauLepas(
  periode: KsPeriode,
  u: UsulanDialihkan,
  opts: {
    statusBaru: 'kedaluwarsa' | 'ditolak';
    alasan: string;
    sekarang: Date;
    aktorNama?: string | null;
  }
): Promise<HasilPengalihan> {
  // Dibaca di luar transaksi supaya transaksinya pendek.
  const pengganti = await cariPengganti(periode, u.slot_id, u.pengajar_id);

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const tutup = await client.query(
      `update ks_usulan
          set status = $2, akses_token = null, alasan_tolak = $3, updated_at = $4
        where id = $1 and status = 'menunggu'
        returning id`,
      [u.id, opts.statusBaru, opts.alasan, opts.sekarang.toISOString()]
    );
    if ((tutup.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return { hasil: 'terlewat' };
    }

    if (pengganti) {
      await client.query('SAVEPOINT pengganti');
      try {
        const { rows: baru } = await client.query<{ id: string }>(
          `insert into ks_usulan
             (periode_id, slot_id, pengajar_id, level, pita_umur, pita_digabung, putaran, urutan_prioritas, status)
           values ($1, $2, $3, $4, $5, $6, $7, $8, 'usulan')
           returning id`,
          [
            periode.id,
            u.slot_id,
            pengganti,
            u.level,
            u.pita_umur,
            Boolean(u.pita_digabung),
            u.putaran,
            (u.urutan_prioritas ?? 0) + 1,
          ]
        );
        // Peserta ikut pindah utuh: mereka sudah menunggu, tidak boleh dikembalikan
        // ke belakang antrean karena pengajarnya yang diam atau menolak.
        await client.query(
          'update ks_usulan_peserta set usulan_id = $1, updated_at = $2 where usulan_id = $3',
          [baru[0].id, opts.sekarang.toISOString(), u.id]
        );
        await client.query(
          `insert into ks_log (periode_id, entitas, entitas_id, aksi, sebelum, sesudah, alasan, aktor_nama)
           values ($1, 'ks_usulan', $2, 'geser_prioritas', $3::jsonb, $4::jsonb, $5, $6)`,
          [
            periode.id,
            u.id,
            JSON.stringify({ pengajar_id: u.pengajar_id, status: opts.statusBaru }),
            JSON.stringify({ usulan_id: baru[0].id, pengajar_id: pengganti }),
            opts.alasan,
            opts.aktorNama ?? null,
          ]
        );
        await client.query('COMMIT');
        return { hasil: 'digeser', usulanBaru: baru[0].id, pengganti };
      } catch (e) {
        // Mis. `uq_ks_usulan_hidup`: pengganti keburu mendapat usulan di slot ini.
        // Jatuh ke pelepasan peserta, bukan membatalkan penutupan usulan lama.
        console.error('[ks] pengganti gagal disisipkan, peserta dilepas', u.id, e);
        await client.query('ROLLBACK TO SAVEPOINT pengganti');
      }
    }

    const { rows: lepas } = await client.query<{ pendaftar_id: string }>(
      'delete from ks_usulan_peserta where usulan_id = $1 returning pendaftar_id',
      [u.id]
    );
    const pendaftarIds = lepas.map((r) => r.pendaftar_id);
    if (pendaftarIds.length > 0) {
      await client.query(
        `update ks_pendaftar set status = 'valid', updated_at = $2
          where id = any($1::uuid[]) and status = 'dialokasikan'`,
        [pendaftarIds, opts.sekarang.toISOString()]
      );
    }
    await client.query(
      `insert into ks_log (periode_id, entitas, entitas_id, aksi, sebelum, sesudah, alasan, aktor_nama)
       values ($1, 'ks_usulan', $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
      [
        periode.id,
        u.id,
        opts.statusBaru === 'kedaluwarsa' ? 'kedaluwarsa_tanpa_pengganti' : 'ditolak_tanpa_pengganti',
        JSON.stringify({ pengajar_id: u.pengajar_id }),
        JSON.stringify({ peserta_dilepas: pendaftarIds.length, pendaftar_ids: pendaftarIds }),
        `${opts.alasan} — tidak ada pengajar lain yang tersedia di slot ini; peserta kembali ke antrean`,
        opts.aktorNama ?? null,
      ]
    );
    await client.query('COMMIT');
    return { hasil: 'dilepas', peserta: pendaftarIds.length };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Geser usulan yang lewat tenggat ke prioritas berikutnya.
 *
 * Usulan lama ditandai kedaluwarsa, lalu usulan baru dibuat untuk slot dan
 * kelompok peserta yang sama dengan pengajar berikutnya menurut prioritas.
 * Bila tidak ada pengganti, pesertanya kembali ke antrean (lihat `alihkanAtauLepas`).
 *
 * Dijalankan berkala dan juga saat koordinator membuka papan status, supaya
 * tidak bergantung pada satu mekanisme saja — aman berjalan bersamaan.
 */
export async function geserYangKedaluwarsa(
  periode: KsPeriode,
  sekarang: Date
): Promise<{ digeser: number; tanpaPengganti: number }> {
  const { data: lewat } = await supabaseAdmin
    .from('ks_usulan')
    .select('id, slot_id, pengajar_id, level, pita_umur, pita_digabung, putaran, urutan_prioritas')
    .eq('periode_id', periode.id)
    .eq('status', 'menunggu')
    .lte('token_kedaluwarsa', sekarang.toISOString());

  let digeser = 0;
  let tanpaPengganti = 0;

  for (const u of (lewat ?? []) as UsulanDialihkan[]) {
    const r = await alihkanAtauLepas(periode, u, {
      statusBaru: 'kedaluwarsa',
      alasan: 'Lewat tenggat konfirmasi',
      sekarang,
    });
    if (r.hasil === 'digeser') digeser++;
    else if (r.hasil === 'dilepas') tanpaPengganti++;
  }

  return { digeser, tanpaPengganti };
}
