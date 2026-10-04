import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import {
  getMaahirSP,
  PROGRAM_START,
  SP_START_UMUM,
  type PemutihanRingkas,
  type Penetapan,
  type SPLevel,
} from '@/lib/maahir-sp';
import { todayJakarta } from '@/lib/anggota-periode';
import { GenderNavSelect } from '@/components/GenderNavSelect';
import { Icon } from '@/components/icons';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function tanggalLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Ringkas daftar pemutihan jadi satu label sel tabel. */
function pemutihanLabel(rows: PemutihanRingkas[]): string {
  if (rows.length === 0) return '—';
  const sebulan = rows.filter((r) => r.tanggal === null);
  const harian = rows.filter((r) => r.tanggal !== null);
  const bagian: string[] = [];
  if (harian.length === 1) bagian.push(tanggalPendek(harian[0].tanggal as string));
  else if (harian.length > 1) bagian.push(`${harian.length} tanggal`);
  if (sebulan.length === 1) bagian.push(`${bulanPendek(sebulan[0].month)} (sebulan)`);
  else if (sebulan.length > 1) bagian.push(`${sebulan.length} bulan penuh`);
  return bagian.join(' · ');
}

function tanggalPendek(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function bulanPendek(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', {
    month: 'short',
    timeZone: 'UTC',
  });
}

function spStyle(sp: SPLevel) {
  if (sp >= 3) return { bg: 'var(--merah-tint)', bd: 'var(--merah-line)', ink: 'var(--merah-ink)' };
  if (sp === 2) return { bg: 'var(--kuning-tint)', bd: 'var(--kuning-line)', ink: 'var(--kuning-ink)' };
  return { bg: 'var(--surface-3)', bd: 'var(--line)', ink: 'var(--muted)' };
}

/** Tanggal penetapan tiap tingkat, satu baris per tingkat. */
function PenetapanSel({ rows }: { rows: Penetapan[] }) {
  if (rows.length === 0) return <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {rows.map((r) => (
        <span key={r.level} className="t-tiny" style={{ whiteSpace: 'nowrap' }}>
          <strong>SP{r.level}</strong>{' '}
          <span style={{ color: 'var(--muted-2)' }}>
            {tanggalPendek(r.tanggal)} · {r.pemicu}
          </span>
        </span>
      ))}
    </div>
  );
}

export default async function PendataanSPPage({
  searchParams,
}: {
  searchParams: { gender?: string; dari?: string; sampai?: string };
}) {
  const { accesses } = await getSession();
  if (!accesses?.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran')) {
    redirect('/2in1/koordinator/login');
  }

  const genderFilter: Gender | undefined =
    searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
      ? searchParams.gender
      : undefined;

  // Rentang tanggal, bukan dropdown bulan. SP tetap KUMULATIF sejak program
  // mulai — `sampai` memotong perhitungan di tanggal itu ("per tanggal ini,
  // siapa sudah kena SP berapa"), `dari` hanya menyaring tampilan ke peserta
  // yang penetapan SP-nya jatuh di dalam rentang.
  const hariIni = todayJakarta();
  const dariParam = searchParams.dari && DATE_RE.test(searchParams.dari) ? searchParams.dari : '';
  const sampaiParam = searchParams.sampai && DATE_RE.test(searchParams.sampai) ? searchParams.sampai : '';
  const rangeTerbalik = !!dariParam && !!sampaiParam && dariParam > sampaiParam;
  const dari = rangeTerbalik ? '' : dariParam;
  const sampai = rangeTerbalik ? '' : sampaiParam;

  const { list, summary, cutoff, dariTampilan } = await getMaahirSP({
    gender: genderFilter,
    dari: dari || undefined,
    sampai: sampai || undefined,
  });

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Pendataan SP</div>
            <Link href="/2in1/koordinator/kehadiran" className="back">{Icon.shield(12)} Kembali</Link>
          </div>

          <div className="section-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div>
              <h1 className="t-h1" style={{ marginBottom: 2 }}>Surat Peringatan Peserta</h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Disiplin kehadiran Maahir (kumulatif). Alpa 1/2/≥3 → SP 1/2/3 · Izin 2/3/≥4 → SP 1/2/3.
                Sesi Maahir &amp; At-Tibyan digabung, sama dengan Rekap Kehadiran.
              </p>
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
                Dihitung s/d {tanggalLabel(cutoff)}
                {dariTampilan ? ` · hanya yang kena SP sejak ${tanggalLabel(dariTampilan)}` : ''}.
              </p>
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
                Akumulasi dimulai {tanggalLabel(SP_START_UMUM)} — kecuali Maahir 6A &amp; 6B Ikhwan
                yang tetap dihitung sejak {tanggalLabel(PROGRAM_START)}.
              </p>
            </div>
            <GenderNavSelect value={genderFilter ?? ''} />
          </div>

          {/* Rentang tanggal — hitungan tetap kumulatif s/d tanggal akhir */}
          <form
            method="get"
            className="card-flat"
            style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}
          >
            {genderFilter && <input type="hidden" name="gender" value={genderFilter} />}
            <div style={{ flex: '1 1 150px' }}>
              <label className="t-tiny" htmlFor="sp_dari" style={{ display: 'block', marginBottom: 4 }}>
                Dari tanggal
              </label>
              <input
                id="sp_dari"
                type="date"
                name="dari"
                defaultValue={dari}
                min={PROGRAM_START}
                max={hariIni}
                className="input"
                style={{ height: 38 }}
              />
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label className="t-tiny" htmlFor="sp_sampai" style={{ display: 'block', marginBottom: 4 }}>
                Sampai tanggal
              </label>
              <input
                id="sp_sampai"
                type="date"
                name="sampai"
                defaultValue={sampai}
                min={PROGRAM_START}
                max={hariIni}
                className="input"
                style={{ height: 38 }}
              />
            </div>
            <button type="submit" className="btn btn-ghost btn-sm" style={{ height: 38 }}>
              Terapkan
            </button>
            {(dari || sampai) && (
              <Link
                href={`?${new URLSearchParams(genderFilter ? { gender: genderFilter } : {}).toString()}`}
                className="btn btn-soft btn-sm"
                style={{ height: 38, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                Reset
              </Link>
            )}
          </form>

          {rangeTerbalik && (
            <div className="banner banner-error" style={{ marginBottom: 12 }}>
              <div className="desc">
                Tanggal awal melewati tanggal akhir — rentang diabaikan, daftar kembali kumulatif
                s/d hari ini.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <Stat label="Total kena SP" value={summary.total} />
            <Stat label="SP 1" value={summary.sp1} />
            <Stat label="SP 2" value={summary.sp2} tone="warn" />
            <Stat label="SP 3 (diberhentikan)" value={summary.sp3} tone="bad" />
            <Stat label="Pernah diputihkan" value={summary.diputihkan} />
          </div>

          {list.length === 0 ? (
            <div className="card-flat" style={{ padding: 24, textAlign: 'center' }}>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Tak ada peserta yang kena SP pada scope ini. Alhamdulillah.
              </p>
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="k-table">
                  <thead>
                    <tr>
                      <th>Peserta</th>
                      <th>Kelas</th>
                      <th style={{ textAlign: 'right' }} title="Alpa (tanpa keterangan)">Alpa</th>
                      <th style={{ textAlign: 'right' }}>Izin</th>
                      <th style={{ textAlign: 'right' }}>Telat</th>
                      <th style={{ textAlign: 'right' }} title="Hadir">Hadir</th>
                      <th style={{ textAlign: 'center' }}>SP</th>
                      <th title="Tanggal sesi yang membuat hitungannya menembus tiap ambang">
                        Penetapan
                      </th>
                      <th>Diputihkan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => {
                      const ss = spStyle(p.sp);
                      const adaPemutihan = p.diputihkan.length > 0;
                      // Baris bank data: SP-nya sudah luruh, tapi namanya tetap
                      // disimpan supaya perubahannya bisa ditelusuri.
                      const bankData = p.sp === 0;
                      return (
                        <tr key={p.anggotaId} style={bankData ? { opacity: 0.6 } : undefined}>
                          <td style={{ fontWeight: 600 }}>
                            <Link
                              href={`/2in1/koordinator/kehadiran/sp/${p.anggotaId}`}
                              style={{ color: 'inherit' }}
                            >
                              {p.name}
                            </Link>
                          </td>
                          <td className="t-small" style={{ color: 'var(--muted-2)' }}>{p.kelasName}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: p.alpa > 0 ? 'var(--merah-ink)' : undefined }}>{p.alpa}</td>
                          <td style={{ textAlign: 'right' }}>{p.izin}</td>
                          <td style={{ textAlign: 'right', color: 'var(--muted-2)' }}>{p.terlambat}</td>
                          <td style={{ textAlign: 'right', color: 'var(--muted-2)' }}>{p.hadir}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {p.spKotor !== p.sp && (
                              <span
                                className="t-tiny"
                                style={{ color: 'var(--muted-2)', textDecoration: 'line-through', marginRight: 6 }}
                                title="SP sebelum pemutihan"
                              >
                                SP {p.spKotor}
                              </span>
                            )}
                            <span className="badge" style={{ background: ss.bg, borderColor: ss.bd, color: ss.ink }}>
                              SP {p.sp}{p.sp >= 3 ? ' ⚠' : ''}
                            </span>
                          </td>
                          <td><PenetapanSel rows={p.penetapan} /></td>
                          <td
                            className="t-small"
                            style={{ color: adaPemutihan ? 'var(--ink)' : 'var(--muted-2)' }}
                            title={p.diputihkan.map((r) => r.alasan ?? 'tanpa alasan').join(' · ')}
                          >
                            {pemutihanLabel(p.diputihkan)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 12 }}>
            SP 3 = melebihi batas → kandidat diberhentikan dari program Maahir. Angka kumulatif sejak
            awal akumulasi kelas masing-masing ({tanggalLabel(SP_START_UMUM)}, kecuali Maahir 6A
            &amp; 6B Ikhwan sejak {tanggalLabel(PROGRAM_START)}) s/d {tanggalLabel(cutoff)};
            pelanggaran sebelum tanggal itu tetap tampil di Rekap Kehadiran tapi tak berbobot SP.
            Tanggal libur, sesi di luar rentang
            keanggotaan, dan sesi yang diputihkan tak dihitung. Kolom Penetapan menunjukkan tanggal
            pertemuan yang membuat hitungannya menembus tiap ambang — ikut bergeser bila koordinator
            memutihkan sesi. Filter <strong>Sampai tanggal</strong> memotong perhitungan di tanggal
            itu, <strong>Dari tanggal</strong> hanya menyaring siapa yang tampil.
          </p>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  const ink = tone === 'bad' ? 'var(--merah-ink)' : tone === 'warn' ? 'var(--kuning-ink)' : 'var(--ink)';
  return (
    <div className="card-flat" style={{ padding: '10px 14px', minWidth: 110 }}>
      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: ink }}>{value}</div>
    </div>
  );
}
