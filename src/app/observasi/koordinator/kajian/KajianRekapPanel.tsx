'use client';
import { useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';

/** Baris tabel — sudah diratakan di server (Map tak boleh jadi prop client component). */
export interface KajianRekapRow {
  ketuaWa: string;
  nama: string;
  halaqah: string;   // hasil join(', '), '' bila kosong
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  belumIsi: number;
  totalSesi: number;
  persen: number;
}

export interface BulanOption {
  value: string;   // 'YYYY-MM'
  label: string;   // 'Agustus 2026'
}

export interface KajianRekapPanelProps {
  rows: KajianRekapRow[];
  totalSesi: number;
  /** sesi yang harinya sudah lewat — dasar badge "belum pernah lapor" */
  sesiLewat: number;
  bulan: string | null;          // null = semua periode
  bulanOptions: BulanOption[];
  /** dipertahankan saat push URL bulan; '' bila bukan superadmin */
  genderParam: string;
}

type SortKey = 'nama' | 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpa' | 'belumIsi' | 'persen';

const COLLATOR = new Intl.Collator('id', { sensitivity: 'base', numeric: true });

const LABEL: Record<SortKey, string> = {
  nama: 'Ketua', hadir: 'Hadir', terlambat: 'Telat', izin: 'Izin',
  sakit: 'Sakit', alpa: 'Alpa', belumIsi: 'Belum', persen: 'Persen',
};

function sortVal(r: KajianRekapRow, k: SortKey): string | number {
  switch (k) {
    case 'nama': return r.nama;
    case 'hadir': return r.hadir;
    case 'terlambat': return r.terlambat;
    case 'izin': return r.izin;
    case 'sakit': return r.sakit;
    case 'alpa': return r.alpa;
    case 'belumIsi': return r.belumIsi;
    case 'persen': return r.persen;
  }
}

/**
 * Arah klik pertama per kolom. Kolom hitungan turun ("siapa paling banyak" =
 * jawaban nol-klik); % naik karena halaman ini mencari yang tertinggal.
 */
function defaultDir(k: SortKey): 1 | -1 {
  if (k === 'nama') return 1;
  if (k === 'persen') return 1;
  return -1;
}

function SortTh({
  label, k, sortKey, dir, onSort, numeric, className, style, title,
}: {
  label: string; k: SortKey; sortKey: SortKey; dir: 1 | -1;
  onSort: (k: SortKey) => void; numeric?: boolean;
  className?: string; style?: CSSProperties; title?: string;
}) {
  const active = sortKey === k;
  return (
    <th
      scope="col"
      className={['kj-th', numeric ? 'kj-num' : '', className ?? ''].filter(Boolean).join(' ')}
      style={style}
      title={title}
      aria-sort={active ? (dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      {/* label statis: state urutan disampaikan aria-sort + live region, bukan
          accessible name yang berubah persis saat tombolnya sedang difokus */}
      <button
        type="button"
        className="kj-sort-th"
        onClick={() => onSort(k)}
        aria-label={`Urutkan berdasarkan ${label}`}
      >
        <span>{label}</span>
        <span className="kj-sort-ind" aria-hidden="true">
          {active ? (dir === 1 ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

/**
 * Kolom "kejadian": 0 tak bermakna → diredam jadi en-dash. Glif disembunyikan
 * dari screen reader dan angkanya disediakan terpisah (title tak diumumkan AT).
 */
function Kejadian({ n, color }: { n: number; color?: string }) {
  if (n === 0) {
    return (
      <>
        <span aria-hidden="true" style={{ color: 'var(--muted)' }}>–</span>
        <span className="sr-only">0</span>
      </>
    );
  }
  return <span style={color ? { color, fontWeight: 700 } : undefined}>{n}</span>;
}

const PRESET_URUT = [
  { v: 'nama:1', label: 'Nama A→Z' },
  { v: 'persen:1', label: '% terendah' },
  { v: 'persen:-1', label: '% tertinggi' },
  { v: 'alpa:-1', label: 'Alpa terbanyak' },
  { v: 'belumIsi:-1', label: 'Belum isi terbanyak' },
];

export function KajianRekapPanel({
  rows, totalSesi, sesiLewat, bulan, bulanOptions, genderParam,
}: KajianRekapPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [navPending, startNav] = useTransition();

  // Sorting = presentasi murni → state klien. Halaman ini force-dynamic dan tiap
  // request menarik seluruh riwayat presensi; lewat URL, satu klik header = ratusan ms.
  const [sortKey, setSortKey] = useState<SortKey>('nama');
  const [dir, setDir] = useState<1 | -1>(1);
  const [q, setQ] = useState('');
  const [announce, setAnnounce] = useState('');
  // optimistik: prop `bulan` baru berubah setelah payload RSC tiba, tanpa ini
  // pilihan user memantul balik ke nilai lama selama navigasi.
  const [bulanPilih, setBulanPilih] = useState(bulan ?? '');
  useEffect(() => { setBulanPilih(bulan ?? ''); }, [bulan]);

  function applySort(k: SortKey, nextDir?: 1 | -1) {
    const d = nextDir ?? (k === sortKey ? ((dir === 1 ? -1 : 1) as 1 | -1) : defaultDir(k));
    setSortKey(k);
    setDir(d);
    setAnnounce(`Diurutkan berdasarkan ${LABEL[k]}, ${d === 1 ? 'menaik' : 'menurun'}.`);
  }

  function hrefBulan(next: string): string {
    const params = new URLSearchParams();
    if (next) params.set('bulan', next);
    if (genderParam) params.set('gender', genderParam);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function gantiBulan(next: string) {
    setBulanPilih(next);
    startNav(() => router.push(hrefBulan(next)));
  }

  function reset() {
    setQ('');
    setSortKey('nama');
    setDir(1);
    setAnnounce('Filter direset. Urutan nama A sampai Z.');
    if (bulan) gantiBulan('');
  }

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // .filter() sudah menghasilkan array baru — .sort() tak memutasi prop.
    const out = rows.filter(
      (r) => !needle || r.nama.toLowerCase().includes(needle) || r.halaqah.toLowerCase().includes(needle)
    );
    out.sort((a, b) => {
      const va = sortVal(a, sortKey);
      const vb = sortVal(b, sortKey);
      const c = typeof va === 'string'
        ? COLLATOR.compare(va, vb as string)
        : (va as number) - (vb as number);
      // tie-breaker selalu nama: urutan deterministik, baris tak melompat
      return c !== 0 ? c * dir : COLLATOR.compare(a.nama, b.nama);
    });
    return out;
  }, [rows, q, sortKey, dir]);

  const thProps = { sortKey, dir, onSort: applySort };
  const urutSekarang = `${sortKey}:${dir}`;

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: 10 }}>
        <div className="search">
          {Icon.search(13)}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama ketua / halaqah…"
            aria-label="Cari ketua"
          />
        </div>

        <select
          className="chip-select"
          value={bulanPilih}
          aria-label="Periode"
          disabled={navPending}
          onChange={(e) => gantiBulan(e.target.value)}
        >
          <option value="">Semua periode</option>
          {bulanOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="kj-sort">Urutkan tabel</label>
        <select
          id="kj-sort"
          className="chip-select kj-sort-mobile"
          value={urutSekarang}
          onChange={(e) => {
            const [k, d] = e.target.value.split(':');
            applySort(k as SortKey, Number(d) as 1 | -1);
          }}
        >
          {/* Header tabel bisa menghasilkan kombinasi di luar preset; tanpa opsi
              bayangan ini <select> terkontrol jadi kosong dan berbohong. */}
          {!PRESET_URUT.some((p) => p.v === urutSekarang) && (
            <option value={urutSekarang}>
              {LABEL[sortKey]} {dir === 1 ? 'naik' : 'turun'}
            </option>
          )}
          {PRESET_URUT.map((p) => (
            <option key={p.v} value={p.v}>{p.label}</option>
          ))}
        </select>

        <span className="grow" />
        <button type="button" className="act-btn" onClick={reset}>Reset</button>
      </div>

      <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          className="table-scroll kj-scroll"
          tabIndex={0}
          role="region"
          aria-label="Rekap presensi kajian per ketua"
        >
          <table className="k-table kj-table" style={{ minWidth: 640 }}>
            <caption className="sr-only">Rekap presensi Kajian Adab per ketua kelas</caption>
            <thead>
              <tr>
                <th scope="col" className="kj-num" style={{ width: 44, padding: '10px 14px' }}>#</th>
                <SortTh label="Ketua" k="nama" className="kj-ketua" {...thProps} />
                <SortTh label="Hadir" k="hadir" numeric {...thProps} />
                <SortTh label="Telat" k="terlambat" numeric {...thProps} />
                <SortTh label="Izin" k="izin" numeric {...thProps} />
                <SortTh label="Sakit" k="sakit" numeric {...thProps} />
                <SortTh label="Alpa" k="alpa" numeric {...thProps} />
                <SortTh label="Belum" k="belumIsi" numeric {...thProps} />
                <SortTh label="%" k="persen" numeric title="Klik: terendah dulu" {...thProps} />
              </tr>
            </thead>
            <tbody>
              {totalSesi === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                    Belum ada sesi kajian pada periode ini — semua Ahad libur atau belum lewat.
                  </td>
                </tr>
              )}
              {totalSesi > 0 && view.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                    {rows.length === 0
                      ? 'Belum ada ketua kelas aktif untuk gender ini.'
                      : 'Tak ada ketua yang cocok dengan pencarian.'}
                  </td>
                </tr>
              )}
              {totalSesi > 0 && view.map((r, i) => {
                const belumPernah =
                  sesiLewat > 0 && r.hadir + r.terlambat + r.izin + r.sakit + r.alpa === 0;
                return (
                  <tr key={r.ketuaWa}>
                    <td className="kj-num t-mono" style={{ color: 'var(--muted)' }}>{i + 1}</td>
                    <th scope="row" className="kj-ketua">
                      <div className="nm">
                        {r.nama}{' '}
                        {belumPernah && (
                          <span className="badge badge-merah" style={{ marginLeft: 6 }}>
                            <span className="dot" />Belum pernah lapor
                          </span>
                        )}
                      </div>
                      {r.halaqah && <div className="sub">{r.halaqah}</div>}
                    </th>
                    <td className="kj-num t-mono">{r.hadir}</td>
                    <td className="kj-num t-mono"><Kejadian n={r.terlambat} /></td>
                    <td className="kj-num t-mono"><Kejadian n={r.izin} /></td>
                    <td className="kj-num t-mono"><Kejadian n={r.sakit} /></td>
                    <td className="kj-num t-mono"><Kejadian n={r.alpa} color="var(--merah-ink)" /></td>
                    <td
                      className="kj-num t-mono"
                      style={r.belumIsi > 0 ? { color: 'var(--kuning-ink)', fontWeight: 700 } : undefined}
                    >
                      {r.belumIsi}
                    </td>
                    <td className="kj-num t-mono" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                      {r.persen}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="t-small" style={{ marginTop: 8, color: 'var(--muted)' }}>
        Menampilkan {totalSesi === 0 ? 0 : view.length} dari {rows.length} ketua · {totalSesi} sesi
      </div>

      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}
