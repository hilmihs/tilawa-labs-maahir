import Link from 'next/link';
import { requireOneOfRoles } from '@/lib/session';
import {
  bacaFilterPeserta, muatRekapPeserta, AMBANG_LULUS_AKHIR,
} from '@/lib/evaluasi-rekap-peserta';
import type { Urut } from '@/lib/evaluasi-rekap-peserta';
import { PrintButton } from '@/components/PrintButton';
import { QueryNavSelect } from '@/components/QueryNavSelect';
import { KeputusanKontrol, KeputusanKosong } from './KeputusanKontrol';

export const dynamic = 'force-dynamic';

const WARNA_LULUS = 'oklch(0.40 0.10 150)';
const WARNA_MENGULANG = 'oklch(0.46 0.14 25)';

export default async function KoordinatorPesertaPage({
  searchParams,
}: {
  searchParams: {
    program?: string; batch?: string; gender?: string; urut?: string; arah?: string;
    mengulang?: string;
  };
}) {
  // Sama seperti dashboard: koordinator ketua kelas ikut memantau halaqah yang
  // sama, jadi rekap dibuka untuk keduanya.
  const session = await requireOneOfRoles(['koordinator', 'koordinator_ketua_kelas']);
  const f = bacaFilterPeserta(searchParams, session.gender);
  const d = await muatRekapPeserta(f);

  const tampilkanGender = f.gender === 'semua';
  // Keputusan pengulangan wewenang koordinator penuh; koordinator ketua kelas
  // ikut melihat halaman ini tapi hanya membaca.
  //
  // TIDAK dibatasi gender — koordinator mana pun boleh memutuskan santri mana
  // pun. Penempatan angkatan berikutnya diputuskan sebagai satu majelis, jadi
  // mengunci per gender hanya memaksa satu daftar dikerjakan dua akun. Kolom
  // "Aksi" di sebelahnya TETAP terkunci gender: tautannya menuju halaman detail
  // halaqah, yang memang 404 untuk gender lain.
  const bolehMemutuskan = session.role === 'koordinator';

  /** Penyaring yang harus ikut terbawa oleh setiap tautan di halaman ini. */
  function paramDasar(): URLSearchParams {
    const p = new URLSearchParams();
    if (f.program) p.set('program', f.program);
    if (d.batchTerpilih) p.set('batch', d.batchTerpilih);
    p.set('gender', f.gender);
    return p;
  }

  /** Tautan judul kolom: klik kolom yang sama membalik arah, kolom lain mulai
   *  dari arah wajarnya — nilai dari terendah, teks dari A. */
  function hrefUrut(kolom: Urut): string {
    const p = paramDasar();
    if (f.hanyaMengulang) p.set('mengulang', '1');
    p.set('urut', kolom);
    p.set('arah', f.urut === kolom && f.arah === 'naik' ? 'turun' : 'naik');
    return `?${p.toString()}`;
  }

  /** Tautan saklar "hanya yang mengulang" — urutan yang sedang dipakai ikut. */
  function hrefMengulang(): string {
    const p = paramDasar();
    if (!f.hanyaMengulang) p.set('mengulang', '1');
    p.set('urut', f.urut);
    p.set('arah', f.arah);
    return `?${p.toString()}`;
  }

  function JudulUrut({ kolom, children, rata }: {
    kolom: Urut; children: React.ReactNode; rata?: 'kanan' | 'tengah';
  }) {
    const aktif = f.urut === kolom;
    return (
      <th style={{ textAlign: rata === 'kanan' ? 'right' : rata === 'tengah' ? 'center' : 'left' }}>
        <Link
          href={hrefUrut(kolom)}
          style={{
            textDecoration: 'none',
            color: aktif ? 'var(--ink)' : 'inherit',
            fontWeight: aktif ? 700 : 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          {children}
          <span style={{ opacity: aktif ? 1 : 0.25, marginLeft: 4 }}>
            {aktif ? (f.arah === 'naik' ? '↑' : '↓') : '↕'}
          </span>
        </Link>
      </th>
    );
  }

  const adaFilter = !!(
    d.programTerpilih ||
    d.batchTerpilih ||
    f.gender !== session.gender ||
    f.urut !== 'qn' ||
    f.arah !== 'naik' ||
    f.hanyaMengulang
  );

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="eval-print-wrap" style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 40px' }}>
        <Link
          href="/evaluasi/koordinator"
          className="btn btn-ghost btn-sm no-print"
          style={{ height: 34, padding: '0 12px', fontSize: 12, textDecoration: 'none', marginBottom: 14 }}
        >
          ← Dashboard halaqah
        </Link>

        {/* Header */}
        <div className="kop-fitur" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div className="t-h1" style={{ fontSize: 20 }}>
              Peringkat Peserta
            </div>
            <div className="t-small" style={{ marginTop: 2 }}>
              {session.name} · {d.total.peserta} peserta aktif dari semua halaqah binaan
            </div>
            {/* Penyaring ikut di subjudul supaya PDF hasil cetak menerangkan
                data siapa yang sedang dilihat — bar penyaringnya no-print. */}
            <div className="t-small" style={{ marginTop: 2 }}>
              {d.ringkasFilter} · Nilai akhir rapot
            </div>
          </div>
          <div className="no-print" style={{ marginLeft: 'auto' }}>
            <PrintButton label="Unduh peringkat PDF" />
          </div>
        </div>

        {/* Bar penyaring. Sengaja tanpa "cakupan": angka di sini nilai akhir
            rapot, yang rumusnya tak bergantung pilihan sesi. */}
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
          <QueryNavSelect
            param="gender"
            value={f.gender}
            options={[
              { value: 'ikhwan', label: 'Ikhwan' },
              { value: 'akhwat', label: 'Akhwat' },
              { value: 'semua', label: 'Ikhwan & Akhwat' },
            ]}
            ariaLabel="Pilih gender"
          />
          {/* Tanpa saklar ini fitur keputusan praktis tak terpakai: yang perlu
              diputuskan cuma puluhan orang di antara ratusan baris. */}
          <Link
            href={hrefMengulang()}
            className="btn btn-ghost btn-sm"
            style={{
              height: 34,
              padding: '0 12px',
              fontSize: 12,
              textDecoration: 'none',
              borderColor: f.hanyaMengulang ? 'oklch(0.86 0.08 85)' : undefined,
              background: f.hanyaMengulang ? 'oklch(0.96 0.05 85)' : undefined,
              color: f.hanyaMengulang ? 'oklch(0.48 0.11 80)' : undefined,
              fontWeight: f.hanyaMengulang ? 700 : undefined,
            }}
          >
            {f.hanyaMengulang ? '✓ ' : ''}Hanya yang mengulang
          </Link>
          {adaFilter && (
            <Link href="/evaluasi/koordinator/peserta" className="t-small" style={{ marginLeft: 4 }}>
              Reset
            </Link>
          )}
        </div>

        {d.rows.length === 0 ? (
          <div className="card-flat" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📖</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {d.adaPesertaSamaSekali ? 'Tak ada peserta yang cocok' : 'Belum ada peserta'}
            </div>
            <p className="t-small" style={{ margin: 0 }}>
              {d.adaPesertaSamaSekali ? (
                <>
                  Tak ada peserta aktif yang cocok dengan penyaring ini.{' '}
                  <Link href="/evaluasi/koordinator/peserta">Reset penyaring</Link>.
                </>
              ) : (
                'Belum ada peserta yang tersinkron ke sistem evaluasi.'
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Kartu statistik */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
                  {d.total.bernilai}
                  <span style={{ fontSize: 15, color: 'var(--muted-2)' }}>/{d.total.peserta}</span>
                </div>
                <div
                  className="t-small"
                  style={{ marginTop: 4 }}
                  title="Peserta yang nilai akhirnya sudah sah di minimal satu track. Nilai akhir baru sah bila komponennya lengkap."
                >
                  Punya nilai akhir
                </div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    fontSize: 26, fontWeight: 700, lineHeight: 1,
                    color: d.total.rataQn == null ? 'var(--muted-2)' : WARNA_LULUS,
                  }}
                >
                  {d.total.rataQn == null ? '—' : d.total.rataQn}
                </div>
                <div className="t-small" style={{ marginTop: 4 }}>Rata-rata {d.namaTrackQn}</div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    fontSize: 26, fontWeight: 700, lineHeight: 1,
                    color: d.total.rataPb == null ? 'var(--muted-2)' : WARNA_LULUS,
                  }}
                >
                  {d.total.rataPb == null ? '—' : d.total.rataPb}
                </div>
                <div className="t-small" style={{ marginTop: 4 }}>Rata-rata {d.namaTrackPb}</div>
              </div>
              <div className="card-flat" style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    fontSize: 26, fontWeight: 700, lineHeight: 1,
                    color: d.total.mengulang > 0 ? WARNA_MENGULANG : 'var(--ink)',
                  }}
                >
                  {d.total.mengulang}
                </div>
                <div
                  className="t-small"
                  style={{ marginTop: 4 }}
                  title={`Peserta dengan nilai akhir Rapot PB sah dan di bawah ${AMBANG_LULUS_AKHIR}. Rapot QN adalah prasyarat — nilainya tidak menggugurkan kelulusan, jadi tidak ikut dihitung di sini.`}
                >
                  Mengulang
                  {d.total.belumDiputuskan > 0 && (
                    <>
                      {' · '}
                      <span style={{ color: 'oklch(0.48 0.11 80)', fontWeight: 700 }}>
                        {d.total.belumDiputuskan} belum diputuskan
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-scroll">
                <table className="k-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'right', width: 44 }}>#</th>
                      <JudulUrut kolom="nama">Peserta</JudulUrut>
                      <JudulUrut kolom="halaqah">Halaqah</JudulUrut>
                      {tampilkanGender && <th>Gender</th>}
                      <th>Pengajar</th>
                      <JudulUrut kolom="qn" rata="tengah">{d.namaTrackQn}</JudulUrut>
                      <JudulUrut kolom="pb" rata="tengah">{d.namaTrackPb}</JudulUrut>
                      <th
                        style={{ textAlign: 'right' }}
                        title="Kelas tempat peserta yang tidak lulus ditempatkan ulang — Kelas QN atau Kelas PB."
                      >
                        Ulang di kelas
                      </th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r, i) => {
                      const warna = (n: number | null) =>
                        n == null ? 'var(--muted-2)' : n >= AMBANG_LULUS_AKHIR ? WARNA_LULUS : WARNA_MENGULANG;
                      return (
                        <tr key={r.id}>
                          <td
                            style={{
                              textAlign: 'right', color: 'var(--muted-2)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {i + 1}
                          </td>
                          <td>
                            <div className="nm">{r.nama}</div>
                          </td>
                          <td>
                            <div className="nm" style={{ fontWeight: 500 }}>{r.halaqahNama}</div>
                            <div className="sub">{r.sub}</div>
                          </td>
                          {tampilkanGender && (
                            <td style={{ color: 'var(--ink-2)' }}>
                              {r.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
                            </td>
                          )}
                          <td style={{ color: 'var(--ink-2)' }}>{r.pengajar}</td>
                          <td
                            style={{
                              textAlign: 'center', fontWeight: 700, color: warna(r.qn.nilai),
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {r.qn.nilai == null ? '—' : r.qn.nilai}
                          </td>
                          <td
                            style={{
                              textAlign: 'center', fontWeight: 700, color: warna(r.pb.nilai),
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {r.pb.nilai == null ? '—' : r.pb.nilai}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {r.bisaDiputuskan || r.keputusan ? (
                              <KeputusanKontrol
                                pesertaId={r.id}
                                nilai={r.keputusan}
                                bolehUbah={bolehMemutuskan}
                              />
                            ) : (
                              <KeputusanKosong lulus={r.pb.lulus === true} />
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {/* Gender halaqah selalu = gender pemakai kecuali
                                penyaring dibuka ke "semua"; halaman detail masih
                                mengunci gender dan akan 404 untuk gender lain. */}
                            {r.gender !== session.gender ? (
                              <span className="t-small" style={{ color: 'var(--line-2)' }}>—</span>
                            ) : (
                              <Link
                                href={`/evaluasi/koordinator/${encodeURIComponent(r.halaqahId)}`}
                                className="btn btn-ghost btn-sm no-print"
                                style={{
                                  height: 30, padding: '0 10px', fontSize: 12,
                                  textDecoration: 'none', whiteSpace: 'nowrap',
                                }}
                              >
                                Halaqah
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
