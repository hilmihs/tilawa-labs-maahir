import { requireOneOfRoles } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentCycleStart, previousCycles, formatCycleRange, formatCycleDeadline } from '@/lib/week';
import { buildWaMeUrl, tplReminderPesertaBelumSetor } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { SetoranDistributionChart } from '@/components/charts/SetoranDistributionChart';
import { NotesPanel } from '@/components/NotesPanel';
import type { NilaiRekaman } from '@/types/db';

interface NoteRow {
  id: string;
  author_role: string;
  author_id: string;
  body: string;
  visibility: string;
  created_at: string;
}

export const dynamic = 'force-dynamic';

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Belum setor', cls: 'badge-merah' },
  submitted: { label: 'Menunggu cek', cls: 'badge-kuning' },
  checked: { label: 'Dicek', cls: 'badge-hijau' },
};

const NILAI_COLOR: Record<NilaiRekaman, string> = {
  hijau: 'var(--hijau)',
  kuning: 'var(--kuning)',
  merah: 'var(--merah)',
};

export default async function PesertaDossierPage({ params }: { params: { id: string } }) {
  const session = await requireOneOfRoles(['koordinator', 'syaikh']);

  const { data: peserta } = await supabaseAdmin
    .from('peserta')
    .select('id, name, gender, kelas_id, whatsapp_number, active')
    .eq('id', params.id)
    .maybeSingle();
  if (!peserta) notFound();

  // Syaikh + koordinator boleh akses cross-gender (sudah pattern existing di /2in1)
  const sessionAuthorId = session.role === 'koordinator' ? session.koordinator_id : session.syaikh_id;

  const { data: kelas } = await supabaseAdmin
    .from('kelas')
    .select('id, name, gender, musyrif:musyrif_id(id, name, gender, whatsapp_number)')
    .eq('id', peserta.kelas_id)
    .maybeSingle();

  const musyrif = (kelas?.musyrif as unknown as { id: string; name: string; gender: string; whatsapp_number: string } | null) ?? null;

  const cycleNow = currentCycleStart();
  const cycleList = [cycleNow, ...previousCycles(5)]; // 6 cycles total
  const cycleListAsc = [...cycleList].reverse();

  const { data: setoranList } = await supabaseAdmin
    .from('setoran')
    .select('id, peserta_id, week_start, status, submitted_at, checked_at, checked_by_musyrif_id')
    .eq('peserta_id', peserta.id)
    .in('week_start', cycleList)
    .order('week_start', { ascending: false });

  const setoranIds = (setoranList ?? []).map((s) => s.id);

  const { data: rekamanList } = setoranIds.length
    ? await supabaseAdmin
        .from('rekaman')
        .select('setoran_id, jenis, nilai, masukan, checked_at')
        .in('setoran_id', setoranIds)
    : { data: [] as Array<{ setoran_id: string; jenis: string; nilai: NilaiRekaman | null; masukan: string | null; checked_at: string | null }> };

  const rekamanBySetoran = new Map<string, Array<{ jenis: string; nilai: NilaiRekaman | null; masukan: string | null; checked_at: string | null }>>();
  for (const r of rekamanList ?? []) {
    const arr = rekamanBySetoran.get(r.setoran_id) ?? [];
    arr.push({ jenis: r.jenis, nilai: r.nilai, masukan: r.masukan, checked_at: r.checked_at });
    rekamanBySetoran.set(r.setoran_id, arr);
  }

  const setoranByCycle = new Map((setoranList ?? []).map((s) => [s.week_start, s]));

  // Risk: ≥2 dari 3 cycle terakhir tidak setor / draft.
  const last3 = [cycleNow, ...previousCycles(2)];
  let missing = 0;
  for (const c of last3) {
    const s = setoranByCycle.get(c);
    if (!s || s.status === 'draft') missing++;
  }
  const isRisky = missing >= 2;

  // Catatan musyrif terakhir (sampai 3)
  const recentNotes: Array<{ cycle: string; jenis: string; masukan: string }> = [];
  for (const s of setoranList ?? []) {
    const rec = rekamanBySetoran.get(s.id) ?? [];
    for (const r of rec) {
      if (r.masukan && r.masukan.trim()) {
        recentNotes.push({ cycle: s.week_start, jenis: r.jenis, masukan: r.masukan.trim() });
        if (recentNotes.length >= 3) break;
      }
    }
    if (recentNotes.length >= 3) break;
  }

  const cycleDeadline = formatCycleDeadline(cycleNow);
  const cycleRange = formatCycleRange(cycleNow);

  // Notes
  const { data: notesRaw } = await supabaseAdmin
    .from('koordinator_notes')
    .select('id, author_role, author_id, body, visibility, created_at')
    .eq('target_type', 'peserta')
    .eq('target_id', peserta.id)
    .or(`visibility.eq.peer,and(visibility.eq.private,author_id.eq.${sessionAuthorId})`)
    .order('created_at', { ascending: false })
    .limit(20);

  const authorIds = Array.from(new Set((notesRaw ?? []).map((n) => n.author_id)));
  const authorMap = new Map<string, string>();
  if (authorIds.length) {
    const tables = ['koordinator', 'syaikh', 'koordinator_ketua_kelas'];
    for (const t of tables) {
      const { data } = await supabaseAdmin.from(t).select('id, name').in('id', authorIds);
      for (const r of data ?? []) authorMap.set(r.id, r.name);
    }
  }

  const notes = ((notesRaw ?? []) as NoteRow[]).map((n) => ({
    id: n.id,
    author_role: n.author_role,
    author_name: authorMap.get(n.author_id),
    body: n.body,
    visibility: n.visibility,
    created_at: n.created_at,
    isMine: n.author_id === sessionAuthorId,
  }));

  // Reminder URL untuk koordinator (kalau peserta belum setor cycle ini)
  const setoranNow = setoranByCycle.get(cycleNow);
  const reminderUrl =
    setoranNow?.status !== 'submitted' && setoranNow?.status !== 'checked'
      ? buildWaMeUrl(
          peserta.whatsapp_number,
          tplReminderPesertaBelumSetor({
            pesertaName: peserta.name,
            pesertaGender: peserta.gender,
            setorUrl: absUrl('/2in1/peserta'),
            deadlineLabel: cycleDeadline,
          })
        )
      : null;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">M</span> Peserta
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/2in1/koordinator" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>
                {Icon.back(12)} Dashboard
              </Link>
              <LogoutButton />
            </div>
          </div>

          {/* Header */}
          <div className="card-flat" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h1 className="t-h1" style={{ marginBottom: 4 }}>{peserta.name}</h1>
                <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                  {kelas?.name ?? '—'} · {peserta.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
                  {musyrif && ` · ${musyrif.gender === 'akhwat' ? 'Musyrifah' : 'Musyrif'}: ${musyrif.name}`}
                </p>
                <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
                  Cycle aktif: {cycleRange} · Deadline {cycleDeadline}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {!peserta.active && <span className="badge badge-merah"><span className="dot" /> Nonaktif</span>}
                {peserta.active && isRisky && (
                  <span className="badge badge-merah"><span className="dot" /> Berisiko · {missing}/3 cycle</span>
                )}
                {reminderUrl && (
                  <a className="btn btn-sm btn-wa" href={reminderUrl} target="_blank" rel="noopener noreferrer">
                    {Icon.wa(13)} Reminder
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Cycle history table */}
          <h2 className="t-h2" style={{ marginBottom: 10 }}>Riwayat Setoran (6 cycle)</h2>
          <div className="card-flat" style={{ padding: 0, overflowX: 'auto', marginBottom: 24 }}>
            <table className="k-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>Status</th>
                  <th>Dikirim</th>
                  <th>Dicek</th>
                  <th>Nilai</th>
                </tr>
              </thead>
              <tbody>
                {cycleListAsc.map((cy) => {
                  const s = setoranByCycle.get(cy);
                  const status = s?.status ?? 'draft';
                  const badge = STATUS_BADGE[status];
                  const rec = s ? rekamanBySetoran.get(s.id) ?? [] : [];
                  return (
                    <tr key={cy}>
                      <td className="nm">{formatCycleRange(cy)}</td>
                      <td>
                        <span className={`badge ${badge.cls}`}><span className="dot" />{badge.label}</span>
                      </td>
                      <td className="t-mono" style={{ color: 'var(--muted)' }}>{fmtDate(s?.submitted_at)}</td>
                      <td className="t-mono" style={{ color: 'var(--muted)' }}>{fmtDate(s?.checked_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[0, 1, 2].map((idx) => {
                            const r = rec[idx];
                            const color = r?.nilai ? NILAI_COLOR[r.nilai] : 'var(--line-2)';
                            return (
                              <span
                                key={idx}
                                aria-label={r?.nilai ?? 'kosong'}
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  background: color,
                                  border: '1px solid var(--line)',
                                }}
                              />
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Distribution chart */}
          {(() => {
            const dist = cycleListAsc.map((cy) => {
              const s = setoranByCycle.get(cy);
              const rec = s ? rekamanBySetoran.get(s.id) ?? [] : [];
              const count = { hijau: 0, kuning: 0, merah: 0 };
              for (const r of rec) {
                if (r.nilai) count[r.nilai]++;
              }
              return {
                cycle_label: cy.slice(5),
                ...count,
              };
            });
            const hasAny = dist.some((d) => d.hijau + d.kuning + d.merah > 0);
            return hasAny ? (
              <>
                <h2 className="t-h2" style={{ marginBottom: 10 }}>Distribusi Nilai per Cycle</h2>
                <div className="card-flat" style={{ padding: 16, marginBottom: 24 }}>
                  <SetoranDistributionChart data={dist} />
                </div>
              </>
            ) : null;
          })()}

          {/* Notes panel */}
          <NotesPanel targetType="peserta" targetId={peserta.id} notes={notes} />

          {/* Catatan musyrif */}
          <h2 className="t-h2" style={{ marginBottom: 10 }}>Catatan Musyrif Terakhir</h2>
          {recentNotes.length > 0 ? (
            <div style={{ marginBottom: 24 }}>
              {recentNotes.map((n, i) => (
                <div key={i} className="card-flat" style={{ padding: '12px 16px', marginBottom: 8, borderLeft: '3px solid var(--accent-line)' }}>
                  <div className="t-tiny" style={{ marginBottom: 4 }}>
                    {formatCycleRange(n.cycle)} · {n.jenis}
                  </div>
                  <p className="t-small" style={{ color: 'var(--ink-2)' }}>{n.masukan}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center', marginBottom: 24 }}>
              <p className="t-small" style={{ color: 'var(--muted)' }}>Belum ada catatan musyrif.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
