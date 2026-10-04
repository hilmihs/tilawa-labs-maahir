import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Icon, Initials } from '@/components/icons';
import { StatCard } from '@/components/ui/StatCard';
import {
  LegendaPredikat,
  PredikatTrio,
  StatusPeriodeBadge,
  StatusUjianBadge,
} from '@/components/ujian/UjianBadges';
import { muatPeriodeTerpilih, muatUjianPeserta } from '@/lib/ujian-data';
import { formatRentang, statusPeriode, statusUjianPeserta, type StatusUjianPeserta } from '@/lib/ujian';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplReminderPesertaBelumUjian } from '@/lib/whatsapp';
import type { Gender } from '@/types/db';
import { mulaiNilaiLangsung } from './actions';
import { AlasanBelumForm } from './AlasanBelumForm';

export const dynamic = 'force-dynamic';

type PesertaRow = { id: string; name: string; gender: Gender; kelas_id: string; whatsapp_number: string };

const URUTAN: Record<StatusUjianPeserta, number> = { menunggu: 0, belum: 1, dinilai: 2 };

export default async function MusyrifUjianPage({ searchParams }: { searchParams: { periode?: string } }) {
  const s = await getSession();
  if (!s.session || s.session.role !== 'musyrif') redirect('/2in1/musyrif/login?next=/2in1/musyrif/ujian');
  const musyrifId = s.session.musyrif_id;

  const [{ semua, periode, today }, { data: kelasList }] = await Promise.all([
    muatPeriodeTerpilih(searchParams.periode),
    supabaseAdmin.from('kelas').select('id, name').eq('musyrif_id', musyrifId),
  ]);
  const kelasById = new Map((kelasList ?? []).map((k) => [k.id as string, k.name as string]));
  const kelasIds = [...kelasById.keys()];

  const { data: pesertaRaw } = kelasIds.length
    ? await supabaseAdmin
        .from('peserta')
        .select('id, name, gender, kelas_id, whatsapp_number')
        .eq('active', true)
        .in('kelas_id', kelasIds)
        .order('name')
    : { data: [] };
  const pesertaList = (pesertaRaw ?? []) as PesertaRow[];

  const ujianMap = periode ? await muatUjianPeserta(periode.id, pesertaList.map((p) => p.id)) : new Map();
  const stPeriode = periode ? statusPeriode(periode, today) : null;

  const rows = pesertaList
    .map((p) => {
      const d = ujianMap.get(p.id);
      return { peserta: p, ujian: d?.ujian ?? null, rekaman: d?.rekaman ?? [], status: statusUjianPeserta(d?.ujian) };
    })
    .sort((a, b) => URUTAN[a.status] - URUTAN[b.status] || a.peserta.name.localeCompare(b.peserta.name));

  const hitung = {
    belum: rows.filter((r) => r.status === 'belum').length,
    menunggu: rows.filter((r) => r.status === 'menunggu').length,
    dinilai: rows.filter((r) => r.status === 'dinilai').length,
  };

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="topbar">
          <Link href="/2in1/musyrif" className="back">
            {Icon.back(12)} dashboard
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
            Ujian peserta
          </h1>
          <p className="t-small" style={{ marginBottom: 12 }}>
            Peserta merekam 3 matan di rentang ujian, lalu antum beri predikat per matan. Ujian lewat telepon/tatap
            muka? Pakai <strong>Nilai langsung</strong>.
          </p>

          {semua.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {[...semua].reverse().map((p) => (
                <Link
                  key={p.id}
                  href={`/2in1/musyrif/ujian?periode=${p.id}`}
                  className={`btn btn-xs ${p.id === periode?.id ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ textDecoration: 'none' }}
                >
                  {p.nama}
                </Link>
              ))}
            </div>
          )}

          {!periode ? (
            <div className="card-flat" style={{ padding: 16 }}>
              <p className="t-small" style={{ margin: 0 }}>Belum ada jadwal ujian. Koordinator yang menjadwalkan.</p>
            </div>
          ) : (
            <>
              <div className="card-flat" style={{ padding: 14, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{periode.nama}</div>
                    <div className="t-small">{formatRentang(periode.mulai, periode.selesai)}</div>
                  </div>
                  {stPeriode && <StatusPeriodeBadge status={stPeriode} />}
                </div>
                <div style={{ marginTop: 8 }}>
                  <LegendaPredikat />
                </div>
              </div>

              <div className="stat-grid-3" style={{ marginBottom: 14 }}>
                <StatCard value={hitung.belum} label="Belum ujian" valueColor="var(--merah-ink)" dotColor="var(--merah)" />
                <StatCard value={hitung.menunggu} label="Perlu dinilai" valueColor="var(--kuning-ink)" dotColor="var(--kuning)" />
                <StatCard value={hitung.dinilai} label="Dinilai" valueColor="var(--hijau-ink)" dotColor="var(--hijau)" />
              </div>

              {rows.length === 0 ? (
                <div className="card-flat" style={{ padding: 16 }}>
                  <p className="t-small" style={{ margin: 0 }}>Belum ada peserta di kelas Anda.</p>
                </div>
              ) : (
                <div className="card-flat" style={{ overflow: 'hidden' }}>
                  {rows.map(({ peserta, ujian, rekaman, status }) => {
                    const ingatkan =
                      status === 'belum' && stPeriode === 'berlangsung'
                        ? buildWaMeUrl(
                            peserta.whatsapp_number,
                            tplReminderPesertaBelumUjian({
                              pesertaName: peserta.name,
                              pesertaGender: peserta.gender,
                              periodeNama: periode.nama,
                              rentangLabel: formatRentang(periode.mulai, periode.selesai),
                              ujianUrl: absUrl('/2in1/peserta/ujian'),
                            })
                          )
                        : null;
                    return (
                      <div key={peserta.id} style={{ padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="avatar">
                            <Initials name={peserta.name} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{peserta.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                              Kelas {kelasById.get(peserta.kelas_id) ?? '-'}
                              {ujian?.submitted_at && status !== 'belum' && <> · kirim {formatWaktu(ujian.submitted_at)}</>}
                            </div>
                          </div>
                          {status === 'menunggu' && ujian && (
                            <Link href={`/2in1/musyrif/ujian/${ujian.id}`} className="badge badge-kuning" style={{ textDecoration: 'none' }}>
                              <span className="dot" />
                              Nilai
                            </Link>
                          )}
                          {status === 'dinilai' && ujian && (
                            <Link href={`/2in1/musyrif/ujian/${ujian.id}`} style={{ textDecoration: 'none' }} title="Lihat / ubah nilai">
                              <PredikatTrio rekaman={rekaman} />
                            </Link>
                          )}
                          {status === 'belum' && (
                            <>
                              {ingatkan && (
                                <a href={ingatkan} target="_blank" rel="noopener" className="act-btn wa" style={{ textDecoration: 'none' }}>
                                  {Icon.wa(11)} Ingatkan
                                </a>
                              )}
                              {/* Badge "belum" diganti tombol — baris sempit di layar HP. */}
                              {stPeriode !== 'akan' ? (
                                <form action={mulaiNilaiLangsung}>
                                  <input type="hidden" name="periode_id" value={periode.id} />
                                  <input type="hidden" name="peserta_id" value={peserta.id} />
                                  <button type="submit" className="act-btn" title="Ujian lewat telepon/tatap muka">
                                    Nilai langsung
                                  </button>
                                </form>
                              ) : (
                                <StatusUjianBadge status="belum" />
                              )}
                            </>
                          )}
                        </div>
                        {status === 'belum' && (
                          <AlasanBelumForm periodeId={periode.id} pesertaId={peserta.id} alasan={ujian?.alasan_belum ?? null} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
