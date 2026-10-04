import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { AMBANG, JENIS } from '@/lib/evaluasi';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const accesses = s.accesses ?? (s.session ? [s.session] : []);
    const pengajar = accesses.find((a) => a.role === 'pengajar') as
      | { role: 'pengajar'; pengajar_id: string }
      | undefined;
    if (!pengajar) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { halaqah_id, jenis, nomor_sesi, tgl_jadwal, surat, ayat_mulai, ayat_selesai, ambang } =
      body as {
        halaqah_id: string;
        jenis: string;
        nomor_sesi: number;
        tgl_jadwal?: string | null;
        surat?: string | null;
        ayat_mulai: number;
        ayat_selesai: number;
        ambang?: number | null;
      };

    if (typeof halaqah_id !== 'string' || !halaqah_id) {
      return NextResponse.json({ error: 'halaqah_id wajib diisi' }, { status: 400 });
    }
    if (typeof jenis !== 'string' || !(JENIS as readonly string[]).includes(jenis)) {
      return NextResponse.json({ error: 'jenis tidak valid' }, { status: 400 });
    }
    if (!Number.isInteger(nomor_sesi) || nomor_sesi < 1 || nomor_sesi > 4) {
      return NextResponse.json({ error: 'nomor_sesi harus 1..4' }, { status: 400 });
    }
    if (
      !Number.isInteger(ayat_mulai) ||
      !Number.isInteger(ayat_selesai) ||
      ayat_mulai > ayat_selesai
    ) {
      return NextResponse.json(
        { error: 'ayat_mulai/ayat_selesai tidak valid' },
        { status: 400 }
      );
    }

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id')
      .eq('id', halaqah_id)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    // Sesi yang sudah dikirim tidak boleh diubah lagi.
    const { data: existing } = await supabaseAdmin
      .from('evaluasi_sesi')
      .select('status')
      .eq('halaqah_id', halaqah_id)
      .eq('jenis', jenis)
      .eq('nomor_sesi', nomor_sesi)
      .maybeSingle();
    if (existing?.status === 'terkirim') {
      return NextResponse.json(
        { error: 'Sesi sudah dikirim, tidak bisa diubah' },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.from('evaluasi_sesi').upsert(
      {
        halaqah_id,
        jenis,
        nomor_sesi,
        tgl_jadwal:
          typeof tgl_jadwal === 'string' && tgl_jadwal.trim() !== '' ? tgl_jadwal : null,
        surat: surat ?? 'Al-Baqarah',
        ayat_mulai,
        ayat_selesai,
        ambang: ambang ?? AMBANG,
        dibuat_oleh: evalPengajarId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'halaqah_id,jenis,nomor_sesi' }
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: row, error: selErr } = await supabaseAdmin
      .from('evaluasi_sesi')
      .select('id')
      .eq('halaqah_id', halaqah_id)
      .eq('jenis', jenis)
      .eq('nomor_sesi', nomor_sesi)
      .maybeSingle();
    if (selErr) {
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sesi_id: row?.id ?? null });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
