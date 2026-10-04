// Kirim setoran musyrif → syaikh (tiga rekaman sekaligus).
//
// Aturan sama dengan alur peserta (lihat src/lib/setoran-submit.ts):
//   · rekaman yang sudah dinilai syaikh tidak ditimpa — berkasnya dilewati;
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

const ROUTE = 'setoran-musyrif/submit';
const TABEL = 'setoran_musyrif';

export async function POST(req: NextRequest) {
  let actor: MusyrifSession | null = null;
  let weekDicatat: string | null = null;
  try {
    const s = await getSession();
    actor = aksesMusyrif(s);
    if (!actor) {
      return NextResponse.json({ error: 'Anda harus login sebagai musyrif.' }, { status: 401 });
    }
    const musyrifId = actor.musyrif_id;

    const form = await req.formData();
    const files: Record<JenisRekaman, File | null> = {
      tuhfatul_athfal: fileOrNull(form.get('audio_tuhfatul_athfal')),
      jazariyyah: fileOrNull(form.get('audio_jazariyyah')),
      syawahid: fileOrNull(form.get('audio_syawahid')),
    };
    const durations: Record<JenisRekaman, number | null> = {
      tuhfatul_athfal: numOrNull(form.get('duration_tuhfatul_athfal')),
      jazariyyah: numOrNull(form.get('duration_jazariyyah')),
      syawahid: numOrNull(form.get('duration_syawahid')),
    };

    const ws = bacaWeekStart(form);
    if (!ws.ok) {
      return balasGagal(actor, ROUTE, 400, ws.error, { week_start: String(form.get('week_start') ?? '') }, null, TABEL);
    }
    const weekStart = ws.weekStart;
    weekDicatat = weekStart;

    const syaikh = await syaikhPenerima(actor.gender);
    if (!syaikh.ok) {
      return balasGagal(actor, ROUTE, syaikh.status, syaikh.error, { week_start: weekStart }, null, TABEL);
    }

    const keadaan = await muatKeadaanSetoranMusyrif(musyrifId, weekStart);
    if (!keadaan.ok) {
      return balasGagal(actor, ROUTE, 500, keadaan.error, { week_start: weekStart }, null, TABEL);
    }
    const existing = keadaan.data.setoran;
    const rekamanAda = keadaan.data.rekaman;

    // Tiap jenis harus punya berkas di kiriman ini ATAU rekaman yang sudah
    // tersimpan di server. Berkas untuk rekaman yang sudah dinilai dilewati —
    // nilainya dijaga utuh.
    const akanDitulis: JenisRekaman[] = [];
    const dilewati: JenisRekaman[] = [];
    for (const j of JENIS_REKAMAN) {
      const ada = rekamanAda.get(j);
      if (files[j]) {
        if (sudahDinilai(ada)) dilewati.push(j);
        else akanDitulis.push(j);
      } else if (!ada?.audio_url) {
        return balasGagal(
          actor,
          ROUTE,
          400,
          `Rekaman ${JENIS_REKAMAN_LABEL[j]} belum ada.`,
          { week_start: weekStart, jenis: j },
          existing?.id ?? null,
          TABEL
        );
      }
    }
    if (akanDitulis.length === 0) {
      if (dilewati.length > 0) {
        return balasGagal(
          actor,
          ROUTE,
          409,
          `Rekaman yang dikirim sudah dinilai ${syaikh.titelKecil}, tidak bisa diganti.`,
          { week_start: weekStart, dilewati, kode: 'sudah_dinilai' },
          existing?.id ?? null,
          TABEL
        );
      }
      return balasGagal(actor, ROUTE, 400, 'Tidak ada rekaman yang dikirim.', { week_start: weekStart }, existing?.id ?? null, TABEL);
    }

    // Setoran 'checked' yang masih kurang rekaman → terima rekaman susulan
    // dan buka ulang ke 'submitted'.
    const bukaUlang = existing?.status === 'checked';

    const idSetoran = await pastikanSetoranMusyrif(musyrifId, weekStart, existing);
    if (!idSetoran.ok) {
      return balasGagal(actor, ROUTE, 500, idSetoran.error, { week_start: weekStart }, null, TABEL);
    }
    const setoranId = idSetoran.id;

    await ensureAudioBucket();

    const recordedAt = new Date().toISOString();
    const tersimpan: JenisRekaman[] = [];
    for (const jenis of akanDitulis) {
      const file = files[jenis]!;
      const buffer = Buffer.from(await file.arrayBuffer());
      const path = await uploadAudioMusyrif({
        musyrifId,
        weekStart,
        jenis,
        blob: buffer,
        contentType: file.type || 'audio/webm',
      });
      const simpan = await simpanRekamanMusyrif({
        setoranId,
        jenis,
        path,
        durationSec: durations[jenis],
        recordedAt,
        adaBaris: rekamanAda.has(jenis),
      });
      if (!simpan.ok) {
        const label = JENIS_REKAMAN_LABEL[jenis];
        return balasGagal(
          actor,
          ROUTE,
          simpan.status,
          simpan.status === 409
            ? `Rekaman ${label} sudah dinilai ${syaikh.titelKecil}, tidak bisa diganti.`
            : `Gagal menyimpan rekaman ${label}: ${simpan.error}`,
          { week_start: weekStart, jenis, tersimpan, ...(simpan.status === 409 ? { kode: 'sudah_dinilai' } : {}) },
          setoranId,
          TABEL
        );
      }
      tersimpan.push(jenis);
    }

    const tanda = await tandaiTerkirimMusyrif(setoranId, existing?.status ?? 'draft');
    if (!tanda.ok) {
      return balasGagal(actor, ROUTE, 500, tanda.error, { week_start: weekStart, tersimpan }, setoranId, TABEL);
    }
    if (bukaUlang) {
      catatAudit(
        actor,
        'setoran.buka_ulang',
        setoranId,
        {
          route: ROUTE,
          jenis: tersimpan,
          week_start: weekStart,
          checked_at_lama: existing?.checked_at ?? null,
          checked_by_syaikh_id_lama: existing?.checked_by_syaikh_id ?? null,
        },
        TABEL
      );
    }

    return NextResponse.json({
      ok: true,
      setoran_id: setoranId,
      week_start: weekStart,
      tersimpan,
      // Berkas yang tidak ditulis karena rekamannya sudah dinilai.
      dilewati,
      dibuka_ulang: bukaUlang,
      peringatan: dilewati.length
        ? `Rekaman ${dilewati.map((j) => JENIS_REKAMAN_LABEL[j]).join(', ')} sudah dinilai ${syaikh.titelKecil}, jadi tidak diganti.`
        : null,
      syaikh_name: syaikh.data.name,
      wa_url: waKeSyaikh(actor, syaikh.data, setoranId),
    });
  } catch (e: unknown) {
    const pesan = e instanceof Error ? e.message : 'Internal error';
    if (actor) {
      return balasGagal(actor, ROUTE, 500, `Gagal mengirim setoran: ${pesan}`, { week_start: weekDicatat }, null, TABEL);
    }
    return NextResponse.json({ error: pesan }, { status: 500 });
  }
}

// Cek bentuk, bukan `instanceof File` — runtime prod tidak punya global File.
function fileOrNull(v: FormDataEntryValue | null): File | null {
  if (!v || typeof v !== 'object') return null;
  const f = v as File;
  if (typeof f.arrayBuffer !== 'function' || !f.size) return null;
  return f;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const n = parseInt(String(v));
  return Number.isFinite(n) ? n : null;
}
