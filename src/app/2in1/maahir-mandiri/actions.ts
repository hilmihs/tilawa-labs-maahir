'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  getSessionWa,
  getSelfAttendanceKelas,
  findSelfAttendanceMembership,
  isTakhassusKelas,
} from '@/lib/program-kelas';
import { berlakuPeriodeBerjalan, simpanTarget } from '@/lib/setoran-target';
import { PRESENSI_ANCHOR, todayJakarta, expectedDaysInRange } from '@/lib/maahir-presensi';
import { getLiburDates } from '@/lib/maahir-libur';
import { pesanTerkunci, presensiTerbuka } from '@/lib/periode-laporan';
import { buildWaMeUrl, tplReminderLiburToKetua } from '@/lib/whatsapp';
// Konstanta status TIDAK boleh tinggal di berkas ini: 'use server' hanya
// mengizinkan ekspor async function. Lihat lib/kehadiran-status.ts.
import { butuhAlasan, isStatusValid } from '@/lib/kehadiran-status';

export type SelfPresensiResult = { ok?: boolean; error?: string };
export type RemindResult = { ok?: boolean; error?: string; waUrl?: string };
export type TargetResult = { ok?: boolean; error?: string };

/**
 * Peserta Takhassus Ikhwan menetapkan target hafalan BULANANNYA SENDIRI.
 *
 * Kelas itu presensi-mandiri dan tak punya ketua di alur presensi, jadi
 * pesertanya yang memasang sendiri. Tanggal berlakunya dikunci ke awal periode
 * berjalan — target yang dipasang hari ini tak boleh memperbaiki capaian bulan
 * yang sudah dilaporkan. Koordinator tetap bisa mengoreksi dan memundurkan
 * tanggal lewat /2in1/koordinator/target-setoran.
 */
export async function simpanTargetSaya(
  _prev: TargetResult | undefined,
  fd: FormData
): Promise<TargetResult> {
  const wa = await getSessionWa();
  if (!wa) return { error: 'Login diperlukan.' };

  const m = await findSelfAttendanceMembership(wa);
  if (!m) return { error: 'Akun Anda tidak terdaftar di kelas presensi mandiri.' };
  if (!isTakhassusKelas(m.kelas.name)) {
    return { error: 'Target setoran hanya untuk kelas Maahir Takhassus.' };
  }

  // Koma sebagai pemisah desimal — "37,5" adalah cara mengetik yang paling wajar.
  const halamanPerBulan = Number(String(fd.get('halaman_per_bulan') ?? '').replace(',', '.'));
  const res = await simpanTarget({
    programKelasId: m.kelas.id,
    anggotaId: m.anggotaId,
    halamanPerBulan,
    berlakuMulai: berlakuPeriodeBerjalan(),
    catatan: null,
    dibuatOleh: m.anggotaName,
  });
  if (res.error) return { error: res.error };

  revalidatePath('/2in1/maahir-mandiri');
  revalidatePath('/2in1/koordinator/target-setoran');
  revalidatePath('/2in1/laporan/maahir');
  return { ok: true };
}

/** Peserta mengingatkan ketua kelas bahwa pertemuan tanggal ini libur → WA ketua. */
export async function remindKetuaLibur(kelasId: string, tanggal: string): Promise<RemindResult> {
  const wa = await getSessionWa();
  if (!wa) return { error: 'Login diperlukan.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return { error: 'Tanggal tidak valid.' };

  const kelas = await getSelfAttendanceKelas(kelasId);
  if (!kelas) return { error: 'Kelas tidak ditemukan.' };
  if (!kelas.ketua_wa) return { error: 'Nomor ketua kelas belum diset.' };

  // Nama pengaju + nama ketua (opsional) dari anggota.
  const { data: rows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('name, whatsapp_number, is_ketua')
    .eq('program_kelas_id', kelasId)
    .eq('active', true);
  const pesertaName = (rows ?? []).find((r) => r.whatsapp_number === wa)?.name ?? 'Peserta';
  const ketuaName = (rows ?? []).find((r) => r.whatsapp_number === kelas.ketua_wa)?.name
    ?? (rows ?? []).find((r) => r.is_ketua)?.name
    ?? null;

  const tanggalLabel = new Date(tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const msg = tplReminderLiburToKetua({ ketuaName, pesertaName, kelasName: kelas.name, tanggalLabel });
  return { ok: true, waUrl: buildWaMeUrl(kelas.ketua_wa, msg) };
}


/**
 * Peserta menandai kehadiran DIRINYA pada kelas presensi-mandiri, lewat akun
 * sendiri (login). Mencakup SELURUH presensinya: Kelas Maahir & At-Tibyan.
 */
export async function submitSelfPresensi(_prev: SelfPresensiResult | undefined, fd: FormData): Promise<SelfPresensiResult> {
  const wa = await getSessionWa();
  if (!wa) return { error: 'Login diperlukan.' };

  const kelasId = String(fd.get('kelas_id') ?? '');
  const anggotaId = String(fd.get('anggota_id') ?? '');
  const tanggal = String(fd.get('tanggal') ?? '');
  const program = String(fd.get('program') ?? '');
  const status = String(fd.get('status') ?? '');
  const catatan = String(fd.get('catatan') ?? '').trim();
  const setoranRaw = String(fd.get('setoran_halaman') ?? '').trim();
  const modeRaw = String(fd.get('mode') ?? '').trim();
  if (!kelasId || !anggotaId || !tanggal || !program) return { error: 'Data tidak lengkap.' };
  if (!isStatusValid(status)) return { error: 'Status tidak valid.' };

  // Tidak hadir wajib beralasan — kolom Keterangan di laporan bulanan &
  // rekap kehadiran mengandalkan catatan ini. Divalidasi di server juga,
  // bukan cuma di form, supaya tak bisa dilewati.
  if (butuhAlasan(status) && catatan === '') {
    return { error: 'Alasan wajib diisi untuk Izin / Sakit / Tidak hadir.' };
  }

  // Setoran halaman hanya relevan untuk sesi Kelas Maahir. Kosong/hadir=null.
  let setoranHalaman: number | null = null;
  if (program === 'kelas_maahir' && setoranRaw !== '') {
    const n = Number(setoranRaw);
    if (!Number.isInteger(n) || n < 0) return { error: 'Setoran halaman tidak valid.' };
    setoranHalaman = n;
  }

  const kelas = await getSelfAttendanceKelas(kelasId);
  if (!kelas) return { error: 'Kelas bukan presensi mandiri.' };

  // Anggota harus milik kelas ini DAN nomornya = WA yang login (isi diri sendiri).
  const { data: anggota } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, peserta_id, program_kelas_id, whatsapp_number')
    .eq('id', anggotaId)
    .eq('active', true)
    .maybeSingle();
  if (!anggota || anggota.program_kelas_id !== kelasId) return { error: 'Peserta tidak terdaftar di kelas ini.' };
  if (anggota.whatsapp_number !== wa) return { error: 'Hanya bisa mengisi presensi untuk akun sendiri.' };

  // (program, tanggal) harus hari sesi sah sejak anchor s/d hari ini (libur dikecualikan).
  const today = todayJakarta();
  const libur = await getLiburDates(kelas.id, PRESENSI_ANCHOR, today);
  const day = expectedDaysInRange(kelas, PRESENSI_ANCHOR, today, libur)
    .find((d) => d.tanggal === tanggal && d.program === program);
  if (!day) return { error: 'Hari/sesi tidak valid atau sedang libur.' };
  // Periode yang sudah dilaporkan terkunci — berlaku juga untuk presensi mandiri.
  if (!presensiTerbuka(day.tanggal)) return { error: pesanTerkunci(day.tanggal) };

  const { data: pertemuan, error: pErr } = await supabaseAdmin
    .from('pertemuan_program')
    .upsert(
      {
        program_kelas_id: kelasId,
        program: day.program,
        tanggal: day.tanggal,
        nama_kegiatan: day.namaKegiatan,
        waktu_mulai: day.waktu_mulai,
        waktu_selesai: day.waktu_selesai,
      },
      { onConflict: 'program_kelas_id,program,tanggal', ignoreDuplicates: false }
    )
    .select('id')
    .single();
  if (pErr || !pertemuan) return { error: `Gagal menyiapkan pertemuan: ${pErr?.message ?? 'unknown'}` };

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('kehadiran_peserta')
    .upsert(
      {
        pertemuan_id: pertemuan.id,
        anggota_id: anggotaId,
        peserta_id: anggota.peserta_id ?? null,
        status,
        catatan: catatan || null,
        setoran_halaman: setoranHalaman,
        // Hadir offline (default) / online — hanya relevan saat hadir/terlambat.
        mode: modeRaw === 'online' ? 'online' : 'offline',
        diisi_at: now,
        updated_at: now,
      },
      { onConflict: 'pertemuan_id,anggota_id' }
    );
  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  return { ok: true };
}
