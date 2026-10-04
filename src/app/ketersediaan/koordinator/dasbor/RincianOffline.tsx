import type { Gender } from '@/types/db';
import type { RincianLevelJam } from '@/lib/ketersediaan-dasbor';

const fmt = (n: number) => n.toLocaleString('id-ID');

const tanggal = (t: string) =>
  new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const KELAS_NADA: Record<RincianLevelJam['nada'], string> = {
  merah: 'badge-merah',
  kuning: 'badge-kuning',
  hijau: 'badge-hijau',
  netral: 'badge-neutral',
};

/**
 * Jam offline per lokasi: pendaftar dipecah level × kelompok umur, kelompok yang
 * benar-benar bisa jadi halaqah, pengajar, dan kendalanya. Jam offline kecil dan
 * tersebar, jadi angka antre per jam saja menyesatkan — 19 orang bisa nol halaqah.
 */
export function RincianOffline({ baris, tampilGender }: { baris: RincianLevelJam[]; tampilGender: boolean }) {
  if (baris.length === 0) return null;

  const kelompok = new Map<string, RincianLevelJam[]>();
  for (const b of baris) {
    const k = `${b.kelompok}|${b.lokasi ?? 'Offline'}`;
    kelompok.set(k, [...(kelompok.get(k) ?? []), b]);
  }
  const urut = [...kelompok.entries()].sort(([a], [b]) => a.localeCompare(b));
  const adaGabung = baris.some((b) => b.tanggalGabung);

  return (
    <div className="ks-kartu">
      <div className="ks-kartu-kepala">
        <h2>Rincian jam offline per level &amp; kelompok umur</h2>
        <p>Satu halaqah = 12 orang dengan level dan kelompok umur yang sama</p>
      </div>
      <div className="ks-kartu-isi">
        <p className="t-small" style={{ marginTop: 0 }}>
          Angka pendaftar ditulis <b>≤45 / 46+</b>. Kolom &ldquo;Kelompok siap&rdquo; memakai aturan yang sama dengan mesin
          alokasi: kelompok penuh per level dan kelompok umur, lalu sisa lintas umur boleh digabung bila minimal 8 orang
          dan antrean tertuanya sudah 21 hari.
          {adaGabung ? ' Angka di dalam kurung = kelompok setelah tanggal gabung.' : ''}
        </p>
        {urut.map(([kunci, rows]) => {
          const [g, lokasi] = kunci.split('|') as [Gender, string];
          const siap = rows.reduce((n, r) => n + r.kelompokSetelahGabung, 0);
          const guru = rows.reduce((n, r) => n + r.pengajar, 0);
          const orang = rows.reduce((n, r) => n + r.total, 0);
          return (
            <div key={kunci} style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>
                {tampilGender ? `${g === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} · ` : ''}
                {lokasi}
                <span className="t-small" style={{ fontWeight: 400, color: 'var(--ink-2)' }}>
                  {' '}
                  — {fmt(orang)} pendaftar · {fmt(siap)} kelompok siap · {fmt(guru)} pengajar
                </span>
              </h3>
              <div className="table-scroll">
                <table className="k-table" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr>
                      <th>Jam</th>
                      <th style={{ textAlign: 'right' }}>Dasar</th>
                      <th style={{ textAlign: 'right' }}>Lanjutan</th>
                      <th style={{ textAlign: 'right' }}>Pengajar</th>
                      <th style={{ textAlign: 'right' }}>Kelompok siap</th>
                      <th>Kondisi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.slot_id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.label}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.dasar.muda} / {r.dasar.tua}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.lanjutan.muda} / {r.lanjutan.tua}
                        </td>
                        <td style={{ textAlign: 'right' }}>{r.pengajar}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.kelompokSekarang}
                          {r.tanggalGabung && r.kelompokSetelahGabung !== r.kelompokSekarang && (
                            <span title={`Mulai ${tanggal(r.tanggalGabung)} sisa lintas kelompok umur boleh digabung`}>
                              {' '}
                              ({r.kelompokSetelahGabung} mulai {tanggal(r.tanggalGabung)})
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${KELAS_NADA[r.nada]}`}>
                            <span className="dot" />
                            {r.kendala}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
