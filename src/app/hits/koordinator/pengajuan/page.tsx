import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireKoordinatorKetuaKelas } from '@/lib/session';
import { Icon } from '@/components/icons';
import { buildWaMeUrl } from '@/lib/whatsapp';
import {
  getHitsPengajuan,
  countByJenis,
  PENGAJUAN_LABEL,
  WAITING_LABEL,
  JENIS_ORDER,
  type PengajuanJenis,
  type PengajuanRow,
} from '@/lib/hits-pengajuan';
import { absUrl } from '@/lib/url';
import { ShareLinkButton } from './ShareLinkButton';

export const dynamic = 'force-dynamic';

const JENIS_BADGE: Record<PengajuanJenis, string> = {
  pindah: 'badge-neutral',
  hapus: 'badge-merah',
  koreksi: 'badge-kuning',
  dual: 'badge-hijau',
};

function ageBadgeClass(days: number): string {
  if (days > 7) return 'badge-merah';
  if (days > 3) return 'badge-kuning';
  return 'badge-neutral';
}

export default async function PengajuanInboxPage({
  searchParams,
}: {
  searchParams: { tab?: string; jenis?: string; gender?: string };
}) {
  try {
    await requireKoordinatorKetuaKelas();
  } catch {
    redirect('/');
  }

  const tab = searchParams.tab === 'riwayat' ? 'riwayat' : 'menunggu';
  const jenisFilter = JENIS_ORDER.includes(searchParams.jenis as PengajuanJenis)
    ? (searchParams.jenis as PengajuanJenis)
    : undefined;
  const genderFilter =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat' ? searchParams.gender : undefined;

  const all = await getHitsPengajuan(tab === 'riwayat' ? 'decided' : 'pending');
  // Hitung per jenis dihormati filter gender (tapi tak dipersempit filter jenis —
  // chip harus tetap bisa pindah antar jenis).
  const genderScoped = genderFilter ? all.filter((r) => r.gender === genderFilter) : all;
  const counts = countByJenis(genderScoped);
  let rows = genderScoped;
  if (jenisFilter) rows = rows.filter((r) => r.jenis === jenisFilter);

  const qs = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = { tab, jenis: jenisFilter, gender: genderFilter, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">H</span> Pengajuan Masuk
          </div>
          <Link href="/hits/koordinator" className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ gap: 8, marginBottom: 12 }}>
            <Link
              href={qs({ tab: undefined })}
              className={`btn btn-sm ${tab === 'menunggu' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Menunggu
            </Link>
            <Link
              href={qs({ tab: 'riwayat' })}
              className={`btn btn-sm ${tab === 'riwayat' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Riwayat
            </Link>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <Link
              href={qs({ jenis: undefined })}
              className={`badge ${!jenisFilter ? 'badge-hijau' : 'badge-neutral'}`}
              style={{ textDecoration: 'none' }}
            >
              Semua {genderScoped.length}
            </Link>
            {JENIS_ORDER.map((j) => (
              <Link
                key={j}
                href={qs({ jenis: j })}
                className={`badge ${jenisFilter === j ? 'badge-hijau' : 'badge-neutral'}`}
                style={{ textDecoration: 'none' }}
              >
                {PENGAJUAN_LABEL[j]} {counts[j]}
              </Link>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['ikhwan', 'akhwat'] as const).map((g) => (
              <Link
                key={g}
                href={qs({ gender: genderFilter === g ? undefined : g })}
                className={`badge ${genderFilter === g ? 'badge-kuning' : 'badge-neutral'}`}
                style={{ textDecoration: 'none' }}
              >
                {g === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
              </Link>
            ))}
          </div>

          {rows.length === 0 && (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              {tab === 'riwayat' ? 'Belum ada pengajuan yang diputuskan.' : 'Tak ada pengajuan menunggu. 🎉'}
            </p>
          )}

          {rows.map((r) => (
            <PengajuanCard key={`${r.jenis}-${r.id}`} r={r} tab={tab} />
          ))}
        </div>
      </div>
    </main>
  );
}

function PengajuanCard({ r, tab }: { r: PengajuanRow; tab: 'menunggu' | 'riwayat' }) {
  const waPengaju =
    r.requesterWa &&
    buildWaMeUrl(
      r.requesterWa,
      `Assalamualaikum ${r.requesterName}, terkait pengajuan ${PENGAJUAN_LABEL[r.jenis]} (${r.halaqahName}).`
    );

  return (
    <div
      className="card"
      style={{
        padding: '10px 14px',
        marginBottom: 8,
        borderLeft: r.conflict ? '3px solid var(--merah)' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`badge ${JENIS_BADGE[r.jenis]}`}>{PENGAJUAN_LABEL[r.jenis]}</span>
            {tab === 'menunggu' && (
              <span className={`badge ${ageBadgeClass(r.ageDays)}`}>
                <span className="dot" /> {r.ageDays} hari
              </span>
            )}
            {tab === 'menunggu' && (
              <span
                className="badge"
                style={{
                  background: r.waitingOn === 'koordinator' ? 'var(--amber-bg, #f8f1d9)' : 'rgba(120,140,170,.16)',
                  color: r.waitingOn === 'koordinator' ? 'var(--amber-ink, #a8871a)' : 'inherit',
                  fontWeight: 600,
                }}
                title="Progress persetujuan"
              >
                {WAITING_LABEL[r.waitingOn]}
              </span>
            )}
            {r.gender && <span className="t-tiny">{r.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>
            {r.halaqahName}
            {r.batchName ? ` · ${r.batchName}` : ''}
          </div>
          <div className="t-small" style={{ marginTop: 1 }}>
            {r.ringkas}
          </div>
          {r.items && r.items.length > 1 && (
            <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
              {r.items
                .slice(0, 3)
                .map((it) => `#${it.pertemuan_no ?? '?'}${it.tanggal ? '→' + it.tanggal : ''}`)
                .join(', ')}
              {r.items.length > 3 ? ` +${r.items.length - 3} lagi` : ''}
            </div>
          )}
          <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
            Pengaju: {r.requesterName}
          </div>
          {r.conflict && (
            <div className="t-tiny" style={{ color: 'var(--merah-ink)', marginTop: 2, fontWeight: 600 }}>
              ⚠ {r.conflict}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tab === 'menunggu' ? (
            <>
              {r.decideHref && (
                <Link href={r.decideHref} className="btn btn-sm btn-primary" style={{ whiteSpace: 'nowrap' }}>
                  Tinjau →
                </Link>
              )}
              {waPengaju && (
                <a href={waPengaju} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
                  WA pengaju
                </a>
              )}
              {r.decideHref && (
                <ShareLinkButton
                  url={absUrl(r.decideHref)}
                  label={`Pengajuan ${PENGAJUAN_LABEL[r.jenis]} — ${r.halaqahName}`}
                />
              )}
            </>
          ) : (
            <>
              <span
                className={`badge ${
                  r.status === 'rejected' ? 'badge-merah' : r.status === 'pending' ? 'badge-kuning' : 'badge-hijau'
                }`}
              >
                {r.status}
              </span>
              {r.decidedAt && (
                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                  {r.decidedAt.slice(0, 10)}
                  {r.decidedByRole ? ` · ${r.decidedByRole}` : ''}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
