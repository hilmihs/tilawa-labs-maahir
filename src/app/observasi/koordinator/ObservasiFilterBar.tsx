'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';

interface Props {
  current: {
    q: string;
    hari: string | null;
    statusObs: string | null;
    statusTab: string | null;
  };
}

export function ObservasiFilterBar({ current }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(current.q);
  const qDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushedQ = useRef(current.q);

  function buildHref(overrides: Partial<{ q: string; hari: string; statusObs: string; statusTab: string }>) {
    const params = new URLSearchParams();
    const merged = {
      q: overrides.q !== undefined ? overrides.q : q,
      hari: overrides.hari !== undefined ? overrides.hari : current.hari ?? '',
      statusObs: overrides.statusObs !== undefined ? overrides.statusObs : current.statusObs ?? '',
      statusTab: overrides.statusTab !== undefined ? overrides.statusTab : current.statusTab ?? '',
    };
    if (merged.q) params.set('q', merged.q);
    if (merged.hari) params.set('hari', merged.hari);
    if (merged.statusObs) params.set('statusObs', merged.statusObs);
    if (merged.statusTab) params.set('statusTab', merged.statusTab);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

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

  useEffect(() => {
    setQ(current.q);
    lastPushedQ.current = current.q;
  }, [current.q]);

  return (
    <div className="filter-bar">
      <div className="search">
        {Icon.search(13)}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari pengajar / kelas…"
        />
      </div>
      <select
        value={current.hari ?? ''}
        onChange={(e) => router.push(buildHref({ hari: e.target.value }))}
        className="chip-select"
      >
        <option value="">Semua hari</option>
        <option value="Senin">Senin</option>
        <option value="Selasa">Selasa</option>
        <option value="Rabu">Rabu</option>
        <option value="Kamis">Kamis</option>
        <option value="Jumat">Jumat</option>
      </select>
      <select
        value={current.statusObs ?? ''}
        onChange={(e) => router.push(buildHref({ statusObs: e.target.value }))}
        className="chip-select"
      >
        <option value="">Semua observasi</option>
        <option value="sudah">Sudah diisi</option>
        <option value="belum">Belum diisi</option>
      </select>
      <select
        value={current.statusTab ?? ''}
        onChange={(e) => router.push(buildHref({ statusTab: e.target.value }))}
        className="chip-select"
      >
        <option value="">Semua tabayyun</option>
        <option value="pending">Pending</option>
        <option value="decided">Decided</option>
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
