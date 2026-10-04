'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOneOfRoles } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { ambilCalonBadal, cekBadal } from '@/lib/shakwa-badal';

export type UbahShakwaResult = { ok?: boolean; error?: string };

const STATUS = new Set(['submitted', 'in_review', 'resolved', 'closed']);

/** Koordinator menandai tindak lanjut sebuah aduan. */
export async function ubahStatusShakwa(
  _prev: UbahShakwaResult | undefined,
  fd: FormData
): Promise<UbahShakwaResult> {
  const session = await requireOneOfRoles(['koordinator', 'koordinator_ketua_kelas']);
  const reviewerId =
    session.role === 'koordinator' ? session.koordinator_id : session.koordinator_kk_id;

  const id = String(fd.get('id') ?? '');
  const status = String(fd.get('status') ?? '');
  const catatan = String(fd.get('catatan') ?? '').trim();
  if (!id) return { error: 'Aduan tidak ditemukan.' };
  if (!STATUS.has(status)) return { error: 'Status tidak dikenal.' };

  // Gender ikut jadi syarat UPDATE, bukan cuma penyaring tampilan. Daftar di
  // halaman memang sudah dikunci ke gender koordinator, tapi action ini menerima
  // id apa pun dari form — tanpa syarat ini, tiket gender lain masih bisa
  // ditindak oleh siapa saja yang tahu id-nya. RLS tak menolong: aplikasi
  // menyambung sebagai superuser pg, jadi kendalinya harus di sini.
  const { data: terubah, error } = await supabaseAdmin
    .from('shakwa')
    .update({
      status,
      catatan_reviewer: catatan || null,
      reviewed_by_id: reviewerId,
      reviewed_by_role: session.role,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('gender', session.gender)
    .select('id');
  if (error) return { error: `Gagal menyimpan: ${error.message}` };
  // Nol baris = id tak ada, atau ada tapi milik gender lain. Keduanya dijawab
  // sama supaya balasan galat tak jadi alat menebak keberadaan tiket.
  if (!terubah || terubah.length === 0) return { error: 'Aduan tidak ditemukan.' };

  await logAudit({
    actor: session,
    action: 'shakwa.status',
    targetTable: 'shakwa',
    targetId: id,
    detail: { status },
  });

  revalidatePath('/shakwa/koordinator');
  return { ok: true };
}

/**
 * Betulkan tanggal "Jadwal Kelas Pengganti" satu rincian izin.
 *
 * Hanya `jadwal_ganti` yang boleh disunting. `tanggal`/`jenis`/`menit` dipakai
 * `cariIzinCocok`, perhitungan hutang, dan rekap — mengubahnya setelah izin
 * menempel ke tabayyun membuat catatan lama tak lagi cocok dengan sumbernya.
 * `jadwal_ganti` tidak ikut mencocokkan apa pun, jadi aman dibetulkan kapan saja,
 * termasuk sesudah `dipakai_tabayyun_id` terisi.
 */
export async function ubahJadwalGantiIzin(
  _prev: UbahShakwaResult | undefined,
  fd: FormData
): Promise<UbahShakwaResult> {
  const session = await requireOneOfRoles(['koordinator', 'koordinator_ketua_kelas']);

  const id = String(fd.get('izin_id') ?? '');
  const isian = String(fd.get('jadwal_ganti') ?? '').trim();
  if (!id) return { error: 'Rincian izin tidak ditemukan.' };
  // Kosong = izin tanpa kelas pengganti. Dibolehkan: pengajar bisa saja terlanjur
  // mengisi tanggal pada izin yang ternyata tak berkelas pengganti.
  const tanggal = isian === '' ? null : isian;
  if (tanggal && !/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
    return { error: 'Tanggal harus berformat YYYY-MM-DD.' };

  // Gender ada di tiket induk, bukan di baris izin, dan shim tak bisa memfilter
  // kolom embed — jadi diperiksa dua langkah. Sama seperti ubahStatusShakwa, ini
  // SYARAT tulis: action menerima id apa pun dari form, dan tanpa cek ini rincian
  // izin gender lain bisa disunting siapa pun yang tahu id-nya.
  const { data: izin } = await supabaseAdmin
    .from('shakwa_izin')
    .select('id, shakwa_id, jadwal_ganti')
    .eq('id', id)
    .maybeSingle();
  if (!izin) return { error: 'Rincian izin tidak ditemukan.' };

  const { data: tiket } = await supabaseAdmin
    .from('shakwa')
    .select('id, nomor_tiket')
    .eq('id', izin.shakwa_id)
    .eq('gender', session.gender)
    .maybeSingle();
  // Tiket gender lain dijawab sama dengan tiket yang tak ada — balasan galat
  // jangan jadi alat menebak isi tabel.
  if (!tiket) return { error: 'Rincian izin tidak ditemukan.' };

  if (izin.jadwal_ganti === tanggal) return { ok: true };

  const { error } = await supabaseAdmin
    .from('shakwa_izin')
    .update({ jadwal_ganti: tanggal })
    .eq('id', id);
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'shakwa.izin.jadwal_ganti',
    targetTable: 'shakwa_izin',
    targetId: id,
    // Nilai lama ikut dicatat — ini satu-satunya jejak tanggal sebelumnya,
    // karena barisnya ditimpa di tempat.
    detail: { dari: izin.jadwal_ganti, ke: tanggal, nomor_tiket: tiket.nomor_tiket },
  });

  revalidatePath('/shakwa/koordinator');
  return { ok: true };
}

/**
 * Ganti pengajar badal satu rincian izin BADAL.
 *
 * Seperti `jadwal_ganti`, badal tidak dipakai `cariIzinCocok` untuk mencocokkan
 * izin, jadi aman diganti sesudah izin menempel ke tabayyun. Aturan siapa boleh
 * jadi badal sama persis dengan formulir pengajar (cekBadal) — pembandingnya
 * pengajar pemilik izin, bukan koordinator.
 */
export async function ubahBadalIzin(
  _prev: UbahShakwaResult | undefined,
  fd: FormData
): Promise<UbahShakwaResult> {
  const session = await requireOneOfRoles(['koordinator', 'koordinator_ketua_kelas']);

  const id = String(fd.get('izin_id') ?? '');
  const badalId = String(fd.get('badal_pengajar_id') ?? '').trim();
  if (!id) return { error: 'Rincian izin tidak ditemukan.' };
  if (!badalId) return { error: 'Pilih pengajar badal.' };

  const { data: izin } = await supabaseAdmin
    .from('shakwa_izin')
    .select('id, shakwa_id, jenis, pengajar_id, badal_pengajar_id')
    .eq('id', id)
    .maybeSingle();
  if (!izin || izin.jenis !== 'BADAL') return { error: 'Rincian izin tidak ditemukan.' };

  // Syarat gender tiket — alasan sama dengan ubahJadwalGantiIzin.
  const { data: tiket } = await supabaseAdmin
    .from('shakwa')
    .select('id, nomor_tiket')
    .eq('id', izin.shakwa_id)
    .eq('gender', session.gender)
    .maybeSingle();
  if (!tiket) return { error: 'Rincian izin tidak ditemukan.' };

  if (izin.badal_pengajar_id === badalId) return { ok: true };

  const calon = await ambilCalonBadal([badalId]);
  const alasanTolak = cekBadal(calon.get(badalId) ?? null, {
    id: izin.pengajar_id as string,
    gender: session.gender,
  });
  if (alasanTolak) return { error: alasanTolak.charAt(0).toUpperCase() + alasanTolak.slice(1) };

  const { error } = await supabaseAdmin
    .from('shakwa_izin')
    .update({ badal_pengajar_id: badalId })
    .eq('id', id);
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  await logAudit({
    actor: session,
    action: 'shakwa.izin.badal',
    targetTable: 'shakwa_izin',
    targetId: id,
    detail: { dari: izin.badal_pengajar_id, ke: badalId, nomor_tiket: tiket.nomor_tiket },
  });

  revalidatePath('/shakwa/koordinator');
  return { ok: true };
}
