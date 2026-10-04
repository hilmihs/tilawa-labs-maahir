import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import { HITS_LEVEL_SHORT } from '@/lib/hits-pertemuan';
import { dayNameOf } from '@/lib/maahir-presensi';
import { KoreksiPanel } from './KoreksiPanel';

export const dynamic = 'force-dynamic';

export default async function KoreksiPage({ searchParams }: { searchParams: { h?: string } }) {
  const session = await requireKetuaKelas();
  const halaqahId = searchParams.h && /^[0-9a-f-]{36}$/.test(searchParams.h) ? searchParams.h : session.hits_halaqah_id;
  if (!halaqahId) redirect('/hits/ketua');

  const { data: self } = await supabaseAdmin.from('ketua_kelas').select('whatsapp_number').eq('id', session.ketua_kelas_id).maybeSingle();
  if (self?.whatsapp_number) {
    const { data: ok } = await supabaseAdmin.from('ketua_kelas').select('id').eq('whatsapp_number', self.whatsapp_number).eq('active', true).eq('hits_halaqah_id', halaqahId).limit(1).maybeSingle();
    if (!ok) redirect('/hits/ketua');
  }

  const loaded = await loadHalaqahPertemuan(halaqahId);
  const slots = (loaded?.derived ?? []).map((d) => ({
    level: d.level as string, pertemuan_no: d.pertemuan_no, tanggal: d.tanggal,
    label: `Pertemuan ${d.pertemuan_no} · ${dayNameOf(d.tanggal)} ${d.tanggal}${d.level ? ' · ' + HITS_LEVEL_SHORT[d.level] : ''}`,
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }} className="page">
        <div className="topbar">
          <div className="wordmark"><span className="mark">H</span> Koreksi Pertemuan</div>
          <Link href="/hits/ketua" className="back">← Dashboard</Link>
        </div>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>{loaded?.halaqah.name ?? ''}</p>
        <KoreksiPanel halaqahId={halaqahId} slots={slots} />
      </div>
    </main>
  );
}
