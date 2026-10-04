import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const session = s.session;
    if (!session || (session.role !== 'koordinator' && session.role !== 'syaikh')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { peserta_id, year_month, skor_bacaan, ket_bacaan, skor_hafalan, ket_hafalan } = body as {
      peserta_id: string;
      year_month: string;
      skor_bacaan: number | null;
      ket_bacaan: string | null;
      skor_hafalan: number | null;
      ket_hafalan: string | null;
    };

    if (!peserta_id || !year_month) {
      return NextResponse.json({ error: 'peserta_id dan year_month wajib diisi' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(year_month)) {
      return NextResponse.json({ error: 'Format year_month harus YYYY-MM' }, { status: 400 });
    }

    const assessorId = session.role === 'koordinator'
      ? (session as { koordinator_id: string }).koordinator_id
      : (session as { syaikh_id: string }).syaikh_id;

    const { error } = await supabaseAdmin
      .from('penilaian_peserta')
      .upsert(
        {
          peserta_id,
          year_month,
          skor_bacaan: skor_bacaan ?? null,
          ket_bacaan: ket_bacaan ?? null,
          skor_hafalan: skor_hafalan ?? null,
          ket_hafalan: ket_hafalan ?? null,
          assessor_role: session.role,
          assessor_id: assessorId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'peserta_id,year_month' }
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
