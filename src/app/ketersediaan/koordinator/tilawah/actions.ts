'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOneOfRoles } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { catatKs } from '@/lib/ketersediaan-log';
import { jagaKirimTilawah } from '@/lib/ketersediaan-akses';
import { getPeriode, listSlot } from '@/lib/ketersediaan-periode';
import {
  ambilBatches,
  ambilDays,
  ambilLevels,
  ambilPrograms,
  ambilSessions,
  tilawahTerkonfigurasi,
  ujiKoneksi,
} from '@/lib/tilawah/client';
import { usulkanHari, usulkanLevel, usulkanSesi } from '@/lib/tilawah/map';
import { prosesOutbox, pulihkanOutboxGagal } from '@/lib/tilawah/push';

export type Hasil = { ok: true; pesan: string; data?: unknown } | { ok: false; error: string };

const LEVEL_DIPAKAI = ['HITS Dasar', 'HITS Lanjutan'];

export async function ujiKoneksiTilawah(): Promise<Hasil> {
  await requireOneOfRoles(['koordinator']);
  await jagaKirimTilawah();
  if (!tilawahTerkonfigurasi()) {
    return { ok: false, error: 'TILAWAH_BASE_URL / TILAWAH_EMAIL / TILAWAH_PASSWORD belum diset.' };
  }
  try {
    const r = await ujiKoneksi();
    return { ok: true, pesan: `Terhubung. ${r.programs} program terbaca.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Daftar program & batch CMS, untuk memilih tujuan. */
export async function muatProgramBatch(input: { programId?: number }): Promise<Hasil> {
  await requireOneOfRoles(['koordinator']);
  await jagaKirimTilawah();
  try {
    const programs = await ambilPrograms();
    const batches = input.programId ? await ambilBatches(input.programId) : [];
    return {
      ok: true,
      pesan: `${programs.length} program`,
      data: {
        programs: programs.map((p) => ({ id: p.id, name: p.name })),
        batches: batches.map((b) => ({ id: b.id, name: b.name, program_id: b.program_id })),
      },
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Susun usulan pemetaan slot & level untuk satu batch CMS.
 *
 * Hanya USULAN — koordinator yang mengesahkan. Sebagian baris master `days`
 * punya `int_days` pincang (probe staging: id 3 "Selasa, Jum'at" berisi [1]
 * saja), sehingga pencocokan otomatis bisa memilih baris yang namanya benar
 * tetapi isinya salah, dan halaqah terjadwal pada hari yang keliru.
 */
export async function muatUsulanPemetaan(input: {
  periodeId: string;
  batchId: number;
}): Promise<Hasil> {
  await requireOneOfRoles(['koordinator']);
  await jagaKirimTilawah();
  try {
    const [slots, days, sessions, levels] = await Promise.all([
      listSlot(input.periodeId, { hanyaAktif: true }),
      ambilDays(),
      ambilSessions(),
      ambilLevels(),
    ]);

    const { data: slotMapRows } = await supabaseAdmin
      .from('ks_tilawah_slot_map')
      .select('slot_id, day_id, session_id, usulan_otomatis')
      .eq('tilawah_batch_id', input.batchId);
    const tersimpan = new Map(
      ((slotMapRows ?? []) as {
        slot_id: string;
        day_id: number;
        session_id: number;
        usulan_otomatis: boolean;
      }[]).map((r) => [r.slot_id, r])
    );

    const { data: levelMapRows } = await supabaseAdmin
      .from('ks_tilawah_level_map')
      .select('level_nama, level_id')
      .eq('tilawah_batch_id', input.batchId);
    const levelTersimpan = new Map(
      ((levelMapRows ?? []) as { level_nama: string; level_id: number }[]).map((r) => [
        r.level_nama,
        r.level_id,
      ])
    );

    const barisSlot = slots.map((s) => {
      const hari = usulkanHari(s, days);
      const sesi = usulkanSesi(s, sessions);
      const ada = tersimpan.get(s.id);
      return {
        slot_id: s.id,
        label: s.label,
        kelompok: s.kelompok,
        mode: s.mode,
        day_id: ada?.day_id ?? hari.day_id,
        session_id: ada?.session_id ?? sesi.session_id,
        tersimpan: Boolean(ada) && !ada?.usulan_otomatis,
        hari_keyakinan: hari.keyakinan,
        hari_alasan: hari.alasan,
        sesi_keyakinan: sesi.keyakinan,
        sesi_alasan: sesi.alasan,
      };
    });

    const barisLevel = LEVEL_DIPAKAI.map((nama) => {
      const u = usulkanLevel(nama, levels);
      return {
        level_nama: nama,
        level_id: levelTersimpan.get(nama) ?? u.level_id,
        tersimpan: levelTersimpan.has(nama),
        keyakinan: u.keyakinan,
        alasan: u.alasan,
      };
    });

    return {
      ok: true,
      pesan: `${slots.length} slot, ${days.length} hari, ${sessions.length} sesi, ${levels.length} level.`,
      data: {
        slot: barisSlot,
        level: barisLevel,
        pilihanHari: days
          .filter((d) => d.status === 1)
          .map((d) => ({ id: d.id, nama: `${d.name} ${JSON.stringify(d.int_days)}` })),
        pilihanSesi: sessions
          .filter((s) => s.status === 1)
          .map((s) => ({ id: s.id, nama: `${s.name} (${s.start_hour?.slice(0, 5)}–${s.end_hour?.slice(0, 5)})` })),
        pilihanLevel: levels.filter((l) => l.status === 1).map((l) => ({ id: l.id, nama: l.name })),
      },
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function sahkanPemetaan(input: {
  periodeId: string;
  batchId: number;
  slot: { slot_id: string; day_id: number | null; session_id: number | null }[];
  level: { level_nama: string; level_id: number | null }[];
}): Promise<Hasil> {
  const sesi = await requireOneOfRoles(['koordinator']);
  await jagaKirimTilawah();
  const wa = await getSessionWa();
  const sekarang = new Date().toISOString();

  let disimpan = 0;
  let dilewati = 0;

  for (const s of input.slot) {
    if (!s.day_id || !s.session_id) {
      // Baris tanpa pasangan lengkap sengaja TIDAK disimpan: slot tanpa pemetaan
      // membuat halaqahnya ditahan, dan itu memang perilaku yang diinginkan.
      dilewati++;
      continue;
    }
    const { data: ada } = await supabaseAdmin
      .from('ks_tilawah_slot_map')
      .select('id')
      .eq('tilawah_batch_id', input.batchId)
      .eq('slot_id', s.slot_id)
      .maybeSingle();
    const baris = {
      periode_id: input.periodeId,
      tilawah_batch_id: input.batchId,
      slot_id: s.slot_id,
      day_id: s.day_id,
      session_id: s.session_id,
      usulan_otomatis: false,
      disahkan_oleh: sesi.name,
      disahkan_pada: sekarang,
      updated_at: sekarang,
    };
    if (ada) await supabaseAdmin.from('ks_tilawah_slot_map').update(baris).eq('id', ada.id);
    else await supabaseAdmin.from('ks_tilawah_slot_map').insert(baris);
    disimpan++;
  }

  for (const l of input.level) {
    if (!l.level_id) {
      dilewati++;
      continue;
    }
    const { data: ada } = await supabaseAdmin
      .from('ks_tilawah_level_map')
      .select('id')
      .eq('tilawah_batch_id', input.batchId)
      .eq('level_nama', l.level_nama)
      .maybeSingle();
    const baris = {
      periode_id: input.periodeId,
      tilawah_batch_id: input.batchId,
      level_nama: l.level_nama,
      level_id: l.level_id,
      disahkan_oleh: sesi.name,
      disahkan_pada: sekarang,
      updated_at: sekarang,
    };
    if (ada) await supabaseAdmin.from('ks_tilawah_level_map').update(baris).eq('id', ada.id);
    else await supabaseAdmin.from('ks_tilawah_level_map').insert(baris);
    disimpan++;
  }

  await catatKs({
    periode_id: input.periodeId,
    entitas: 'ks_tilawah_slot_map',
    aksi: 'sahkan_pemetaan',
    sesudah: { batch: input.batchId, disimpan, dilewati },
    aktor_wa: wa,
    aktor_nama: sesi.name,
  });

  revalidatePath('/ketersediaan/koordinator/tilawah');
  return {
    ok: true,
    pesan: `${disimpan} pemetaan disahkan${dilewati ? `, ${dilewati} dilewati karena belum lengkap` : ''}.`,
  };
}

/**
 * Jalankan antrean pengiriman. Dalam mode kirim-percobaan ini hanya menyusun
 * dan menyimpan payload — tidak ada panggilan keluar sama sekali.
 */
export async function jalankanOutbox(input: { periodeId: string }): Promise<Hasil> {
  const sesi = await requireOneOfRoles(['koordinator']);
  await jagaKirimTilawah();
  const wa = await getSessionWa();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };

  try {
    const h = await prosesOutbox(periode);
    await catatKs({
      periode_id: periode.id,
      entitas: 'ks_outbox',
      aksi: 'jalankan_outbox',
      sesudah: {
        percobaan: h.percobaan,
        diproses: h.diproses,
        terkirim: h.terkirim,
        gagal: h.gagal,
        ditahan: h.ditahan,
      },
      aktor_wa: wa,
      aktor_nama: sesi.name,
    });
    const kepala = h.percobaan
      ? `Mode percobaan: ${h.diproses} baris disusun payload-nya (${h.ditahan} tertahan), tidak ada yang dikirim.`
      : `${h.terkirim} terkirim, ${h.gagal} gagal, ${h.ditahan} tertahan dari ${h.diproses} baris.`;
    revalidatePath('/ketersediaan/koordinator/tilawah');
    return { ok: true, pesan: [kepala, ...h.pesan].join('\n') };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Kembalikan baris antrean yang `gagal` ke antrean dengan jatah percobaan baru.
 *
 * Baris PERLU CEK (pertemuan yang mungkin sudah sampai ke CMS) hanya ikut bila
 * `termasukPerluCek` — koordinator menyatakan sudah memeriksa CMS dan pertemuan
 * itu belum ada. Salah menyatakannya berarti pertemuan kembar di CMS.
 */
export async function ulangiOutboxGagal(input: {
  periodeId: string;
  termasukPerluCek?: boolean;
}): Promise<Hasil> {
  const sesi = await requireOneOfRoles(['koordinator']);
  await jagaKirimTilawah();
  const wa = await getSessionWa();
  const periode = await getPeriode(input.periodeId);
  if (!periode) return { ok: false, error: 'Periode tidak ditemukan.' };

  try {
    const h = await pulihkanOutboxGagal(periode.id, { termasukPerluCek: Boolean(input.termasukPerluCek) });
    await catatKs({
      periode_id: periode.id,
      entitas: 'ks_outbox',
      aksi: 'ulangi_outbox_gagal',
      sesudah: { ...h, termasuk_perlu_cek: Boolean(input.termasukPerluCek) },
      aktor_wa: wa,
      aktor_nama: sesi.name,
    });
    revalidatePath('/ketersediaan/koordinator/tilawah');
    return {
      ok: true,
      pesan:
        `${h.dipulihkan} baris dikembalikan ke antrean.`
        + (h.perluCekDilewati > 0
          ? ` ${h.perluCekDilewati} baris PERLU CEK tidak disentuh — periksa CMS dulu, lalu centang pilihan perlu-cek.`
          : ''),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
