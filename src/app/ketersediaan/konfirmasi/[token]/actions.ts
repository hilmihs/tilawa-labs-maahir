'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { catatKs } from '@/lib/ketersediaan-log';
import {
  aksesTokenBerakhir,
  alihkanAtauLepas,
  terbitkanToken,
} from '@/lib/ketersediaan-konfirmasi';
import { getPeriode } from '@/lib/ketersediaan-periode';
import { antrekanPengiriman } from '@/lib/tilawah/push';

export type Hasil = { ok: true; pesan: string } | { ok: false; error: string };

/**
 * Aksi pada halaman konfirmasi pengajar.
 *
 * Halaman ini TERBUKA tanpa login — yang menjaga adalah tokennya. Karena itu
 * setiap aksi memuat ulang usulan dari token, tidak pernah mempercayai id yang
 * dikirim klien, dan menolak usulan yang statusnya sudah lewat.
 */
async function muatDariToken(token: string) {
  const { data } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, periode_id, status, token_kedaluwarsa, tanggal_mulai, dikonfirmasi_pada, level, slot_id, pengajar_id, nama_halaqah, grup_wa_link, pita_umur, pita_digabung, putaran, urutan_prioritas, pengajar:pengajar_id(name, gender), slot:slot_id(label, kelompok, mode)'
    )
    .eq('akses_token', token)
    .maybeSingle();
  return data as
    | {
        id: string;
        periode_id: string;
        status: string;
        token_kedaluwarsa: string | null;
        tanggal_mulai: string | null;
        dikonfirmasi_pada: string | null;
        level: string;
        slot_id: string;
        pengajar_id: string | null;
        nama_halaqah: string | null;
        grup_wa_link: string | null;
        pita_umur: string | null;
        pita_digabung: boolean | null;
        putaran: number;
        urutan_prioritas: number | null;
        pengajar?: { name: string; gender: 'ikhwan' | 'akhwat' } | null;
        slot?: { label: string; kelompok: 'ikhwan' | 'akhwat'; mode: string } | null;
      }
    | null;
}

/** Status sesudah pengajar bersedia. `gagal` = pengiriman CMS bermasalah, bukan penolakan. */
const SUDAH_SETUJU = ['dikonfirmasi', 'dikirim', 'gagal'];

/**
 * Susun antrean CMS tanpa menggagalkan konfirmasi yang sudah sah. Antrean yang
 * gagal disusun dilengkapi lagi saat outbox dijalankan (`prosesOutbox`) atau
 * saat tautan ini dibuka ulang.
 */
async function antrekanAman(u: { id: string; periode_id: string }): Promise<boolean> {
  try {
    await antrekanPengiriman(u.id);
    return true;
  } catch (e) {
    console.error('[ks] antrean pengiriman gagal disusun', u.id, e);
    await catatKs({
      periode_id: u.periode_id,
      entitas: 'ks_usulan',
      entitas_id: u.id,
      aksi: 'antrean_gagal_disusun',
      alasan: (e as Error).message,
    });
    return false;
  }
}

export async function setujuiKonfirmasi(input: { token: string }): Promise<Hasil> {
  const u = await muatDariToken(input.token);
  if (!u) return { ok: false, error: 'Tautan tidak dikenali.' };
  if (SUDAH_SETUJU.includes(u.status)) {
    // Konfirmasi ganda (dua ketukan, dua tab) aman: antrean hanya dilengkapi.
    if (u.status === 'dikonfirmasi') await antrekanAman(u);
    return { ok: true, pesan: 'Halaqah ini sudah Anda konfirmasi sebelumnya.' };
  }
  if (u.status !== 'menunggu') {
    return { ok: false, error: `Tautan sudah tidak berlaku (status: ${u.status}).` };
  }
  const sekarangDate = new Date();
  if (u.token_kedaluwarsa && new Date(u.token_kedaluwarsa) < sekarangDate) {
    return {
      ok: false,
      error: 'Tautan sudah lewat tenggat. Slot ini akan ditawarkan ke pengajar berikutnya — hubungi koordinator bila masih bersedia.',
    };
  }

  // Bersyarat: hanya dari `menunggu` dan belum lewat tenggat. Sapuan kedaluwarsa
  // yang berjalan di detik yang sama tidak boleh sama-sama menang.
  const sekarang = sekarangDate.toISOString();
  let q = supabaseAdmin
    .from('ks_usulan')
    .update({ status: 'dikonfirmasi', dikonfirmasi_pada: sekarang, updated_at: sekarang })
    .eq('id', u.id)
    .eq('status', 'menunggu');
  if (u.token_kedaluwarsa) q = q.gt('token_kedaluwarsa', sekarang);
  const { data: berubah } = await q.select('id');
  if (!berubah || berubah.length === 0) {
    const ulang = await muatDariToken(input.token);
    if (ulang && SUDAH_SETUJU.includes(ulang.status)) {
      return { ok: true, pesan: 'Halaqah ini sudah Anda konfirmasi sebelumnya.' };
    }
    return {
      ok: false,
      error: 'Tautan sudah tidak berlaku — tenggatnya lewat atau statusnya berubah. Hubungi koordinator.',
    };
  }

  // Tiap peserta mendapat tautan undangannya sendiri. Diterbitkan sekarang,
  // bukan saat pengiriman WhatsApp, supaya daftar peserta langsung siap kirim.
  const { data: peserta } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('id, undangan_token')
    .eq('usulan_id', u.id);
  for (const p of (peserta ?? []) as { id: string; undangan_token: string | null }[]) {
    if (p.undangan_token) continue;
    await supabaseAdmin
      .from('ks_usulan_peserta')
      .update({ undangan_token: terbitkanToken() })
      .eq('id', p.id)
      .is('undangan_token', null);
  }

  await catatKs({
    periode_id: u.periode_id,
    entitas: 'ks_usulan',
    entitas_id: u.id,
    aksi: 'pengajar_konfirmasi_setuju',
    aktor_nama: u.pengajar?.name ?? null,
  });

  // Susun antrean pengiriman ke CMS tilawah — hanya karena perubahan status di
  // atas benar-benar terjadi. Dalam mode kirim-percobaan ini hanya mencatat
  // payload; tidak ada panggilan keluar.
  await antrekanAman(u);

  revalidatePath(`/ketersediaan/konfirmasi/${input.token}`);
  revalidatePath('/ketersediaan/koordinator');
  return { ok: true, pesan: 'Terima kasih. Daftar peserta sudah terbuka di bawah.' };
}

export async function tolakKonfirmasi(input: { token: string; alasan: string }): Promise<Hasil> {
  const u = await muatDariToken(input.token);
  if (!u) return { ok: false, error: 'Tautan tidak dikenali.' };
  if (u.status !== 'menunggu') {
    return { ok: false, error: `Tautan sudah tidak berlaku (status: ${u.status}).` };
  }
  const alasan = input.alasan.trim();
  if (!alasan) return { ok: false, error: 'Mohon tuliskan alasannya agar koordinator dapat menindaklanjuti.' };

  const periode = await getPeriode(u.periode_id);
  if (!periode) return { ok: false, error: 'Periode halaqah ini tidak ditemukan. Hubungi koordinator.' };

  // Penolakan diperlakukan seperti lewat tenggat: tawarkan ke pengajar
  // berikutnya, atau kembalikan peserta ke antrean bila tak ada pengganti.
  // Tanpa ini pesertanya terkunci `dialokasikan` selamanya.
  const r = await alihkanAtauLepas(periode, u, {
    statusBaru: 'ditolak',
    alasan,
    sekarang: new Date(),
    aktorNama: u.pengajar?.name ?? null,
  });
  if (r.hasil === 'terlewat') {
    return { ok: false, error: 'Tautan sudah tidak berlaku — statusnya baru saja berubah. Hubungi koordinator.' };
  }

  await catatKs({
    periode_id: u.periode_id,
    entitas: 'ks_usulan',
    entitas_id: u.id,
    aksi: 'pengajar_konfirmasi_tolak',
    alasan,
    sesudah: r,
    aktor_nama: u.pengajar?.name ?? null,
  });

  revalidatePath('/ketersediaan/koordinator');
  return {
    ok: true,
    pesan:
      r.hasil === 'digeser'
        ? 'Penolakan tercatat. Slot ini diusulkan ke pengajar berikutnya.'
        : 'Penolakan tercatat. Belum ada pengajar lain di slot ini; peserta dikembalikan ke antrean koordinator.',
  };
}

/** Penjaga bersama aksi pasca-konfirmasi: status sudah setuju dan tautan belum habis masa. */
function tolakPascaKonfirmasi(u: NonNullable<Awaited<ReturnType<typeof muatDariToken>>>): Hasil | null {
  if (!SUDAH_SETUJU.includes(u.status)) {
    return { ok: false, error: 'Konfirmasi kesediaan terlebih dahulu.' };
  }
  if (aksesTokenBerakhir(u, new Date())) {
    return { ok: false, error: 'Masa berlaku tautan ini sudah habis. Hubungi koordinator untuk mengganti tautan grup.' };
  }
  return null;
}

/**
 * Simpan tautan undangan grup WhatsApp yang dibuat pengajar.
 *
 * Grup dibuat manusia karena WhatsApp Cloud API resmi tidak memiliki endpoint
 * grup sama sekali — tidak bisa membuat grup, menambah anggota, maupun mengambil
 * invite link. Pustaka tidak resmi mengemudikan nomor pribadi dan melanggar ToS.
 */
export async function simpanGrupWa(input: { token: string; link: string }): Promise<Hasil> {
  const u = await muatDariToken(input.token);
  if (!u) return { ok: false, error: 'Tautan tidak dikenali.' };
  const tolak = tolakPascaKonfirmasi(u);
  if (tolak) return tolak;
  const link = input.link.trim();
  if (!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(link)) {
    return {
      ok: false,
      error: 'Tautan tidak dikenali. Salin dari WhatsApp: Info Grup → Undang via tautan.',
    };
  }

  await supabaseAdmin
    .from('ks_usulan')
    .update({ grup_wa_link: link, grup_sumber: 'pengajar', updated_at: new Date().toISOString() })
    .eq('id', u.id);

  // Tautan lama ikut dicatat: bila tautan pengajar diganti orang yang memegang
  // tautan terusan, jejak inilah satu-satunya cara memulihkannya.
  await catatKs({
    periode_id: u.periode_id,
    entitas: 'ks_usulan',
    entitas_id: u.id,
    aksi: 'simpan_grup_wa',
    sebelum: { grup_wa_link: u.grup_wa_link },
    sesudah: { grup_wa_link: link, sumber: 'pengajar' },
    aktor_nama: u.pengajar?.name ?? null,
  });

  revalidatePath(`/ketersediaan/konfirmasi/${input.token}`);
  return { ok: true, pesan: 'Tautan grup tersimpan. Undangan peserta siap dikirim.' };
}

/**
 * Ambil satu grup dari kolam cadangan — untuk pengajar yang tidak sanggup
 * membuat grup sendiri. Kolam disiapkan koordinator di muka.
 */
export async function ambilGrupKolam(input: { token: string }): Promise<Hasil> {
  const u = await muatDariToken(input.token);
  if (!u) return { ok: false, error: 'Tautan tidak dikenali.' };
  const tolak = tolakPascaKonfirmasi(u);
  if (tolak) return tolak;
  if (u.grup_wa_link) return { ok: false, error: 'Halaqah ini sudah punya grup.' };

  const kosong = {
    ok: false as const,
    error: 'Kolam grup cadangan sedang kosong. Hubungi koordinator, atau buat grup sendiri lalu tempel tautannya.',
  };

  // Klaim bersyarat: dua pengajar yang menekan bersamaan tidak boleh mendapat
  // grup yang sama. Yang kalah mencoba baris berikutnya.
  let kolam: { id: string; invite_link: string } | null = null;
  for (let i = 0; i < 5 && !kolam; i++) {
    const { data: calon } = await supabaseAdmin
      .from('ks_grup_pool')
      .select('id, invite_link')
      .eq('periode_id', u.periode_id)
      .eq('gender', u.slot?.kelompok ?? 'ikhwan')
      .eq('status', 'kosong')
      .limit(1)
      .maybeSingle();
    if (!calon) return kosong;
    const { data: diklaim } = await supabaseAdmin
      .from('ks_grup_pool')
      .update({ status: 'terpakai', usulan_id: u.id, updated_at: new Date().toISOString() })
      .eq('id', calon.id)
      .eq('status', 'kosong')
      .select('id');
    if (diklaim && diklaim.length > 0) kolam = calon as { id: string; invite_link: string };
  }
  if (!kolam) return kosong;

  // Usulan juga bersyarat: dua ketukan dari dua tab tidak boleh menghabiskan dua grup.
  const { data: terpasang } = await supabaseAdmin
    .from('ks_usulan')
    .update({
      grup_wa_link: kolam.invite_link,
      grup_sumber: 'kolam',
      updated_at: new Date().toISOString(),
    })
    .eq('id', u.id)
    .is('grup_wa_link', null)
    .select('id');
  if (!terpasang || terpasang.length === 0) {
    await supabaseAdmin
      .from('ks_grup_pool')
      .update({ status: 'kosong', usulan_id: null, updated_at: new Date().toISOString() })
      .eq('id', kolam.id)
      .eq('usulan_id', u.id);
    return { ok: false, error: 'Halaqah ini sudah punya grup.' };
  }

  await catatKs({
    periode_id: u.periode_id,
    entitas: 'ks_usulan',
    entitas_id: u.id,
    aksi: 'ambil_grup_kolam',
    sesudah: { grup_pool_id: kolam.id },
    aktor_nama: u.pengajar?.name ?? null,
  });

  revalidatePath(`/ketersediaan/konfirmasi/${input.token}`);
  return { ok: true, pesan: 'Grup cadangan diambil. Anda akan ditambahkan sebagai admin oleh koordinator.' };
}
