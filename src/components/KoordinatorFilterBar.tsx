'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import type { Gender } from '@/types/db';

interface KelasOption {
  id: string;
  name: string;
  gender: Gender;
}

interface WeekOption {
  value: string;
  label: string;
}

interface Props {
  kelasOptions: KelasOption[];
  weekOptions: WeekOption[];
  current: {
    q: string;
    week: string;
    kelas: string | null;
    status: string | null;
    gender: Gender | null;
  };
}

export function KoordinatorFilterBar({ kelasOptions, weekOptions, current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(current.q);
  const qDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushedQ = useRef(current.q);

  function buildHref(overrides: Partial<{ q: string; week: string; kelas: string; status: string; gender: string }>) {
    const params = new URLSearchParams();
    const merged = {
      q: overrides.q !== undefined ? overrides.q : q,
      week: overrides.week !== undefined ? overrides.week : current.week,
      kelas: overrides.kelas !== undefined ? overrides.kelas : current.kelas ?? '',
      status: overrides.status !== undefined ? overrides.status : current.status ?? '',
      gender: overrides.gender !== undefined ? overrides.gender : current.gender ?? '',
    };
    if (merged.q) params.set('q', merged.q);
    if (merged.week) params.set('week', merged.week);
    if (merged.kelas) params.set('kelas', merged.kelas);
    if (merged.status) params.set('status', merged.status);
    if (merged.gender) params.set('gender', merged.gender);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // Debounced push for text input
  useEffect(() => {
    if (q === lastPushedQ.current) return;
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current);
    qDebounceRef.current = setTimeout(() => {
      lastPushedQ.current = q;
      router.push(buildHref({ q }));
    }, 300);
    return () => {
      if (qDebounceRef.current) clearTimeout(qDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Sync local q if URL changes externally (e.g. via Reset)
  useEffect(() => {
    setQ(current.q);
    lastPushedQ.current = current.q;
  }, [current.q]);

  const visibleKelas = current.gender
    ? kelasOptions.filter((k) => k.gender === current.gender)
    : kelasOptions;

  return (
    <div className="filter-bar">
      <div className="search">
        {Icon.search(13)}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari peserta…"
        />
      </div>
      <select
        value={current.week}
        onChange={(e) => router.push(buildHref({ week: e.target.value }))}
        className="chip-select"
      >
        {weekOptions.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
      <select
        value={current.gender ?? ''}
        onChange={(e) =>
          router.push(
            buildHref({
              gender: e.target.value,
              // reset kelas kalau pindah gender supaya kelas filter konsisten
              kelas: '',
            })
          )
        }
        className="chip-select"
      >
        <option value="">Semua gender</option>
        <option value="ikhwan">Ikhwan</option>
        <option value="akhwat">Akhwat</option>
      </select>
      <select
        value={current.kelas ?? ''}
        onChange={(e) => router.push(buildHref({ kelas: e.target.value }))}
        className="chip-select"
      >
        <option value="">Semua kelas</option>
        {visibleKelas.map((k) => (
          <option key={k.id} value={k.id}>
            {k.name}
          </option>
        ))}
      </select>
      <select
        value={current.status ?? ''}
        onChange={(e) => router.push(buildHref({ status: e.target.value }))}
        className="chip-select"
      >
        <option value="">Semua status</option>
        <option value="belum">Belum setor</option>
        <option value="menunggu">Menunggu cek</option>
        <option value="selesai">Selesai</option>
      </select>
      <span className="grow" />
      <button
        type="button"
        className="act-btn"
        onClick={() => {
          setQ('');
          lastPushedQ.current = '';
          router.push(pathname);
        }}
      >
        Reset
      </button>
    </div>
  );
}
