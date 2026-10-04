import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    // Pengguna multi-peran: peran utama sesi bisa saja pengajar, sementara menu
    // Penilaian muncul karena ia juga koordinator/syaikh — ambil akses itu.
    const session = [s.session, ...(s.accesses ?? [])].find(
      (a) => a?.role === 'koordinator' || a?.role === 'syaikh'
    );
    if (!session || (session.role !== 'koordinator' && session.role !== 'syaikh')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { pengajar_id, year_month, skor_bacaan, keterangan_bacaan } = body as {
      pengajar_id: string;
      year_month: string;
      skor_bacaan: number | null;
      keterangan_bacaan: string | null;
    };

    if (!pengajar_id || !year_month) {
      return NextResponse.json({ error: 'pengajar_id dan year_month wajib diisi' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(year_month)) {
      return NextResponse.json({ error: 'Format year_month harus YYYY-MM' }, { status: 400 });
    }

    // penilaian_masyaikh.assessor_role hanya menerima 'syaikh' | 'koordinator_hits'.
    // Koordinator (setoran) dipetakan ke 'koordinator_hits' untuk domain HITS.
    const assessorRole = session.role === 'syaikh' ? 'syaikh' : 'koordinator_hits';
    const assessorId = session.role === 'syaikh'
      ? (session as { syaikh_id: string }).syaikh_id
      : (session as { koordinator_id: string }).koordinator_id;

    const { error } = await supabaseAdmin
      .from('penilaian_masyaikh')
      .upsert(
        {
          pengajar_id,
          year_month,
          skor_bacaan: skor_bacaan ?? null,
          keterangan_bacaan: keterangan_bacaan ?? null,
          assessor_role: assessorRole,
          assessor_id: assessorId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'pengajar_id,year_month' }
      );

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
