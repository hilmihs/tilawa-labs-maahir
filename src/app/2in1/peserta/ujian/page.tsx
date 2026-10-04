import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { signedAudioUrl } from '@/lib/storage';
import { PesertaSetoranForm } from '@/components/PesertaSetoranForm';
import { Icon } from '@/components/icons';
import {
  JENIS_LABEL_UJIAN,
  LegendaPredikat,
  PredikatBadge,
  PredikatTrio,
  StatusPeriodeBadge,
  StatusUjianBadge,
} from '@/components/ujian/UjianBadges';
import { muatPeriodeTerpilih } from '@/lib/ujian-data';
import {
  formatRentang,
  perkiraanBerikutnya,
  statusPeriode,
  statusUjianPeserta,
} from '@/lib/ujian';
import { musyrifTitle } from '@/lib/whatsapp';
import { JENIS_REKAMAN, type JenisRekaman, type PredikatUjian, type StatusSetoran } from '@/types/db';

export const dynamic = 'force-dynamic';

type UjianRow = {
  id: string;
  periode_id: string;
  status: StatusSetoran;
  submitted_at: string | null;
  checked_at: string | null;
  alasan_belum: string | null;
};
type RekRow = {
  ujian_id: string;
  jenis: JenisRekaman;
  audio_url: string | null;
  duration_seconds: number | null;
  predikat: PredikatUjian | null;
  masukan: string | null;
};

export default async function PesertaUjianPage({ searchParams }: { searchParams: { periode?: string } }) {
  const s = await getSession();
  if (!s.session || s.session.role !== 'peserta') redirect('/');
  const session = s.session;

  const [{ semua, periode, today }, { data: kelas }, { data: me }] = await Promise.all([
    muatPeriodeTerpilih(searchParams.periode),
    supabaseAdmin
      .from('kelas')
      .select('id, name, musyrif:musyrif_id(id, name, gender)')
      .eq('id', session.kelas_id)
      .maybeSingle(),
    supabaseAdmin.from('peserta').select('name').eq('id', session.peserta_id).maybeSingle(),
  ]);
  const displayName = me?.name ?? session.name;
  const musyrif = kelas?.musyrif as unknown as { id: string; name: string; gender: 'ikhwan' | 'akhwat' } | null;

  const { data: ujianRaw } = await supabaseAdmin
    .from('ujian')
    .select('id, periode_id, status, submitted_at, checked_at, alasan_belum')
    .eq('peserta_id', session.peserta_id);
  const ujianList = (ujianRaw ?? []) as UjianRow[];
  const ujianIds = ujianList.map((u) => u.id);
  const { data: rekRaw } = ujianIds.length
    ? await supabaseAdmin
        .from('rekaman_ujian')
        .select('ujian_id, jenis, audio_url, duration_seconds, predikat, masukan')
        .in('ujian_id', ujianIds)
    : { data: [] };
  const rekByUjian = new Map<string, RekRow[]>();
  for (const r of (rekRaw ?? []) as RekRow[]) {
    const arr = rekByUjian.get(r.ujian_id) ?? [];
    arr.push(r);
    rekByUjian.set(r.ujian_id, arr);
  }
  const ujianByPeriode = new Map(ujianList.map((u) => [u.periode_id, u]));

  const ujian = periode ? ujianByPeriode.get(periode.id) ?? null : null;
  const rekaman = ujian ? rekByUjian.get(ujian.id) ?? [] : [];
  const stPeriode = periode ? statusPeriode(periode, today) : null;
  const stUjian = statusUjianPeserta(ujian);

  // Rekaman yang sudah tersimpan di server → bisa diputar ulang / tidak dikirim dua kali.
  const restored: Partial<Record<JenisRekaman, { audioUrl: string; durationSec: number }>> = {};
  if (stPeriode === 'berlangsung' && stUjian !== 'dinilai') {
    for (const r of rekaman) {
      if (!r.audio_url) continue;
      try {
        restored[r.jenis] = { audioUrl: await signedAudioUrl(r.audio_url, 86400), durationSec: r.duration_seconds ?? 0 };
      } catch {
        // audio tak bisa dipulihkan — peserta masih bisa rekam ulang
      }
    }
  }

  const berikutnyaTerjadwal = periode ? semua.find((p) => p.mulai > periode.selesai) ?? null : null;
  const perkiraan = periode && !berikutnyaTerjadwal ? perkiraanBerikutnya(periode) : null;

  const riwayat = semua
    .filter((p) => p.id !== periode?.id && p.selesai < today)
    .reverse()
    .map((p) => {
      const u = ujianByPeriode.get(p.id) ?? null;
      return { periode: p, ujian: u, rekaman: u ? rekByUjian.get(u.id) ?? [] : [] };
    });

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <Link href="/2in1/peserta" className="back">
            {Icon.back(12)} setoran
          </Link>
          {periode && (
            <span className="pekan-tag">
              <span className="dot" />
              {formatRentang(periode.mulai, periode.selesai)}
            </span>
          )}
        </div>

        <div className="page">
          <h1 className="t-h1" style={{ marginBottom: 2 }}>
            Ujian hafalan
          </h1>
          <p className="t-small" style={{ marginBottom: 16 }}>
            {displayName} · Kelas {kelas?.name ?? '—'}
            {musyrif && <> · dinilai {musyrifTitle(musyrif.gender).toLowerCase()} {musyrif.name}</>}
          </p>

          {!periode ? (
            <div className="card-flat" style={{ padding: 16 }}>
              <p className="t-small" style={{ margin: 0 }}>Belum ada jadwal ujian.</p>
            </div>
          ) : (
            <>
              <div className="card-flat" style={{ padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{periode.nama}</div>
                    <div className="t-small">{formatRentang(periode.mulai, periode.selesai)}</div>
                  </div>
                  {stPeriode && <StatusPeriodeBadge status={stPeriode} />}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 12 }}>
                  <span className="t-small">Status ujian Anda</span>
                  <StatusUjianBadge status={stUjian} />
                </div>
                {stUjian === 'belum' && ujian?.alasan_belum && (
                  <p className="t-small" style={{ margin: '8px 0 0' }}>
                    Keterangan musyrif/ah: <em>{ujian.alasan_belum}</em>
                  </p>
                )}
              </div>

              {stUjian === 'dinilai' ? (
                <>
                  <div className="section-row">
                    <div className="t-tiny">Nilai ujian</div>
                    <PredikatTrio rekaman={rekaman} />
                  </div>
                  {JENIS_REKAMAN.map((j) => {
                    const r = rekaman.find((x) => x.jenis === j);
                    return (
                      <div key={j} className="card" style={{ padding: 14, marginBottom: 10 }}>
                        <div className="rec-head" style={{ marginBottom: 6 }}>
                          <div className="title">{JENIS_LABEL_UJIAN[j]}</div>
                          {r?.predikat || r?.audio_url ? (
                            <PredikatBadge predikat={r.predikat} />
                          ) : (
                            <span className="badge badge-neutral">
                              <span className="dot" />
                              tidak diujikan
                            </span>
                          )}
                        </div>
                        {r?.masukan ? (
                          <p className="t-body" style={{ margin: 0 }}>{r.masukan}</p>
                        ) : (
                          <p className="t-small" style={{ fontStyle: 'italic', margin: 0 }}>(tidak ada catatan)</p>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 6 }}>
                    <LegendaPredikat />
                  </div>
                </>
              ) : stPeriode === 'berlangsung' ? (
                musyrif ? (
                  <PesertaSetoranForm
                    musyrifName={musyrif.name}
                    musyrifInitials={initialsOf(musyrif.name)}
                    existing={null}
                    singleSubmitEndpoint="/api/2in1/ujian/rekaman"
                    singleOnly
                    nounLabel="ujian"
                    extraFields={{ periode_id: periode.id }}
                    targetRoleLabel={`${musyrifTitle(musyrif.gender)} kelas Anda`}
                    cacheKey={`ujian:${periode.id}`}
                    submittedJenis={rekaman.filter((r) => r.audio_url).map((r) => r.jenis)}
                    restored={restored}
                    pesertaName={displayName}
                    pesertaId={session.peserta_id}
                    kelasName={kelas?.name}
                  />
                ) : (
                  <p className="t-body">Belum ada musyrif untuk kelas Anda. Hubungi koordinator.</p>
                )
              ) : stPeriode === 'akan' ? (
                <div className="card-flat" style={{ padding: 14 }}>
                  <p className="t-small" style={{ margin: 0 }}>
                    Perekaman ujian dibuka pada {formatRentang(periode.mulai, periode.selesai)}. Siapkan hafalan
                    Tuhfatul Athfal, Al-Jazariyyah, dan Asy-Syawahid.
                  </p>
                </div>
              ) : stUjian === 'menunggu' ? (
                <div className="card-flat" style={{ padding: 14 }}>
                  <p className="t-small" style={{ margin: 0 }}>Rekaman sudah terkirim. Menunggu penilaian musyrif/ah.</p>
                </div>
              ) : (
                <div className="card-flat" style={{ padding: 14 }}>
                  <p className="t-small" style={{ margin: 0 }}>
                    Rentang ujian sudah berakhir dan Anda belum mengirim rekaman. Hubungi musyrif/ah Anda.
                  </p>
                </div>
              )}

              <div className="t-small" style={{ marginTop: 20 }}>
                Ujian berikutnya:{' '}
                {berikutnyaTerjadwal ? (
                  <strong>{formatRentang(berikutnyaTerjadwal.mulai, berikutnyaTerjadwal.selesai)}</strong>
                ) : perkiraan ? (
                  <>
                    perkiraan <strong>{formatRentang(perkiraan.mulai, perkiraan.selesai)}</strong> (±3 bulan sekali)
                  </>
                ) : (
                  '—'
                )}
              </div>
            </>
          )}

          {riwayat.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h2 className="t-h1" style={{ fontSize: 18, marginBottom: 10 }}>
                Riwayat ujian
              </h2>
              <div className="card-flat" style={{ overflow: 'hidden' }}>
                {riwayat.map(({ periode: p, ujian: u, rekaman: rk }) => (
                  <Link
                    key={p.id}
                    href={`/2in1/peserta/ujian?periode=${p.id}`}
                    className="row"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{p.nama}</div>
                      <div className="t-small">{formatRentang(p.mulai, p.selesai)}</div>
                    </div>
                    {statusUjianPeserta(u) === 'dinilai' ? (
                      <PredikatTrio rekaman={rk} />
                    ) : (
                      <StatusUjianBadge status={statusUjianPeserta(u)} />
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
