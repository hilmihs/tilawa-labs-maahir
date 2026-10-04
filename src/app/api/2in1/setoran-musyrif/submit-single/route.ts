// Kirim satu rekaman setoran musyrif → syaikh (mode satu-satu di halaman
// /2in1/musyrif/setor). Cermin dari /api/2in1/rekaman/submit-single milik
// peserta — aturannya di src/lib/setoran-submit.ts:
//   · rekaman yang sudah dinilai syaikh tidak boleh diganti (409);
//   · setoran 'checked' yang masih kurang rekaman menerima rekaman susulan
//     lalu dibuka ulang ke 'submitted' (nilai rekaman lain dijaga utuh);
//   · week_start dari klien divalidasi (awal cycle sah, bukan masa depan).
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { ensureAudioBucket, uploadAudioMusyrif } from '@/lib/storage';
import {
  aksesMusyrif,
  bacaWeekStart,
  balasGagal,
  catatAudit,
  muatKeadaanSetoranMusyrif,
  pastikanSetoranMusyrif,
  simpanRekamanMusyrif,
  sudahDinilai,
  syaikhPenerima,
  tandaiTerkirimMusyrif,
  waKeSyaikh,
} from '@/lib/setoran-submit';
import { JENIS_REKAMAN, JENIS_REKAMAN_LABEL, type JenisRekaman, type MusyrifSession } from '@/types/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ROUTE = 'setoran-musyrif/submit-single';
const TABEL = 'setoran_musyrif';

export async function POST(req: NextRequest) {
  let actor: MusyrifSession | null = null;
  let jenisDicatat: string | null = null;
  let weekDicatat: string | null = null;
  try {
    const s = await getSession();
    actor = aksesMusyrif(s);
    if (!actor) {
      return NextResponse.json({ error: 'Anda harus login sebagai musyrif.' }, { status: 401 });
    }
    const musyrifId = actor.musyrif_id;

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
      return balasGagal(actor, ROUTE, 400, 'Jenis rekaman tidak valid.', { jenis }, null, TABEL);
    }
    // Cek bentuk, bukan `instanceof File` — runtime prod tidak punya global File.
    if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function' || file.size === 0) {
      return balasGagal(actor, ROUTE, 400, 'File rekaman kosong. Rekam ulang lalu kirim lagi.', { jenis }, null, TABEL);
    }
    const jenisRekaman = jenis as JenisRekaman;
    const label = JENIS_REKAMAN_LABEL[jenisRekaman];

    const ws = bacaWeekStart(form);
    if (!ws.ok) {
      return balasGagal(
        actor,
        ROUTE,
        400,
        ws.error,
        { jenis, week_start: String(form.get('week_start') ?? '') },
        null,
        TABEL
      );
    }
    const weekStart = ws.weekStart;
    weekDicatat = weekStart;

    const syaikh = await syaikhPenerima(actor.gender);
    if (!syaikh.ok) {
      return balasGagal(actor, ROUTE, syaikh.status, syaikh.error, { jenis, week_start: weekStart }, null, TABEL);
    }

    const keadaan = await muatKeadaanSetoranMusyrif(musyrifId, weekStart);
    if (!keadaan.ok) {
      return balasGagal(actor, ROUTE, 500, keadaan.error, { jenis, week_start: weekStart }, null, TABEL);
    }
    const existing = keadaan.data.setoran;
    const rekamanAda = keadaan.data.rekaman.get(jenisRekaman);

    // Rekaman yang sudah dinilai tidak boleh ditimpa — dicek SEBELUM menulis
    // berkas, karena path audio per jenis tetap dan unggahan akan menimpanya.
    const pesanSudahDinilai = `Rekaman ${label} sudah dinilai ${syaikh.titelKecil}, tidak bisa diganti.`;
    if (sudahDinilai(rekamanAda)) {
      return balasGagal(
        actor,
        ROUTE,
        409,
        pesanSudahDinilai,
        { jenis, week_start: weekStart, kode: 'sudah_dinilai' },
        existing?.id ?? null,
        TABEL
      );
    }
    // Setoran 'checked' yang masih kurang rekaman → terima rekaman susulan
    // dan buka ulang ke 'submitted' (nilai rekaman lain dibiarkan utuh).
    const bukaUlang = existing?.status === 'checked';

    const idSetoran = await pastikanSetoranMusyrif(musyrifId, weekStart, existing);
    if (!idSetoran.ok) {
      return balasGagal(actor, ROUTE, 500, idSetoran.error, { jenis, week_start: weekStart }, null, TABEL);
    }
    const setoranId = idSetoran.id;
    const isFirstRekaman = !existing;

    await ensureAudioBucket();

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = await uploadAudioMusyrif({
      musyrifId,
      weekStart,
      jenis: jenisRekaman,
      blob: buffer,
      contentType: file.type || 'audio/webm',
    });

    const simpan = await simpanRekamanMusyrif({
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
        simpan.status === 409 ? pesanSudahDinilai : simpan.error,
        { jenis, week_start: weekStart, ...(simpan.status === 409 ? { kode: 'sudah_dinilai' } : {}) },
        setoranId,
        TABEL
      );
    }

    const tanda = await tandaiTerkirimMusyrif(setoranId, existing?.status ?? 'draft');
    if (!tanda.ok) {
      return balasGagal(actor, ROUTE, 500, tanda.error, { jenis, week_start: weekStart }, setoranId, TABEL);
    }
    if (bukaUlang) {
      catatAudit(
        actor,
        'setoran.buka_ulang',
        setoranId,
        {
          route: ROUTE,
          jenis,
          week_start: weekStart,
          checked_at_lama: existing?.checked_at ?? null,
          checked_by_syaikh_id_lama: existing?.checked_by_syaikh_id ?? null,
        },
        TABEL
      );
    }

    // Tautan WA hanya saat rekaman pertama atau saat setoran dibuka ulang,
    // supaya syaikh tidak dibanjiri pesan.
    const waUrl = isFirstRekaman || bukaUlang ? waKeSyaikh(actor, syaikh.data, setoranId) : null;

    return NextResponse.json({
      ok: true,
      setoran_id: setoranId,
      week_start: weekStart,
      jenis: jenisRekaman,
      dibuka_ulang: bukaUlang,
      syaikh_name: syaikh.data.name,
      wa_url: waUrl,
    });
  } catch (e: unknown) {
    const pesan = e instanceof Error ? e.message : 'Internal error';
    if (actor) {
      return balasGagal(
        actor,
        ROUTE,
        500,
        `Gagal menyimpan rekaman: ${pesan}`,
        { jenis: jenisDicatat, week_start: weekDicatat },
        null,
        TABEL
      );
    }
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}
