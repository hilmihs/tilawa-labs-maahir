'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import {
  buildWaMeUrl,
  tplReminderKetuaKelasObservasi,
  tplReminderPengajarTunjukKetua,
  tplTabayyunToPengajar,
  tplTabayyunGhostingTeguran,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { logAudit } from '@/lib/audit';
import { logWaReminder } from '@/lib/wa-log';
import { getHitsHarian, OBSERVASI_EFEKTIF } from '@/lib/hits-harian';
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
import {
  tabayyunGhostingState,
  deadlineFromReminder,
  capBayarDisetujui,
  describePelanggaran,
} from '@/lib/hits-tabayyun';
import { generateTabayyunToken } from '@/lib/hits-tabayyun-token';

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/** URL isi keterangan untuk ketua: magic-link (auto-login) bila ada token. */
function ketuaFillUrl(magicToken: string | null): string {
  return magicToken ? absUrl(`/api/auth/magic-link?token=${magicToken}`) : absUrl('/hits/ketua');
}

/** Shape minimal tabayyun untuk terbitkan teguran. */
type TegTab = {
  id: string;
  kondisi: string;
  pengajar_id: string | null;
  halaqah?: { pengajar_id: string | null } | null;
  keterangan?: { tanggal: string } | null;
};

/**
 * Terbitkan teguran non-udzur untuk sebuah tabayyun (idempoten per tabayyun).
 * Dipakai decideTabayyun (keputusan manual) & escalateTabayyunGhosting (auto 72h).
 * Kategori: KMT/KBLA→kedisiplinan_waktu (jam kelas), JKG/BADAL→komitmen_jadwal
 * (kelas ada/tidak), lain→tanggung_jawab. Pembagian ini sengaja sama dengan
 * matrix-compute.ts agar satu pelanggaran tak menghukum dua indikator.
 */
async function issueTeguranForTabayyun(
  tab: TegTab,
  opts: { catatan: string | null; actorId: string; actorRole: string }
): Promise<void> {
  const pengajarId = tab.pengajar_id ?? tab.halaqah?.pengajar_id ?? null;
  if (!pengajarId) return;
  const ym = (tab.keterangan?.tanggal ?? jakartaToday()).slice(0, 7);
  const category =
    tab.kondisi === 'KMT' || tab.kondisi === 'KBLA'
      ? 'kedisiplinan_waktu'
      : tab.kondisi === 'JKG' || tab.kondisi === 'BADAL'
        ? 'komitmen_jadwal'
        : 'tanggung_jawab';
  // Idempotent: jangan gandakan teguran utk tabayyun yang sama.
  const { data: existing } = await supabaseAdmin
    .from('hits_teguran')
    .select('id')
    .eq('source_ref_type', 'hits_tabayyun')
    .eq('source_ref_id', tab.id)
    .maybeSingle();
  if (existing) return;
  const { count } = await supabaseAdmin
    .from('hits_teguran')
    .select('id', { count: 'exact', head: true })
    .eq('pengajar_id', pengajarId)
    .eq('year_month', ym)
    .eq('category', category);
  await supabaseAdmin.from('hits_teguran').insert({
    pengajar_id: pengajarId,
    year_month: ym,
    category,
    nomor_teguran: (count ?? 0) + 1,
    source_ref_type: 'hits_tabayyun',
    source_ref_id: tab.id,
    keterangan: opts.catatan || `Tabayyun ${tab.kondisi} tidak diterima sebagai udzur syar'i`,
    issued_by_role: opts.actorRole,
    issued_by_id: opts.actorId,
  });
}

/** Koordinator KK memutuskan tabayyun HITS (udzur syar'i atau tidak). */
export async function decideTabayyun(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requireKoordinatorKetuaKelas();

  const tabayyunId = String(formData.get('tabayyun_id') ?? '');
  const isUdzur = formData.get('is_udzur_syari') === 'true';
  const catatan = String(formData.get('keputusan_catatan') ?? '').trim();

  if (!tabayyunId) return { error: 'ID tabayyun tidak ditemukan.' };

  // Konteks utk auto-teguran (kondisi, pengajar, tanggal) + kredit hutang.
  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select('id, kondisi, pengajar_id, halaqah_id, keterangan_id, bayar_menit_klaim, halaqah:halaqah_id(pengajar_id), keterangan:keterangan_id(tanggal)')
    .eq('id', tabayyunId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from('hits_tabayyun')
    .update({
      is_udzur_syari: isUdzur,
      keputusan_catatan: catatan || null,
      decided_at: new Date().toISOString(),
      status: 'decided',
      koordinator_kk_id: session.koordinator_kk_id,
    })
    .eq('id', tabayyunId);

  if (error) return { error: `Gagal simpan: ${error.message}` };

  // Kredit hutang hasil persetujuan. Replace-all agar keputusan bisa diubah
  // tanpa menumpuk kredit; hanya menyapu baris sumber='tabayyun' milik sendiri.
  const disetujuiRaw = Number(formData.get('bayar_menit_disetujui') ?? 0);
  if (tab?.keterangan_id) {
    await supabaseAdmin
      .from('hits_hutang_bayar')
      .delete()
      .eq('keterangan_id', tab.keterangan_id as string)
      .eq('sumber', 'tabayyun');

    const { saldo } = await computeHutangForHalaqah(tab.halaqah_id as string);
    const menit = capBayarDisetujui(disetujuiRaw, saldo);
    if (menit > 0) {
      const ketTab = tab.keterangan as unknown as { tanggal: string } | null;
      const halTab = tab.halaqah as unknown as { pengajar_id: string | null } | null;
      const { error: bayarErr } = await supabaseAdmin.from('hits_hutang_bayar').insert({
        halaqah_id: tab.halaqah_id as string,
        pengajar_id: (tab.pengajar_id as string | null) ?? halTab?.pengajar_id ?? null,
        keterangan_id: tab.keterangan_id as string,
        menit,
        tanggal: ketTab?.tanggal ?? new Date().toISOString().slice(0, 10),
        dilaporkan_oleh: `koordinator_kk:${session.koordinator_kk_id}`,
        sumber: 'tabayyun',
      });
      if (bayarErr) return { error: `Gagal menyimpan pembayaran: ${bayarErr.message}` };
    }

    await supabaseAdmin
      .from('hits_tabayyun')
      .update({ bayar_menit_disetujui: menit })
      .eq('id', tabayyunId);

    await logAudit({
      actor: session,
      action: 'hits.tabayyun.bayar',
      targetTable: 'hits_hutang_bayar',
      targetId: tabayyunId,
      detail: { klaim: tab.bayar_menit_klaim ?? null, disetujui: menit, saldo_sebelum: saldo },
    });
  }

  // Bukan udzur syar'i → terbitkan teguran (feed komitmen_jadwal matrix + risk).
  if (!isUdzur && tab) {
    await issueTeguranForTabayyun(tab as unknown as TegTab, {
      catatan: catatan || null,
      actorId: session.koordinator_kk_id,
      actorRole: 'koordinator_ketua_kelas',
    });
  }

  await logAudit({
    actor: session,
    action: 'hits.tabayyun.decide',
    targetTable: 'hits_tabayyun',
    targetId: tabayyunId,
    detail: { is_udzur_syari: isUdzur, keputusan_catatan: catatan || null },
  });

  return { ok: true };
}

/** Reminder WA ke ketua kelas agar mengisi keterangan harian (HITS). */
export async function reminderKetuaKelas(
  ketuaKelasId: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: ketua } = await supabaseAdmin
    .from('ketua_kelas')
    .select('name, whatsapp_number, gender, magic_token')
    .eq('id', ketuaKelasId)
    .maybeSingle();

  if (!ketua) return { error: 'Ketua kelas tidak ditemukan.' };

  const msg = tplReminderKetuaKelasObservasi({
    ketuaKelasName: ketua.name,
    ketuaKelasGender: ketua.gender,
    kelasName,
    observasiUrl: ketuaFillUrl(ketua.magic_token),
  });

  const waUrl = buildWaMeUrl(ketua.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'ketua_kelas',
    recipientId: ketuaKelasId,
    recipientWa: ketua.whatsapp_number,
    templateKind: 'observasi_reminder',
  });

  return { waUrl };
}

/**
 * Reminder WA ke pengajar agar mengirim alasan tabayyun (HITS). Satu tabayyun per
 * pertemuan → template me-list SEMUA pelanggaran-nya (dibaca dari hits_pelanggaran).
 */
export async function reminderTabayyunPengajar(
  tabayyunId: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select('id, keterangan_id, pengajar_id, halaqah_id, status, reminder_sent_at, deadline_at, akses_token, halaqah:halaqah_id(name), keterangan:keterangan_id(tanggal)')
    .eq('id', tabayyunId)
    .maybeSingle();
  if (!tab) return { error: 'Tabayyun tidak ditemukan.' };

  const nowIso = new Date().toISOString();
  const state = tabayyunGhostingState(
    { status: tab.status as string, reminder_sent_at: tab.reminder_sent_at as string | null, deadline_at: tab.deadline_at as string | null },
    nowIso
  );
  if (state === 'ghosting') {
    return { error: 'Sudah lewat 72 jam tanpa respons — gunakan tombol "Teguran ghosting".' };
  }
  if (state === 'has_reason' || state === 'decided') {
    return { error: 'Tabayyun ini sudah direspons/diputuskan — reminder tidak berlaku.' };
  }
  // Reminder pertama → mulai jam 72h. Reminder ulang dalam window → jam TAK di-reset.
  // Token digenerate sekali lalu dipakai selamanya (sampai status decided).
  let token = (tab.akses_token as string | null) ?? null;
  const patch: Record<string, string> = {};
  if (!tab.reminder_sent_at) {
    patch.reminder_sent_at = nowIso;
    patch.deadline_at = deadlineFromReminder(nowIso);
  }
  if (!token) {
    token = generateTabayyunToken();
    patch.akses_token = token;
  }
  if (Object.keys(patch).length > 0) {
    const { error: clockErr } = await supabaseAdmin
      .from('hits_tabayyun')
      .update(patch)
      .eq('id', tab.id);
    if (clockErr) return { error: `Gagal mulai jam tabayyun: ${clockErr.message}` };
  }

  const hal = tab.halaqah as unknown as { name: string } | null;
  const ket = tab.keterangan as unknown as { tanggal: string } | null;

  const { data: pengajar } = tab.pengajar_id
    ? await supabaseAdmin
        .from('pengajar')
        .select('name, whatsapp_number, gender')
        .eq('id', tab.pengajar_id)
        .maybeSingle()
    : { data: null };
  if (!pengajar) return { error: 'Pengajar tidak ditemukan.' };

  const { data: pelRows } = await supabaseAdmin
    .from('hits_pelanggaran')
    .select('jenis, menit, jkg_opsi, cicil_n, badal_nama, badal_mulai')
    .eq('keterangan_id', tab.keterangan_id);
  const pelanggaran = (pelRows ?? []).map(describePelanggaran);

  const hutang = tab.halaqah_id
    ? await computeHutangForHalaqah(tab.halaqah_id as string)
    : { saldo: 0 };

  const msg = tplTabayyunToPengajar({
    pengajarName: pengajar.name,
    pengajarGender: pengajar.gender,
    tanggal: ket?.tanggal ?? '',
    kelasName: hal?.name ?? '(kelas)',
    formUrl: absUrl(`/tabayyun/${token}`),
    pelanggaran,
    hutangSaldo: hutang.saldo,
  });

  const waUrl = buildWaMeUrl(pengajar.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'pengajar',
    recipientId: tab.pengajar_id!,
    recipientWa: pengajar.whatsapp_number,
    templateKind: 'tabayyun_notify',
    targetTable: 'hits_keterangan_harian',
  });

  return { waUrl };
}

/**
 * Eskalasi ghosting: pengajar tak respons 72h sejak reminder → non-udzur otomatis
 * + teguran + WA bertanggal. Guard: hanya bila state 'ghosting'.
 */
export async function escalateTabayyunGhosting(
  tabayyunId: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    // prettier-ignore
    .select('id, kondisi, keterangan_id, pengajar_id, halaqah_id, status, reminder_sent_at, deadline_at, halaqah:halaqah_id(name, pengajar_id), keterangan:keterangan_id(tanggal)')
    .eq('id', tabayyunId)
    .maybeSingle();
  if (!tab) return { error: 'Tabayyun tidak ditemukan.' };

  const nowIso = new Date().toISOString();
  const state = tabayyunGhostingState(
    { status: tab.status as string, reminder_sent_at: tab.reminder_sent_at as string | null, deadline_at: tab.deadline_at as string | null },
    nowIso
  );
  if (state !== 'ghosting') {
    return { error: 'Tabayyun ini belum memenuhi syarat ghosting (72 jam tanpa respons).' };
  }

  const hal = tab.halaqah as unknown as { name: string; pengajar_id: string | null } | null;
  const ket = tab.keterangan as unknown as { tanggal: string } | null;

  const fmtWib = (iso: string) =>
    new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  const catatan = `Ghosting: tak respons 72 jam sejak diingatkan ${fmtWib(tab.reminder_sent_at as string)}`;

  // Putuskan non-udzur.
  const { error: updErr } = await supabaseAdmin
    .from('hits_tabayyun')
    .update({
      is_udzur_syari: false,
      keputusan_catatan: catatan,
      decided_at: nowIso,
      status: 'decided',
      koordinator_kk_id: session.koordinator_kk_id,
    })
    .eq('id', tab.id);
  if (updErr) return { error: `Gagal simpan: ${updErr.message}` };

  // Teguran (idempoten).
  await issueTeguranForTabayyun(
    { id: tab.id as string, kondisi: tab.kondisi as string, pengajar_id: tab.pengajar_id as string | null, halaqah: hal, keterangan: ket },
    { catatan, actorId: session.koordinator_kk_id, actorRole: 'koordinator_ketua_kelas' }
  );

  // Nomor teguran untuk template WA (baca ulang teguran tabayyun ini).
  const { data: teg } = await supabaseAdmin
    .from('hits_teguran')
    .select('nomor_teguran')
    .eq('source_ref_type', 'hits_tabayyun')
    .eq('source_ref_id', tab.id)
    .maybeSingle();

  // WA teguran ghosting.
  let waUrl: string | undefined;
  if (tab.pengajar_id) {
    const { data: pengajar } = await supabaseAdmin
      .from('pengajar')
      .select('name, whatsapp_number, gender')
      .eq('id', tab.pengajar_id)
      .maybeSingle();
    if (pengajar?.whatsapp_number) {
      const { data: pelRows } = await supabaseAdmin
        .from('hits_pelanggaran')
        .select('jenis, menit, jkg_opsi, cicil_n, badal_nama, badal_mulai')
        .eq('keterangan_id', tab.keterangan_id as string);
      const pelanggaran = (pelRows ?? []).map(describePelanggaran);
      const hutang = tab.halaqah_id
        ? await computeHutangForHalaqah(tab.halaqah_id as string)
        : { saldo: 0 };
      const msg = tplTabayyunGhostingTeguran({
        pengajarName: pengajar.name,
        pengajarGender: pengajar.gender,
        tanggalObservasi: ket?.tanggal ?? '',
        diingatkanWib: fmtWib(tab.reminder_sent_at as string),
        deadlineWib: fmtWib(tab.deadline_at as string),
        nomorTeguran: teg?.nomor_teguran ?? 1,
        pelanggaran,
        hutangSaldo: hutang.saldo,
      });
      waUrl = buildWaMeUrl(pengajar.whatsapp_number, msg);
      await logWaReminder({
        sender: session,
        recipientTable: 'pengajar',
        recipientId: tab.pengajar_id as string,
        recipientWa: pengajar.whatsapp_number,
        templateKind: 'tabayyun_ghosting',
        targetTable: 'hits_keterangan_harian',
      });
    }
  }

  await logAudit({
    actor: session,
    action: 'hits.tabayyun.ghosting',
    targetTable: 'hits_tabayyun',
    targetId: tab.id as string,
    detail: { reminder_sent_at: tab.reminder_sent_at, deadline_at: tab.deadline_at },
  });

  return { waUrl };
}

/** Reminder WA ke pengajar agar menunjuk ketua kelas (halaqah tanpa ketua). */
export async function reminderTunjukKetua(
  pengajarId: string,
  kelasName: string
): Promise<{ waUrl?: string; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();

  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('name, whatsapp_number, gender')
    .eq('id', pengajarId)
    .maybeSingle();
  if (!pengajar || !pengajar.whatsapp_number) return { error: 'Pengajar / WA tidak ditemukan.' };

  const msg = tplReminderPengajarTunjukKetua({
    pengajarName: pengajar.name,
    pengajarGender: pengajar.gender,
    kelasName,
    url: absUrl('/hits/pengajar'),
  });
  const waUrl = buildWaMeUrl(pengajar.whatsapp_number, msg);

  await logWaReminder({
    sender: session,
    recipientTable: 'pengajar',
    recipientId: pengajarId,
    recipientWa: pengajar.whatsapp_number,
    templateKind: 'tunjuk_ketua',
  });

  return { waUrl };
}

export type ReminderItem = { ketuaName: string; kelasName: string; waUrl: string };

/**
 * Reminder massal: semua ketua kelas yang halaqahnya ada pertemuan hari ini &
 * keterangan belum diisi. Tiap item berisi link wa.me + magic-link auto-login
 * ke form pengisian. Efektif mulai OBSERVASI_EFEKTIF (2026-06-22).
 */
export async function reminderMassalHariIni(): Promise<{ items?: ReminderItem[]; error?: string }> {
  const session = await requireKoordinatorKetuaKelas();
  const today = jakartaToday();
  if (today < OBSERVASI_EFEKTIF) {
    return { error: `Sistem observasi mulai efektif ${OBSERVASI_EFEKTIF}.` };
  }

  const { rows } = await getHitsHarian(today, session.gender);
  const targets = rows.filter((r) => !r.keterangan && r.ketua);
  if (targets.length === 0) return { items: [] };

  const ketuaIds = targets.map((r) => r.ketua!.id);
  const { data: ketuaRows } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, name, whatsapp_number, gender, magic_token')
    .in('id', ketuaIds);
  const ketuaById = new Map((ketuaRows ?? []).map((k) => [k.id, k]));

  const items: ReminderItem[] = [];
  for (const r of targets) {
    const k = ketuaById.get(r.ketua!.id);
    if (!k) continue;
    const msg = tplReminderKetuaKelasObservasi({
      ketuaKelasName: k.name,
      ketuaKelasGender: k.gender,
      kelasName: r.halaqah_name,
      observasiUrl: ketuaFillUrl(k.magic_token),
    });
    items.push({ ketuaName: k.name, kelasName: r.halaqah_name, waUrl: buildWaMeUrl(k.whatsapp_number, msg) });
    await logWaReminder({
      sender: session,
      recipientTable: 'ketua_kelas',
      recipientId: k.id,
      recipientWa: k.whatsapp_number,
      templateKind: 'observasi_reminder',
    });
  }
  return { items };
}
