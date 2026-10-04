'use client';
import { useState, useTransition } from 'react';
import { submitKajianCheckin } from './actions';

type Props = {
  canCheckin: boolean;
  sesiLabel: string;
  currentState: string;
  reminderAktif: boolean;
};

const LABEL: Record<string, string> = {
  hadir: 'Hadir', terlambat: 'Hadir (Terlambat)', izin: 'Izin', sakit: 'Sakit',
  alpa: 'Alpa', 'belum-isi': 'Belum presensi', 'akan-datang': 'Belum dibuka',
};

export function KajianAdabCard({ canCheckin, sesiLabel, currentState, reminderAktif }: Props) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function kirim(pilih: 'Hadir' | 'Izin' | 'Sakit') {
    start(async () => {
      const r = await submitKajianCheckin(pilih);
      setMsg(r.ok ? `Tersimpan: ${r.status}` : (r.error ?? 'Gagal'));
    });
  }

  return (
    <div className="rounded-xl border p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Kajian Adab · Minggu 16.00</h3>
        <span className="text-sm text-gray-500">{sesiLabel}</span>
      </div>
      {reminderAktif && (
        <p className="mt-2 text-sm text-amber-700 bg-amber-50 rounded p-2">
          Kamu belum presensi. Segera isi sebelum tercatat Alpa (batas 3 hari sejak reminder).
        </p>
      )}
      <p className="mt-2 text-sm">Status: <b>{LABEL[currentState] ?? currentState}</b></p>
      {canCheckin && (
        <div className="mt-3 flex gap-2">
          <button disabled={pending} onClick={() => kirim('Hadir')} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">Hadir</button>
          <button disabled={pending} onClick={() => kirim('Izin')} className="px-3 py-1.5 rounded bg-amber-500 text-white text-sm disabled:opacity-50">Izin</button>
          <button disabled={pending} onClick={() => kirim('Sakit')} className="px-3 py-1.5 rounded bg-sky-600 text-white text-sm disabled:opacity-50">Sakit</button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
    </div>
  );
}
