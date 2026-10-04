import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getMaahirRekap } from '@/lib/maahir-rekap';
import { PRESENSI_ANCHOR, weekRangeLabel } from '@/lib/maahir-presensi';
import {
  periodeBerjalan,
  periodeStartDate,
  periodeEndDate,
  periodeMonthOf,
} from '@/lib/periode-laporan';
import { todayJakarta } from '@/lib/anggota-periode';
import { MaahirRekapTable } from '@/components/MaahirRekapTable';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SearchableBlocks } from '@/components/SearchableBlocks';
import { Icon } from '@/components/icons';
import { buildWaMeUrl, tplReminderKetuaIsiPresensi } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { bolehLihatRekapPengajarMaahir } from '@/lib/maahir-checkin-pengajar-akses';
import { getGrupSesiKelas } from '@/lib/program-kelas';
import { hariKelas, kelompokkanKelas } from '@/lib/grup-sesi';
import type { RekapKelas } from '@/lib/maahir-rekap';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SP = { gender?: string; start?: string; end?: string };

/** Penerima pengingat isi presensi satu kelas/sesi. */
type Penanggungjawab = { name: string; whatsappNumber: string | null; isWakil: boolean };

const GENDER_TABS: Array<{ key: string; label: string }> = [
  { key: 'semua', label: 'Semua' },
  { key: 'ikhwan', label: 'Ikhwan' },
  { key: 'akhwat', label: 'Akhwat' },
];

function tanggalLabel(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default async function KoordinatorKehadiranPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const s = await getSession();
  // Terima koordinator dari accesses (bukan hanya role aktif) supaya user
  // multi-role bisa buka dari beranda tanpa ke-redirect ke login.
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  // Terima koordinator penuh ATAU koordinator akses-terbatas (kehadiran_only).
  if (!accesses.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran')) {
    redirect('/2in1/koordinator/login');
  }

  const genderParam = searchParams.gender === 'ikhwan' || searchParams.gender === 'akhwat'
    ? searchParams.gender
    : undefined;

  // Filter tunggal halaman ini adalah RENTANG TANGGAL. Dropdown bulan dibuang:
  // dua kontrol yang saling menimpa hanya membingungkan — bulan yang dipilih
  // tak berpengaruh apa-apa begitu rentangnya disetel manual.
  //
  // Default = periode laporan berjalan 28–27, sama dengan Laporan Bulanan supaya
  // angkanya sebanding.
  const defStart = periodeStartDate(periodeBerjalan());
  const defEnd = periodeEndDate(periodeBerjalan());
  const startParam = searchParams.start && DATE_RE.test(searchParams.start) ? searchParams.start : null;
  const endParam = searchParams.end && DATE_RE.test(searchParams.end) ? searchParams.end : null;
  const start = startParam ?? defStart;
  const endPilihan = endParam ?? defEnd;
  // Rentang terbalik tak bisa dihitung — jatuhkan ke default & beri tahu.
  const rangeTerbalik = start > endPilihan;
  const rangeStart = rangeTerbalik ? defStart : start;
  const rangeEndPilihan = rangeTerbalik ? defEnd : endPilihan;
  // Hitungan dipotong di hari ini: pertemuan yang belum terjadi bukan "belum diisi".
  const today = todayJakarta();
  const rangeEnd = rangeEndPilihan > today ? today : rangeEndPilihan;
  const dipotongHariIni = rangeEndPilihan > today;
  const rangeCustom = rangeStart !== defStart || rangeEndPilihan !== defEnd;
  // `month` kini turunan rentang, bukan pilihan tersendiri — dipakai untuk label
  // periode di template WhatsApp pengingat ketua kelas.
  const month = periodeMonthOf(rangeEndPilihan);

  const rekap = await getMaahirRekap(month, {
    gender: genderParam,
    range: { start: rangeStart, end: rangeEnd },
  });

  const totalBelum = rekap.reduce((sum, k) => sum + k.belumDiisi, 0);

  // Kelas per hari yang segrup sesi (grup_sesi, mis. Halaqah Tahfizh akhwat
  // Pagi/Siang) tampil di bawah satu judul sesi; kelas harinya jadi rincian.
  const grupById = await getGrupSesiKelas(rekap.map((k) => k.kelasId));
  const entri = kelompokkanKelas(rekap, (k) => ({
    id: k.kelasId,
    grupSesi: grupById.get(k.kelasId),
    gender: k.gender,
    jadwalHari: k.jadwalHari,
  })).map((e) => {
    const kelas = e.jenis === 'grup' ? e.anggota : [e.kelas];
    return {
      e,
      kelas,
      nama: e.jenis === 'grup' ? e.label : e.kelas.kelasName,
      gender: kelas[0].gender,
      belumDiisi: kelas.reduce((n, k) => n + k.belumDiisi, 0),
    };
  });
  const bolehRekapPengajar = await bolehLihatRekapPengajarMaahir();

  // Nama penanggung jawab presensi dari WA-nya: ketua sesi bisa bukan anggota
  // kelas yang ia isi, jadi cari di semua kelas rekap. Tak ketemu → nomor WA.
  const namaByWa = new Map<string, string>();
  for (const k of rekap) {
    for (const a of k.anggota) {
      if (a.whatsappNumber && !namaByWa.has(a.whatsappNumber)) namaByWa.set(a.whatsappNumber, a.name);
    }
  }
  const namaDariWa = (wa: string) => namaByWa.get(wa) ?? wa;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Kehadiran Maahir
          </div>
          <Link href="/2in1/koordinator" className="back">
            {Icon.back(12)} Dashboard
          </Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ marginBottom: 12, alignItems: 'center' }}>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Rekap kehadiran anggota semua kelas Maahir
              <br />
              <span className="t-tiny">
                Rentang <strong>{tanggalLabel(rangeStart)} – {tanggalLabel(rangeEndPilihan)}</strong>
                {rangeCustom ? ' (disetel manual)' : ' — periode 28–27, sama dengan Laporan Bulanan'} ·
                sesi Maahir &amp; At-Tibyan digabung.
                {dipotongHariIni && (
                  <> Dihitung s/d hari ini ({tanggalLabel(today)}); sisanya belum berjalan.</>
                )}
              </span>
            </p>
          </div>

          {bolehRekapPengajar && (
            <Link
              href="/2in1/koordinator/kehadiran/pengajar"
              className="card-flat"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', marginBottom: 12, textDecoration: 'none', color: 'inherit', borderRadius: 10 }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Kehadiran Pengajar Maahir</div>
                <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                  Check-in & capaian materi pengajar kelas 6A–6D · periode 16–15
                </div>
              </div>
              <span style={{ color: 'var(--muted-2)' }}>→</span>
            </Link>
          )}

          {/* Rentang tanggal — default periode 28–27, bisa diubah */}
          <form
            method="get"
            className="card-flat"
            style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}
          >
            {genderParam && <input type="hidden" name="gender" value={genderParam} />}
            <div style={{ flex: '1 1 150px' }}>
              <label className="t-tiny" htmlFor="rekap_start" style={{ display: 'block', marginBottom: 4 }}>
                Dari tanggal
              </label>
              <input
                id="rekap_start"
                type="date"
                name="start"
                defaultValue={rangeStart}
                min={PRESENSI_ANCHOR}
                className="input"
                style={{ height: 38 }}
              />
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label className="t-tiny" htmlFor="rekap_end" style={{ display: 'block', marginBottom: 4 }}>
                Sampai tanggal
              </label>
              <input
                id="rekap_end"
                type="date"
                name="end"
                defaultValue={rangeEndPilihan}
                min={PRESENSI_ANCHOR}
                className="input"
                style={{ height: 38 }}
              />
            </div>
            <button type="submit" className="btn btn-ghost btn-sm" style={{ height: 38 }}>
              Terapkan
            </button>
            {rangeCustom && (
              <Link
                href={`?${new URLSearchParams(genderParam ? { gender: genderParam } : {}).toString()}`}
                className="btn btn-soft btn-sm"
                style={{ height: 38, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                Reset 28–27
              </Link>
            )}
          </form>

          {rangeTerbalik && (
            <div className="banner banner-error" style={{ marginBottom: 12 }}>
              <div className="desc">
                Tanggal awal melewati tanggal akhir — rentang dikembalikan ke default periode 28–27.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <Link
              href="/2in1/koordinator/kehadiran/tibyan"
              className="btn btn-sm btn-ghost"
              style={{ textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' }}
            >
              📊 Kehadiran At-Tibyan (per kelas)
            </Link>
            <Link
              href="/2in1/koordinator/kehadiran/sp"
              className="btn btn-sm btn-ghost"
              style={{ textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' }}
            >
              ⚠️ Pendataan SP (Surat Peringatan)
            </Link>
            <Link
              href="/2in1/koordinator/kehadiran/pemutihan"
              className="btn btn-sm btn-ghost"
              style={{ textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' }}
            >
              🤍 Pemutihan Absensi
            </Link>
          </div>

          {/* Filter gender */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {GENDER_TABS.map((t) => {
              const active =
                (t.key === 'semua' && !genderParam) || t.key === genderParam;
              const params = new URLSearchParams();
              if (t.key !== 'semua') params.set('gender', t.key);
              // Pertahankan rentang manual supaya ganti gender tak mereset filter tanggal.
              if (rangeCustom) {
                params.set('start', rangeStart);
                params.set('end', rangeEndPilihan);
              }
              return (
                <Link
                  key={t.key}
                  href={`?${params.toString()}`}
                  className={active ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'}
                  style={{ textDecoration: 'none', fontSize: 12 }}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>

          {totalBelum > 0 && (
            <details className="banner banner-error" style={{ marginBottom: 16 }}>
              <summary className="desc" style={{ cursor: 'pointer', userSelect: 'none' }}>
                <strong>{totalBelum} presensi belum diisi</strong> oleh ketua kelas pada rentang ini.
                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}> — tap untuk rincian</span>
              </summary>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {entri
                  .filter((k) => k.belumDiisi > 0)
                  .map((k) => {
                    // Kelas segrup biasanya berketua sama — satu orang, satu pengingat.
                    // Penanggung jawab = ketua_wa/wakil_wa kelas (yang memberi akses
                    // isi presensi); ketua sesi tak harus anggota kelas itu, jadi
                    // namanya dicari di seluruh rekap. Tanda is_ketua anggota hanya
                    // cadangan untuk kelas yang belum punya ketua_wa.
                    const pjMap = new Map<string, Penanggungjawab>();
                    for (const kk of k.kelas) {
                      const dariKelas: Penanggungjawab[] = [
                        ...(kk.ketuaWa ? [{ name: namaDariWa(kk.ketuaWa), whatsappNumber: kk.ketuaWa, isWakil: false }] : []),
                        ...(kk.wakilWa ? [{ name: namaDariWa(kk.wakilWa), whatsappNumber: kk.wakilWa, isWakil: true }] : []),
                      ];
                      const daftar = dariKelas.length
                        ? dariKelas
                        : kk.anggota
                            .filter((a) => a.isKetua || a.isWakil)
                            .map((a) => ({ name: a.name, whatsappNumber: a.whatsappNumber, isWakil: a.isWakil }));
                      for (const a of daftar) {
                        const kunci = a.whatsappNumber ?? a.name.trim().toLowerCase();
                        if (!pjMap.has(kunci)) pjMap.set(kunci, a);
                      }
                    }
                    const pj = [...pjMap.values()];
                    const ketuaLabel = pj.length
                      ? pj.map((a) => `${a.name}${a.isWakil ? ' (wakil)' : ''}`).join(', ')
                      : 'Ketua belum ditunjuk';
                    const presensiUrl = absUrl('/2in1/ketua-kelas/presensi');
                    const waReminders = pj
                      .filter((a) => a.whatsappNumber)
                      .map((a) => ({
                        name: a.name,
                        isWakil: a.isWakil,
                        url: buildWaMeUrl(
                          a.whatsappNumber!,
                          tplReminderKetuaIsiPresensi({
                            ketuaName: a.name,
                            gender: k.gender,
                            kelasName: k.nama,
                            belumCount: k.belumDiisi,
                            monthLabel: month,
                            presensiUrl,
                          })
                        ),
                      }));
                    return (
                      <div
                        key={k.e.kunci}
                        style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', borderBottom: '1px solid var(--surface-3)', paddingBottom: 6 }}
                      >
                        <div>
                          <div className="t-small" style={{ fontWeight: 600 }}>{ketuaLabel}</div>
                          <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                            {k.nama} · {k.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
                            {k.e.jenis === 'grup' && (
                              <>
                                {' '}·{' '}
                                {k.kelas
                                  .filter((kk) => kk.belumDiisi > 0)
                                  .map((kk) => `${hariKelas(kk.jadwalHari) || kk.kelasName} ${kk.belumDiisi}`)
                                  .join(', ')}
                              </>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                            {waReminders.length > 0 ? (
                              waReminders.map((w, i) => (
                                <a
                                  key={i}
                                  href={w.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="t-tiny"
                                  style={{ color: 'var(--hijau-ink)', fontWeight: 600 }}
                                >
                                  📲 Ingatkan {w.name}{w.isWakil ? ' (wakil)' : ''}
                                </a>
                              ))
                            ) : (
                              <span className="t-tiny" style={{ color: 'var(--muted)' }}>
                                (WA ketua tidak tersedia)
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="badge badge-merah" style={{ whiteSpace: 'nowrap' }}>{k.belumDiisi} belum</span>
                      </div>
                    );
                  })}
              </div>
            </details>
          )}

          {rekap.length === 0 && (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada data untuk filter ini.
            </p>
          )}

          <SearchableBlocks
            blocks={entri.map(({ e, kelas, nama, gender, belumDiisi }) => ({
              key: e.kunci,
              text: [
                nama,
                e.jenis === 'grup' ? e.grupSesi : '',
                gender,
                ...kelas.map((k) => k.kelasName),
                ...kelas.flatMap((k) => k.anggota.map((a) => a.name)),
              ]
                .join(' ')
                .toLowerCase(),
              node:
                e.jenis === 'tunggal' ? (
                  <div key={e.kunci} style={{ marginBottom: 28 }}>
                    <SectionHeader
                      title={`${e.kelas.kelasName}`}
                      style={{ marginBottom: 6 }}
                      right={<BelumBadge belum={e.kelas.belumDiisi} />}
                    />
                    <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
                      {gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} · {e.kelas.jadwalHari.join(', ')} ·{' '}
                      {e.kelas.anggota.length} anggota · {e.kelas.pertemuan.length}/{e.kelas.sessions.length} pertemuan terisi
                    </div>
                    <RincianPertemuan k={e.kelas} />
                    <MaahirRekapTable kelas={e.kelas} />
                  </div>
                ) : (
                  <div key={e.kunci} style={{ marginBottom: 28 }}>
                    <SectionHeader
                      title={e.label}
                      style={{ marginBottom: 6 }}
                      right={<BelumBadge belum={belumDiisi} />}
                    />
                    <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
                      {gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} ·{' '}
                      {hariKelas([...new Set(kelas.flatMap((k) => k.jadwalHari))])} ·{' '}
                      {
                        new Set(
                          kelas.flatMap((k) =>
                            k.anggota.map((a) => a.whatsappNumber ?? a.name.trim().toLowerCase())
                          )
                        ).size
                      }{' '}
                      anggota · {kelas.reduce((n, k) => n + k.pertemuan.length, 0)}/
                      {kelas.reduce((n, k) => n + k.sessions.length, 0)} pertemuan terisi · tap hari
                      untuk rinciannya
                    </div>
                    {kelas.map((k) => (
                      <details
                        key={k.kelasId}
                        style={{ marginBottom: 8, border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px' }}
                      >
                        <summary className="t-small" style={{ cursor: 'pointer', userSelect: 'none' }}>
                          <strong>{hariKelas(k.jadwalHari) || k.kelasName}</strong>
                          <span style={{ color: 'var(--muted-2)' }}>
                            {' '}· {k.anggota.length} anggota · {k.pertemuan.length}/{k.sessions.length} terisi
                          </span>{' '}
                          <BelumBadge belum={k.belumDiisi} />
                        </summary>
                        <div style={{ marginTop: 10 }}>
                          <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
                            Kelas: {k.kelasName}
                          </div>
                          <RincianPertemuan k={k} />
                          <MaahirRekapTable kelas={k} />
                        </div>
                      </details>
                    ))}
                  </div>
                ),
            }))}
          />
        </div>
      </div>
    </main>
  );
}

function BelumBadge({ belum }: { belum: number }) {
  return belum > 0 ? (
    <span className="badge badge-merah">{belum} belum diisi</span>
  ) : (
    <span className="badge badge-hijau">Lengkap</span>
  );
}

/** Daftar sesi yang diharapkan satu kelas — hijau terisi, merah belum. */
function RincianPertemuan({ k }: { k: RekapKelas }) {
  if (k.sessions.length === 0) return null;
  return (
    <details style={{ marginBottom: 10 }}>
      <summary className="t-small" style={{ cursor: 'pointer', color: 'var(--muted-2)', userSelect: 'none' }}>
        Rincian {k.sessions.length} pertemuan — {k.sessions.filter((x) => !x.filled).length} belum diisi
      </summary>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {k.sessions.map((sn, i) => {
          const label = sn.mingguan
            ? weekRangeLabel(sn.tanggal)
            : new Date(sn.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
                weekday: 'short', day: 'numeric', month: 'short',
              });
          const isTibyan = sn.program === 'at_tibyan';
          return (
            <span
              key={`${sn.program}-${sn.tanggal}-${i}`}
              className={`badge ${sn.filled ? 'badge-hijau' : 'badge-merah'}`}
              style={{ fontSize: 11 }}
              title={sn.filled ? 'Sudah diisi' : 'Belum diisi'}
            >
              <span className="dot" />
              {label}{isTibyan ? ' · Tibyan' : ''} {sn.filled ? '✓' : '✗'}
            </span>
          );
        })}
      </div>
    </details>
  );
}
