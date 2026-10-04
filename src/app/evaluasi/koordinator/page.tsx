import Link from 'next/link';
import { requireOneOfRoles } from '@/lib/session';
import { AMBANG } from '@/lib/evaluasi';
import { bacaFilter, muatDashboard, CAKUPAN_DEFAULT } from '@/lib/evaluasi-dashboard';
import { buildWaMeUrl, tplReminderPengajarIsiNilaiEvaluasi } from '@/lib/whatsapp';
import { PrintButton } from '@/components/PrintButton';
import { QueryNavSelect } from '@/components/QueryNavSelect';

export const dynamic = 'force-dynamic';

export default async function KoordinatorEvaluasiPage({
  searchParams,
}: {
  searchParams: { program?: string; batch?: string; gender?: string };
}) {
  // Rekap dibuka juga untuk koordinator ketua kelas — mereka memantau halaqah
  // yang sama; pengaturan tetap milik koordinator.
  const session = await requireOneOfRoles(['koordinator', 'koordinator_ketua_kelas']);
  const bolehPengaturan = session.role === 'koordinator';

  const filter = bacaFilter(searchParams, session.gender);
  const d = await muatDashboard(filter);

  const adaFilter = !!(
    d.programTerpilih ||
    d.batchTerpilih ||
    filter.gender !== session.gender ||
    d.cakupanTerpilih !== CAKUPAN_DEFAULT
  );
  const tampilkanKolomGender = filter.gender === 'semua';
  const tampilkanRingkasan = d.grup.length > 1;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="eval-print-wrap" style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 40px' }}>
        {/* Header */}
        <div className="kop-fitur" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div className="t-h1" style={{ fontSize: 20 }}>
              Dashboard Koordinator
            </div>
            {/* Cakupan penyaring ikut di subjudul, bukan cuma di bar penyaring:
                bar-nya no-print, jadi tanpa ini PDF hasil cetak tak menerangkan
                data siapa yang sedang dilihat. */}
            <div className="t-small" style={{ marginTop: 2 }}>
              {session.name} · {d.total.halaqah} halaqah binaan · {d.namaPeriode}
            </div>
            <div className="t-small" style={{ marginTop: 2 }}>
              {d.ringkasFilter}
            </div>
          </div>
          <div className="no-print" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {/* Penyaring dibawa serta: berpindah ke peringkat peserta tak boleh
                diam-diam melebarkan cakupan yang sedang dilihat. Cakupan sesi
                tidak ikut — halaman itu memakai nilai akhir rapot. */}
            <Link
              href={{
                pathname: '/evaluasi/koordinator/peserta',
                query: {
                  ...(d.programTerpilih ? { program: d.programTerpilih } : {}),
                  ...(d.batchTerpilih ? { batch: d.batchTerpilih } : {}),
                  gender: filter.gender,
                },
              }}
              className="btn btn-ghost btn-sm"
              style={{ height: 40, padding: '0 14px', textDecoration: 'none' }}
            >
              ☰ Peringkat peserta
            </Link>
            {bolehPengaturan && (
              <Link
                href="/evaluasi/koordinator/pengaturan"
                className="btn btn-ghost btn-sm"
                style={{ height: 40, padding: '0 14px', textDecoration: 'none' }}
              >
                ⚙ Pengaturan
              </Link>
            )}
            <PrintButton label="Unduh rekap PDF" />
          </div>
        </div>

        {/* Bar penyaring */}
        <div
          className="no-print"
          style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <QueryNavSelect
            param="program"
            value={d.programTerpilih}
            options={d.opsiProgram}
            ariaLabel="Pilih program"
            allLabel="Semua program"
          />
          {d.opsiBatch.length > 0 && (
            <QueryNavSelect
              param="batch"
              value={d.batchTerpilih}
              options={d.opsiBatch}
              ariaLabel="Pilih batch"
              allLabel="Semua batch"
            />
          )}
          {/* Nilai kosong berarti "gender saya", bukan "semua" — karena itu
              "semua" harus jadi opsi eksplisit, dan GenderNavSelect (yang
              memaknai kosong sebagai semua) tak dipakai di sini. */}
          <QueryNavSelect
            param="gender"
            value={filter.gender}
            options={[
              { value: 'ikhwan', label: 'Ikhwan' },
              { value: 'akhwat', label: 'Akhwat' },
              { value: 'semua', label: 'Ikhwan & Akhwat' },
            ]}
            ariaLabel="Pilih gender"
          />
          {/* Seperti gender: kosong bukan berarti "semua", jadi tiap cakupan
              ditulis eksplisit dan tak ada opsi kosong. */}
          <QueryNavSelect
            param="cakupan"
            value={d.cakupanTerpilih}
            options={d.opsiCakupan}
            ariaLabel="Pilih cakupan penilaian"
          />
          {adaFilter && (
            <Link href="/evaluasi/koordinator" className="t-small" style={{ marginLeft: 4 }}>
              Reset
            </Link>
          )}
        </div>

        {d.halaqah.length === 0 ? (
          <div className="card-flat" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📖</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {d.adaHalaqahSamaSekali ? 'Tak ada halaqah yang cocok' : 'Belum ada halaqah binaan'}
            </div>
            <p className="t-small" style={{ margin: 0 }}>
              {d.adaHalaqahSamaSekali ? (
                <>
                  Tak ada halaqah yang cocok dengan penyaring ini.{' '}
                  <Link href="/evaluasi/koordinator">Reset penyaring</Link>.
                </>
              ) : (
                'Belum ada halaqah yang tersinkron ke sistem evaluasi.'
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Kartu statistik */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{d.total.halaqah}</div>
                <div className="t-small" style={{ marginTop: 4 }}>Halaqah binaan</div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
                  {d.total.selesai}
                  <span style={{ fontSize: 15, color: 'var(--muted-2)' }}>/{d.total.peserta}</span>
                </div>
                <div
                  className="t-small"
                  style={{ marginTop: 4 }}
                  title="Peserta yang punya minimal satu nilai selesai dalam cakupan ini. Satu peserta dihitung sekali, walau dinilai di banyak sesi."
                >
                  Peserta sudah dinilai
                </div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    fontSize: 26, fontWeight: 700, lineHeight: 1,
                    color: d.total.rata == null ? 'var(--muted-2)' : 'oklch(0.40 0.10 150)',
                  }}
                >
                  {d.total.rata == null ? '—' : d.total.rata}
                </div>
                <div className="t-small" style={{ marginTop: 4 }}>Rata-rata skor</div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    fontSize: 26, fontWeight: 700, lineHeight: 1,
                    color: d.total.bermasalah > 0 ? 'oklch(0.46 0.14 25)' : 'var(--ink)',
                  }}
                >
                  {d.total.bermasalah}
                </div>
                <div
                  className="t-small"
                  style={{ marginTop: 4 }}
                  title="Peserta yang RATA-RATA skornya dalam cakupan ini di bawah ambang standar — bukan yang sekadar pernah jeblok di satu sesi."
                >
                  Peserta perlu perhatian
                </div>
              </div>
            </div>

            {/* Ringkasan per program × batch × gender. Disembunyikan bila cuma
                satu grup — tak menambah apa pun di atas keempat kartu. */}
            {tampilkanRingkasan && (
              <div className="card-flat" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                <div className="table-scroll">
                  <table className="k-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Program</th>
                        <th>Batch</th>
                        {tampilkanKolomGender && <th>Gender</th>}
                        <th style={{ textAlign: 'center' }}>Halaqah</th>
                        <th style={{ textAlign: 'center' }}>Kelengkapan</th>
                        <th style={{ textAlign: 'center' }}>Rata-rata</th>
                        <th style={{ textAlign: 'center' }}>Bermasalah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.grup.map((g) => (
                        <tr key={`${g.batchId ?? ''}|${g.gender}`}>
                          <td className="nm">{g.programNama}</td>
                          <td style={{ color: 'var(--ink-2)' }}>{g.batchLabel ?? '—'}</td>
                          {tampilkanKolomGender && (
                            <td style={{ color: 'var(--ink-2)' }}>
                              {g.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
                            </td>
                          )}
                          <td style={{ textAlign: 'center' }}>{g.halaqah}</td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {g.selesai}/{g.total}
                          </td>
                          <td
                            style={{
                              textAlign: 'center', fontWeight: 700,
                              color:
                                g.rata == null
                                  ? 'var(--muted-2)'
                                  : g.rata >= AMBANG
                                    ? 'oklch(0.40 0.10 150)'
                                    : 'oklch(0.46 0.14 25)',
                            }}
                          >
                            {g.rata == null ? '—' : g.rata}
                          </td>
                          <td
                            style={{
                              textAlign: 'center',
                              color: g.bermasalah > 0 ? 'oklch(0.46 0.14 25)' : 'var(--line-2)',
                            }}
                          >
                            {g.bermasalah > 0 ? g.bermasalah : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tabel halaqah */}
            <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-scroll">
                <table className="k-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Halaqah</th>
                      <th>Pengajar</th>
                      <th>Kelengkapan</th>
                      <th style={{ textAlign: 'center' }}>Rata-rata</th>
                      <th style={{ textAlign: 'center' }}>Bermasalah</th>
                      <th>Lahn tersering</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.halaqah.map((h) => {
                      const progPct = h.total > 0 ? Math.round((h.selesai / h.total) * 100) : 0;
                      const progColor =
                        h.selesai === h.total && h.total > 0
                          ? 'oklch(0.58 0.09 165)'
                          : h.selesai === 0
                            ? 'var(--line-2)'
                            : 'oklch(0.78 0.10 80)';
                      const rataColor =
                        h.rata == null
                          ? 'var(--muted-2)'
                          : h.rata >= AMBANG
                            ? 'oklch(0.40 0.10 150)'
                            : 'oklch(0.46 0.14 25)';
                      const showIngatkan = h.selesai < h.total;
                      return (
                        <tr key={h.id}>
                          <td>
                            <div className="nm">{h.nama}</div>
                            <div className="sub">{h.sub}</div>
                          </td>
                          <td style={{ color: 'var(--ink-2)' }}>{h.pengajar}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  width: 64, height: 6, borderRadius: 3,
                                  background: 'var(--line)', overflow: 'hidden',
                                }}
                              >
                                <div style={{ height: '100%', background: progColor, width: `${progPct}%` }} />
                              </div>
                              <span className="t-small" style={{ whiteSpace: 'nowrap' }}>
                                {h.selesai}/{h.total}
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: rataColor }}>
                            {h.rata == null ? '—' : h.rata}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {h.bermasalah > 0 ? (
                              <span
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  minWidth: 22, height: 22, borderRadius: 999,
                                  background: 'oklch(0.96 0.03 25)', color: 'oklch(0.46 0.14 25)',
                                  fontSize: 12, fontWeight: 700,
                                }}
                              >
                                {h.bermasalah}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--line-2)' }}>—</span>
                            )}
                          </td>
                          <td style={{ color: 'var(--muted)' }}>{h.lahnTop}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {/* Dulu <button> tanpa handler di server component —
                                terlihat bisa ditekan tapi tak melakukan apa pun.
                                Kini tautan wa.me berisi pesan siap kirim; pengajar
                                tanpa WA tercatat tak menampilkan tautan sama sekali,
                                daripada menawarkan tautan yang buntu. */}
                            {showIngatkan && h.pengajarWa && (
                              <a
                                href={buildWaMeUrl(
                                  h.pengajarWa,
                                  tplReminderPengajarIsiNilaiEvaluasi({
                                    pengajarName: h.pengajar,
                                    pengajarGender: h.gender,
                                    namaHalaqah: h.nama,
                                    periodeLabel: d.namaPeriode,
                                    selesai: h.selesai,
                                    total: h.total,
                                  })
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="no-print"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  height: 30, padding: '0 10px', borderRadius: 6,
                                  fontSize: 12, fontWeight: 600, border: 'none',
                                  background: 'oklch(0.70 0.13 75)', color: '#fff',
                                  cursor: 'pointer', marginRight: 6,
                                  textDecoration: 'none',
                                }}
                              >
                                Ingatkan
                              </a>
                            )}
                            {/* Halaman detail masih mengunci gender dan akan 404
                                untuk halaqah gender lain. Rekap lintas-gender di
                                sini memang disengaja, tapi menawarkan tautan yang
                                pasti mental lebih buruk daripada tak menawarkan. */}
                            {h.gender !== session.gender ? (
                              <span className="t-small" style={{ color: 'var(--line-2)' }}>—</span>
                            ) : (
                              <Link
                                href={`/evaluasi/koordinator/${encodeURIComponent(h.id)}`}
                                className="btn btn-ghost btn-sm"
                                style={{ height: 30, padding: '0 10px', fontSize: 12, textDecoration: 'none' }}
                              >
                                Detail
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
