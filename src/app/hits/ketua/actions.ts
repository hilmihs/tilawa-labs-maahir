'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKetuaKelas } from '@/lib/session';
import { loadHalaqahPertemuan, resolveKetuaHalaqah } from '@/lib/hits-ketua';
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
import { todayJakarta, dayIndexOf } from '@/lib/maahir-presensi';
import { statusOnCheckin, KAJIAN_GHOSTING_DAYS } from '@/lib/hits-kajian';
import { logAudit } from '@/lib/audit';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplHapusPertemuanToKoorKK } from '@/lib/whatsapp';
import { cariIzinCocok, alasanDariIzin, tandaiIzinTerpakai, kebutuhanTabayyunIzin } from '@/lib/shakwa-izin';
import { HITS_LEVEL_SHORT } from '@/lib/hits-pertemuan';
import type { HitsKondisi, HitsStatusLatihan, HitsLevel, HitsPelanggaranJenis } from '@/types/db';

export type KetuaHarianResult = { ok?: boolean; error?: string };
export type AjukanHapusResult = { ok?: boolean; error?: string; waUrl?: string };

/** Ketua kelas mengajukan penghapusan pertemuan kelebihan/salah → koordinator KK. */
export async function ajukanHapusPertemuan(
  _prev: AjukanHapusResult | undefined,
  fd: FormData
): Promise<AjukanHapusResult> {
  const session = await requireKetuaKelas();
  // Hormati halaqah yang sedang dipilih (ketua multi-halaqah via switcher).
  const resolved = await resolveKetuaHalaqah(session, String(fd.get('halaqah_id') ?? '') || null);
  if (!resolved) return { error: 'Akun ini bukan ketua kelas HITS.' };
  const halaqahId = resolved.halaqahId;

  const pertemuanNo = Number(fd.get('pertemuan_no'));
  const level = String(fd.get('level') ?? '') as HitsLevel;
  const tanggal = String(fd.get('tanggal') ?? '') || null;
  const alasan = String(fd.get('alasan') ?? '').trim();
  if (!Number.isFinite(pertemuanNo) || pertemuanNo < 1) return { error: 'Pertemuan tidak valid.' };
  if (level !== 'qoidah_nuroniyyah' && level !== 'perbaikan_bacaan') return { error: 'Tahap tidak valid.' };

  const { data: halaqah } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender')
    .eq('id', halaqahId)
    .maybeSingle();
  if (!halaqah) return { error: 'Halaqah tidak ditemukan.' };
  const gender = (halaqah.gender ?? session.gender) as 'ikhwan' | 'akhwat';

  const token = crypto.randomUUID();
  const { error: insErr } = await supabaseAdmin
    .from('hits_pertemuan_hapus_request')
    .insert({
      halaqah_id: halaqahId,
      level,
      pertemuan_no: pertemuanNo,
      tanggal,
      alasan: alasan || null,
      gender,
      requested_by_ketua_id: resolved.ketuaKelasId,
      requested_by_name: session.name,
      token,
      status: 'pending',
    });
  if (insErr) {
    if (insErr.code === '23505') return { error: 'Pertemuan ini sudah diajukan & menunggu keputusan koordinator.' };
    return { error: `Gagal mengajukan: ${insErr.message}` };
  }

  // Routing ke koordinator ketua kelas sesuai gender halaqah.
  const { data: koor } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('whatsapp_number, name')
    .eq('gender', gender)
    .eq('active', true)
    .ilike('name', 'Koordinator KK%')
    .limit(1)
    .maybeSingle();
  const { data: koorFallback } = koor
    ? { data: koor }
    : await supabaseAdmin
        .from('koordinator_ketua_kelas')
        .select('whatsapp_number, name')
        .eq('gender', gender)
        .eq('active', true)
        .limit(1)
        .maybeSingle();
  const target = koor ?? koorFallback;

  await logAudit({
    actor: session,
    action: 'hits.pertemuan.hapus.ajukan',
    targetTable: 'hits_pertemuan_hapus_request',
    targetId: null,
    detail: { halaqah_id: halaqahId, level, pertemuan_no: pertemuanNo, gender },
  });

  revalidatePath('/hits/ketua');

  if (!target?.whatsapp_number) {
    return { ok: true, error: 'Pengajuan tersimpan, tapi nomor koordinator ketua kelas belum diset.' };
  }
  const msg = tplHapusPertemuanToKoorKK({
    ketuaName: session.name,
    kelasName: halaqah.name,
    pertemuanNo,
    tanggal,
    levelLabel: HITS_LEVEL_SHORT[level],
    alasan,
    approveUrl: absUrl(`/hits/hapus-pertemuan/${token}`),
  });
  return { ok: true, waUrl: buildWaMeUrl(target.whatsapp_number, msg) };
}

const STATUS: HitsStatusLatihan[] = ['TAL', 'PTML', 'SML'];

// Payload pelanggaran waktu/jadwal dari form (TIDAK_LATIHAN diturunkan server dari
// latihan_diberikan, jadi tak ikut di sini).
type PelIn = {
  jenis: 'KMT' | 'KBLA' | 'JKG' | 'BADAL';
  menit?: number | null;
  jkg_opsi?: 'ganti_hari' | 'cicil' | null;
  cicil_n?: 2 | 3 | null;
  badal_nama?: string | null;
  badal_mulai?: 'sesuai' | 'lebih_awal' | null;
};

type PelRow = {
  keterangan_id: string;
  jenis: HitsPelanggaranJenis;
  menit: number | null;
  jkg_opsi: 'ganti_hari' | 'cicil' | null;
  cicil_n: 2 | 3 | null;
  badal_nama: string | null;
  badal_mulai: 'sesuai' | 'lebih_awal' | null;
};

// Headline pelanggaran (paling berat → tampil di tabayyun). Urutan severity:
// JKG > BADAL > KBLA > KMT > TIDAK_LATIHAN.
const SEVERITY: HitsPelanggaranJenis[] = ['JKG', 'BADAL', 'KBLA', 'KMT', 'TIDAK_LATIHAN'];
function headline(jenisList: HitsPelanggaranJenis[]): HitsPelanggaranJenis | null {
  for (const s of SEVERITY) if (jenisList.includes(s)) return s;
  return null;
}

// keterangan.kondisi tetap enum hits_kondisi (KBBS/KMT/JKG/KBLA/LIBUR) untuk
// kompatibilitas display lama. BADAL dipetakan JKG (guru asli dihitung JKG);
// TIDAK_LATIHAN sendirian → KBBS (timing bersih, ditangkap latihan_diberikan).
function primaryKondisi(jenisList: HitsPelanggaranJenis[]): HitsKondisi {
  if (jenisList.includes('JKG') || jenisList.includes('BADAL')) return 'JKG';
  if (jenisList.includes('KBLA')) return 'KBLA';
  if (jenisList.includes('KMT')) return 'KMT';
  return 'KBBS';
}

export async function submitKeteranganHarian(
  _prev: KetuaHarianResult | undefined,
  fd: FormData
): Promise<KetuaHarianResult> {
  const session = await requireKetuaKelas();
  // Hormati halaqah yang sedang dipilih (ketua multi-halaqah via switcher).
  const resolved = await resolveKetuaHalaqah(session, String(fd.get('halaqah_id') ?? '') || null);
  if (!resolved) return { error: 'Akun ini bukan ketua kelas HITS.' };
  const halaqahId = resolved.halaqahId;

  const pertemuanNo = Number(fd.get('pertemuan_no'));
  const level = String(fd.get('level') ?? '') as HitsLevel;
  const isLibur = String(fd.get('libur') ?? 'false') === 'true';
  const latihanDiberikanRaw = String(fd.get('latihan_diberikan') ?? '');
  const statusLatihan = String(fd.get('status_latihan') ?? '') as HitsStatusLatihan;
  const catatan = String(fd.get('catatan') ?? '').trim() || null;
  const bayarMenitRaw = Number(fd.get('bayar_menit') ?? 0);
  const bayarMenit = Number.isFinite(bayarMenitRaw) && bayarMenitRaw > 0 ? Math.trunc(bayarMenitRaw) : 0;

  if (!Number.isFinite(pertemuanNo) || pertemuanNo < 1) return { error: 'Pertemuan tidak valid.' };
  if (level !== 'qoidah_nuroniyyah' && level !== 'perbaikan_bacaan') return { error: 'Tahap tidak valid.' };

  // Parse & validasi pelanggaran waktu/jadwal.
  let pelIn: PelIn[] = [];
  if (!isLibur) {
    try {
      const raw = String(fd.get('pelanggaran') ?? '[]');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('bukan array');
      pelIn = parsed as PelIn[];
    } catch {
      return { error: 'Data pelanggaran tidak valid.' };
    }
  }
  const allowedJenis = new Set(['KMT', 'KBLA', 'JKG', 'BADAL']);
  for (const p of pelIn) {
    if (!allowedJenis.has(p.jenis)) return { error: `Jenis pelanggaran tidak dikenal: ${p.jenis}` };
    if ((p.jenis === 'KMT' || p.jenis === 'KBLA')) {
      if (p.menit == null || !Number.isFinite(p.menit) || p.menit < 0) {
        return { error: `${p.jenis} butuh jumlah menit (≥0).` };
      }
    }
    if (p.jenis === 'JKG') {
      if (p.jkg_opsi !== 'ganti_hari' && p.jkg_opsi !== 'cicil') return { error: 'JKG butuh opsi tindak lanjut.' };
      if (p.jkg_opsi === 'cicil' && p.cicil_n !== 2 && p.cicil_n !== 3) return { error: 'Cicilan JKG harus 2× atau 3×.' };
    }
    if (p.jenis === 'BADAL') {
      if (!p.badal_nama || !String(p.badal_nama).trim()) return { error: 'BADAL butuh nama pengganti.' };
      if (p.badal_mulai !== 'sesuai' && p.badal_mulai !== 'lebih_awal') return { error: 'BADAL butuh waktu mulai.' };
    }
  }
  // Cegah duplikat jenis (unique keterangan_id,jenis di DB).
  if (new Set(pelIn.map((p) => p.jenis)).size !== pelIn.length) {
    return { error: 'Jenis pelanggaran tidak boleh ganda.' };
  }

  // Validasi server-side: (level, pertemuan_no, tanggal) harus pertemuan sah & tidak di masa depan.
  const loaded = await loadHalaqahPertemuan(halaqahId);
  if (!loaded) return { error: 'Halaqah tidak ditemukan.' };
  const today = todayJakarta();
  const match = loaded.derived.find((d) => d.pertemuan_no === pertemuanNo && d.level === level);
  if (!match) return { error: 'Pertemuan tidak ada di kaldik halaqah ini.' };
  if (match.tanggal > today) return { error: 'Tidak bisa mengisi pertemuan yang belum berlangsung.' };

  const latihanDiberikan = isLibur ? null : latihanDiberikanRaw === 'true';
  // TAL ("tidak ada latihan") mustahil bareng latihan_diberikan=true — dulu form
  // menawarkan keduanya dan ketua kelas banyak salah pilih. Client lama/legacy
  // edit dinormalkan jadi PTML (tugas diberikan, peserta belum mengerjakan).
  const statusNorm: HitsStatusLatihan =
    latihanDiberikan && statusLatihan === 'TAL' ? 'PTML' : statusLatihan;
  const finalStatus = !isLibur && latihanDiberikan && STATUS.includes(statusNorm) ? statusNorm : null;
  const semuaSelesai = !isLibur && latihanDiberikan ? statusNorm === 'SML' : null;

  // Susun daftar jenis final (timing/jadwal + TIDAK_LATIHAN turunan).
  const jenisList: HitsPelanggaranJenis[] = isLibur ? [] : pelIn.map((p) => p.jenis);
  if (!isLibur && latihanDiberikan === false) jenisList.push('TIDAK_LATIHAN');
  const kondisi: HitsKondisi = isLibur ? 'LIBUR' : primaryKondisi(jenisList);

  // Kepatuhan SOP Teknis: status on-cam pengajar. Hanya berlaku (wajib) saat KBM
  // dibawakan pengajar asli — bukan libur, bukan JKG/BADAL (pengajar diganti/pindah
  // hari). Selain itu disimpan null (tak masuk penilaian).
  const kbmHeld = !isLibur && !jenisList.includes('JKG') && !jenisList.includes('BADAL');
  const onCamRaw = String(fd.get('pengajar_on_cam') ?? '');
  if (kbmHeld && onCamRaw !== 'true' && onCamRaw !== 'false') {
    return { error: 'Status On Cam pengajar wajib diisi saat kelas berlangsung.' };
  }
  const pengajarOnCam = kbmHeld ? onCamRaw === 'true' : null;

  const { data: saved, error } = await supabaseAdmin
    .from('hits_keterangan_harian')
    .upsert(
      {
        halaqah_id: halaqahId,
        level,
        pertemuan_no: pertemuanNo,
        tanggal: match.tanggal,
        kondisi,
        // KMT (kelas mulai terlambat) implikasikan terlambat=true utk kompat lama.
        terlambat: jenisList.includes('KMT'),
        pengajar_on_cam: pengajarOnCam,
        latihan_diberikan: latihanDiberikan,
        status_latihan: finalStatus,
        semua_selesai: semuaSelesai,
        catatan,
        editable: true,
        diisi_by_role: 'ketua_kelas',
        diisi_by_id: resolved.ketuaKelasId,
      },
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    )
    .select('id')
    .single();
  if (error || !saved) return { error: `Gagal menyimpan: ${error?.message ?? 'tidak diketahui'}` };

  // Sync hits_pelanggaran (sumber kebenaran multi). Replace-all: hapus lalu insert.
  await supabaseAdmin.from('hits_pelanggaran').delete().eq('keterangan_id', saved.id);
  const pelRows: PelRow[] = pelIn.map((p) => ({
    keterangan_id: saved.id,
    jenis: p.jenis,
    menit: p.jenis === 'KMT' || p.jenis === 'KBLA' ? Math.trunc(p.menit as number) : null,
    jkg_opsi: p.jenis === 'JKG' ? (p.jkg_opsi ?? null) : null,
    cicil_n: p.jenis === 'JKG' && p.jkg_opsi === 'cicil' ? (p.cicil_n ?? null) : null,
    badal_nama: p.jenis === 'BADAL' ? String(p.badal_nama).trim() : null,
    badal_mulai: p.jenis === 'BADAL' ? (p.badal_mulai ?? null) : null,
  }));
  if (!isLibur && latihanDiberikan === false) {
    pelRows.push({
      keterangan_id: saved.id, jenis: 'TIDAK_LATIHAN',
      menit: null, jkg_opsi: null, cicil_n: null, badal_nama: null, badal_mulai: null,
    });
  }
  if (pelRows.length > 0) {
    const { error: pelErr } = await supabaseAdmin.from('hits_pelanggaran').insert(pelRows);
    if (pelErr) return { error: `Gagal menyimpan pelanggaran: ${pelErr.message}` };
  }

  // Pembayaran hutang menit (F2): replace-all per keterangan (idempoten saat edit).
  // Cap ke saldo terkini agar tak overpay (saldo dihitung setelah credit lama ket ini dihapus).
  // Hanya sapu kredit yang dilaporkan ketua. Kredit sumber='tabayyun' (disetujui
  // koordinator) TIDAK boleh ikut terhapus saat ketua mengedit pertemuan ini.
  await supabaseAdmin
    .from('hits_hutang_bayar')
    .delete()
    .eq('keterangan_id', saved.id)
    .eq('sumber', 'ketua');
  if (bayarMenit > 0) {
    const { saldo } = await computeHutangForHalaqah(halaqahId);
    const menit = Math.min(bayarMenit, saldo);
    if (menit > 0) {
      const { data: hq } = await supabaseAdmin
        .from('hits_halaqah')
        .select('pengajar_id')
        .eq('id', halaqahId)
        .maybeSingle();
      const { error: bayarErr } = await supabaseAdmin.from('hits_hutang_bayar').insert({
        halaqah_id: halaqahId,
        pengajar_id: (hq?.pengajar_id as string | null) ?? null,
        keterangan_id: saved.id,
        menit,
        tanggal: match.tanggal,
        dilaporkan_oleh: session.ketua_kelas_id,
        sumber: 'ketua',
      });
      if (bayarErr) return { error: `Gagal menyimpan pembayaran: ${bayarErr.message}` };
    }
  }

  // Lifecycle tabayyun: SATU tabayyun per keterangan yang me-list semua
  // pelanggaran (dibaca dari hits_pelanggaran saat kirim/tampil). Setiap
  // pelanggaran — termasuk TIDAK_LATIHAN — memicu klarifikasi. Bersih
  // (KBBS/LIBUR, tanpa baris pelanggaran) → hapus pending.
  const head = headline(jenisList);
  if (head) {
    const { data: halaqah } = await supabaseAdmin
      .from('hits_halaqah')
      .select('pengajar_id')
      .eq('id', halaqahId)
      .maybeSingle();
    // Upsert: bila sudah ada tabayyun utk keterangan ini, perbarui headline
    // (kecuali sudah decided — jangan buka ulang keputusan).
    const { data: existing } = await supabaseAdmin
      .from('hits_tabayyun')
      .select('id, status')
      .eq('keterangan_id', saved.id)
      .maybeSingle();
    if (!existing) {
      // Pengajar sudah lapor izin lewat Shakwa untuk tanggal ini? Alasannya dipakai
      // sebagai konteks — tapi izin TIDAK menutup tabayyun sendirian: bila menitnya
      // tak menutupi observasi, atau masih ada saldo hutang, status tetap 'pending'
      // supaya pengajar tetap ditanya lewat tautan tabayyun.
      const izin = await cariIzinCocok({
        pengajarId: halaqah?.pengajar_id,
        halaqahId,
        tanggal: match.tanggal,
        jenisList,
      });

      let statusBaru: 'pending' | 'awaiting_reason' = 'pending';
      let selisihIzin: number | null = null;
      if (izin) {
        // Menit observasi untuk jenis yang dicocokkan izin. 0 → null (tak ada
        // menit yang bisa dibandingkan, mis. izin TIDAK_HADIR atau jenis JKG).
        const menitObservasi =
          pelRows
            .filter((p) => p.jenis === izin.jenis)
            .reduce((s, p) => s + (p.menit ?? 0), 0) || null;
        const { saldo: saldoKini } = await computeHutangForHalaqah(halaqahId);
        const kebutuhan = kebutuhanTabayyunIzin({
          menitIzin: izin.menit,
          menitObservasi,
          saldoHutang: saldoKini,
        });
        statusBaru = kebutuhan.status;
        selisihIzin = kebutuhan.selisihMenit;
      }

      const { data: tabBaru } = await supabaseAdmin
        .from('hits_tabayyun')
        .insert({
          keterangan_id: saved.id,
          halaqah_id: halaqahId,
          pengajar_id: halaqah?.pengajar_id ?? null,
          kondisi: head,
          status: statusBaru,
          alasan_pengajar: izin ? alasanDariIzin(izin) : null,
          alasan_submitted_at: izin ? izin.dikirimAt : null,
          izin_selisih_menit: selisihIzin,
        })
        .select('id')
        .single();
      if (izin && tabBaru?.id) await tandaiIzinTerpakai(izin.id, tabBaru.id as string);
    } else if (existing.status !== 'decided') {
      await supabaseAdmin.from('hits_tabayyun').update({ kondisi: head }).eq('id', existing.id);
    }
  } else {
    await supabaseAdmin
      .from('hits_tabayyun')
      .delete()
      .eq('keterangan_id', saved.id)
      .eq('status', 'pending');
  }

  await logAudit({
    actor: session,
    action: 'hits.keterangan.submit',
    targetTable: 'hits_keterangan_harian',
    targetId: null,
    detail: { halaqah_id: halaqahId, pertemuan_no: pertemuanNo, kondisi, jenis: jenisList, bayar_menit: bayarMenit },
  });

  revalidatePath('/hits/ketua');
  return { ok: true };
}

export async function submitKajianCheckin(pilih: 'Hadir' | 'Izin' | 'Sakit') {
  const session = await requireKetuaKelas();
  const { data: self } = await supabaseAdmin
    .from('ketua_kelas').select('whatsapp_number').eq('id', session.ketua_kelas_id).maybeSingle();
  const ketuaWa = self?.whatsapp_number;
  if (!ketuaWa) return { ok: false, error: 'WA ketua tak ditemukan' };

  const today = todayJakarta();
  const nowIso = new Date().toISOString();

  // Tentukan tanggal sesi: hari-H (hari ini Minggu) atau Minggu terakhir yang direminder (susulan).
  let tanggal: string | null = dayIndexOf(today) === 0 ? today : null;
  if (!tanggal) {
    const { data: pend } = await supabaseAdmin
      .from('hits_kajian_presensi')
      .select('tanggal, reminder_sent_at')
      .eq('ketua_wa', ketuaWa).is('status', null).not('reminder_sent_at', 'is', null)
      .order('tanggal', { ascending: false }).limit(1);
    const row = pend?.[0];
    if (row?.reminder_sent_at) {
      const deadline = new Date(row.reminder_sent_at).getTime() + KAJIAN_GHOSTING_DAYS * 86_400_000;
      if (Date.now() < deadline) tanggal = row.tanggal;
      // else: countdown habis → tak boleh susulan (biarkan tercatat Alpa)
    }
  }
  if (!tanggal) return { ok: false, error: 'Belum waktunya presensi (bukan hari Minggu / tak ada reminder aktif).' };

  const { data: libur } = await supabaseAdmin
    .from('hits_kajian_libur').select('id').eq('tanggal', tanggal).maybeSingle();
  if (libur) return { ok: false, error: 'Kajian Adab tanggal ini libur.' };

  const status = statusOnCheckin(pilih, nowIso, tanggal);
  const { error } = await supabaseAdmin
    .from('hits_kajian_presensi')
    .upsert({ ketua_wa: ketuaWa, tanggal, status, checkin_at: nowIso }, { onConflict: 'ketua_wa,tanggal' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/hits/ketua');
  return { ok: true, status };
}
