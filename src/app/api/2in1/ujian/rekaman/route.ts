import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { ensureAudioBucket, uploadAudioUjian } from '@/lib/storage';
import { statusPeriode, todayJakarta } from '@/lib/ujian';
import { buildWaMeUrl, tplPesertaUjianToMusyrif } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { JENIS_REKAMAN, type JenisRekaman } from '@/types/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Satu rekaman ujian per permintaan (mode kirim satu-satu PesertaSetoranForm).
// Hanya diterima selama rentang periode ujian berlangsung dan sebelum dinilai.
export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const pesertaSession =
      s.accesses?.find((a) => a.role === 'peserta') ?? (s.session?.role === 'peserta' ? s.session : null);
    if (!pesertaSession) {
      return NextResponse.json({ error: 'Anda harus login sebagai peserta.' }, { status: 401 });
    }
    const pesertaId = (pesertaSession as { peserta_id: string }).peserta_id;

    const form = await req.formData();
    const jenis = form.get('jenis') as string | null;
    const periodeId = String(form.get('periode_id') ?? '');
    // Cek bentuk, bukan `instanceof File` — runtime prod tak punya global File.
    const file = form.get('audio_file') as Blob | null;
    const durationSec = (() => {
      const n = parseInt(String(form.get('duration_sec') ?? ''));
      return Number.isFinite(n) ? n : null;
    })();

    if (!jenis || !JENIS_REKAMAN.includes(jenis as JenisRekaman)) {
      return NextResponse.json({ error: 'Jenis rekaman tidak valid.' }, { status: 400 });
    }
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function' || file.size === 0) {
      return NextResponse.json({ error: 'File rekaman kosong.' }, { status: 400 });
    }
    if (!periodeId) {
      return NextResponse.json({ error: 'Periode ujian wajib.' }, { status: 400 });
    }

    const { data: periode } = await supabaseAdmin
      .from('ujian_periode')
      .select('id, nama, mulai, selesai')
      .eq('id', periodeId)
      .maybeSingle();
    if (!periode) {
      return NextResponse.json({ error: 'Periode ujian tidak ditemukan.' }, { status: 404 });
    }
    const st = statusPeriode(periode, todayJakarta());
    if (st !== 'berlangsung') {
      return NextResponse.json(
        { error: st === 'akan' ? 'Ujian belum dibuka.' : 'Rentang ujian sudah berakhir. Hubungi musyrif/ah Anda.' },
        { status: 409 }
      );
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

    const { data: existing } = await supabaseAdmin
      .from('ujian')
      .select('id, status')
      .eq('periode_id', periodeId)
      .eq('peserta_id', pesertaId)
      .maybeSingle();

    if (existing?.status === 'checked') {
      return NextResponse.json({ error: 'Ujian ini sudah dinilai, tidak bisa diubah.' }, { status: 409 });
    }

    let ujianId: string;
    if (existing) {
      ujianId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('ujian')
        .insert({ periode_id: periodeId, peserta_id: pesertaId, status: 'draft' })
        .select('id')
        .single();
      if (insErr || !inserted) {
        return NextResponse.json({ error: `Gagal buat ujian: ${insErr?.message ?? 'unknown'}` }, { status: 500 });
      }
      ujianId = inserted.id;
    }
    // Baris 'draft' bisa sudah ada karena musyrif mencatat alasan belum ujian —
    // rekaman pertama tetap memicu pemberitahuan ke musyrif.
    const isFirstRekaman = !existing || existing.status === 'draft';

    await ensureAudioBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = await uploadAudioUjian({
      periodeId,
      pesertaId,
      jenis: jenis as JenisRekaman,
      blob: buffer,
      contentType: file.type || 'audio/webm',
    });

    const now = new Date().toISOString();
    const { error: rErr } = await supabaseAdmin.from('rekaman_ujian').upsert(
      {
        ujian_id: ujianId,
        jenis: jenis as JenisRekaman,
        audio_url: path,
        duration_seconds: durationSec,
        recorded_at: now,
        predikat: null,
        masukan: null,
        checked_at: null,
        updated_at: now,
      },
      { onConflict: 'ujian_id,jenis' }
    );
    if (rErr) {
      return NextResponse.json({ error: `Gagal simpan rekaman: ${rErr.message}` }, { status: 500 });
    }

    if (isFirstRekaman) {
      await supabaseAdmin
        .from('ujian')
        .update({ status: 'submitted', submitted_at: now, updated_at: now })
        .eq('id', ujianId);
    }

    let waUrl: string | null = null;
    if (isFirstRekaman && musyrif) {
      const waText = tplPesertaUjianToMusyrif({
        pesertaName: peserta.name,
        pesertaGender: peserta.gender as 'ikhwan' | 'akhwat',
        kelasName: kelas.name,
        musyrifGender: musyrif.gender,
        periodeNama: periode.nama,
        nilaiUrl: absUrl(`/2in1/musyrif/ujian/${ujianId}`),
      });
      waUrl = buildWaMeUrl(musyrif.whatsapp_number, waText);
    }

    return NextResponse.json({ ok: true, ujian_id: ujianId, musyrif_name: musyrif?.name ?? null, wa_url: waUrl });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal error' }, { status: 500 });
  }
}
