import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';

export const runtime = 'nodejs';

// Cabut (batalkan) sebuah rapot resmi. Token tetap bisa dipindai, tapi halaman
// verifikasi publik menandainya "dicabut". Hanya pengajar pemilik halaqah.
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

    const body = (await req.json()) as { token?: unknown };
    const token = body.token;
    if (typeof token !== 'string' || !token) {
      return NextResponse.json({ error: 'token wajib diisi' }, { status: 400 });
    }

    const { data: rapot } = await supabaseAdmin
      .from('evaluasi_rapot')
      .select('id, halaqah_id, status')
      .eq('token', token)
      .maybeSingle();
    if (!rapot) {
      return NextResponse.json({ error: 'Rapot tidak ditemukan' }, { status: 404 });
    }
    if (rapot.status === 'dicabut') {
      return NextResponse.json({ ok: true, already: true });
    }

    // Verifikasi kepemilikan halaqah.
    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id')
      .eq('id', rapot.halaqah_id)
      .maybeSingle();
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!halaqah || !evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('evaluasi_rapot')
      .update({
        status: 'dicabut',
        dicabut_at: new Date().toISOString(),
        dicabut_oleh: evalPengajarId,
      })
      .eq('id', rapot.id);
    if (error) {
      console.error('[cabut] update gagal:', error.message);
      return NextResponse.json({ error: 'Gagal mencabut rapot' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('[cabut] error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Gagal mencabut rapot' }, { status: 500 });
  }
}
