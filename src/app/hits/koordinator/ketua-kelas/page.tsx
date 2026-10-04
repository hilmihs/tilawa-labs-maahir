import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { GenderNavSelect } from '@/components/GenderNavSelect';
import { buildWaMeUrl } from '@/lib/whatsapp';
import { Icon } from '@/components/icons';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

type Halaqah = {
  id: string;
  name: string;
  gender: Gender | null;
  batch_id: string | null;
  pengajar_id: string | null;
  pengajar_nama_sheet: string | null;
};
type Ketua = { name: string; whatsapp_number: string | null; hits_halaqah_id: string | null };

export default async function KetuaKelasHitsPage({
  searchParams,
}: {
  searchParams: { gender?: string };
}) {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const genderFilter: Gender | undefined =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat' ? searchParams.gender : undefined;

  const { data: batchesRaw } = await supabaseAdmin
    .from('hits_batch')
    .select('id, name, start_date')
    .order('start_date');
  const batches = (batchesRaw ?? []) as Array<{ id: string; name: string; start_date: string | null }>;

  let hq = supabaseAdmin
    .from('hits_halaqah')
    .select('id, name, gender, batch_id, pengajar_id, pengajar_nama_sheet')
    .eq('active', true)
    .order('name');
  if (genderFilter) hq = hq.eq('gender', genderFilter);
  const { data: halaqahRaw } = await hq;
  const halaqah = ((halaqahRaw ?? []) as Halaqah[]).filter((h) => !/\(observasi\)/i.test(h.name));

  // Ambil pengajar dari RECORD pengajar (via pengajar_id) → nama + WA otoritatif,
  // sama sumbernya dengan Matrix Skill Guru. Field pengajar_wa di halaqah (dari
  // sheet) sering basi, jadi tak dipakai.
  const pengajarIds = Array.from(new Set(halaqah.map((h) => h.pengajar_id).filter(Boolean))) as string[];
  const { data: pengajarRows } = pengajarIds.length
    ? await supabaseAdmin.from('pengajar').select('id, name, whatsapp_number').in('id', pengajarIds)
    : { data: [] };
  const pengajarById = new Map(
    ((pengajarRows ?? []) as Array<{ id: string; name: string; whatsapp_number: string | null }>).map((p) => [p.id, p])
  );

  const { data: ketuaRaw } = await supabaseAdmin
    .from('ketua_kelas')
    .select('name, whatsapp_number, hits_halaqah_id')
    .eq('active', true)
    .not('hits_halaqah_id', 'is', null);
  const ketuaByHalaqah = new Map<string, Ketua>();
  for (const k of (ketuaRaw ?? []) as Ketua[]) {
    if (k.hits_halaqah_id && !ketuaByHalaqah.has(k.hits_halaqah_id)) ketuaByHalaqah.set(k.hits_halaqah_id, k);
  }

  const byBatch = new Map<string, Halaqah[]>();
  for (const h of halaqah) {
    const key = h.batch_id ?? '_none';
    const arr = byBatch.get(key) ?? [];
    arr.push(h);
    byBatch.set(key, arr);
  }

  const totalHalaqah = halaqah.length;
  const totalTanpaKetua = halaqah.filter((h) => !ketuaByHalaqah.has(h.id)).length;
  const genderLabel = genderFilter === 'ikhwan' ? 'Ikhwan' : genderFilter === 'akhwat' ? 'Akhwat' : 'Ikhwan & Akhwat';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">H</span> Ketua Kelas HITS
          </div>
          <Link href="/hits/koordinator" className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <div>
              <h1 className="t-h1" style={{ marginBottom: 4 }}>
                Ketua Kelas — Semua Batch
              </h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                {totalHalaqah} halaqah · {genderLabel} ·{' '}
                <strong style={{ color: totalTanpaKetua ? 'var(--merah-ink)' : 'var(--hijau-ink)' }}>
                  {totalTanpaKetua} belum ada ketua
                </strong>
              </p>
            </div>
            <GenderNavSelect value={genderFilter ?? ''} />
          </div>

          {batches
            .filter((b) => (byBatch.get(b.id)?.length ?? 0) > 0)
            .map((b) => {
              const list = byBatch.get(b.id) ?? [];
              const tanpa = list.filter((h) => !ketuaByHalaqah.has(h.id)).length;
              return (
                <div key={b.id} style={{ marginBottom: 22 }}>
                  <div className="section-row" style={{ marginBottom: 6 }}>
                    <h2 className="t-h3" style={{ margin: 0 }}>
                      {b.name}
                    </h2>
                    <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                      {list.length} halaqah · {list.length - tanpa} ada ketua ·{' '}
                      <strong style={{ color: tanpa ? 'var(--merah-ink)' : 'var(--muted)' }}>{tanpa} belum</strong>
                    </span>
                  </div>
                  <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="k-table">
                        <thead>
                          <tr>
                            <th style={{ minWidth: 190 }}>Nomor Halaqah</th>
                            <th style={{ width: 70, textAlign: 'center' }}>Gender</th>
                            <th style={{ minWidth: 150 }}>Pengajar</th>
                            <th style={{ width: 130 }}>WA Pengajar</th>
                            <th style={{ minWidth: 150 }}>Ketua Kelas</th>
                            <th style={{ width: 120 }}>WA Ketua</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((h) => {
                            const k = ketuaByHalaqah.get(h.id);
                            const noKetua = !k;
                            const pg = h.pengajar_id ? pengajarById.get(h.pengajar_id) : undefined;
                            const pengajarNama = pg?.name ?? h.pengajar_nama_sheet;
                            const pengajarWa = pg?.whatsapp_number ?? null;
                            return (
                              <tr
                                key={h.id}
                                style={noKetua ? { background: 'var(--merah-tint, #fce8e6)' } : undefined}
                              >
                                <td style={{ fontWeight: 600 }}>{h.name}</td>
                                <td style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                                  {h.gender === 'ikhwan' ? 'Ikhwan' : h.gender === 'akhwat' ? 'Akhwat' : '—'}
                                </td>
                                <td>{pengajarNama || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                                <td>
                                  {pengajarWa ? (
                                    <a
                                      href={buildWaMeUrl(pengajarWa, '')}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="t-mono"
                                      style={{ color: 'var(--hijau-ink)', fontSize: 12 }}
                                    >
                                      {pengajarWa}
                                    </a>
                                  ) : (
                                    <span style={{ color: 'var(--muted)' }}>—</span>
                                  )}
                                </td>
                                <td style={{ fontWeight: k ? 500 : 400 }}>
                                  {k ? (
                                    k.name
                                  ) : (
                                    <span style={{ color: 'var(--merah-ink)', fontWeight: 600 }}>— belum ada</span>
                                  )}
                                </td>
                                <td>
                                  {k?.whatsapp_number ? (
                                    <a
                                      href={buildWaMeUrl(k.whatsapp_number, '')}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="t-mono"
                                      style={{ color: 'var(--hijau-ink)', fontSize: 12 }}
                                    >
                                      {k.whatsapp_number}
                                    </a>
                                  ) : (
                                    <span style={{ color: 'var(--muted)' }}>—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </main>
  );
}
