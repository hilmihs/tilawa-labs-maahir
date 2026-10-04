import { kunciSel, tingkatPeta, type Peta } from '@/lib/ketersediaan-dasbor';

const fmt = (n: number) => n.toLocaleString('id-ID');

/** Warna tingkat 1–5 — sama dengan .ks-peta td.t1..t5 di globals.css. */
const SKALA = [
  { t: 1, label: '1–24', warna: '#cde2fb' },
  { t: 2, label: '25–49', warna: '#9ec5f4' },
  { t: 3, label: '50–99', warna: '#5598e7' },
  { t: 4, label: '100–199', warna: '#256abf' },
  { t: 5, label: '200+', warna: '#104281' },
];

/**
 * Heatmap pasangan hari × jam mulai. Tugasnya membandingkan besaran, jadi satu
 * hue bergradasi (tervalidasi, spec §7.6). Tabel lengkapnya ada di tab Jam.
 */
export function PetaKekurangan({ peta }: { peta: Peta }) {
  if (peta.jam.length === 0) {
    return (
      <p className="t-small" style={{ margin: 0, color: 'var(--muted)' }}>
        Belum ada jam di periode ini.
      </p>
    );
  }
  return (
    <figure style={{ margin: 0 }}>
      <div className="table-scroll">
        <table className="ks-peta">
          <caption className="sr-only">Pendaftar belum tertampung per pasangan hari dan jam mulai</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Hari</span>
              </th>
              {peta.jam.map((j) => (
                <th key={j} scope="col">
                  {j}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {peta.hari.map((h) => (
              <tr key={h.kunci}>
                <th scope="row">{h.label}</th>
                {peta.jam.map((j) => {
                  const s = peta.sel[kunciSel(h.kunci, j)];
                  if (!s) {
                    return <td key={j} className="kosong" aria-label={`${h.label} ${j}: tidak ditawarkan`} />;
                  }
                  return (
                    <td
                      key={j}
                      className={`t${tingkatPeta(s.sisa)}`}
                      tabIndex={0}
                      aria-label={`${h.label} ${j}: ${fmt(s.sisa)} belum tertampung dari ${fmt(s.antre)} antre, ${s.pengajar} pengajar`}
                    >
                      {fmt(s.sisa)}
                      <span className="tip" role="tooltip">
                        <b>
                          {h.label} · {j}
                        </b>
                        <br />
                        Antre {fmt(s.antre)} · pengajar {s.pengajar}
                        <br />
                        Belum tertampung {fmt(s.sisa)}
                        {s.jumlahJam > 1 && (
                          <>
                            <br />
                            online {fmt(s.sisaOnline)} · offline {fmt(s.sisaOffline)}
                          </>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="ks-peta-legenda">
        <span>Belum tertampung:</span>
        <span>
          <i style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }} />0
        </span>
        {SKALA.map((s) => (
          <span key={s.t}>
            <i style={{ background: s.warna }} />
            {s.label}
          </span>
        ))}
        <span>
          <i style={{ background: 'repeating-linear-gradient(135deg, transparent 0 4px, var(--line) 4px 5px)' }} />
          jam tidak ditawarkan
        </span>
      </figcaption>
    </figure>
  );
}
