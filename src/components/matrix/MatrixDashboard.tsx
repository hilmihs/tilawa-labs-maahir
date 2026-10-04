'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Initials } from '@/components/icons';
import {
  keteranganBlok,
  labelBlok,
  urutanBlok,
  type MatrixBlok,
} from '@/lib/matrix-blok';
import type { Gender } from '@/types/db';

export type MatrixListItem = {
  id: string;
  name: string;
  kelompok: string;
  hard: number | null;
  ped: number | null;
  soft: number | null;
  total: number | null;
  ranking: number | null;
  deltaTotal: number | null;
  deltaRank: number | null;
  /** null = belum diblok. Daftar tampil rata seperti sebelumnya. */
  blok: MatrixBlok | null;
};

type SortKey = 'total' | 'hard' | 'ped' | 'soft';

function skorColor(n: number | null): string {
  if (n === null || n === undefined) return 'var(--muted-2)';
  if (n >= 3) return 'var(--hijau-ink)';
  if (n >= 2) return 'var(--kuning-ink)';
  return 'var(--merah-ink)';
}

function fmt1(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(1);
}

/**
 * Halaman rincian dipakai bersama dengan tampilan tabel. `gender` ikut dibawa
 * karena halaman itu menyaring pengajar per gender — tanpa parameter ini
 * koordinator ikhwan yang membuka pengajar akhwat kena notFound().
 */
function detailHref(id: string, ym: string, gender: string): string {
  return `/matrix/koordinator/pengajar/${id}?bulan=${ym}&gender=${gender}&tampilan=blok`;
}

/* ─── Delta ─────────────────────────────────────────────── */
function Delta({ v }: { v: number | null }) {
  if (v === null || v === 0) return null;
  if (v > 0)
    return <span className="delta-up">▲{Math.abs(v).toFixed(1)}</span>;
  return <span className="delta-down">▼{Math.abs(v).toFixed(1)}</span>;
}

/* ─── TriSkillBar ────────────────────────────────────────── */
function TriSkillBar({
  hard,
  ped,
  soft,
}: {
  hard: number | null;
  ped: number | null;
  soft: number | null;
}) {
  return (
    <div className="tri-bar" style={{ minWidth: 60, flex: 1 }}>
      <div className="seg">
        <div
          className="fill"
          style={{
            width: hard != null ? `${(hard / 4) * 100}%` : '0%',
            background: 'var(--hijau)',
          }}
        />
      </div>
      <div className="seg">
        <div
          className="fill"
          style={{
            width: ped != null ? `${(ped / 4) * 100}%` : '0%',
            background: 'var(--kuning)',
          }}
        />
      </div>
      <div className="seg">
        <div
          className="fill"
          style={{
            width: soft != null ? `${(soft / 4) * 100}%` : '0%',
            background: 'var(--accent)',
          }}
        />
      </div>
    </div>
  );
}

/* ─── Mini histogram (5 buckets: 0-1, 1-2, 2-3, 3-4, 4) ─ */
function MiniHistogram({ items }: { items: MatrixListItem[] }) {
  const buckets = [0, 0, 0, 0, 0];
  let rated = 0;
  for (const it of items) {
    if (it.total === null) continue;
    rated++;
    const b = Math.min(4, Math.floor(it.total));
    buckets[b]++;
  }
  const max = Math.max(...buckets, 1);
  const colors = [
    'var(--merah)',
    'var(--merah)',
    'var(--kuning)',
    'var(--hijau)',
    'var(--hijau)',
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 2,
        height: 28,
        marginTop: 6,
      }}
    >
      {buckets.map((cnt, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.round((cnt / max) * 100)}%`,
            minHeight: cnt > 0 ? 3 : 0,
            background: colors[i],
            borderRadius: 2,
            opacity: 0.75,
          }}
          title={`${i}–${i + 1}: ${cnt} pengajar`}
        />
      ))}
    </div>
  );
}

/* ─── HeroStats ──────────────────────────────────────────── */
function HeroStats({ items }: { items: MatrixListItem[] }) {
  const total = items.length;
  const rated = items.filter((it) => it.total !== null);
  const avg =
    rated.length > 0
      ? rated.reduce((s, it) => s + it.total!, 0) / rated.length
      : null;
  const memenuhi = rated.filter((it) => it.total! >= 3).length;
  const pctMemenuhi =
    rated.length > 0 ? Math.round((memenuhi / rated.length) * 100) : null;

  return (
    <div className="matrix-stat-grid" style={{ marginBottom: 18 }}>
      <div className="stat">
        <div className="v">{total}</div>
        <div className="l">
          Total Pengajar
          <div style={{ color: 'var(--muted-2)', fontSize: 11, marginTop: 2 }}>
            {rated.length} dinilai
          </div>
        </div>
      </div>

      <div className="stat">
        <div
          className="v t-mono"
          style={{ color: avg !== null ? skorColor(avg) : 'var(--muted-2)' }}
        >
          {avg !== null ? avg.toFixed(2) : '—'}
        </div>
        <div className="l">Rata-rata Global</div>
      </div>

      <div className="stat">
        <div
          className="v t-mono"
          style={{
            color:
              pctMemenuhi !== null
                ? pctMemenuhi >= 70
                  ? 'var(--hijau-ink)'
                  : pctMemenuhi >= 50
                  ? 'var(--kuning-ink)'
                  : 'var(--merah-ink)'
                : 'var(--muted-2)',
          }}
        >
          {pctMemenuhi !== null ? `${pctMemenuhi}%` : '—'}
        </div>
        <div className="l">Memenuhi Standar (≥3.00)</div>
      </div>

      <div className="stat">
        <div className="l" style={{ marginBottom: 2 }}>
          Distribusi Skor
        </div>
        <MiniHistogram items={items} />
      </div>
    </div>
  );
}

/* ─── Podium ─────────────────────────────────────────────── */
function Podium({
  top3,
  ym,
  gender,
}: {
  top3: MatrixListItem[];
  ym: string;
  gender: Gender;
}) {
  if (top3.length === 0) return null;

  // Rendering order: #2 left, #1 center, #3 right (classic podium)
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);

  return (
    <div className="podium" style={{ marginBottom: 20 }}>
      {order.map((it) => {
        const isFirst = it.ranking === 1 || (!top3[0]?.ranking && top3[0] === it);
        const rank =
          top3[0] === it ? 1 : top3[1] === it ? 2 : 3;
        return (
          <Link
            key={it.id}
            href={detailHref(it.id, ym, gender)}
            prefetch={false}
            style={{ textDecoration: 'none', flex: 1, maxWidth: 200 }}
          >
            <div className={`podium-card${isFirst ? ' first' : ''}`}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--kuning-ink)',
                  marginBottom: 6,
                }}
              >
                #{rank}
                {isFirst && (
                  <span
                    style={{
                      marginLeft: 5,
                      fontSize: 10,
                      background: 'var(--kuning)',
                      color: '#fff',
                      padding: '1px 5px',
                      borderRadius: 4,
                    }}
                  >
                    Terbaik
                  </span>
                )}
              </div>
              <div
                className="avatar"
                style={{
                  width: 40,
                  height: 40,
                  fontSize: 14,
                  margin: '0 auto 8px',
                  background: 'var(--accent-tint)',
                  color: 'var(--accent-2)',
                }}
              >
                <Initials name={it.name} />
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--ink)',
                }}
              >
                {it.name}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--muted)',
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {it.kelompok}
              </div>
              <div
                className="t-mono"
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  marginTop: 8,
                  color: skorColor(it.total),
                }}
              >
                {fmt1(it.total)}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ─── RankedRow ──────────────────────────────────────────── */
function RankedRow({
  item,
  rank,
  globalRank,
  showGlobal,
  highlightRank,
  ym,
  gender,
}: {
  item: MatrixListItem;
  rank: number | null;
  globalRank: number | null;
  showGlobal: boolean;
  /**
   * Peringkat yang menentukan sorotan emas. Default = nomor yang tampil, tapi
   * dalam mode blok diisi peringkat skor global supaya sorotannya tetap sama
   * dengan tiga orang di podium — bukan tiga teratas blok pertama.
   */
  highlightRank?: number | null;
  ym: string;
  gender: Gender;
}) {
  const sorot = highlightRank !== undefined ? highlightRank : rank;
  const isTop3 = sorot !== null && sorot <= 3;
  return (
    <Link
      href={detailHref(item.id, ym, gender)}
      prefetch={false}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          background: 'var(--surface)',
          borderRadius: 'var(--r-sm)',
          marginBottom: 4,
          border: '1px solid var(--line)',
          transition: 'background 0.1s',
        }}
      >
        {/* Rank badge */}
        <div
          className="t-mono"
          style={{
            width: 26,
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 700,
            textAlign: 'center',
            color: isTop3 ? 'var(--kuning-ink)' : 'var(--muted-2)',
            background: isTop3 ? 'var(--kuning-tint)' : 'transparent',
            borderRadius: 4,
            padding: '2px 0',
          }}
        >
          {rank ?? '—'}
        </div>

        {/* Avatar */}
        <div
          className="avatar"
          style={{
            width: 32,
            height: 32,
            fontSize: 11,
            flexShrink: 0,
            background: 'var(--surface-3)',
          }}
        >
          <Initials name={item.name} />
        </div>

        {/* Name + kelompok */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 1 }}>
            {item.kelompok}
            {showGlobal && globalRank !== null && (
              <span style={{ marginLeft: 6, color: 'var(--muted)' }}>
                (global #{globalRank})
              </span>
            )}
          </div>
        </div>

        {/* TriSkillBar */}
        <div style={{ width: 64, flexShrink: 0 }}>
          <TriSkillBar hard={item.hard} ped={item.ped} soft={item.soft} />
        </div>

        {/* Total chip */}
        <div
          className="t-mono"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: skorColor(item.total),
            flexShrink: 0,
            width: 36,
            textAlign: 'right',
          }}
        >
          {fmt1(item.total)}
        </div>

        {/* Delta */}
        <div style={{ flexShrink: 0, width: 36, textAlign: 'right' }}>
          <Delta v={item.deltaTotal} />
        </div>
      </div>
    </Link>
  );
}

/* ─── BlokHeader ─────────────────────────────────────────── */
function BlokHeader({
  blok,
  count,
  gender,
}: {
  blok: MatrixBlok;
  count: number;
  gender: Gender;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        gap: 8,
        margin: '16px 0 8px',
        paddingLeft: 4,
        borderTop: '1px solid var(--line)',
        paddingTop: 10,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
        {labelBlok(blok, gender)}
      </span>
      <span className="t-mono" style={{ fontSize: 11, color: 'var(--muted-2)' }}>
        {count} pengajar
      </span>
      <span style={{ fontSize: 10, color: 'var(--muted-2)', marginLeft: 'auto' }}>
        {keteranganBlok(blok, gender)}
      </span>
    </div>
  );
}

/* ─── SortBar ────────────────────────────────────────────── */
// Bulan, kelompok, gender, pencarian, dan tombol export tinggal di halaman
// `/matrix/koordinator` — dipakai bersama tampilan tabel. Yang tersisa di sini
// hanya yang khas daftar blok: dasar pengurutan.
function SortBar({
  sortKey,
  setSortKey,
}: {
  sortKey: SortKey;
  setSortKey: (v: SortKey) => void;
}) {
  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'total', label: 'Total' },
    { key: 'hard', label: 'Hard' },
    { key: 'ped', label: 'Pedagogis' },
    { key: 'soft', label: 'Soft' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
        padding: '10px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-md)',
      }}
    >
      <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
        Urut menurut
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {sortOptions.map((o) => (
          <button
            key={o.key}
            onClick={() => setSortKey(o.key)}
            className={`btn btn-xs ${sortKey === o.key ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontWeight: sortKey === o.key ? 700 : 500 }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── MatrixDashboard (main export) ─────────────────────── */
export function MatrixDashboard({
  items,
  ym,
  gender,
}: {
  /** Sudah tersaring di server: gender, kelompok, dan pencarian nama. */
  items: MatrixListItem[];
  ym: string;
  gender: Gender;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('total');

  const filtered = items;

  const sorted = useMemo(() => {
    const key = sortKey;
    const getVal = (it: MatrixListItem) => {
      if (key === 'hard') return it.hard;
      if (key === 'ped') return it.ped;
      if (key === 'soft') return it.soft;
      return it.total;
    };
    return [...filtered].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    });
  }, [filtered, sortKey]);

  const top3 = useMemo(
    () => sorted.filter((it) => it.total !== null).slice(0, 3),
    [sorted]
  );

  // Kalau daftar diurut selain Total, nomor baris tak lagi sama dengan
  // peringkat resmi — peringkat itu ditampilkan terpisah supaya tak rancu.
  const showGlobalCaption = sortKey !== 'total';

  // Nomor di badge = urutan baca dari atas ke bawah dan BERJALAN lintas blok:
  // blok teratas 1..9, blok berikutnya lanjut dari 10, dst. Taksonomi bloknya
  // beda per gender (lihat `matrix-blok.ts`), jadi urutannya pun ikut gender.
  // Peringkat skor global tetap ditampilkan di baris kedua ('global #N')
  // karena keduanya beda arti.
  const blocked = filtered.some((it) => it.blok !== null);

  const groups = useMemo(() => {
    if (!blocked) return null;
    let no = 0;
    return urutanBlok(gender).map((blok) => ({
      blok,
      // Yang belum punya skor sama sekali tak diberi nomor (tampil '—') supaya
      // tak ikut menggeser hitungan orang-orang yang sudah dinilai.
      items: sorted
        .filter((it) => (it.blok ?? 'tanpa_kelas') === blok)
        .map((it) => ({ it, no: it.total === null ? null : ++no })),
    })).filter((g) => g.items.length > 0);
  }, [blocked, gender, sorted]);

  return (
    // Lebar & padding luar diatur halaman pembungkus, jangan digandakan di sini.
    <div style={{ paddingBottom: 40 }}>
      {/* Hero Stats — derived from filtered set */}
      <HeroStats items={filtered} />

      {/* Podium */}
      <Podium top3={top3} ym={ym} gender={gender} />

      {/* Sort */}
      <SortBar sortKey={sortKey} setSortKey={setSortKey} />

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 10,
          paddingLeft: 4,
        }}
      >
        {[
          { color: 'var(--hijau)', label: 'Hard Skill' },
          { color: 'var(--kuning)', label: 'Pedagogis' },
          { color: 'var(--accent)', label: 'Soft Skill' },
        ].map((l) => (
          <div
            key={l.label}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <span
              style={{
                width: 10,
                height: 6,
                borderRadius: 3,
                background: l.color,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{l.label}</span>
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {filtered.length} pengajar
        </span>
      </div>

      {/* Rows */}
      {sorted.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)', padding: 12 }}>
          Tidak ada pengajar sesuai filter.
        </p>
      ) : groups ? (
        <>
          <p className="t-tiny" style={{ color: 'var(--muted-2)', paddingLeft: 4, marginBottom: 4 }}>
            Nomor urut berjalan lintas blok, mengikuti urutan blok dari atas ke
            bawah. Angka dalam kurung = peringkat skor se-gender.
          </p>
          {groups.map((g) => (
            <div key={g.blok}>
              <BlokHeader blok={g.blok} count={g.items.length} gender={gender} />
              {g.items.map(({ it, no }) => (
                <RankedRow
                  key={it.id}
                  item={it}
                  rank={no}
                  globalRank={it.ranking}
                  showGlobal
                  highlightRank={it.ranking}
                  ym={ym}
                  gender={gender}
                />
              ))}
            </div>
          ))}
        </>
      ) : (
        sorted.map((it, idx) => (
          <RankedRow
            key={it.id}
            item={it}
            rank={idx + 1}
            globalRank={it.ranking}
            showGlobal={showGlobalCaption}
            ym={ym}
            gender={gender}
          />
        ))
      )}

      <p
        className="t-tiny"
        style={{ marginTop: 14, color: 'var(--muted-2)', paddingLeft: 4 }}
      >
        Skor dihitung otomatis dari: penilaian bacaan/hafalan, nilai rekaman
        setoran (tajwid), kehadiran 3 program, penilaian pedagogis + SOP ketua
        kelompok, observasi kelas HITS, dan check-in pengajar. Tap baris untuk
        detail 15 indikator.
      </p>
    </div>
  );
}
