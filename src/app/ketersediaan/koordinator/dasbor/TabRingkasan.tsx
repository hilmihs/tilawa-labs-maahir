import Link from 'next/link';
import type { AngkaJam, BarisJam, Peta } from '@/lib/ketersediaan-dasbor';
import { PetaKekurangan } from './PetaKekurangan';
import { BadgeStatus, BatangJam, SelJam } from './TabJam';

export interface ButirTugas {
  nada: 'merah' | 'kuning' | 'aksen';
  judul: string;
  desk: string;
  href: string;
  label: string;
}

export interface PetaBerjudul {
  /** null bila hanya satu gender yang ditampilkan. */
  judul: string | null;
  peta: Peta;
}

export interface AngkaRingkasan extends AngkaJam {
  pengajar: number;
}

const fmt = (n: number) => n.toLocaleString('id-ID');
const WARNA_NADA = { merah: 'var(--merah)', kuning: 'var(--kuning)', aksen: 'var(--accent)' } as const;

export function TabRingkasan({
  angka,
  pecah,
  tugas,
  teratas,
  peta,
  hrefJam,
  tampilGender,
  ketTampung,
  catatan,
  sisipan,
}: {
  angka: AngkaRingkasan;
  /** Pecahan per gender; null bila dashboard sudah disaring satu gender. */
  pecah: { ikhwan: AngkaRingkasan; akhwat: AngkaRingkasan } | null;
  tugas: ButirTugas[];
  teratas: BarisJam[];
  /** Satu heatmap per gender — jam ikhwan dan akhwat tidak pernah dijumlah. */
  peta: PetaBerjudul[];
  hrefJam: string;
  tampilGender: boolean;
  /** Penjelasan angka "Bisa ditampung" bila cara hitungnya berbeda (mis. simulasi gabungan). */
  ketTampung?: string;
  /** Pengganti kalimat di bawah deretan angka, mis. untuk pandangan gabungan. */
  catatan?: React.ReactNode;
  /** Kartu tambahan di bawah deretan angka. */
  sisipan?: React.ReactNode;
}) {
  const persen = angka.antre > 0 ? Math.round((angka.sisa / angka.antre) * 100) : 0;
  const pecahan = (k: keyof AngkaRingkasan) =>
    pecah ? (
      <span className="pecah">
        Ikhwan <b>{fmt(pecah.ikhwan[k])}</b> · Akhwat <b>{fmt(pecah.akhwat[k])}</b>
      </span>
    ) : null;
  const maks = Math.max(1, ...teratas.map((b) => b.antre));

  return (
    <div className="ks-isi">
      <div className="ks-angka">
        <div className="stat">
          <span className="l">Menunggu halaqah</span>
          <span className="v">{fmt(angka.antre)}</span>
          {pecahan('antre')}
          <span className="ket">Pendaftar sah yang belum masuk usulan. Kiriman ulang formulir dihitung sekali.</span>
        </div>
        <div className="stat">
          <span className="l">Pengajar tersedia</span>
          <span className="v">{fmt(angka.pengajar)}</span>
          {pecahan('pengajar')}
          <span className="ket">Orang, bukan jam. Satu pengajar bisa menyanggupi beberapa jam.</span>
        </div>
        <div className="stat">
          <span className="l">Bisa ditampung</span>
          <span className="v">{fmt(angka.tampung)}</span>
          {pecahan('tampung')}
          <span className="ket">
            {ketTampung ?? 'Pengajar bebas di tiap jam × kapasitas, tidak lebih dari yang mengantre di jam itu.'}
          </span>
        </div>
        <div className={`stat${angka.sisa > 0 ? ' buruk' : ''}`}>
          <span className="l">Belum tertampung</span>
          <span className="v">{fmt(angka.sisa)}</span>
          {pecahan('sisa')}
          <span className="ket">
            {angka.sisa > 0
              ? `Sekitar ${persen}% dari yang menunggu. Batasnya jumlah pengajar di jam itu.`
              : 'Semua yang menunggu bisa ditampung.'}
          </span>
        </div>
      </div>

      <p className="ks-catatan-angka" style={{ margin: 0 }}>
        {catatan ?? (
          <>
            Sudah masuk usulan di periode ini: <b>{fmt(angka.dialokasikan)}</b> · sudah dapat halaqah di periode lain:{' '}
            <b>{fmt(angka.terpakaiLain)}</b> · ditahan saringan: <b>{fmt(angka.tertahan)}</b>
          </>
        )}
      </p>

      {sisipan}

      <div className="ks-dua">
        <div className="ks-kartu">
          <div className="ks-kartu-kepala">
            <h2>Perlu tindakan</h2>
            <p>Urut dari yang paling mendesak</p>
          </div>
          <div className="ks-kartu-isi">
            {tugas.length === 0 ? (
              <p className="t-small" style={{ margin: 0 }}>
                Tidak ada yang menunggu.
              </p>
            ) : (
              <ul className="ks-tugas">
                {tugas.map((t) => (
                  <li key={t.judul}>
                    <Link href={t.href}>
                      <span className="tanda" style={{ background: WARNA_NADA[t.nada] }} aria-hidden="true" />
                      <span>
                        <span className="judul" style={{ display: 'block' }}>
                          {t.judul}
                        </span>
                        <span className="desk" style={{ display: 'block' }}>
                          {t.desk}
                        </span>
                      </span>
                      <span className="ke">{t.label} →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="ks-kartu">
          <div className="ks-kartu-kepala">
            <h2>Jam paling kekurangan pengajar</h2>
            <Link href={hrefJam} className="t-small" style={{ color: 'var(--accent-2)', fontWeight: 600 }}>
              Lihat semua jam →
            </Link>
          </div>
          <div className="ks-kartu-isi">
            {teratas.length === 0 ? (
              <p className="t-small" style={{ margin: 0 }}>
                Tidak ada jam yang kekurangan pengajar.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="k-table ks-jam">
                  <tbody>
                    {teratas.map((b) => (
                      <tr key={b.slot_id}>
                        <td>
                          <SelJam b={b} tampilGender={tampilGender} />
                        </td>
                        <td style={{ width: '45%' }}>
                          <BatangJam b={b} maks={maks} />
                        </td>
                        <td className="r">
                          <BadgeStatus status={b.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ks-kartu">
        <div className="ks-kartu-kepala">
          <h2>Peta kekurangan pengajar</h2>
          <p>Makin gelap, makin banyak pendaftar yang belum tertampung</p>
        </div>
        <div className="ks-kartu-isi">
          {peta.map((p) => (
            <div key={p.judul ?? 'satu'} className="ks-peta-gender">
              {p.judul && <h3 className="ks-peta-judul">{p.judul}</h3>}
              <PetaKekurangan peta={p.peta} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
