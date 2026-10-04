// Rute rincian lama → halaman rincian tunggal di modul matrix, yang juga punya
// teguran, risk profile, dan penilaian masyaikh/pedagogis beserta keterangannya.
import { redirect } from 'next/navigation';
import { requireOneOfRoles } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export default async function MatrixDetailLamaRedirect({
  params,
  searchParams,
}: {
  params: { pengajar_id: string };
  searchParams: { bulan?: string };
}) {
  await requireOneOfRoles(['koordinator', 'syaikh']);

  // Halaman tujuan menyaring pengajar per gender; tanpa parameter ini pengajar
  // dari gender lain kena notFound() — padahal rute lama membolehkannya.
  const { data: pengajar } = await supabaseAdmin
    .from('pengajar')
    .select('gender')
    .eq('id', params.pengajar_id)
    .maybeSingle();
  if (!pengajar) redirect('/matrix/koordinator?tampilan=blok');

  const p = new URLSearchParams({ gender: pengajar.gender as string, tampilan: 'blok' });
  if (searchParams.bulan && /^\d{4}-\d{2}$/.test(searchParams.bulan)) {
    p.set('bulan', searchParams.bulan);
  }
  redirect(`/matrix/koordinator/pengajar/${params.pengajar_id}?${p.toString()}`);
}
