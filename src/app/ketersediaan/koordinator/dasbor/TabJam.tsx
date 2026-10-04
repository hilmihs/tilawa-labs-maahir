import type { BarisJam, StatusJam } from '@/lib/ketersediaan-dasbor';

const fmt = (n: number) => n.toLocaleString('id-ID');

const STATUS: Record<StatusJam, { teks: string; kelas: string }> = {
  tanpa_pengajar: { teks: 'Tanpa pengajar', kelas: 'badge-merah' },
  kurang: { teks: 'Kurang pengajar', kelas: 'badge-kuning' },
  cukup: { teks: 'Cukup', kelas: 'badge-hijau' },
  kosong: { teks: 'Belum ada peminat', kelas: 'badge-neutral' },
};

export function BadgeStatus({ status }: { status: StatusJam }) {
  const s = STATUS[status];
  return (
    <span className={`badge ${s.kelas}`}>
      <span className="dot" />
      {s.teks}
    </span>
  );
}

export function SelJam({ b, tampilGender }: { b: BarisJam; tampilGender: boolean }) {
  return (
    <>
      <div className="nm">
        {b.hari} {b.jam}
        {tampilGender && (
          <span className="badge badge-neutral" style={{ marginLeft: 6 }}>
            {b.kelompok === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
          </span>
        )}
      </div>
      <div className="sub">{b.mode === 'offline' ? `Offline · ${b.lokasi ?? 'lokasi belum diisi'}` : 'Online'}</div>
    </>
  );
}

export function BatangJam({ b, maks }: { b: BarisJam; maks: number }) {
  const lebarAntre = maks > 0 ? (b.antre / maks) * 100 : 0;
  const lebarTampung = maks > 0 ? (b.tampung / maks) * 100 : 0;
  return (
    <>
      <div
        className={`ks-batang${b.pengajar === 0 ? ' nol' : ''}`}
        role="img"
        aria-label={`${b.antre} mengantre, ${b.tampung} bisa ditampung`}
      >
        <span className="antre" style={{ width: `${lebarAntre}%` }} />
        <span className="tampung" style={{ width: `${lebarTampung}%` }} />
      </div>
      <div className="ks-batang-ket">
        <b>{fmt(b.antre)}</b> antre · <b>{fmt(b.tampung)}</b> tertampung
        {b.sisa > 0 && (
          <>
            {' '}
            · <b style={{ color: 'var(--merah-ink)' }}>{fmt(b.sisa)}</b> belum
          </>
        )}
        {b.terpakaiLain > 0 && <> · {fmt(b.terpakaiLain)} sudah di periode lain</>}
      </div>
    </>
  );
}

export function TabJam({ baris, tampilGender }: { baris: BarisJam[]; tampilGender: boolean }) {
  const maks = Math.max(1, ...baris.map((b) => b.antre));
  return (
    <div className="ks-isi">
      <div className="ks-kartu">
        <div className="ks-kartu-kepala">
          <h2>Permintaan dan daya tampung per jam</h2>
          <div className="ks-legenda">
            <span>
              <i style={{ background: 'var(--accent)' }} />
              bisa ditampung
            </span>
            <span>
              <i style={{ background: 'var(--merah-line)' }} />
              belum tertampung
            </span>
            <span>
              <i style={{ background: 'color-mix(in oklch, var(--merah) 55%, white)' }} />
              tanpa pengajar
            </span>
          </div>
        </div>
        <div className="ks-kartu-isi">
          {baris.length === 0 ? (
            <p className="t-small" style={{ margin: 0 }}>
              Belum ada jam aktif. Impor ketersediaan pengajar di tab Pengaturan untuk mengisinya.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="k-table ks-jam">
                <thead>
                  <tr>
                    <th>Jam</th>
                    <th style={{ width: '38%' }}>Antre dan daya tampung</th>
                    <th className="r">Pengajar</th>
                    <th className="r">Halaqah bisa / butuh</th>
                    <th className="r">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {baris.map((b) => (
                    <tr key={b.slot_id}>
                      <td>
                        <SelJam b={b} tampilGender={tampilGender} />
                      </td>
                      <td>
                        <BatangJam b={b} maks={maks} />
                      </td>
                      <td className="r">{b.pengajar}</td>
                      <td className="r">
                        {b.bisa} <span className="t-small">/ {b.butuh}</span>
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
  );
}
