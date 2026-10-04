'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Initials, Icon } from '@/components/icons';
import type { Gender, NilaiRekaman } from '@/types/db';

/** Satu kolom periode. `key` = week_start, `label` = teks kepala kolom. */
export type PeriodeKolom = { key: string; label: string };

export type SelPeriode = {
  status: 'belum' | 'menunggu' | 'selesai';
  setoranId: string | null;
  rekaman: NilaiRekaman[];
};

export type RankingRow = {
  id: string;
  name: string;
  gender: Gender;
  kelasId: string;
  kelasName: string;
  /** Diindeks week_start. Periode tanpa entri dianggap 'belum'. */
  periode: Record<string, SelPeriode>;
  rataRata: number | null;
};

const SEL_KOSONG: SelPeriode = { status: 'belum', setoranId: null, rekaman: [] };

// Jumlah kolom periode tidak tetap: era 2-pekan memberi dua per bulan, era
// bulanan satu, dan September 2026 — bulan pergantian aturan — tiga. Karena
// itu kunci urutnya dinamis (`p:<week_start>`), bukan 'h1'/'h2'.
type SortKey = 'name' | 'kelas' | 'rata' | `p:${string}`;
const STATUS_ORD = { belum: 0, menunggu: 1, selesai: 2 } as const;

export function RankingTable({
  rows,
  kelasOptions,
  monthOptions,
  currentMonth,
  periods,
}: {
  rows: RankingRow[];
  kelasOptions: Array<{ id: string; name: string; gender: Gender }>;
  monthOptions: Array<{ value: string; label: string }>;
  currentMonth: string;
  periods: PeriodeKolom[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = useState('');
  const [gender, setGender] = useState<'' | Gender>('');
  const [kelas, setKelas] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rata');
  const [dir, setDir] = useState<1 | -1>(-1); // default rata desc

  function onMonth(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    params.set('month', e.target.value);
    router.push(`?${params.toString()}#ranking`);
  }

  function toggle(k: SortKey) {
    if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(k === 'rata' ? -1 : 1); }
  }

  const visibleKelas = gender ? kelasOptions.filter((k) => k.gender === gender) : kelasOptions;

  const view = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (gender && r.gender !== gender) return false;
      if (kelas && r.kelasId !== kelas) return false;
      if (ql && !r.name.toLowerCase().includes(ql)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      let c = 0;
      if (sortKey === 'name') c = a.name.localeCompare(b.name, 'id');
      else if (sortKey === 'kelas') c = a.kelasName.localeCompare(b.kelasName, 'id');
      else if (sortKey.startsWith('p:')) {
        const k = sortKey.slice(2);
        c = STATUS_ORD[(a.periode[k] ?? SEL_KOSONG).status] - STATUS_ORD[(b.periode[k] ?? SEL_KOSONG).status];
      }
      else if (sortKey === 'rata') {
        const av = a.rataRata, bv = b.rataRata;
        if (av === null && bv === null) c = 0;
        else if (av === null) c = -1; // null selalu di bawah saat desc
        else if (bv === null) c = 1;
        else c = av - bv;
      }
      return c * dir;
    });
    return filtered;
  }, [rows, q, gender, kelas, sortKey, dir]);

  return (
    <div id="ranking" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="t-tiny">RANKING PROGRESS</div>
          <div className="t-small" style={{ marginTop: 2 }}>
            Rata-rata nilai rekaman — kontribusi aspek <strong>tajwid</strong> ke Matrix Skill Guru
          </div>
        </div>
        <Link
          href="/matrix/koordinator?tampilan=blok"
          className="btn btn-sm btn-primary"
          style={{ height: 30, padding: '0 12px', textDecoration: 'none', fontSize: 12 }}
        >
          Matrix Skill Guru →
        </Link>
      </div>

      {/* Filter bar khusus ranking */}
      <div className="filter-bar" style={{ marginBottom: 10 }}>
        <div className="search">
          {Icon.search(13)}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari peserta…" />
        </div>
        <select className="chip-select" value={currentMonth} onChange={onMonth} aria-label="Periode (bulan)">
          {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="chip-select" value={gender} onChange={(e) => { setGender(e.target.value as '' | Gender); setKelas(''); }} aria-label="Gender">
          <option value="">Semua gender</option>
          <option value="ikhwan">Ikhwan</option>
          <option value="akhwat">Akhwat</option>
        </select>
        <select className="chip-select" value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Kelas">
          <option value="">Semua kelas</option>
          {visibleKelas.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <span className="grow" />
        <button type="button" className="act-btn" onClick={() => { setQ(''); setGender(''); setKelas(''); }}>Reset</button>
      </div>

      <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="k-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <SortTh label="Peserta" k="name" sortKey={sortKey} dir={dir} onClick={toggle} style={{ width: '28%' }} />
                <SortTh label="Kelas" k="kelas" sortKey={sortKey} dir={dir} onClick={toggle} style={{ width: '12%' }} />
                {periods.map((p) => (
                  <SortTh
                    key={p.key}
                    label={p.label}
                    k={`p:${p.key}`}
                    sortKey={sortKey}
                    dir={dir}
                    onClick={toggle}
                    style={{ width: `${36 / Math.max(periods.length, 1)}%`, textAlign: 'center' }}
                  />
                ))}
                <SortTh label="Rata²" k="rata" sortKey={sortKey} dir={dir} onClick={toggle} style={{ width: '12%', textAlign: 'center' }} />
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr><td colSpan={4 + periods.length} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>Tidak ada data sesuai filter.</td></tr>
              )}
              {view.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ color: i < 3 ? 'var(--accent-2)' : 'var(--muted)', fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}><Initials name={r.name} /></div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--ink-2)', fontSize: 12 }}>{r.kelasName || '—'}</td>
                  {periods.map((p) => {
                    const sel = r.periode[p.key] ?? SEL_KOSONG;
                    return (
                      <td key={p.key} style={{ textAlign: 'center' }}>
                        <StatusCell status={sel.status} setoranId={sel.setoranId} rekaman={sel.rekaman} />
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'center' }}>
                    {r.rataRata !== null ? (
                      <span style={{ fontWeight: 700, fontSize: 14, color: r.rataRata >= 3 ? 'var(--hijau-ink)' : r.rataRata >= 2 ? 'var(--kuning-ink)' : 'var(--merah-ink)' }}>
                        {r.rataRata.toFixed(1)}
                      </span>
                    ) : <span style={{ color: 'var(--muted-2)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="t-small" style={{ marginTop: 6 }}>{view.length} peserta</div>
    </div>
  );
}

function SortTh({
  label, k, sortKey, dir, onClick, style,
}: {
  label: string; k: SortKey; sortKey: SortKey; dir: 1 | -1; onClick: (k: SortKey) => void; style?: React.CSSProperties;
}) {
  const active = sortKey === k;
  return (
    <th style={{ ...style, cursor: 'pointer', userSelect: 'none' }} onClick={() => onClick(k)} aria-sort={active ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label} <span style={{ color: active ? 'var(--accent-2)' : 'var(--muted-2)', fontSize: 10 }}>{active ? (dir === 1 ? '▲' : '▼') : '↕'}</span>
    </th>
  );
}

function StatusCell({ status, setoranId, rekaman }: { status: 'belum' | 'menunggu' | 'selesai'; setoranId: string | null; rekaman: NilaiRekaman[] }) {
  if (status === 'belum') return <span className="badge badge-merah" style={{ fontSize: 10 }}><span className="dot" />belum</span>;
  if (status === 'menunggu' && setoranId) {
    return <Link href={`/2in1/musyrif/cek/${setoranId}`} className="badge badge-kuning" style={{ textDecoration: 'none', fontSize: 10 }}><span className="dot" />Cek</Link>;
  }
  if (status === 'selesai' && rekaman.length > 0) {
    return (
      <span className="nilai-trio" style={{ justifyContent: 'center' }}>
        {rekaman.slice(0, 3).map((n, i) => <span key={i} className={`d ${n}`} />)}
        {Array.from({ length: Math.max(0, 3 - rekaman.length) }).map((_, i) => <span key={`e${i}`} className="d" />)}
      </span>
    );
  }
  return <span className="badge badge-hijau" style={{ fontSize: 10 }}><span className="dot" />selesai</span>;
}
