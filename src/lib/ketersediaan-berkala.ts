import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { KsPendaftarSumber, KsPeriode } from '@/types/db';
import { tarikSumber } from '@/lib/ketersediaan-pendaftar';
import { geserYangKedaluwarsa } from '@/lib/ketersediaan-konfirmasi';
import { catatKs } from '@/lib/ketersediaan-log';
import { catatRiwayatPeriode } from '@/lib/ketersediaan-ditahan';

/**
 * Pekerjaan berkala yang membuat model bergulir benar-benar bergulir.
 *
 * Tanpa ini seluruh rancangan bergantung pada koordinator yang rajin menekan
 * tombol: pendaftar baru tidak masuk, tenggat konfirmasi tidak pernah lewat, dan
 * ketersediaan basi terus dihitung sebagai pasokan yang sebenarnya sudah tidak ada.
 *
 * Sengaja TIDAK menjalankan alokasi. Pembentukan halaqah tetap menunggu
 * koordinator — itu keputusan rancangan, bukan kelalaian: halaqah yang lahir dari
 * data yang belum sempat dibersihkan tidak dapat ditarik kembali dari CMS tilawah.
 */

export interface HasilBerkalaPeriode {
  periode: string;
  periode_id: string;
  pendaftar: string[];
  digeser: number;
  tanpaPengganti: number;
  ditandaiBasi: number;
  dinonaktifkan: number;
  perluDiingatkan: number;
  /** Slot yang statistiknya direkam ke riwayat; 0 bila periode belum berakhir. */
  riwayatDirekam: number;
  /** Diisi bila periode ini gagal diproses; periode lain tetap berjalan. */
  galat?: string;
}

export interface HasilBerkala {
  /** Nama periode yang diproses, dipisah koma. null bila tidak ada periode aktif. */
  periode: string | null;
  pendaftar: string[];
  digeser: number;
  tanpaPengganti: number;
  ditandaiBasi: number;
  dinonaktifkan: number;
  perluDiingatkan: number;
  /** Slot yang statistiknya direkam ke riwayat; 0 bila periode belum berakhir. */
  riwayatDirekam: number;
  /** Rincian per periode. Angka di atas adalah jumlahnya. */
  perPeriode: HasilBerkalaPeriode[];
}

/**
 * Proses SEMUA periode aktif, bukan hanya yang terbaru. Periode bergulir bisa
 * tumpang tindih — mis. periode lama masih menunggu konfirmasi pengajar saat
 * periode baru sudah membuka form — dan tenggat di periode lama tetap harus lewat.
 */
export async function jalankanBerkala(sekarang = new Date()): Promise<HasilBerkala> {
  const hasil: HasilBerkala = {
    periode: null,
    pendaftar: [],
    digeser: 0,
    tanpaPengganti: 0,
    ditandaiBasi: 0,
    dinonaktifkan: 0,
    perluDiingatkan: 0,
    riwayatDirekam: 0,
    perPeriode: [],
  };

  const { data } = await supabaseAdmin
    .from('ks_periode')
    .select('*')
    .eq('aktif', true)
    .order('mulai', { ascending: false });
  const periodeAktif = (data ?? []) as KsPeriode[];
  if (periodeAktif.length === 0) return hasil;

  for (const periode of periodeAktif) {
    let r: HasilBerkalaPeriode;
    try {
      r = await jalankanBerkalaPeriode(periode, sekarang);
    } catch (e) {
      // Satu periode yang rusak tidak boleh menghentikan periode lain.
      console.error('[ks berkala] periode gagal', periode.id, e);
      r = {
        periode: periode.nama,
        periode_id: periode.id,
        pendaftar: [],
        digeser: 0,
        tanpaPengganti: 0,
        ditandaiBasi: 0,
        dinonaktifkan: 0,
        perluDiingatkan: 0,
        riwayatDirekam: 0,
        galat: 'Gagal diproses — rincian di log server.',
      };
    }
    hasil.perPeriode.push(r);
    hasil.pendaftar.push(...(periodeAktif.length > 1 ? r.pendaftar.map((x) => `[${periode.nama}] ${x}`) : r.pendaftar));
    hasil.digeser += r.digeser;
    hasil.tanpaPengganti += r.tanpaPengganti;
    hasil.ditandaiBasi += r.ditandaiBasi;
    hasil.dinonaktifkan += r.dinonaktifkan;
    hasil.perluDiingatkan += r.perluDiingatkan;
    hasil.riwayatDirekam += r.riwayatDirekam;
  }
  hasil.periode = periodeAktif.map((p) => p.nama).join(', ');
  return hasil;
}

async function jalankanBerkalaPeriode(periode: KsPeriode, sekarang: Date): Promise<HasilBerkalaPeriode> {
  const hasil: HasilBerkalaPeriode = {
    periode: periode.nama,
    periode_id: periode.id,
    pendaftar: [],
    digeser: 0,
    tanpaPengganti: 0,
    ditandaiBasi: 0,
    dinonaktifkan: 0,
    perluDiingatkan: 0,
    riwayatDirekam: 0,
  };

  // 1. Tarik pendaftar terbaru.
  const { data: sumberRows } = await supabaseAdmin
    .from('ks_pendaftar_sumber')
    .select('*')
    .eq('periode_id', periode.id)
    .eq('aktif', true);
  for (const s of (sumberRows ?? []) as KsPendaftarSumber[]) {
    try {
      const h = await tarikSumber(s, periode, sekarang);
      hasil.pendaftar.push(`${s.nama}: ${h.baru} baru, ${h.diperbarui} diperbarui, ${h.ditahan} ditahan`);
    } catch (e) {
      const pesan = (e as Error).message;
      hasil.pendaftar.push(`${s.nama}: GAGAL — ${pesan}`);
      await supabaseAdmin
        .from('ks_pendaftar_sumber')
        .update({
          terakhir_tarik: sekarang.toISOString(),
          terakhir_status: 'gagal',
          terakhir_pesan: pesan,
        })
        .eq('id', s.id);
    }
  }

  // 2. Geser usulan yang lewat tenggat konfirmasi.
  const geser = await geserYangKedaluwarsa(periode, sekarang);
  hasil.digeser = geser.digeser;
  hasil.tanpaPengganti = geser.tanpaPengganti;

  // 3. Segarkan status ketersediaan.
  const segar = await segarkanKetersediaan(periode, sekarang);
  hasil.ditandaiBasi = segar.ditandaiBasi;
  hasil.dinonaktifkan = segar.dinonaktifkan;
  hasil.perluDiingatkan = segar.perluDiingatkan;

  // Rekam riwayat begitu periodenya lewat. Dijalankan berulang tanpa masalah —
  // barisnya di-upsert per (periode, slot) — dan tanpa ini tabel riwayat tidak
  // akan pernah terisi oleh sistem sendiri, sehingga "peluang slot terbentuk"
  // yang dijanjikan ke pengajar tidak pernah punya angka.
  const hariIni = sekarang.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  if (periode.selesai < hariIni) {
    const r = await catatRiwayatPeriode(periode.id);
    hasil.riwayatDirekam = r.slot;
  }

  await catatKs({
    periode_id: periode.id,
    entitas: 'ks_periode',
    entitas_id: periode.id,
    aksi: 'jalankan_berkala',
    sesudah: {
      pendaftar: hasil.pendaftar,
      digeser: hasil.digeser,
      tanpa_pengganti: hasil.tanpaPengganti,
      basi: hasil.ditandaiBasi,
      nonaktif: hasil.dinonaktifkan,
      riwayat: hasil.riwayatDirekam,
    },
  });

  return hasil;
}

/**
 * Tiga tahap, bukan langsung mati:
 *   aktif  → basi     lewat `penyegaran_hari`. Masih ikut alokasi, hanya perlu
 *                     dikonfirmasi ulang; koordinator melihatnya di daftar.
 *   basi   → (diingatkan) `pengingat_penyegaran_hari` sebelum dinonaktifkan.
 *   basi   → nonaktif setelah tenggat pengingat lewat tanpa jawaban.
 *
 * Bertahap karena mematikan langsung membuat kolam pengajar mengempis diam-diam,
 * dan seorang pengajar bisa hilang dari pembagian tanpa pernah tahu kenapa.
 */
async function segarkanKetersediaan(
  periode: KsPeriode,
  sekarang: Date
): Promise<{ ditandaiBasi: number; dinonaktifkan: number; perluDiingatkan: number }> {
  const { data } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, status, disegarkan_pada, submitted_at, pengingat_penyegaran_pada')
    .eq('periode_id', periode.id)
    .in('status', ['aktif', 'basi']);

  const HARI = 86400000;
  let ditandaiBasi = 0;
  let dinonaktifkan = 0;
  let perluDiingatkan = 0;

  for (const p of (data ?? []) as {
    id: string;
    status: string;
    disegarkan_pada: string | null;
    submitted_at: string | null;
    pengingat_penyegaran_pada: string | null;
  }[]) {
    const acuan = p.disegarkan_pada ?? p.submitted_at;
    if (!acuan) continue;
    const umurHari = Math.floor((sekarang.getTime() - new Date(acuan).getTime()) / HARI);

    if (p.status === 'aktif' && umurHari >= periode.penyegaran_hari) {
      await supabaseAdmin
        .from('ks_pengisian')
        .update({ status: 'basi', updated_at: sekarang.toISOString() })
        .eq('id', p.id);
      ditandaiBasi++;
      perluDiingatkan++;
      continue;
    }

    if (p.status === 'basi') {
      // Nonaktif hanya setelah pengingat benar-benar dikirim koordinator —
      // ditandai lewat pengingat_penyegaran_pada. Bila belum pernah dikirim,
      // barisnya tetap basi dan terus muncul di daftar "perlu diingatkan".
      if (!p.pengingat_penyegaran_pada) {
        perluDiingatkan++;
        continue;
      }
      const sejakIngat = Math.floor(
        (sekarang.getTime() - new Date(p.pengingat_penyegaran_pada).getTime()) / HARI
      );
      if (sejakIngat >= periode.pengingat_penyegaran_hari) {
        await supabaseAdmin
          .from('ks_pengisian')
          .update({ status: 'nonaktif', updated_at: sekarang.toISOString() })
          .eq('id', p.id);
        dinonaktifkan++;
      }
    }
  }

  return { ditandaiBasi, dinonaktifkan, perluDiingatkan };
}
