import { requireKoordinator } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PengaturanForm, type PengaturanInitial } from './PengaturanForm';

export const dynamic = 'force-dynamic';

export default async function KoordinatorPengaturanPage() {
  const session = await requireKoordinator();

  const { data: configRow } = await supabaseAdmin
    .from('eval_config')
    .select('nama_qn, nama_pb, ujian_attempts, jadwal')
    .eq('gender', session.gender)
    .maybeSingle();

  const jadwalRaw = (configRow?.jadwal ?? {}) as Record<string, unknown>;
  const asDates = (v: unknown, n: number): string[] => {
    const arr = Array.isArray(v) ? v.map((x) => String(x ?? '')) : [];
    return Array.from({ length: n }, (_, i) => arr[i] ?? '');
  };

  const ujianAttempts = (configRow?.ujian_attempts as number) === 1 ? 1 : 2;

  const initial: PengaturanInitial = {
    nama_qn: (configRow?.nama_qn as string) ?? 'Evaluasi QN',
    nama_pb: (configRow?.nama_pb as string) ?? 'Evaluasi PB',
    ujian_attempts: ujianAttempts,
    jadwal: {
      qn: asDates(jadwalRaw.qn, 4),
      pb: asDates(jadwalRaw.pb, 4),
      ujian: asDates(jadwalRaw.ujian, 2),
    },
  };

  return <PengaturanForm initial={initial} />;
}
