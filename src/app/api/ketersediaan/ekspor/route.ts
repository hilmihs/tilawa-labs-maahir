import { NextResponse } from 'next/server';
import { requireOneOfRoles } from '@/lib/session';
import { getPeriode, getPeriodeAktif } from '@/lib/ketersediaan-periode';
import { bangunWorkbook, namaBerkas } from '@/lib/ketersediaan-export';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { KsPrioritasPreset } from '@/types/db';

export const dynamic = 'force-dynamic';

/**
 * Unduh xlsx replika Template_Ketersediaan_Mengajar_HITS.
 *
 * Route handler, bukan server action, karena keluarannya berkas biner yang
 * harus diunduh peramban. Penjaganya sama dengan halaman koordinator.
 */
export async function GET(req: Request) {
  await requireOneOfRoles(['koordinator']);

  const url = new URL(req.url);
  const periodeId = url.searchParams.get('periode');
  const periode = periodeId ? await getPeriode(periodeId) : await getPeriodeAktif();
  if (!periode) {
    return NextResponse.json({ error: 'Periode tidak ditemukan' }, { status: 404 });
  }

  const ambilPreset = async (id: string | null): Promise<KsPrioritasPreset | null> => {
    if (!id) return null;
    const { data } = await supabaseAdmin
      .from('ks_prioritas_preset')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data as KsPrioritasPreset | null) ?? null;
  };

  const wb = await bangunWorkbook(periode, {
    presetIkhwan: await ambilPreset(url.searchParams.get('preset_ikhwan')),
    presetAkhwat: await ambilPreset(url.searchParams.get('preset_akhwat')),
  });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${namaBerkas(periode)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
