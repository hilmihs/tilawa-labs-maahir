import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { ensureAudioBucket, uploadAudio } from '@/lib/storage';
import { buildWaMeUrl, tplPesertaSubmitToMusyrif } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import {
  aksesPeserta,
  bacaWeekStart,
  balasGagal,
  catatAudit,
  muatKeadaanSetoran,
  pastikanSetoran,
  simpanRekaman,
  sudahDinilai,
  tandaiTerkirim,
} from '@/lib/setoran-submit';
import { JENIS_REKAMAN, JENIS_REKAMAN_LABEL, type JenisRekaman, type PesertaSession } from '@/types/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ROUTE = 'rekaman/submit-single';

export async function POST(req: NextRequest) {
  let actor: PesertaSession | null = null;
  let jenisDicatat: string | null = null;
  let weekDicatat: string | null = null;
  try {
    const s = await getSession();
    actor = aksesPeserta(s);
    if (!actor) {
      return NextResponse.json({ error: 'Anda harus login sebagai peserta.' }, { status: 401 });
    }
    const pesertaId = actor.peserta_id;

    const form = await req.formData();
    const jenisRaw = form.get('jenis');
    const jenis = typeof jenisRaw === 'string' ? jenisRaw : null;
    jenisDicatat = jenis;
    const file = form.get('audio_file') as File | null;
    const durationSec = (() => {
      const v = form.get('duration_sec');
      if (!v) return null;
      const n = parseInt(String(v));
      return Number.isFinite(n) ? n : null;
    })();

    if (!jenis || !JENIS_REKAMAN.includes(jenis as JenisRekaman)) {
      return balasGagal(actor, ROUTE, 400, 'Jenis rekaman tidak valid.', { jenis });
    }
    // Cek bentuk, bukan `instanceof File` — runtime prod tidak punya global File.
    if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function' || file.size === 0) {
      return balasGagal(actor, ROUTE, 400, 'File rekaman kosong. Rekam ulang lalu kirim lagi.', { jenis });
    }
    const jenisRekaman = jenis as JenisRekaman;
    const label = JENIS_REKAMAN_LABEL[jenisRekaman];

    const ws = bacaWeekStart(form);
    if (!ws.ok) {
      return balasGagal(actor, ROUTE, 400, ws.error, { jenis, week_start: String(form.get('week_start') ?? '') });
    }
    const weekStart = ws.weekStart;
    weekDicatat = weekStart;

    const { data: peserta, error: pErr } = await supabaseAdmin
      .from('peserta')
      .select('id, name, gender, kelas:kelas_id(id, name, musyrif:musyrif_id(id, name, gender, whatsapp_number))')
      .eq('id', pesertaId)
      .eq('active', true)
      .single();
    if (pErr || !peserta) {
      return balasGagal(actor, ROUTE, 404, 'Peserta tidak ditemukan atau sudah tidak aktif.', { jenis, week_start: weekStart });
    }
    const kelas = peserta.kelas as unknown as {
      id: string;
      name: string;
      musyrif: { id: string; name: string; gender: 'ikhwan' | 'akhwat'; whatsapp_number: string };
    } | null;
    if (!kelas?.musyrif) {
      return balasGagal(actor, ROUTE, 409, 'Kelas atau musyrif Anda belum diatur. Hubungi koordinator.', { jenis, week_start: weekStart });
    }
    const musyrif = kelas.musyrif;

    const keadaan = await muatKeadaanSetoran(pesertaId, weekStart);
    if (!keadaan.ok) {
      return balasGagal(actor, ROUTE, 500, keadaan.error, { jenis, week_start: weekStart });
    }
    const existing = keadaan.data.setoran;
    const rekamanAda = keadaan.data.rekaman.get(jenisRekaman);

    // Rekaman yang sudah dinilai tidak boleh ditimpa — dicek SEBELUM menulis
    // berkas, karena path audio per jenis tetap dan unggahan akan menimpanya.
    if (sudahDinilai(rekamanAda)) {
      return balasGagal(
        actor,
        ROUTE,
        409,
        `Rekaman ${label} sudah dinilai musyrif, tidak bisa diganti.`,
        { jenis, week_start: weekStart, kode: 'sudah_dinilai' },
        existing?.id ?? null
      );
    }
    // Setoran 'checked' yang masih kurang rekaman → terima rekaman susulan
    // dan buka ulang ke 'submitted' (nilai rekaman lain dibiarkan utuh).
    const bukaUlang = existing?.status === 'checked';

    const idSetoran = await pastikanSetoran(pesertaId, weekStart, existing);
    if (!idSetoran.ok) {
      return balasGagal(actor, ROUTE, 500, idSetoran.error, { jenis, week_start: weekStart });
    }
    const setoranId = idSetoran.id;
    const isFirstRekaman = !existing;

    await ensureAudioBucket();

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = await uploadAudio({
      pesertaId,
      weekStart,
      jenis: jenisRekaman,
      blob: buffer,
      contentType: file.type || 'audio/webm',
    });

    const simpan = await simpanRekaman({
      setoranId,
      jenis: jenisRekaman,
      path,
      durationSec,
      recordedAt: new Date().toISOString(),
      adaBaris: !!rekamanAda,
    });
    if (!simpan.ok) {
      return balasGagal(
        actor,
        ROUTE,
        simpan.status,
        simpan.status === 409 ? `Rekaman ${label} sudah dinilai musyrif, tidak bisa diganti.` : simpan.error,
        { jenis, week_start: weekStart, ...(simpan.status === 409 ? { kode: 'sudah_dinilai' } : {}) },
        setoranId
      );
    }

    const tanda = await tandaiTerkirim(setoranId, existing?.status ?? 'draft');
    if (!tanda.ok) {
      return balasGagal(actor, ROUTE, 500, tanda.error, { jenis, week_start: weekStart }, setoranId);
    }
    if (bukaUlang) {
      catatAudit(actor, 'setoran.buka_ulang', setoranId, {
        route: ROUTE,
        jenis,
        week_start: weekStart,
        checked_at_lama: existing?.checked_at ?? null,
        checked_by_musyrif_id_lama: existing?.checked_by_musyrif_id ?? null,
      });
    }

    // Tautan WA hanya saat rekaman pertama atau saat setoran dibuka ulang,
    // supaya musyrif tidak dibanjiri pesan.
    let waUrl: string | null = null;
    if (isFirstRekaman || bukaUlang) {
      const cekUrl = absUrl(`/2in1/musyrif/cek/${setoranId}`);
      const waText = tplPesertaSubmitToMusyrif({
        pesertaName: peserta.name,
        pesertaGender: peserta.gender as 'ikhwan' | 'akhwat',
        kelasName: kelas.name,
        musyrifGender: musyrif.gender,
        cekUrl,
      });
      waUrl = buildWaMeUrl(musyrif.whatsapp_number, waText);
    }

    return NextResponse.json({
      ok: true,
      setoran_id: setoranId,
      week_start: weekStart,
      jenis: jenisRekaman,
      dibuka_ulang: bukaUlang,
      musyrif_name: musyrif.name,
      wa_url: waUrl,
    });
  } catch (e: unknown) {
    const pesan = e instanceof Error ? e.message : 'Internal error';
    if (actor) {
      return balasGagal(actor, ROUTE, 500, `Gagal menyimpan rekaman: ${pesan}`, {
        jenis: jenisDicatat,
        week_start: weekDicatat,
      });
    }
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}
