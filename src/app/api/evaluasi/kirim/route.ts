import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const { sesi_id } = body as { sesi_id: string };
    if (typeof sesi_id !== 'string' || !UUID_RE.test(sesi_id)) {
      return NextResponse.json({ error: 'sesi_id tidak valid' }, { status: 400 });
    }

    const { data: sesi } = await supabaseAdmin
      .from('evaluasi_sesi')
      .select('id, halaqah_id, status')
      .eq('id', sesi_id)
      .maybeSingle();
    if (!sesi) {
      return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 });
    }
    if (sesi.status === 'terkirim') {
      return NextResponse.json({ error: 'Sesi sudah dikirim' }, { status: 409 });
    }

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id')
      .eq('id', sesi.halaqah_id)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    // Semua peserta aktif yang hadir wajib punya baris nilai done=true.
    // Peserta dengan baris nilai hadir=false dikecualikan; peserta tanpa baris
    // nilai dianggap belum dinilai → blokir.
    const { data: pesertaList } = await supabaseAdmin
      .from('eval_peserta')
      .select('id')
      .eq('halaqah_id', sesi.halaqah_id)
      .eq('aktif', true);

    const { data: nilaiList } = await supabaseAdmin
      .from('evaluasi_nilai')
      .select('peserta_id, hadir, done')
      .eq('sesi_id', sesi_id);

    const nilaiByPeserta = new Map(
      (nilaiList ?? []).map((n) => [n.peserta_id, n as { peserta_id: string; hadir: boolean; done: boolean }])
    );

    for (const p of pesertaList ?? []) {
      const n = nilaiByPeserta.get(p.id);
      if (!n) {
        // Tanpa baris nilai → belum dinilai.
        return NextResponse.json({ error: 'Masih ada peserta belum dinilai' }, { status: 400 });
      }
      if (n.hadir === false) continue; // dikecualikan
      if (!n.done) {
        return NextResponse.json({ error: 'Masih ada peserta belum dinilai' }, { status: 400 });
      }
    }

    const { error } = await supabaseAdmin
      .from('evaluasi_sesi')
      .update({ status: 'terkirim', updated_at: new Date().toISOString() })
      .eq('id', sesi_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
