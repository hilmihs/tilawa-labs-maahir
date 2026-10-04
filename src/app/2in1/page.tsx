import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllAccesses } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';
import type { RoleAccess } from '@/types/db';

export const dynamic = 'force-dynamic';

type Dest = { href: string; title: string; desc: string };

// Tujuan 2in1 per role. Satu role bisa punya >1 tujuan (mis. koordinator:
// dashboard + laporan bulanan). Dedup by href, urutan = setoran dulu.
function destsFor(a: RoleAccess): Dest[] {
  switch (a.role) {
    case 'peserta':
      return [{ href: '/2in1/peserta', title: 'Setoran Hafalan', desc: 'Setor hafalan Anda tiap periode' }];
    case 'musyrif':
      return [{ href: '/2in1/musyrif', title: 'Setoran & Cek Musyrif', desc: 'Setor & cek hafalan peserta halaqah' }];
    case 'koordinator':
      return [
        { href: '/2in1/koordinator', title: 'Dashboard Koordinator', desc: 'Monitoring & ranking setoran' },
        { href: '/2in1/laporan', title: 'Laporan Bulanan', desc: 'Rekap & unduh laporan setoran per bulan' },
      ];
    case 'syaikh':
      return [
        { href: '/2in1/syaikh', title: 'Dashboard Syaikh', desc: 'Monitoring setoran musyrif' },
        { href: '/2in1/laporan', title: 'Laporan Bulanan', desc: 'Rekap & unduh laporan setoran per bulan' },
      ];
    default:
      return [];
  }
}

export default async function Page2in1() {
  const accesses = await getAllAccesses();

  const dests: Dest[] = [];
  const seen = new Set<string>();
  const roleAreas = new Set<string>();
  for (const a of accesses) {
    const rd = destsFor(a);
    if (rd.length) roleAreas.add(a.role);
    for (const d of rd) {
      if (seen.has(d.href)) continue;
      seen.add(d.href);
      dests.push(d);
    }
  }

  if (dests.length === 0) redirect('/');
  // Chooser hanya bila user punya >1 role 2in1 (mis. peserta + koordinator).
  // Solo koordinator (dashboard + laporan) tetap langsung ke dashboard —
  // laporan sudah ada tautannya di dashboard.
  if (roleAreas.size <= 1) redirect(dests[0].href);

  const userName = accesses[0]?.name ?? '';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <Link href="/" className="wordmark">
            <span className="mark">M</span> Barnamij 2in1
          </Link>
          <LogoutButton />
        </div>
        <div className="page">
          <h1 className="t-h1" style={{ marginBottom: 6 }}>Assalamu&apos;alaikum, {userName}</h1>
          <p className="t-body" style={{ marginBottom: 22 }}>Pilih bagian yang ingin Anda buka:</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {dests.map((d) => (
              <a
                key={d.href}
                href={d.href}
                className="card-flat"
                style={{ display: 'block', padding: '16px 20px', textDecoration: 'none', color: 'inherit', borderRadius: 12 }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.title}</div>
                <div className="t-small" style={{ color: 'var(--muted-2)' }}>{d.desc}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
