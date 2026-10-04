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

const ROUTE = 'setoran/submit';

export async function POST(req: NextRequest) {
  let actor: PesertaSession | null = null;
  let weekDicatat: string | null = null;
  try {
    const s = await getSession();
    // Lewat `accesses` (bukan hanya s.session.role) supaya akun multi-peran
    // yang sedang membuka fitur lain tidak ditolak.
    actor = aksesPeserta(s);
    if (!actor) {
      return NextResponse.json({ error: 'Anda harus login sebagai peserta.' }, { status: 401 });
    }
    const pesertaId = actor.peserta_id;

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
      return balasGagal(actor, ROUTE, 400, ws.error, { week_start: String(form.get('week_start') ?? '') });
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
      return balasGagal(actor, ROUTE, 404, 'Peserta tidak ditemukan atau sudah tidak aktif.', { week_start: weekStart });
    }
    const kelas = peserta.kelas as unknown as {
      id: string;
      name: string;
      musyrif: { id: string; name: string; gender: 'ikhwan' | 'akhwat'; whatsapp_number: string };
    } | null;
    if (!kelas?.musyrif) {
      return balasGagal(actor, ROUTE, 409, 'Kelas atau musyrif Anda belum diatur. Hubungi koordinator.', { week_start: weekStart });
    }
    const musyrif = kelas.musyrif;

    const keadaan = await muatKeadaanSetoran(pesertaId, weekStart);
    if (!keadaan.ok) {
      return balasGagal(actor, ROUTE, 500, keadaan.error, { week_start: weekStart });
    }
    const existing = keadaan.data.setoran;
    const rekamanAda = keadaan.data.rekaman;

    // Setiap jenis harus punya berkas di kiriman ini ATAU rekaman yang sudah
    // tersimpan di server (mis. terunggah lewat submit-single). Berkas untuk
    // rekaman yang sudah dinilai musyrif dilewati — nilainya dijaga utuh.
    const akanDitulis: JenisRekaman[] = [];
    const dilewati: JenisRekaman[] = [];
    for (const j of JENIS_REKAMAN) {
      const ada = rekamanAda.get(j);
      if (files[j]) {
        if (sudahDinilai(ada)) dilewati.push(j);
        else akanDitulis.push(j);
      } else if (!ada?.audio_url) {
        return balasGagal(actor, ROUTE, 400, `Rekaman ${JENIS_REKAMAN_LABEL[j]} belum ada.`, {
          week_start: weekStart,
          jenis: j,
        }, existing?.id ?? null);
      }
    }
    if (akanDitulis.length === 0) {
      if (dilewati.length > 0) {
        return balasGagal(
          actor,
          ROUTE,
          409,
          'Rekaman yang dikirim sudah dinilai musyrif, tidak bisa diganti.',
          { week_start: weekStart, dilewati, kode: 'sudah_dinilai' },
          existing?.id ?? null
        );
      }
      return balasGagal(actor, ROUTE, 400, 'Tidak ada rekaman yang dikirim.', { week_start: weekStart }, existing?.id ?? null);
    }

    // Setoran 'checked' yang masih kurang rekaman → terima rekaman susulan
    // dan buka ulang ke 'submitted'.
    const bukaUlang = existing?.status === 'checked';

    const idSetoran = await pastikanSetoran(pesertaId, weekStart, existing);
    if (!idSetoran.ok) {
      return balasGagal(actor, ROUTE, 500, idSetoran.error, { week_start: weekStart });
    }
    const setoranId = idSetoran.id;

    await ensureAudioBucket();

    const recordedAt = new Date().toISOString();
    const tersimpan: JenisRekaman[] = [];
    for (const jenis of akanDitulis) {
      const file = files[jenis]!;
      const buffer = Buffer.from(await file.arrayBuffer());
      const path = await uploadAudio({
        pesertaId,
        weekStart,
        jenis,
        blob: buffer,
        contentType: file.type || 'audio/webm',
      });
      const simpan = await simpanRekaman({
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
            ? `Rekaman ${label} sudah dinilai musyrif, tidak bisa diganti.`
            : `Gagal menyimpan rekaman ${label}: ${simpan.error}`,
          { week_start: weekStart, jenis, tersimpan, ...(simpan.status === 409 ? { kode: 'sudah_dinilai' } : {}) },
          setoranId
        );
      }
      tersimpan.push(jenis);
    }

    const tanda = await tandaiTerkirim(setoranId, existing?.status ?? 'draft');
    if (!tanda.ok) {
      return balasGagal(actor, ROUTE, 500, tanda.error, { week_start: weekStart, tersimpan }, setoranId);
    }
    if (bukaUlang) {
      catatAudit(actor, 'setoran.buka_ulang', setoranId, {
        route: ROUTE,
        jenis: tersimpan,
        week_start: weekStart,
        checked_at_lama: existing?.checked_at ?? null,
        checked_by_musyrif_id_lama: existing?.checked_by_musyrif_id ?? null,
      });
    }

    const cekUrl = absUrl(`/2in1/musyrif/cek/${setoranId}`);
    const waText = tplPesertaSubmitToMusyrif({
      pesertaName: peserta.name,
      pesertaGender: peserta.gender as 'ikhwan' | 'akhwat',
      kelasName: kelas.name,
      musyrifGender: musyrif.gender,
      cekUrl,
    });
    const waUrl = buildWaMeUrl(musyrif.whatsapp_number, waText);

    return NextResponse.json({
      ok: true,
      setoran_id: setoranId,
      week_start: weekStart,
      tersimpan,
      // Berkas yang tidak ditulis karena rekamannya sudah dinilai musyrif.
      dilewati,
      dibuka_ulang: bukaUlang,
      peringatan: dilewati.length
        ? `Rekaman ${dilewati.map((j) => JENIS_REKAMAN_LABEL[j]).join(', ')} sudah dinilai musyrif, jadi tidak diganti.`
        : null,
      musyrif_name: musyrif.name,
      wa_url: waUrl,
    });
  } catch (e: unknown) {
    const pesan = e instanceof Error ? e.message : 'Internal error';
    if (actor) {
      return balasGagal(actor, ROUTE, 500, `Gagal mengirim setoran: ${pesan}`, { week_start: weekDicatat });
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
