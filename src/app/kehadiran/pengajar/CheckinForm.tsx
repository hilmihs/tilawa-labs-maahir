'use client';

import { useState, useTransition } from 'react';
import { submitCheckin, submitAlasan } from './actions';
import { KetuaKelasStep } from './KetuaKelasStep';
import type { ProgramToday } from '@/lib/attendance';
import { tanggalSedang, tanggalRelatif, jamTitik } from '@/lib/tanggal-id';

export interface KetuaKelasInfo {
  kelasHitsId: string;
  kelasName: string;
  hasKetuaThisBatch: boolean;
  currentKetuaName: string | null;
}

interface Props {
  /** Antrian: sesi lampau yang terlewat (paling lama dulu), lalu sesi hari ini. */
  programs: ProgramToday[];
  checkedKeys: string[];
  /** 'YYYY-MM-DD' zona Jakarta, dari server — jangan pakai jam perangkat. */
  today: string;
  kelasList?: KetuaKelasInfo[];
  pekan?: number | null;
}

type Status = 'hadir' | 'izin' | 'sakit';

const STATUS: { value: Status; label: string; warna: 'hijau' | 'kuning' | 'merah' }[] = [
  { value: 'hadir', label: 'Hadir', warna: 'hijau' },
  { value: 'izin', label: 'Izin', warna: 'kuning' },
  { value: 'sakit', label: 'Sakit', warna: 'merah' },
];

const kunci = (p: ProgramToday) => `${p.type}:${p.id}:${p.tanggal}`;

export function CheckinForm({ programs, checkedKeys, today, kelasList, pekan }: Props) {
  const [completed, setCompleted] = useState<string[]>(checkedKeys);
  const [status, setStatus] = useState<Status | null>(null);
  const [lastWaUrl, setLastWaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ketuaStepDone, setKetuaStepDone] = useState<Set<string>>(new Set());
  const [ketuaWaUrl, setKetuaWaUrl] = useState<string | null>(null);

  const remaining = programs.filter((p) => !completed.includes(kunci(p)));
  const current = remaining[0];
  const jumlahLampau = programs.filter((p) => p.tanggal < today).length;
  const jumlahHariIni = programs.length - jumlahLampau;
  // Posisi sesi yang sedang diisi dalam antrian — bukan jumlah yang selesai,
  // karena sesi hari ini yang sudah terisi duduk di ujung antrian.
  const nomorSesi = current ? programs.findIndex((p) => kunci(p) === kunci(current)) + 1 : programs.length;

  const needsKetuaStep = (() => {
    if (!current || !pekan || pekan > 2) return false;
    if (current.type !== 'kelas_maahir') return false;
    const info = kelasList?.find((k) => k.kelasHitsId === current.id);
    if (!info) return false;
    if (info.hasKetuaThisBatch) return false;
    if (ketuaStepDone.has(current.id)) return false;
    return true;
  })();

  function handleCheckin(fd: FormData) {
    if (!current) return;
    setError(null);
    startTransition(async () => {
      const result = await submitCheckin(undefined, fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (!result?.ok) return;

      // Alasan izin/sakit ikut terkirim dalam satu langkah — dulu layar terpisah.
      const alasan = String(fd.get('alasan') ?? '').trim();
      if (alasan && (status === 'izin' || status === 'sakit')) {
        fd.set('jenis', 'alpa');
        const r = await submitAlasan(undefined, fd);
        if (r?.error) {
          // Kehadiran sudah tersimpan; laporkan tanpa menahan antrian.
          setError(`Kehadiran tersimpan, tetapi alasan gagal dikirim: ${r.error}`);
        } else if (r?.waUrl) {
          setLastWaUrl(r.waUrl);
        }
      }

      setCompleted((prev) => [...prev, kunci(current)]);
      setStatus(null);
    });
  }

  function handleKetuaComplete(waUrl?: string) {
    if (current) setKetuaStepDone((prev) => new Set(prev).add(current.id));
    if (waUrl) setKetuaWaUrl(waUrl);
  }

  function handleKetuaSkip() {
    if (current) setKetuaStepDone((prev) => new Set(prev).add(current.id));
  }

  const notifKetuaKelompok = lastWaUrl && (
    <div className="notice-hijau">
      <span>Alasan terkirim.</span>
      <a
        href={lastWaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-sm btn-wa"
        onClick={() => setLastWaUrl(null)}
      >
        Kabari Ketua Kelompok
      </a>
    </div>
  );

  if (programs.length === 0) {
    return (
      <div className="card-flat" style={{ padding: '24px 20px', textAlign: 'center' }}>
        <p className="t-body" style={{ fontWeight: 600 }}>Tidak ada sesi hari ini.</p>
        <p className="t-small" style={{ marginTop: 6 }}>Semua kehadiran sudah terisi.</p>
      </div>
    );
  }

  return (
    <>
      {remaining.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="t-small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
              Sesi {nomorSesi} dari {programs.length}
            </span>
            <span className="t-tiny" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
              {[jumlahLampau > 0 && `${jumlahLampau} lampau`, jumlahHariIni > 0 && `${jumlahHariIni} hari ini`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }} aria-hidden>
            {programs.map((p) => {
              const selesai = completed.includes(kunci(p));
              const aktif = current && kunci(p) === kunci(current);
              return (
                <div
                  key={kunci(p)}
                  style={{
                    height: 4,
                    flex: 1,
                    borderRadius: 2,
                    background: selesai ? 'var(--hijau)' : aktif ? 'var(--ink)' : 'var(--line)',
                  }}
                />
              );
            })}
          </div>
        </>
      )}

      {/* KetuaKelasStep membawa padding sendiri. */}
      <div className="card" style={{ padding: needsKetuaStep ? 0 : 18, borderRadius: 16 }}>
        {!current ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <span className="badge badge-hijau"><span className="dot" />Selesai</span>
            <p className="t-h3" style={{ marginTop: 10 }}>Semua kehadiran sudah terisi</p>
            {notifKetuaKelompok}
          </div>
        ) : needsKetuaStep ? (
          <KetuaKelasStep
            kelasHitsId={current.id}
            kelasName={kelasList?.find((k) => k.kelasHitsId === current.id)?.kelasName ?? current.name}
            pekan={pekan!}
            currentKetuaName={kelasList?.find((k) => k.kelasHitsId === current.id)?.currentKetuaName ?? null}
            onComplete={handleKetuaComplete}
            onSkip={handleKetuaSkip}
          />
        ) : (
          <>
            {notifKetuaKelompok}
            {ketuaWaUrl && (
              <div className="notice-hijau">
                <span>Ketua kelas tersimpan.</span>
                <a
                  href={ketuaWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-wa"
                  onClick={() => setKetuaWaUrl(null)}
                >
                  Kabari Ketua Kelas
                </a>
              </div>
            )}

            {current.tanggal < today ? (
              <span className="badge badge-merah">
                <span className="dot" />
                Terlewat · {tanggalSedang(current.tanggal)}
              </span>
            ) : (
              <span className="badge badge-neutral">
                <span className="dot" />
                Hari ini · {tanggalSedang(current.tanggal)}
              </span>
            )}
            <h3 className="t-h2" style={{ margin: '10px 0 2px' }}>{current.name}</h3>
            <p className="t-small" style={{ marginBottom: 16 }}>
              {jamTitik(current.waktu_mulai)} – {jamTitik(current.waktu_selesai)} WIB
            </p>

            <form action={handleCheckin} key={kunci(current)}>
              <input type="hidden" name="tanggal" value={current.tanggal} />
              {current.type === 'program' && <input type="hidden" name="program_id" value={current.id} />}
              {current.type === 'kelas_maahir' && <input type="hidden" name="kelas_hits_id" value={current.id} />}

              <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
                <legend className="t-small" style={{ fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6, padding: 0 }}>
                  Status Anda
                </legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {STATUS.map((o) => {
                    const on = status === o.value;
                    return (
                      <label
                        key={o.value}
                        className="seg-opt"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          height: 44,
                          borderRadius: 8,
                          border: `1px solid ${on ? `var(--${o.warna})` : 'var(--line-2)'}`,
                          background: on ? `var(--${o.warna}-tint)` : 'var(--surface)',
                          color: on ? `var(--${o.warna}-ink)` : 'var(--ink-2)',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          position: 'relative',
                        }}
                      >
                        <input
                          type="radio"
                          name="status"
                          value={o.value}
                          required
                          checked={on}
                          onChange={() => setStatus(o.value)}
                          style={{ position: 'absolute', opacity: 0, inset: 0, margin: 0, cursor: 'pointer' }}
                        />
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${o.warna})` }} />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {(status === 'izin' || status === 'sakit') && (
                <textarea
                  name="alasan"
                  placeholder="Tulis alasan singkat — diteruskan ke ketua kelompok (boleh dikosongkan)"
                  className="textarea"
                  style={{ minHeight: 68, marginBottom: 14 }}
                />
              )}

              {error && (
                <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</p>
              )}

              <button type="submit" className="btn btn-accent btn-block" disabled={pending || !status}>
                {pending
                  ? 'Menyimpan...'
                  : remaining.length > 1
                    ? 'Simpan & lanjut ke sesi berikutnya'
                    : 'Simpan'}
              </button>
            </form>
          </>
        )}
      </div>

      {programs.length > 1 && (
        <>
          <div className="t-tiny" style={{ fontWeight: 600, margin: '22px 2px 8px' }}>Antrian</div>
          <div className="card-flat" style={{ overflow: 'hidden' }}>
            {programs.map((p, i) => {
              const k = kunci(p);
              const selesai = completed.includes(k);
              const aktif = current && k === kunci(current);
              return (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderTop: i ? '1px solid var(--line)' : 'none',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{tanggalRelatif(p.tanggal, today)}</div>
                    <div className="t-small" style={{ fontSize: 12 }}>
                      {p.name} · {jamTitik(p.waktu_mulai)}
                    </div>
                  </div>
                  {selesai ? (
                    <span className="badge badge-hijau">Terisi</span>
                  ) : aktif ? (
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Sedang diisi</span>
                  ) : p.tanggal < today ? (
                    <span className="badge badge-merah">Terlewat</span>
                  ) : (
                    <span className="badge badge-neutral">Belum</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
