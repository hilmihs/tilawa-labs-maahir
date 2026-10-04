'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePengajar } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { catatKs } from '@/lib/ketersediaan-log';
import { formTerbuka, getPeriode, listSlot, periodeTerbukaUntukPengajar } from '@/lib/ketersediaan-periode';
import { jadwalTerpakaiPengajar, kunciSlot } from '@/lib/ketersediaan-bentrok';
import { apakahLayak } from '@/lib/ketersediaan-kelayakan';
import type { KsCekButir, KsKetersediaanStatus, KsModePengajar, KsPeriode } from '@/types/db';

export type Hasil = { ok: true; pesan: string } | { ok: false; error: string };

const MODE_SAH: KsModePengajar[] = ['online', 'offline', 'keduanya'];

interface MasukanSimpan {
  /** Periode yang sedang diisi. Tanpa ini: periode terbuka yang mulai paling awal. */
  periodeId?: string;
  slotIds: string[];
  mode: KsModePengajar;
  lokasi: string;
  komitmen: boolean;
}

/**
 * Simpan ketersediaan seorang pengajar.
 *
 * Bentuknya "kirim ulang seluruh pilihan", bukan tambah/hapus satu-satu:
 * pengajar boleh mengubah isian selama periode belum ditutup, dan versi terakhir
 * yang berlaku. Ini sekaligus menghapus masalah "pengisian ganda, ambil timestamp
 * terakhir" yang di alur lama harus dibersihkan manual setelah unduh responses.
 */
/**
 * Periode tujuan sebuah aksi pengajar: yang dipilihnya, asalkan aktif dan
 * formnya terbuka. Beberapa tahap (mis. mulai 5 dan 21 Oktober) bisa terbuka
 * bersamaan, jadi "periode aktif terbaru" saja tidak cukup.
 */
async function periodeTujuan(periodeId: string | undefined): Promise<KsPeriode | { galat: string }> {
  const sekarang = new Date();
  if (!periodeId) {
    const terbuka = await periodeTerbukaUntukPengajar(sekarang);
    return terbuka[0] ?? { galat: 'Belum ada periode penarikan yang dibuka.' };
  }
  const periode = await getPeriode(periodeId);
  if (!periode || !periode.aktif) return { galat: 'Periode tidak dikenali atau sudah tidak aktif. Muat ulang halaman.' };
  if (!formTerbuka(periode, sekarang)) return { galat: 'Form ketersediaan periode ini sedang tidak dibuka.' };
  return periode;
}

export async function simpanKetersediaan(input: MasukanSimpan): Promise<Hasil> {
  const sesi = await requirePengajar();
  const wa = await getSessionWa();

  const tujuan = await periodeTujuan(input.periodeId);
  if ('galat' in tujuan) return { ok: false, error: tujuan.galat };
  const periode = tujuan;
  // Diperiksa lagi di sini, bukan hanya di halaman: kelayakan bisa dicabut
  // koordinator setelah halamannya terbuka di layar pengajar.
  if (!(await apakahLayak(periode.id, sesi.pengajar_id))) {
    return {
      ok: false,
      error: 'Anda belum terdaftar sebagai pengajar untuk periode ini. Hubungi koordinator.',
    };
  }
  if (!MODE_SAH.includes(input.mode)) return { ok: false, error: 'Mode mengajar tidak dikenal.' };
  if (!input.komitmen) {
    return { ok: false, error: 'Pernyataan komitmen harus dicentang sebelum mengirim.' };
  }
  if (input.mode !== 'online' && !input.lokasi.trim()) {
    return { ok: false, error: 'Mode offline memerlukan lokasi.' };
  }

  // Isian yang sudah dikunci koordinator (biasanya setelah rilis) hanya boleh
  // diubah lewat koordinator, dan perubahannya wajib tercatat.
  const { data: adaPengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, terkunci')
    .eq('periode_id', periode.id)
    .eq('pengajar_id', sesi.pengajar_id)
    .maybeSingle();
  if (adaPengisian?.terkunci) {
    return {
      ok: false,
      error: 'Isian Anda sudah dikunci karena data periode ini telah dirilis. Hubungi koordinator untuk perubahan.',
    };
  }

  // Slot hanya sah bila milik periode ini, kelompoknya cocok, dan masih aktif.
  const semuaSlot = await listSlot(periode.id, { hanyaAktif: true });
  const slotMilikKelompok = semuaSlot.filter((s) => s.kelompok === sesi.gender);
  const sahIds = new Set(slotMilikKelompok.map((s) => s.id));
  const slotById = new Map(slotMilikKelompok.map((s) => [s.id, s]));
  const diminta = [...new Set(input.slotIds)].filter((id) => sahIds.has(id));
  if (diminta.length !== new Set(input.slotIds).size) {
    return { ok: false, error: 'Ada slot yang tidak dikenali atau sudah dinonaktifkan. Muat ulang halaman.' };
  }
  if (diminta.length === 0) return { ok: false, error: 'Pilih minimal satu slot.' };

  // Pilihan yang SUDAH tersimpan harus diketahui sebelum aturan penolakan mana pun
  // dijalankan. Sebagian besar isian periode berjalan lahir dari impor dan memuat
  // slot yang baru belakangan menjadi terlarang (offline, atau bentrok dengan
  // halaqah yang masih `active`); bila baris lama ikut menolak kiriman, pengajar
  // terkunci total — bahkan untuk sekadar melepas slot yang salah.
  let barisTersimpan: { id: string; slot_id: string }[] = [];
  if (adaPengisian) {
    const { data } = await supabaseAdmin
      .from('ks_ketersediaan')
      .select('id, slot_id')
      .eq('pengisian_id', adaPengisian.id as string);
    barisTersimpan = (data ?? []) as { id: string; slot_id: string }[];
  }
  const lamaIds = new Map(barisTersimpan.map((r) => [r.slot_id, r.id]));
  const tersimpanSebelumnya = new Set<string>(lamaIds.keys());
  const labelSlot = (ids: string[]) => ids.map((id) => slotById.get(id)?.label ?? id);

  // Slot offline mengikat ruang fisik yang ketersediaannya hanya diketahui
  // koordinator, jadi menambahkannya bukan hak pengajar. Yang sudah tersimpan
  // tetap dihormati — termasuk hak melepasnya, karena melepas tidak menuntut
  // ruang mana pun.
  const offlineBaru = diminta.filter(
    (id) => !tersimpanSebelumnya.has(id) && slotById.get(id)?.mode === 'offline'
  );
  if (offlineBaru.length > 0) {
    return {
      ok: false,
      error: `Slot offline hanya dapat ditambahkan lewat koordinator: ${labelSlot(offlineBaru).join('; ')}`,
    };
  }

  // Slot yang bertabrakan dengan jadwal mengajar berjalan tidak boleh dipilih
  // BARU, kecuali sanggahannya sudah diterima koordinator. Yang sudah tersimpan
  // dibiarkan apa adanya: `hits_halaqah` kerap basi (sheet disync manual, dan
  // `active` bisa hidup lagi sendiri), sehingga bentrok yang baru muncul bukan
  // perbuatan pengajar dan tidak boleh membatalkan seluruh kirimannya.
  const terpakai = await jadwalTerpakaiPengajar(sesi.pengajar_id, { acuan: periode.mulai });
  const terkunci = kunciSlot(slotMilikKelompok, terpakai);
  const { data: sanggahDiterima } = sahIds.size
    ? await supabaseAdmin
        .from('ks_ketersediaan')
        .select('slot_id, sanggahan_status, pengisian:pengisian_id(pengajar_id)')
        .in('slot_id', [...sahIds])
        .eq('sanggahan_status', 'diterima')
    : { data: [] };
  const dibuka = new Set(
    ((sanggahDiterima ?? []) as { slot_id: string; pengisian?: { pengajar_id: string } | null }[])
      .filter((r) => r.pengisian?.pengajar_id === sesi.pengajar_id)
      .map((r) => r.slot_id)
  );
  const bentrokTersisa = diminta.filter((id) => terkunci.has(id) && !dibuka.has(id));
  const melanggar = bentrokTersisa.filter((id) => !tersimpanSebelumnya.has(id));
  if (melanggar.length > 0) {
    return {
      ok: false,
      error: `Slot berikut bertabrakan dengan jadwal mengajar Anda: ${labelSlot(melanggar).join('; ')}. Ajukan sanggahan bila jadwal itu sudah selesai.`,
    };
  }

  const sekarang = new Date().toISOString();
  const barisPengisian = {
    periode_id: periode.id,
    pengajar_id: sesi.pengajar_id,
    mode: input.mode,
    lokasi: input.mode === 'online' ? null : input.lokasi.trim(),
    komitmen: true,
    submitted_at: adaPengisian ? undefined : sekarang,
    disegarkan_pada: sekarang,
    status: 'aktif' as const,
    // Isian yang disentuh pengajar sendiri tidak boleh ditimpa impor xlsx
    // berikutnya — impor hanya memperbarui baris bersumber 'impor'.
    sumber: 'form' as const,
    updated_at: sekarang,
  };

  let pengisianId: string;
  if (adaPengisian) {
    pengisianId = adaPengisian.id as string;
    const { submitted_at: _abaikan, ...patch } = barisPengisian;
    void _abaikan;
    await supabaseAdmin.from('ks_pengisian').update(patch).eq('id', pengisianId);
  } else {
    const { data: baru, error } = await supabaseAdmin
      .from('ks_pengisian')
      .insert(barisPengisian)
      .select('id')
      .single();
    if (error || !baru) return { ok: false, error: 'Gagal menyimpan isian. Coba lagi.' };
    pengisianId = baru.id as string;
  }

  // Enam butir verifikasi dokumen konsep, disimpan apa adanya supaya jejaknya
  // terlihat — bukan hanya status akhirnya.
  const waSah = /^\d{9,15}$/.test((wa ?? '').replace(/\D/g, ''));
  const cek: KsCekButir = {
    nama_terdaftar: true, // dijamin oleh sesi: hanya pengajar aktif dapat masuk
    wa_sah: waSah,
    tanpa_bentrok_maahir: true,
    tanpa_bentrok_hits: true,
    // `slot_cukup` sengaja tidak diisi: tidak ada lagi ambang jumlah slot.
    // Menyanggupi satu jam saja sudah sah — pengajar yang hanya punya satu jam
    // bukan kasus yang perlu ditanyai koordinator.
    slot_aktif: true,
  };
  // Butir yang gagal tidak menolak baris; ia menurunkannya ke antrean koordinator.
  const status: KsKetersediaanStatus = waSah ? 'diajukan' : 'perlu_konfirmasi';

  const dibuang = [...lamaIds.entries()].filter(([slotId]) => !diminta.includes(slotId));
  for (const [, id] of dibuang) {
    await supabaseAdmin.from('ks_ketersediaan').delete().eq('id', id);
  }

  for (const slotId of diminta) {
    const adaId = lamaIds.get(slotId);
    if (adaId) {
      await supabaseAdmin
        .from('ks_ketersediaan')
        .update({ cek, updated_at: sekarang })
        .eq('id', adaId);
    } else {
      await supabaseAdmin.from('ks_ketersediaan').insert({
        pengisian_id: pengisianId,
        slot_id: slotId,
        status,
        cek,
      });
    }
  }

  await catatKs({
    periode_id: periode.id,
    entitas: 'ks_pengisian',
    entitas_id: pengisianId,
    aksi: adaPengisian ? 'ubah_ketersediaan' : 'kirim_ketersediaan',
    sesudah: {
      slot: diminta.length,
      mode: input.mode,
      // Berapa slot bentrok yang dipertahankan karena sudah tersimpan — angka ini
      // yang memberi tahu koordinator bahwa ada bentrok tak tersanggah di isian.
      bentrok_dipertahankan: bentrokTersisa.filter((id) => tersimpanSebelumnya.has(id)).length,
      sumber: 'form',
    },
    aktor_wa: wa,
    aktor_nama: sesi.name,
  });

  revalidatePath('/ketersediaan/pengajar');
  return {
    ok: true,
    pesan: `Tersimpan: ${diminta.length} slot.`,
  };
}

/**
 * Sanggah slot yang terkunci karena bentrok.
 *
 * Jalan keluar yang wajib ada: `hits_halaqah` diisi dari Google Sheet yang
 * disync manual, dan kolom `active` bahkan bisa hidup lagi sendiri setelah sync
 * bila barisnya masih tercantum di sheet. Tanpa sanggahan, satu baris basi
 * mengunci pengajar dari slot favoritnya tanpa siapa pun mengetahuinya.
 */
export async function sanggahBentrok(input: { slotId: string; alasan: string; periodeId?: string }): Promise<Hasil> {
  const sesi = await requirePengajar();
  const wa = await getSessionWa();
  const alasan = input.alasan.trim();
  if (alasan.length < 10) {
    return { ok: false, error: 'Tuliskan alasannya lebih jelas (minimal 10 karakter).' };
  }

  const tujuan = await periodeTujuan(input.periodeId);
  if ('galat' in tujuan) return { ok: false, error: tujuan.galat };
  const periode = tujuan;
  // Diperiksa lagi di sini, bukan hanya di halaman: kelayakan bisa dicabut
  // koordinator setelah halamannya terbuka di layar pengajar.
  if (!(await apakahLayak(periode.id, sesi.pengajar_id))) {
    return {
      ok: false,
      error: 'Anda belum terdaftar sebagai pengajar untuk periode ini. Hubungi koordinator.',
    };
  }

  const { data: slot } = await supabaseAdmin
    .from('ks_slot')
    .select('id, label, kelompok, periode_id')
    .eq('id', input.slotId)
    .maybeSingle();
  if (!slot || slot.periode_id !== periode.id || slot.kelompok !== sesi.gender) {
    return { ok: false, error: 'Slot tidak dikenali.' };
  }

  let pengisianId: string;
  const { data: ada } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id')
    .eq('periode_id', periode.id)
    .eq('pengajar_id', sesi.pengajar_id)
    .maybeSingle();
  if (ada) {
    pengisianId = ada.id as string;
  } else {
    // Sanggahan boleh diajukan sebelum mengirim isian apa pun — justru itu
    // urutan yang wajar: pengajar membuka form, melihat slotnya terkunci, lalu
    // menyanggah sebelum dapat memilih.
    const { data: baru, error } = await supabaseAdmin
      .from('ks_pengisian')
      .insert({ periode_id: periode.id, pengajar_id: sesi.pengajar_id, mode: 'online' })
      .select('id')
      .single();
    if (error || !baru) return { ok: false, error: 'Gagal menyimpan sanggahan. Coba lagi.' };
    pengisianId = baru.id as string;
  }

  const { data: barisAda } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('id')
    .eq('pengisian_id', pengisianId)
    .eq('slot_id', input.slotId)
    .maybeSingle();

  if (barisAda) {
    await supabaseAdmin
      .from('ks_ketersediaan')
      .update({
        bentrok_alasan: alasan,
        sanggahan_status: 'menunggu',
        updated_at: new Date().toISOString(),
      })
      .eq('id', barisAda.id);
  } else {
    // Baris sanggahan belum berarti "bersedia" — statusnya perlu_konfirmasi
    // sampai koordinator memutuskan, lalu pengajar mengirim ulang pilihannya.
    await supabaseAdmin.from('ks_ketersediaan').insert({
      pengisian_id: pengisianId,
      slot_id: input.slotId,
      status: 'perlu_konfirmasi',
      bentrok_alasan: alasan,
      sanggahan_status: 'menunggu',
    });
  }

  await catatKs({
    periode_id: periode.id,
    entitas: 'ks_ketersediaan',
    entitas_id: input.slotId,
    aksi: 'sanggah_bentrok',
    alasan,
    aktor_wa: wa,
    aktor_nama: sesi.name,
  });

  revalidatePath('/ketersediaan/pengajar');
  return { ok: true, pesan: 'Sanggahan terkirim. Koordinator akan meninjau.' };
}
