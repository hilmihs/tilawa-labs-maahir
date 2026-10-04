import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { ensureAudioBucket, uploadAudio } from '@/lib/storage';
import { currentCycleStart } from '@/lib/week';
import { buildWaMeUrl, tplPesertaSubmitToMusyrif } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { JENIS_REKAMAN, type JenisRekaman } from '@/types/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    if (!s.session || s.session.role !== 'peserta') {
      return NextResponse.json({ error: 'Anda harus login sebagai peserta.' }, { status: 401 });
    }
    const pesertaId = s.session.peserta_id;

    const form = await req.formData();
    const files: Record<JenisRekaman, File | null> = {
      tuhfatul_athfal: form.get('audio_tuhfatul_athfal') as File | null,
      jazariyyah: form.get('audio_jazariyyah') as File | null,
      syawahid: form.get('audio_syawahid') as File | null,
    };
    const durations: Record<JenisRekaman, number | null> = {
      tuhfatul_athfal: numOrNull(form.get('duration_tuhfatul_athfal')),
      jazariyyah: numOrNull(form.get('duration_jazariyyah')),
      syawahid: numOrNull(form.get('duration_syawahid')),
    };
    for (const j of JENIS_REKAMAN) {
      if (!files[j] || files[j]!.size === 0) {
        return NextResponse.json(
          { error: `Rekaman ${j} belum ada` },
          { status: 400 }
        );
      }
    }

    const { data: peserta, error: pErr } = await supabaseAdmin
      .from('peserta')
      .select('id, name, gender, kelas:kelas_id(id, name, musyrif:musyrif_id(id, name, gender, whatsapp_number))')
      .eq('id', pesertaId)
      .eq('active', true)
      .single();
    if (pErr || !peserta) {
      return NextResponse.json({ error: 'Peserta tidak ditemukan' }, { status: 404 });
    }
    const kelas = peserta.kelas as unknown as {
      id: string;
      name: string;
      musyrif: { id: string; name: string; gender: 'ikhwan' | 'akhwat'; whatsapp_number: string };
    };
    const musyrif = kelas.musyrif;

    const weekStart = currentCycleStart();

    const { data: existing } = await supabaseAdmin
      .from('setoran')
      .select('id, status')
      .eq('peserta_id', pesertaId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (existing && existing.status === 'checked') {
      return NextResponse.json(
        { error: 'Setoran pekan ini sudah dicek musyrif, tidak bisa diubah.' },
        { status: 409 }
      );
    }

    let setoranId: string;
    if (existing) {
      setoranId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('setoran')
        .insert({ peserta_id: pesertaId, week_start: weekStart, status: 'draft' })
        .select('id')
        .single();
      if (insErr || !inserted) {
        return NextResponse.json(
          { error: `Gagal buat setoran: ${insErr?.message ?? 'unknown'}` },
          { status: 500 }
        );
      }
      setoranId = inserted.id;
    }

    await ensureAudioBucket();

    const recordedAt = new Date().toISOString();
    for (const jenis of JENIS_REKAMAN) {
      const file = files[jenis]!;
      const buffer = Buffer.from(await file.arrayBuffer());
      const path = await uploadAudio({
        pesertaId,
        weekStart,
        jenis,
        blob: buffer,
        contentType: file.type || 'audio/webm',
      });
      const { error: rErr } = await supabaseAdmin
        .from('rekaman')
        .upsert(
          {
            setoran_id: setoranId,
            jenis,
            audio_url: path,
            duration_seconds: durations[jenis],
            recorded_at: recordedAt,
            nilai: null,
            masukan: null,
            checked_at: null,
          },
          { onConflict: 'setoran_id,jenis' }
        );
      if (rErr) {
        return NextResponse.json(
          { error: `Gagal simpan rekaman ${jenis}: ${rErr.message}` },
          { status: 500 }
        );
      }
    }

    const { error: sErr } = await supabaseAdmin
      .from('setoran')
      .update({ status: 'submitted' })
      .eq('id', setoranId);
    if (sErr) {
      return NextResponse.json(
        { error: `Gagal update status: ${sErr.message}` },
        { status: 500 }
      );
    }

    const cekUrl = absUrl(`/musyrif/cek/${setoranId}`);
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
      musyrif_name: musyrif.name,
      wa_url: waUrl,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const n = parseInt(String(v));
  return Number.isFinite(n) ? n : null;
}
