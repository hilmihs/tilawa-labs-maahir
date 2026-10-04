'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOneOfRoles } from '@/lib/session';
import { getAdminActor, requireAdmin } from '@/lib/admin-guard';
import { getPool } from '@/lib/pg-core';
import { getSessionWa } from '@/lib/program-kelas';
import { absUrl } from '@/lib/url';
import {
  buildWaMeUrl,
  tplAnulirKetersediaan,
  tplButuhPengajarSlot,
  tplSegarkanKetersediaan,
} from '@/lib/whatsapp';
import { tautanWaKonfirmasi } from './data';
import { catatKs } from '@/lib/ketersediaan-log';
import { layakMenurutDaftar, listKelayakan } from '@/lib/ketersediaan-kelayakan';
import { getPeriode, getPeriodeAktif, listSlot, siapkanSlot, SLOT_BAWAAN } from '@/lib/ketersediaan-periode';
import { ringkasSlot } from '@/lib/ketersediaan-permintaan';
import { catatRiwayatPeriode } from '@/lib/ketersediaan-ditahan';
import { susunLabel, uraikanSlot } from '@/lib/ketersediaan-slot';
import { identitasPendaftar, tarikSumber, tebakPemetaan } from '@/lib/ketersediaan-pendaftar';
import { identitasTerpakaiLintasPeriode } from '@/lib/ketersediaan-lintas-periode';
import { parseCsv } from '@/lib/csv';
import { ambilCsvTerbit, urlCsvSah } from '@/lib/ketersediaan-csv-url';
import { uraiLibur } from '@/lib/ketersediaan-pertemuan';
import { jalankanAlokasi } from '@/lib/ketersediaan-jalankan';
import {
  geserYangKedaluwarsa,
  tanggalMulaiBawaan,
  tenggatDari,
  terbitkanToken,
} from '@/lib/ketersediaan-konfirmasi';
import type { Gender, KsPemetaanKolom, KsPendaftarSumber, KsPrioritasPreset } from '@/types/db';

export type Hasil = { ok: true; pesan: string; data?: unknown } | { ok: false; error: string };

async function aktor(): Promise<{ wa: string | null; nama: string }> {
  const sesi = await requireOneOfRoles(['koordinator']);
  return { wa: await getSessionWa(), nama: sesi.name };
}

function segarkan(): void {
  revalidatePath('/ketersediaan/koordinator');
  revalidatePath('/ketersediaan/pengajar');
}

// ── Periode & slot ─────────────────────────────────────────────────────────

export async function buatPeriode(input: {
  nama: string;
  mulai: string;
  selesai: string;
  kapasitas: number;
  isiSlotBawaan: boolean;
}): Promise<Hasil> {
  const a = await aktor();
  if (!input.nama.trim()) return { ok: false, error: 'Nama periode wajib diisi.' };
  if (!input.mulai || !input.selesai) return { ok: false, error: 'Tanggal mulai dan selesai wajib diisi.' };
  if (input.selesai < input.mulai) return { ok: false, error: 'Tanggal selesai lebih awal dari tanggal mulai.' };

  const { data: periode, error } = await supabaseAdmin
    .from('ks_periode')
    .insert({
      nama: input.nama.trim(),
      mulai: input.mulai,
      selesai: input.selesai,
      // 0 = tanpa ambang. Ambang jumlah slot dihapus: pengajar yang hanya
      // sanggup satu jam tetap isian yang sah, bukan kasus untuk koordinator.
      minimal_slot: 0,
      kapasitas_halaqah: Math.max(1, Math.min(100, input.kapasitas)),
      // Bergulir: form tidak pernah ditutup kecuali koordinator menutupnya sendiri.
      form_tutup: null,
    })
    .select('*')
    .single();
  if (error || !periode) {
    return { ok: false, error: `Gagal membuat periode${error?.message ? `: ${error.message}` : '.'}` };
  }

  let jumlahSlot = 0;
  if (input.isiSlotBawaan) {
    const { baris, gagal } = siapkanSlot(periode.id as string, SLOT_BAWAAN);
    for (const b of baris) {
      await supabaseAdmin.from('ks_slot').insert(b);
      jumlahSlot++;
    }
    if (gagal.length > 0) {
      await catatKs({
        periode_id: periode.id as string,
        entitas: 'ks_slot',
        aksi: 'slot_bawaan_gagal_diurai',
        sesudah: { gagal },
        aktor_wa: a.wa,
        aktor_nama: a.nama,
      });
    }
  }

  await catatKs({
    periode_id: periode.id as string,
    entitas: 'ks_periode',
    entitas_id: periode.id as string,
    aksi: 'buat_periode',
    sesudah: { nama: input.nama, slot: jumlahSlot },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });

  segarkan();
  return {
    ok: true,
    pesan: `Periode dibuat${jumlahSlot ? ` dengan ${jumlahSlot} slot bawaan` : ''}. Slot offline masih berlokasi "Belum ditentukan" — mohon diisi sebelum dipakai.`,
    data: { id: periode.id as string },
  };
}

export async function ubahAturanPeriode(input: {
  periodeId: string;
  nama: string;
  mulai: string;
  selesai: string;
  /** Satu libur per baris, lihat `uraiLibur`. */
  liburTeks: string;
  kapasitas: number;
  ambangBentuk: number;
  ambangBawah: number;
  usiaAntreanMaksHari: number;
  jedaMulaiHari: number;
  tenggatKonfirmasiJam: number;
  penyegaranHari: number;
  jumlahPertemuanDasar: number;
  jumlahPertemuanLanjutan: number;
}): Promise<Hasil> {
  const a = await aktor();
  const lama = await getPeriode(input.periodeId);
  if (!lama) return { ok: false, error: 'Periode tidak ditemukan.' };
  // Dijepit ke batas CHECK di 0063/0072/0077 — angka di luar batas akan ditolak
  // basis data dan, sebelum perbaikan ini, ditelan diam-diam.
  input = {
    ...input,
    kapasitas: jepit(input.kapasitas, 1, 100),
    ambangBentuk: jepit(input.ambangBentuk, 1, 100),
    ambangBawah: jepit(input.ambangBawah, 1, 100),
    usiaAntreanMaksHari: jepit(input.usiaAntreanMaksHari, 1, 365),
    jedaMulaiHari: jepit(input.jedaMulaiHari, 0, 90),
    tenggatKonfirmasiJam: jepit(input.tenggatKonfirmasiJam, 1, 720),
    penyegaranHari: jepit(input.penyegaranHari, 1, 365),
    jumlahPertemuanDasar: jepit(input.jumlahPertemuanDasar, 0, 200),
    jumlahPertemuanLanjutan: jepit(input.jumlahPertemuanLanjutan, 0, 200),
  };
  if (input.ambangBawah > input.ambangBentuk) {
    return { ok: false, error: 'Ambang bawah tidak boleh melebihi ambang bentuk.' };
  }
  const nama = input.nama.trim();
  if (!nama) return { ok: false, error: 'Nama periode wajib diisi.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.mulai) || !/^\d{4}-\d{2}-\d{2}$/.test(input.selesai)) {
    return { ok: false, error: 'Tanggal mulai dan selesai wajib diisi.' };
  }
  if (input.selesai < input.mulai) return { ok: false, error: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' };
  const { libur, galat } = uraiLibur(input.liburTeks);
  if (galat.length > 0) return { ok: false, error: `Daftar libur belum benar:\n${galat.join('\n')}` };

  const patch = {
    nama,
    mulai: input.mulai,
    selesai: input.selesai,
    libur,
    kapasitas_halaqah: input.kapasitas,
    ambang_bentuk: input.ambangBentuk,
    ambang_bawah: input.ambangBawah,
    usia_antrean_maks_hari: input.usiaAntreanMaksHari,
    jeda_mulai_hari: input.jedaMulaiHari,
    tenggat_konfirmasi_jam: input.tenggatKonfirmasiJam,
    penyegaran_hari: input.penyegaranHari,
    jumlah_pertemuan_dasar: input.jumlahPertemuanDasar,
    jumlah_pertemuan_lanjutan: input.jumlahPertemuanLanjutan,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from('ks_periode').update(patch).eq('id', input.periodeId);
  if (error) return { ok: false, error: `Aturan tidak tersimpan: ${error.message}` };

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_periode',
    entitas_id: input.periodeId,
    aksi: 'ubah_aturan',
    sebelum: {
      nama: lama.nama,
      mulai: lama.mulai,
      selesai: lama.selesai,
      libur: lama.libur,
      minimal_slot: lama.minimal_slot,
      kapasitas_halaqah: lama.kapasitas_halaqah,
      ambang_bentuk: lama.ambang_bentuk,
      ambang_bawah: lama.ambang_bawah,
    },
    sesudah: patch,
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: 'Aturan periode diperbarui.' };
}

/** Bilangan bulat di dalam [min, max]; NaN jatuh ke min. */
function jepit(n: number, min: number, max: number): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

export async function tambahSlot(input: {
  periodeId: string;
  kelompok: 'ikhwan' | 'akhwat';
  mode: 'online' | 'offline';
  teks: string;
  lokasi: string;
}): Promise<Hasil> {
  const a = await aktor();
  const urai = uraikanSlot(input.teks);
  if (!urai) {
    return {
      ok: false,
      error: 'Teks slot tidak terbaca. Contoh yang benar: "Senin & Rabu 06:00 - 07:30 WIB".',
    };
  }
  if (input.mode === 'offline' && !input.lokasi.trim()) {
    return { ok: false, error: 'Slot offline wajib berlokasi.' };
  }

  const label = urai.label;
  const adaSlot = await listSlot(input.periodeId);
  if (
    adaSlot.some(
      (s) => s.kelompok === input.kelompok && s.mode === input.mode && s.label === label
    )
  ) {
    return { ok: false, error: 'Slot dengan kombinasi kelompok, mode, dan waktu itu sudah ada.' };
  }

  await supabaseAdmin.from('ks_slot').insert({
    periode_id: input.periodeId,
    kelompok: input.kelompok,
    mode: input.mode,
    label,
    hari: urai.hari,
    hari_idx: urai.hari_idx,
    waktu_mulai: urai.waktu_mulai,
    waktu_selesai: urai.waktu_selesai,
    lokasi: input.mode === 'offline' ? input.lokasi.trim() : null,
    urutan: adaSlot.length,
  });

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_slot',
    aksi: 'tambah_slot',
    sesudah: { label, kelompok: input.kelompok, mode: input.mode },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: `Slot "${label}" ditambahkan.` };
}

/**
 * Nonaktifkan slot, jangan hapus — aturan eksplisit dokumen konsep. Baris yang
 * sudah memakai slot itu tetap punya rujukan yang sah, dan riwayatnya utuh.
 */
export async function alihSlotAktif(input: { slotId: string; aktif: boolean }): Promise<Hasil> {
  const a = await aktor();
  const { data: slot } = await supabaseAdmin
    .from('ks_slot')
    .select('id, label, periode_id, aktif')
    .eq('id', input.slotId)
    .maybeSingle();
  if (!slot) return { ok: false, error: 'Slot tidak ditemukan.' };

  await supabaseAdmin
    .from('ks_slot')
    .update({ aktif: input.aktif, updated_at: new Date().toISOString() })
    .eq('id', input.slotId);

  await catatKs({
    periode_id: slot.periode_id as string,
    entitas: 'ks_slot',
    entitas_id: input.slotId,
    aksi: input.aktif ? 'aktifkan_slot' : 'nonaktifkan_slot',
    sebelum: { aktif: slot.aktif },
    sesudah: { aktif: input.aktif },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: `Slot "${slot.label}" ${input.aktif ? 'diaktifkan' : 'dinonaktifkan'}.` };
}

// ── Verifikasi & sanggahan ─────────────────────────────────────────────────

export async function putuskanSanggahan(input: {
  ketersediaanId: string;
  terima: boolean;
  catatan: string;
}): Promise<Hasil> {
  const a = await aktor();
  const { data: baris } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('id, slot_id, bentrok_alasan, pengisian:pengisian_id(periode_id)')
    .eq('id', input.ketersediaanId)
    .maybeSingle();
  if (!baris) return { ok: false, error: 'Baris tidak ditemukan.' };

  await supabaseAdmin
    .from('ks_ketersediaan')
    .update({
      sanggahan_status: input.terima ? 'diterima' : 'ditolak',
      sanggahan_catatan: input.catatan.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.ketersediaanId);

  const pengisian = baris.pengisian as { periode_id: string } | null;
  await catatKs({
    periode_id: pengisian?.periode_id ?? null,
    entitas: 'ks_ketersediaan',
    entitas_id: input.ketersediaanId,
    aksi: input.terima ? 'terima_sanggahan' : 'tolak_sanggahan',
    alasan: input.catatan.trim() || (baris.bentrok_alasan as string | null),
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return {
    ok: true,
    pesan: input.terima
      ? 'Sanggahan diterima — slot terbuka untuk pengajar itu. Pengajar perlu mengirim ulang pilihannya.'
      : 'Sanggahan ditolak — slot tetap terkunci.',
  };
}

export async function ubahStatusVerifikasi(input: {
  ketersediaanId: string;
  status: 'terverifikasi' | 'perlu_konfirmasi' | 'ditolak';
  catatan: string;
}): Promise<Hasil> {
  const a = await aktor();
  const { data: baris } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('id, status, pengisian:pengisian_id(periode_id)')
    .eq('id', input.ketersediaanId)
    .maybeSingle();
  if (!baris) return { ok: false, error: 'Baris tidak ditemukan.' };
  if (input.status === 'ditolak' && !input.catatan.trim()) {
    return { ok: false, error: 'Penolakan wajib disertai alasan — dokumen konsep menuntut jejaknya.' };
  }

  await supabaseAdmin
    .from('ks_ketersediaan')
    .update({
      status: input.status,
      catatan: input.catatan.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.ketersediaanId);

  const pengisian = baris.pengisian as { periode_id: string } | null;
  await catatKs({
    periode_id: pengisian?.periode_id ?? null,
    entitas: 'ks_ketersediaan',
    entitas_id: input.ketersediaanId,
    aksi: 'ubah_status_verifikasi',
    sebelum: { status: baris.status },
    sesudah: { status: input.status },
    alasan: input.catatan.trim() || null,
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: 'Status verifikasi diperbarui.' };
}

// ── Sumber pendaftar ───────────────────────────────────────────────────────

export async function simpanSumberPendaftar(input: {
  periodeId: string;
  sumberId?: string;
  nama: string;
  csvUrl: string;
  pemetaan: KsPemetaanKolom;
}): Promise<Hasil> {
  const a = await aktor();
  const sah = urlCsvSah(input.csvUrl);
  if (!sah.ok) return { ok: false, error: sah.error };

  if (input.sumberId) {
    await supabaseAdmin
      .from('ks_pendaftar_sumber')
      .update({
        nama: input.nama.trim(),
        csv_url: input.csvUrl.trim(),
        pemetaan_kolom: input.pemetaan,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.sumberId);
  } else {
    await supabaseAdmin.from('ks_pendaftar_sumber').insert({
      periode_id: input.periodeId,
      nama: input.nama.trim() || 'Responses pendaftaran',
      csv_url: input.csvUrl.trim(),
      pemetaan_kolom: input.pemetaan,
    });
  }

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_pendaftar_sumber',
    aksi: input.sumberId ? 'ubah_sumber' : 'tambah_sumber',
    sesudah: { nama: input.nama, kolom: Object.keys(input.pemetaan) },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: 'Sumber pendaftar tersimpan.' };
}

/**
 * Baca kepala CSV lalu usulkan pemetaan kolom. Dipanggil sebelum menyimpan,
 * supaya koordinator melihat kolom apa saja yang benar-benar ada di sheet.
 */
export async function intipKolomCsv(input: { csvUrl: string }): Promise<Hasil> {
  await aktor();
  try {
    const teks = await ambilCsvTerbit(input.csvUrl);
    // Judul kolom Google Form lazim memuat koma ("Pilihan Jam Belajar (WIB, 90 menit)"),
    // jadi kepala dibaca pengurai CSV, bukan dipecah koma.
    const kepala = (parseCsv(teks)[0] ?? []).map((h) => h.trim()).filter(Boolean);
    return { ok: true, pesan: `${kepala.length} kolom terbaca.`, data: { kepala, usulan: tebakPemetaan(kepala) } };
  } catch (e) {
    // Pesan dari ambilCsvTerbit sudah ramah; galat jaringan mentah tidak dipantulkan.
    const pesan = (e as Error).message;
    return { ok: false, error: /^(Gagal|Sheet|CSV|Gunakan|Tautan|URL)/.test(pesan) ? pesan : 'Gagal membuka CSV. Periksa tautan dan coba lagi.' };
  }
}

/**
 * Hentikan atau lanjutkan penarikan satu CSV. Pendaftar yang sudah tertarik tetap
 * di antrean — menonaktifkan hanya berarti link itu tidak ditarik lagi.
 */
export async function aturSumberAktif(input: { periodeId: string; sumberId: string; aktif: boolean }): Promise<Hasil> {
  const a = await aktor();
  await supabaseAdmin
    .from('ks_pendaftar_sumber')
    .update({ aktif: input.aktif, updated_at: new Date().toISOString() })
    .eq('id', input.sumberId)
    .eq('periode_id', input.periodeId);
  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_pendaftar_sumber',
    aksi: input.aktif ? 'aktifkan_sumber' : 'nonaktifkan_sumber',
    sesudah: { sumber_id: input.sumberId },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: input.aktif ? 'CSV kembali ditarik.' : 'CSV tidak ditarik lagi. Pendaftar yang sudah masuk tetap di antrean.' };
}

/** Tarik semua CSV aktif periode ini, atau satu CSV saja bila `sumberId` diberikan. */
export async function tarikPendaftarSekarang(input: { periodeId: string; sumberId?: string }): Promise<Hasil> {
  const a = await aktor();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };

  let kueri = supabaseAdmin
    .from('ks_pendaftar_sumber')
    .select('*')
    .eq('periode_id', input.periodeId)
    .eq('aktif', true);
  if (input.sumberId) kueri = kueri.eq('id', input.sumberId);
  const { data: sumberRows } = await kueri.order('created_at', { ascending: true });
  const sumber = (sumberRows ?? []) as KsPendaftarSumber[];
  if (sumber.length === 0) return { ok: false, error: 'Belum ada sumber pendaftar yang aktif.' };

  const sekarang = new Date();
  const ringkas: string[] = [];

  for (const s of sumber) {
    try {
      const h = await tarikSumber(s, periode, sekarang);
      ringkas.push(
        `${s.nama}: ${h.dibaca} baris → ${h.baru} baru, ${h.diperbarui} diperbarui, ${h.ditahan} ditahan, ${h.diganti} diganti kiriman baru, ${h.jamBaru} jam baru di master` +
          (h.peringatan.length ? ` — ${h.peringatan.join('; ')}` : '')
      );
    } catch (e) {
      const pesan = (e as Error).message;
      ringkas.push(`${s.nama}: GAGAL — ${pesan}`);
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

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_pendaftar',
    aksi: 'tarik_pendaftar',
    sesudah: { ringkas },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: ringkas.join(' | ') };
}

// ── Alokasi & konfirmasi ───────────────────────────────────────────────────

export async function jalankanAlokasiSekarang(input: {
  periodeId: string;
  presetIkhwanId?: string | null;
  presetAkhwatId?: string | null;
}): Promise<Hasil> {
  const a = await aktor();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };

  const ambil = async (id?: string | null): Promise<KsPrioritasPreset | null> => {
    if (!id) return null;
    const { data } = await supabaseAdmin.from('ks_prioritas_preset').select('*').eq('id', id).maybeSingle();
    return (data as KsPrioritasPreset | null) ?? null;
  };

  const hasil = await jalankanAlokasi(periode, {
    presetIkhwan: await ambil(input.presetIkhwanId),
    presetAkhwat: await ambil(input.presetAkhwatId),
    aktor: a,
  });

  segarkan();
  return {
    ok: true,
    pesan:
      `${hasil.usulanBaru} usulan halaqah dibentuk (${hasil.pesertaTerpakai} murid, ${hasil.putaran} putaran). ` +
      (hasil.dilewati > 0
        ? `${hasil.dilewati} penempatan dilewati karena data berubah saat ditulis — jalankan lagi bila perlu. `
        : '') +
      (hasil.tanpaPengajar > 0
        ? `${hasil.tanpaPengajar} kelompok siap tetapi belum ada pengajarnya.`
        : 'Semua kelompok mendapat pengajar.'),
  };
}

/**
 * Deklarasikan halaqah penuh: terbitkan token, siapkan tautan wa.me.
 * Pengiriman tetap lewat manusia — maahir tidak punya gateway WhatsApp, dan
 * membangun satu bukan bagian dari pekerjaan ini.
 */
export async function setujuiUsulan(input: { usulanId: string; tanggalMulai?: string }): Promise<Hasil> {
  const a = await aktor();
  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, periode_id, status, level, pengajar_id, slot:slot_id(label), pengajar:pengajar_id(name, gender, whatsapp_number)'
    )
    .eq('id', input.usulanId)
    .maybeSingle();
  if (!usulan) return { ok: false, error: 'Usulan tidak ditemukan.' };
  if (usulan.status !== 'usulan' && usulan.status !== 'disetujui') {
    return { ok: false, error: `Usulan berstatus "${usulan.status}" tidak dapat disetujui lagi.` };
  }
  const pengajar = usulan.pengajar as { name: string; gender: 'ikhwan' | 'akhwat'; whatsapp_number: string } | null;
  const slot = usulan.slot as { label: string } | null;
  if (!pengajar || !slot) return { ok: false, error: 'Data pengajar atau slot tidak lengkap.' };

  const periode = await getPeriode(usulan.periode_id as string);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };

  // Periode lain bisa melahirkan usulan untuk orang yang sama setelah alokasi ini
  // dijalankan. Periksa sebelum pengajar dihubungi.
  const [{ data: identitasPeserta }, terpakaiLain] = await Promise.all([
    supabaseAdmin
      .from('ks_usulan_peserta')
      .select('pendaftar:pendaftar_id(wa_normal, nama)')
      .eq('usulan_id', input.usulanId),
    identitasTerpakaiLintasPeriode(usulan.periode_id as string),
  ]);
  const sudahDiLain = ((identitasPeserta ?? []) as {
    pendaftar?: { wa_normal: string | null; nama: string } | null;
  }[])
    .map((p) => (p.pendaftar ? identitasPendaftar(p.pendaftar.wa_normal, p.pendaftar.nama) : null))
    .filter((id): id is string => id !== null && terpakaiLain.has(id));
  if (sudahDiLain.length > 0) {
    return {
      ok: false,
      error: `${sudahDiLain.length} peserta usulan ini sudah mendapat halaqah di ${terpakaiLain.get(sudahDiLain[0])}. Batalkan usulan ini, lalu jalankan alokasi lagi.`,
    };
  }

  const sekarang = new Date();
  const mulaiPeriode = periode.mulai.slice(0, 10);
  let mulai: string;
  if (input.tanggalMulai) {
    if (!tanggalSah(input.tanggalMulai)) return { ok: false, error: 'Tanggal mulai harus berformat YYYY-MM-DD.' };
    if (input.tanggalMulai < mulaiPeriode) {
      return { ok: false, error: `Tanggal mulai tidak boleh sebelum KBM periode (${mulaiPeriode}).` };
    }
    mulai = input.tanggalMulai;
  } else {
    // Bawaan: hari ini + jeda, tetapi tidak pernah sebelum KBM periode dimulai.
    const bawaan = tanggalMulaiBawaan(periode, sekarang);
    mulai = bawaan > mulaiPeriode ? bawaan : mulaiPeriode;
  }
  const token = terbitkanToken();
  const tenggat = tenggatDari(periode, sekarang);

  const { data: pesertaRows } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('id')
    .eq('usulan_id', input.usulanId);
  const jumlahPeserta = (pesertaRows ?? []).length;

  // Dijaga status: klik ganda atau dua koordinator bersamaan tidak boleh
  // menerbitkan token kedua — token pertama yang sudah dikirim akan mati.
  const { data: berubah, error } = await supabaseAdmin
    .from('ks_usulan')
    .update({
      status: 'menunggu',
      akses_token: token,
      token_kedaluwarsa: tenggat,
      tanggal_mulai: mulai,
      updated_at: sekarang.toISOString(),
    })
    .eq('id', input.usulanId)
    .eq('status', usulan.status as string)
    .select('id');
  if (error) return { ok: false, error: `Gagal menyetujui: ${error.message}` };
  if (!berubah || (berubah as unknown[]).length === 0) {
    return { ok: false, error: 'Usulan ini baru saja diproses orang lain. Muat ulang halaman — tautan WA ada di kartunya.' };
  }

  const { waUrl, konfirmasiUrl } = tautanWaKonfirmasi({
    token,
    tenggat,
    tanggalMulai: mulai,
    pengajar,
    slotLabel: slot.label,
    level: usulan.level as string,
    jumlahPeserta,
  });

  await catatKs({
    periode_id: usulan.periode_id as string,
    entitas: 'ks_usulan',
    entitas_id: input.usulanId,
    aksi: 'deklarasi_penuh',
    sesudah: { tanggal_mulai: mulai, tenggat },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();

  return {
    ok: true,
    pesan: `Tautan konfirmasi untuk ${pengajar.name} (${slot.label}) siap dikirim. Tombol "Kirim WA" juga tersedia di kartunya.`,
    data: { waUrl, konfirmasiUrl, pengajar: pengajar.name },
  };
}

/** YYYY-MM-DD yang benar-benar ada di kalender. */
function tanggalSah(t: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

export async function batalkanUsulan(input: { usulanId: string; alasan: string }): Promise<Hasil> {
  const a = await aktor();
  if (!input.alasan.trim()) return { ok: false, error: 'Pembatalan wajib disertai alasan.' };

  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .select('id, periode_id, status, tilawah_halaqah_id')
    .eq('id', input.usulanId)
    .maybeSingle();
  if (!usulan) return { ok: false, error: 'Usulan tidak ditemukan.' };
  if (usulan.status === 'dikirim' || usulan.tilawah_halaqah_id) {
    return {
      ok: false,
      error: 'Halaqah ini sudah dibuat di CMS tilawah — batalkan dulu di sana, karena CMS tidak bisa dihapus dari sini.',
    };
  }
  if (usulan.status === 'batal') return { ok: false, error: 'Usulan ini sudah dibatalkan.' };

  // Satu langkah outbox yang sudah terkirim berarti ada data nyata di CMS
  // (mis. akun murid), walau halaqahnya belum tercatat di sini.
  const { data: terkirim } = await supabaseAdmin
    .from('ks_outbox')
    .select('id')
    .eq('usulan_id', input.usulanId)
    .eq('status', 'terkirim')
    .limit(1);
  if ((terkirim ?? []).length > 0) {
    return {
      ok: false,
      error: 'Sebagian data usulan ini sudah terkirim ke CMS tilawah. Bereskan dulu di CMS, baru batalkan di sini.',
    };
  }

  // Peserta dikembalikan ke antrean, tidak dibuang: mereka tetap berhak.
  // Satu transaksi: usulan batal tanpa pesertanya kembali = murid hilang dari antrean.
  const client = await getPool().connect();
  let kembali = 0;
  try {
    await client.query('BEGIN');
    const { rows: kunci } = await client.query<{ status: string }>(
      'select status from ks_usulan where id = $1 for update',
      [input.usulanId]
    );
    if (!kunci[0] || kunci[0].status !== usulan.status) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Status usulan berubah saat dibatalkan. Muat ulang halaman.' };
    }
    const r = await client.query(
      `update ks_pendaftar set status = 'valid', updated_at = now()
        where status = 'dialokasikan'
          and id in (select pendaftar_id from ks_usulan_peserta where usulan_id = $1)`,
      [input.usulanId]
    );
    kembali = r.rowCount ?? 0;
    await client.query('delete from ks_usulan_peserta where usulan_id = $1', [input.usulanId]);
    await client.query(
      `update ks_usulan set status = 'batal', akses_token = null, alasan_tolak = $2, updated_at = now()
        where id = $1`,
      [input.usulanId, input.alasan.trim()]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, error: `Gagal membatalkan: ${(e as Error).message}` };
  } finally {
    client.release();
  }

  await catatKs({
    periode_id: usulan.periode_id as string,
    entitas: 'ks_usulan',
    entitas_id: input.usulanId,
    aksi: 'batalkan_usulan',
    sebelum: { status: usulan.status },
    sesudah: { status: 'batal', peserta_kembali: kembali },
    alasan: input.alasan.trim(),
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: `Usulan dibatalkan, ${kembali} peserta kembali ke antrean.` };
}

export async function sapuKedaluwarsa(input: { periodeId: string }): Promise<Hasil> {
  const a = await aktor();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };
  const h = await geserYangKedaluwarsa(periode, new Date());
  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_usulan',
    aksi: 'sapu_kedaluwarsa',
    sesudah: h,
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return {
    ok: true,
    pesan: `${h.digeser} usulan digeser ke prioritas berikutnya, ${h.tanpaPengganti} tanpa pengganti.`,
  };
}

/**
 * Nyalakan pengiriman nyata ke CMS tilawah untuk satu periode.
 * Dikunci superadmin: CMS tidak menyediakan endpoint hapus, sehingga halaqah
 * dan akun murid yang salah terkirim hanya bisa dibereskan manual dari dalam CMS.
 */
export async function nyalakanKirimNyata(input: {
  periodeId: string;
  nyala: boolean;
  /** Wajib saat menyalakan: nama periode diketik ulang, penahan klik tak sengaja. */
  konfirmasiNama?: string;
}): Promise<Hasil> {
  const a = await aktor();
  const admin = await requireAdmin();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };
  if (input.nyala && (!periode.tilawah_batch_id || !periode.tilawah_program_id)) {
    return { ok: false, error: 'Tetapkan program dan batch tujuan di CMS tilawah terlebih dahulu.' };
  }
  if (input.nyala && (input.konfirmasiNama ?? '').trim() !== periode.nama.trim()) {
    return { ok: false, error: `Ketik nama periode persis "${periode.nama}" untuk menyalakan pengiriman nyata.` };
  }

  const { error } = await supabaseAdmin
    .from('ks_periode')
    .update({ kirim_nyata: input.nyala, updated_at: new Date().toISOString() })
    .eq('id', input.periodeId);
  if (error) return { ok: false, error: `Gagal mengubah: ${error.message}` };
  // Nama superadmin yang sebenarnya, juga saat sedang "login sebagai" orang lain.
  const pelaku = await getAdminActor();

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_periode',
    entitas_id: input.periodeId,
    aksi: input.nyala ? 'nyalakan_kirim_nyata' : 'matikan_kirim_nyata',
    aktor_wa: admin.wa,
    aktor_nama: pelaku?.name ?? a.nama,
  });
  segarkan();
  return {
    ok: true,
    pesan: input.nyala
      ? 'Pengiriman nyata dinyalakan. Outbox berikutnya akan memanggil CMS tilawah.'
      : 'Pengiriman nyata dimatikan. Outbox kembali hanya mencatat payload.',
  };
}

export async function tetapkanTujuanTilawah(input: {
  periodeId: string;
  programId: number | null;
  batchId: number | null;
}): Promise<Hasil> {
  const a = await aktor();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };
  // Mengganti tujuan saat pengiriman nyata menyala membuat sebagian halaqah
  // mendarat di batch lama dan sisanya di batch baru — tak bisa dihapus di CMS.
  if (periode.kirim_nyata) {
    return { ok: false, error: 'Matikan pengiriman nyata dulu (superadmin) sebelum mengganti tujuan CMS tilawah.' };
  }
  await supabaseAdmin
    .from('ks_periode')
    .update({
      tilawah_program_id: input.programId,
      tilawah_batch_id: input.batchId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.periodeId);

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_periode',
    entitas_id: input.periodeId,
    aksi: 'tetapkan_tujuan_tilawah',
    sesudah: { program: input.programId, batch: input.batchId },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: 'Tujuan CMS tilawah tersimpan.' };
}

/** Periode aktif untuk dipakai komponen klien tanpa menebak. */
export async function periodeAktifRingkas(): Promise<Hasil> {
  await aktor();
  const p = await getPeriodeAktif();
  return p
    ? { ok: true, pesan: p.nama, data: { id: p.id, nama: p.nama } }
    : { ok: false, error: 'Belum ada periode aktif.' };
}

// ── Pengingat lewat wa.me ──────────────────────────────────────────────────

export interface Pengingat {
  pengisian_id: string | null;
  nama: string;
  keterangan: string;
  waUrl: string;
}

/**
 * Susun daftar tautan wa.me siap klik.
 *
 * Maahir tidak punya gateway WhatsApp — seluruh repo memakai deep-link dan
 * manusia yang menekan kirim. Membangun gateway adalah pekerjaan tersendiri
 * (nomor bisnis, templat pesan yang disetujui Meta, langganan penyedia), jadi
 * yang disediakan di sini adalah daftar terkurasi: siapa yang perlu dihubungi,
 * dan teksnya sudah jadi.
 *
 * Dua jenis: pengajar yang ketersediaannya basi, dan pengajar yang bersedia di
 * slot yang antreannya menumpuk tanpa pengajar bebas.
 */
export async function daftarPengingat(input: { periodeId: string }): Promise<Hasil> {
  await aktor();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };

  const formUrl = absUrl('/ketersediaan/pengajar');
  const out: Pengingat[] = [];

  // 1. Ketersediaan yang basi.
  const { data: basi } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, status, pengingat_penyegaran_pada, pengajar:pengajar_id(name, gender, whatsapp_number)')
    .eq('periode_id', input.periodeId)
    .eq('status', 'basi');

  const batas = new Date(Date.now() + periode.pengingat_penyegaran_hari * 86400000).toLocaleDateString(
    'id-ID',
    { timeZone: 'Asia/Jakarta' }
  );
  for (const b of (basi ?? []) as {
    id: string;
    pengingat_penyegaran_pada: string | null;
    pengajar?: { name: string; gender: 'ikhwan' | 'akhwat'; whatsapp_number: string } | null;
  }[]) {
    if (!b.pengajar) continue;
    out.push({
      pengisian_id: b.id,
      nama: b.pengajar.name,
      keterangan: b.pengingat_penyegaran_pada
        ? `sudah diingatkan ${new Date(b.pengingat_penyegaran_pada).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}`
        : 'belum diingatkan',
      waUrl: buildWaMeUrl(
        b.pengajar.whatsapp_number,
        tplSegarkanKetersediaan({
          pengajarName: b.pengajar.name,
          pengajarGender: b.pengajar.gender,
          batas,
          formUrl,
        })
      ),
    });
  }

  // 2. Slot yang antreannya menumpuk tanpa pengajar bebas.
  const slots = await listSlot(input.periodeId, { hanyaAktif: true });
  const ringkas = await ringkasSlot(periode, slots, new Date());
  const butuh = slots.filter((s) => ringkas.get(s.id)?.butuh_pengajar);

  if (butuh.length > 0) {
    const { data: pengajarAktif } = await supabaseAdmin
      .from('pengajar')
      .select('id, name, gender, whatsapp_number')
      .eq('active', true);
    const semua = (pengajarAktif ?? []) as {
      id: string;
      name: string;
      gender: 'ikhwan' | 'akhwat';
      whatsapp_number: string;
    }[];

    // Yang dihubungi: pengajar segender yang BELUM menyatakan bersedia di slot
    // itu. Menghubungi yang sudah bersedia hanya menambah kebisingan.
    const { data: sudahBersedia } = await supabaseAdmin
      .from('ks_ketersediaan')
      .select('slot_id, pengisian:pengisian_id(pengajar_id, periode_id)')
      .in(
        'slot_id',
        butuh.map((s) => s.id)
      );
    const bersediaPerSlot = new Map<string, Set<string>>();
    for (const k of (sudahBersedia ?? []) as {
      slot_id: string;
      pengisian?: { pengajar_id: string; periode_id: string } | null;
    }[]) {
      if (k.pengisian?.periode_id !== input.periodeId) continue;
      if (!bersediaPerSlot.has(k.slot_id)) bersediaPerSlot.set(k.slot_id, new Set());
      bersediaPerSlot.get(k.slot_id)!.add(k.pengisian.pengajar_id);
    }

    for (const s of butuh) {
      const r = ringkas.get(s.id)!;
      const sudah = bersediaPerSlot.get(s.id) ?? new Set<string>();
      for (const pg of semua.filter((x) => x.gender === s.kelompok && !sudah.has(x.id))) {
        out.push({
          pengisian_id: null,
          nama: pg.name,
          keterangan: `slot "${s.label}" menunggu ${r.antre} pendaftar`,
          waUrl: buildWaMeUrl(
            pg.whatsapp_number,
            tplButuhPengajarSlot({
              pengajarName: pg.name,
              pengajarGender: pg.gender,
              slotLabel: s.label,
              jumlahAntre: r.antre,
              formUrl,
            })
          ),
        });
      }
    }
  }

  return { ok: true, pesan: `${out.length} pengingat siap kirim.`, data: { pengingat: out } };
}

/**
 * Tandai pengingat penyegaran sudah dikirim.
 *
 * Ini yang memulai hitungan mundur menuju nonaktif. Sengaja dipisahkan dari
 * penyusunan daftar: sistem tidak boleh menganggap pesan terkirim hanya karena
 * tautannya dibuat — yang menekan kirim adalah manusia.
 */
export async function tandaiPengingatTerkirim(input: { pengisianIds: string[] }): Promise<Hasil> {
  const a = await aktor();
  if (input.pengisianIds.length === 0) return { ok: false, error: 'Tidak ada yang ditandai.' };
  const sekarang = new Date().toISOString();
  for (const id of input.pengisianIds) {
    await supabaseAdmin
      .from('ks_pengisian')
      .update({ pengingat_penyegaran_pada: sekarang, updated_at: sekarang })
      .eq('id', id);
  }
  await catatKs({
    entitas: 'ks_pengisian',
    aksi: 'tandai_pengingat_terkirim',
    sesudah: { jumlah: input.pengisianIds.length },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: `${input.pengisianIds.length} pengingat ditandai terkirim.` };
}

// ── Kolam grup WhatsApp cadangan ───────────────────────────────────────────

/**
 * Isi kolam grup cadangan dari tempelan banyak tautan sekaligus.
 *
 * Jalur utama tetap pengajar membuat grupnya sendiri; kolam ini untuk yang tak
 * sanggup. WhatsApp Cloud API resmi tidak punya endpoint grup sama sekali, jadi
 * grupnya memang harus dibuat manusia lebih dulu — yang bisa diotomasi hanya
 * pembagiannya.
 */
export async function tambahGrupPool(input: {
  periodeId: string;
  gender: 'ikhwan' | 'akhwat';
  tempelan: string;
}): Promise<Hasil> {
  const a = await aktor();
  const tautan = [...new Set(
    input.tempelan
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(t))
  )];
  if (tautan.length === 0) {
    return {
      ok: false,
      error: 'Tidak ada tautan grup yang dikenali. Tempel tautan berformat https://chat.whatsapp.com/…',
    };
  }

  const { data: ada } = await supabaseAdmin
    .from('ks_grup_pool')
    .select('invite_link')
    .eq('periode_id', input.periodeId);
  const sudahAda = new Set(((ada ?? []) as { invite_link: string }[]).map((r) => r.invite_link));

  let masuk = 0;
  let dilewati = 0;
  for (const link of tautan) {
    // Tautan kembar berbahaya: dua halaqah bisa mendapat grup yang sama dan
    // muridnya tercampur tanpa siapa pun menyadarinya.
    if (sudahAda.has(link)) {
      dilewati++;
      continue;
    }
    const { error } = await supabaseAdmin.from('ks_grup_pool').insert({
      periode_id: input.periodeId,
      gender: input.gender,
      invite_link: link,
    });
    if (error) return { ok: false, error: `Gagal menyimpan tautan: ${error.message}` };
    sudahAda.add(link);
    masuk++;
  }

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_grup_pool',
    aksi: 'tambah_grup_kolam',
    sesudah: { gender: input.gender, masuk, dilewati },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return {
    ok: true,
    pesan: `${masuk} tautan masuk kolam${dilewati ? `, ${dilewati} dilewati karena sudah ada` : ''}.`,
  };
}

export async function ubahStatusGrupPool(input: {
  id: string;
  status: 'kosong' | 'rusak';
  catatan: string;
}): Promise<Hasil> {
  const a = await aktor();
  const { data: baris } = await supabaseAdmin
    .from('ks_grup_pool')
    .select('id, periode_id, status, usulan_id')
    .eq('id', input.id)
    .maybeSingle();
  if (!baris) return { ok: false, error: 'Tautan tidak ditemukan.' };
  if (baris.status === 'terpakai' && baris.usulan_id) {
    return {
      ok: false,
      error: 'Tautan ini sedang dipakai sebuah halaqah. Ganti tautan grupnya dari halaman konfirmasi pengajar.',
    };
  }

  await supabaseAdmin
    .from('ks_grup_pool')
    .update({
      status: input.status,
      catatan: input.catatan.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id);

  await catatKs({
    periode_id: baris.periode_id as string,
    entitas: 'ks_grup_pool',
    entitas_id: input.id,
    aksi: input.status === 'rusak' ? 'tandai_grup_rusak' : 'kembalikan_grup_ke_kolam',
    alasan: input.catatan.trim() || null,
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: 'Status tautan diperbarui.' };
}

// ── Pendaftar ditahan ──────────────────────────────────────────────────────

/**
 * Nyatakan satu baris tertahan layak diproses.
 *
 * Hanya boleh untuk baris yang slotnya sudah dikenali — tanpa slot, mesin
 * alokasi tidak punya tempat menaruhnya dan barisnya akan menggantung sebagai
 * "sah" yang tak pernah terpakai, yang justru lebih membingungkan daripada
 * tertahan.
 *
 * Alasan penahanannya TIDAK dihapus: ia menjadi catatan kenapa baris ini pernah
 * dipertanyakan, dan tarikan berikutnya tidak akan menurunkannya lagi karena
 * status 'valid' hanya ditimpa untuk baris yang belum pernah diputuskan.
 */
export async function loloskanPendaftar(input: {
  periodeId: string;
  pendaftarId: string;
}): Promise<Hasil> {
  const a = await aktor();
  const { data: p } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('id, nama, status, slot_id, alasan_ditahan')
    .eq('id', input.pendaftarId)
    .maybeSingle();
  if (!p) return { ok: false, error: 'Pendaftar tidak ditemukan.' };
  if (p.status !== 'ditahan') return { ok: false, error: `Baris ini berstatus "${p.status}".` };
  if (!p.slot_id) {
    return {
      ok: false,
      error: 'Slotnya belum dikenali master. Tambahkan slotnya dulu, lalu tarik ulang pendaftar.',
    };
  }

  await supabaseAdmin
    .from('ks_pendaftar')
    .update({ status: 'valid', updated_at: new Date().toISOString() })
    .eq('id', input.pendaftarId);

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_pendaftar',
    entitas_id: input.pendaftarId,
    aksi: 'loloskan_pendaftar',
    sebelum: { status: 'ditahan', alasan: p.alasan_ditahan },
    sesudah: { status: 'valid' },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: `${p.nama || 'Baris'} diloloskan dan ikut antrean.` };
}

export async function batalkanPendaftar(input: {
  periodeId: string;
  pendaftarId: string;
}): Promise<Hasil> {
  const a = await aktor();
  const { data: p } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('id, nama, status, alasan_ditahan')
    .eq('id', input.pendaftarId)
    .maybeSingle();
  if (!p) return { ok: false, error: 'Pendaftar tidak ditemukan.' };
  if (p.status === 'dialokasikan') {
    return { ok: false, error: 'Baris ini sudah masuk usulan halaqah — batalkan dari papan usulan.' };
  }

  await supabaseAdmin
    .from('ks_pendaftar')
    .update({ status: 'batal', updated_at: new Date().toISOString() })
    .eq('id', input.pendaftarId);

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_pendaftar',
    entitas_id: input.pendaftarId,
    aksi: 'batalkan_pendaftar',
    sebelum: { status: p.status, alasan: p.alasan_ditahan },
    sesudah: { status: 'batal' },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return { ok: true, pesan: `${p.nama || 'Baris'} dibatalkan.` };
}

/**
 * Rekam statistik periode ke riwayat slot.
 *
 * Angka "peluang slot terbentuk" yang dilihat pengajar dihitung dari sini. Tanpa
 * pemanggilan ini tabelnya tidak akan pernah terisi oleh sistem sendiri, dan
 * janji itu tidak pernah ditepati walau sistemnya berjalan bertahun.
 */
export async function rekamRiwayatPeriode(input: { periodeId: string }): Promise<Hasil> {
  const a = await aktor();
  const h = await catatRiwayatPeriode(input.periodeId);
  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_slot_riwayat',
    aksi: 'rekam_riwayat_periode',
    sesudah: h,
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });
  segarkan();
  return {
    ok: true,
    pesan: `${h.slot} slot tercatat — ${h.terbentuk} halaqah terbentuk, ${h.batal} batal.`,
  };
}

// ── Kelayakan pengajar ─────────────────────────────────────────────────────

/**
 * Daftar pengajar batch ini dulu hanya ada di dropdown form Google; sekarang
 * koordinator yang menyetelnya sendiri. Semua aksi di bawah dikunci ke gender
 * koordinator — sama seperti modul lain, koordinator ikhwan tidak menyentuh
 * data akhwat dan sebaliknya.
 */
async function pengajarSegender(
  pengajarId: string,
  gender: Gender
): Promise<{ id: string; name: string; gender: Gender; whatsapp_number: string } | null> {
  const { data } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, gender, whatsapp_number')
    .eq('id', pengajarId)
    .maybeSingle();
  const p = data as { id: string; name: string; gender: Gender; whatsapp_number: string } | null;
  if (!p || p.gender !== gender) return null;
  return p;
}

export async function ubahKelayakan(input: {
  periodeId: string;
  pengajarId: string;
  boleh: boolean;
  alasan?: string;
}): Promise<Hasil> {
  const sesi = await requireOneOfRoles(['koordinator']);
  const a = await aktor();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };

  const pengajar = await pengajarSegender(input.pengajarId, sesi.gender);
  if (!pengajar) return { ok: false, error: 'Pengajar tidak ditemukan pada kelompok Anda.' };

  const { data: lama } = await supabaseAdmin
    .from('ks_kelayakan')
    .select('id, boleh')
    .eq('periode_id', input.periodeId)
    .eq('pengajar_id', input.pengajarId)
    .maybeSingle();

  const isi = {
    boleh: input.boleh,
    alasan: input.alasan?.trim() || null,
    diubah_oleh: a.wa,
    updated_at: new Date().toISOString(),
  };

  if (lama) {
    const { error } = await supabaseAdmin.from('ks_kelayakan').update(isi).eq('id', lama.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabaseAdmin.from('ks_kelayakan').insert({
      periode_id: input.periodeId,
      pengajar_id: input.pengajarId,
      ...isi,
    });
    if (error) return { ok: false, error: error.message };
  }

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_kelayakan',
    entitas_id: input.pengajarId,
    aksi: input.boleh ? 'izinkan' : 'cabut',
    sebelum: lama ? { boleh: lama.boleh } : null,
    sesudah: { boleh: input.boleh, nama: pengajar.name },
    alasan: input.alasan?.trim() || null,
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });

  segarkan();
  return {
    ok: true,
    pesan: `${pengajar.name} ${input.boleh ? 'boleh' : 'tidak boleh'} mengisi ketersediaan periode ini.`,
  };
}

/**
 * Menyetel daftar sekaligus: dipakai tombol "semua boleh"/"hanya yang dicentang"
 * dan penyalinan dari periode sebelumnya. Baris ditulis untuk SETIAP pengajar
 * segender supaya periode itu jelas berada dalam mode daftar (periode tanpa
 * baris sama sekali berarti "semua boleh").
 */
export async function setelKelayakanMassal(input: {
  periodeId: string;
  bolehIds: string[];
}): Promise<Hasil> {
  const sesi = await requireOneOfRoles(['koordinator']);
  const a = await aktor();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };

  const { data: daftarPengajar } = await supabaseAdmin
    .from('pengajar')
    .select('id')
    .eq('active', true)
    .eq('gender', sesi.gender);
  const semua = ((daftarPengajar ?? []) as { id: string }[]).map((p) => p.id);
  const boleh = new Set(input.bolehIds.filter((id) => semua.includes(id)));

  const { data: adaBaris } = await supabaseAdmin
    .from('ks_kelayakan')
    .select('id, pengajar_id')
    .eq('periode_id', input.periodeId);
  const idBaris = new Map(
    ((adaBaris ?? []) as { id: string; pengajar_id: string }[]).map((r) => [r.pengajar_id, r.id])
  );

  const sekarang = new Date().toISOString();
  for (const pengajarId of semua) {
    const nilai = {
      boleh: boleh.has(pengajarId),
      diubah_oleh: a.wa,
      updated_at: sekarang,
    };
    const baris = idBaris.get(pengajarId);
    if (baris) {
      await supabaseAdmin.from('ks_kelayakan').update(nilai).eq('id', baris);
    } else {
      await supabaseAdmin
        .from('ks_kelayakan')
        .insert({ periode_id: input.periodeId, pengajar_id: pengajarId, ...nilai });
    }
  }

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_kelayakan',
    aksi: 'setel_massal',
    sesudah: { gender: sesi.gender, boleh: boleh.size, total: semua.length },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });

  segarkan();
  return { ok: true, pesan: `Daftar disimpan: ${boleh.size} dari ${semua.length} pengajar boleh mengisi.` };
}

/** Menyalin daftar kelayakan periode lain ke periode ini (gender koordinator). */
export async function salinKelayakan(input: {
  periodeId: string;
  dariPeriodeId: string;
}): Promise<Hasil> {
  const sesi = await requireOneOfRoles(['koordinator']);
  if (input.periodeId === input.dariPeriodeId) {
    return { ok: false, error: 'Pilih periode asal yang berbeda.' };
  }

  const { data: asal } = await supabaseAdmin
    .from('ks_kelayakan')
    .select('pengajar_id, boleh, pengajar:pengajar_id(gender)')
    .eq('periode_id', input.dariPeriodeId);
  const baris = (asal ?? []) as {
    pengajar_id: string;
    boleh: boolean;
    pengajar?: { gender: Gender } | null;
  }[];
  const bolehIds = baris
    .filter((b) => b.boleh && b.pengajar?.gender === sesi.gender)
    .map((b) => b.pengajar_id);
  if (baris.length === 0) return { ok: false, error: 'Periode asal belum punya daftar kelayakan.' };

  return setelKelayakanMassal({ periodeId: input.periodeId, bolehIds });
}

/**
 * Isian milik pengajar yang tidak layak: dihapus, bukan ditandai.
 *
 * `ks_ketersediaan` ikut terhapus lewat cascade, jadi ringkasan slotnya disalin
 * ke ks_log lebih dulu — kalau ternyata orangnya memang berhak, koordinator
 * masih bisa melihat apa yang pernah dia isi.
 */
export async function hapusIsianTakLayak(input: {
  periodeId: string;
  pengajarId: string;
}): Promise<Hasil> {
  const sesi = await requireOneOfRoles(['koordinator']);
  const a = await aktor();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };

  const pengajar = await pengajarSegender(input.pengajarId, sesi.gender);
  if (!pengajar) return { ok: false, error: 'Pengajar tidak ditemukan pada kelompok Anda.' };

  const daftar = await listKelayakan(input.periodeId);
  if (layakMenurutDaftar(daftar, input.pengajarId)) {
    return {
      ok: false,
      error: `${pengajar.name} masih terdaftar sebagai pengajar periode ini. Cabut kelayakannya dulu bila isiannya memang hendak dihapus.`,
    };
  }

  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, mode, lokasi, submitted_at, sumber')
    .eq('periode_id', input.periodeId)
    .eq('pengajar_id', input.pengajarId)
    .maybeSingle();
  if (!pengisian) return { ok: false, error: 'Tidak ada isian untuk dihapus.' };

  const { data: barisSlot } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('slot_id, status, slot:slot_id(label)')
    .eq('pengisian_id', pengisian.id as string);
  const label = ((barisSlot ?? []) as { slot?: { label: string } | null }[])
    .map((b) => b.slot?.label)
    .filter((l): l is string => Boolean(l));

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_pengisian',
    entitas_id: pengisian.id as string,
    aksi: 'hapus_tak_layak',
    sebelum: { pengajar: pengajar.name, isian: pengisian, slot: label },
    aktor_wa: a.wa,
    aktor_nama: a.nama,
  });

  const { error } = await supabaseAdmin.from('ks_pengisian').delete().eq('id', pengisian.id as string);
  if (error) return { ok: false, error: error.message };

  segarkan();
  return {
    ok: true,
    pesan: `Isian ${pengajar.name} dihapus (${label.length} slot). Kabari yang bersangkutan lewat tombol WA.`,
    data: {
      waUrl: buildWaMeUrl(
        pengajar.whatsapp_number,
        tplAnulirKetersediaan({
          pengajarName: pengajar.name,
          pengajarGender: pengajar.gender,
          periodeNama: periode.nama,
          slotLabel: label,
        })
      ),
    },
  };
}
