'use client';

import { useEffect, useMemo, useState } from 'react';
import { TombolPerbarui } from './TombolPerbarui';

// Tampilan Rekap Pertemuan (desain "Rekap Pertemuan" 1a Daftar + 1c Kalender).
// Semua angka & status dihitung di server; komponen ini hanya menyaring,
// mengelompokkan per tanggal, dan menggambar kalender.

export type StatusTampil = 'selesai' | 'dikonfirmasi' | 'berhalangan' | 'belum' | 'hari_ini' | 'terjadwal';

export type BarisPertemuan = {
  id: string;
  tanggal: string; // YYYY-MM-DD
  urutan: number | null;
  status: StatusTampil;
  alasan: string | null;
  halaqahNama: string;
  programNama: string;
  warna: string;
  keterangan: string | null; // badal / dicocokkan lewat nama
};

export type SinkronInfo = {
  nada: 'hijau' | 'kuning' | 'merah';
  label: string;
  desc: string;
};

const GAYA: Record<StatusTampil, { l: string; bg: string; fg: string; dot: string; bd: string }> = {
  selesai: { l: 'Selesai', bg: 'var(--hijau-tint)', fg: 'var(--hijau-ink)', dot: 'var(--hijau)', bd: 'var(--hijau-line)' },
  dikonfirmasi: { l: 'Dikonfirmasi', bg: 'var(--hijau-tint)', fg: 'var(--hijau-ink)', dot: 'var(--hijau)', bd: 'var(--hijau-line)' },
  berhalangan: { l: 'Berhalangan', bg: 'oklch(0.96 0.02 250)', fg: 'oklch(0.45 0.08 250)', dot: 'oklch(0.6 0.1 250)', bd: 'oklch(0.87 0.04 250)' },
  belum: { l: 'Belum diinput', bg: 'var(--merah-tint)', fg: 'var(--merah-ink)', dot: 'var(--merah)', bd: 'var(--merah-line)' },
  hari_ini: { l: 'Hari ini', bg: 'var(--kuning-tint)', fg: 'var(--kuning-ink)', dot: 'var(--emas)', bd: 'var(--kuning-line)' },
  terjadwal: { l: 'Terjadwal', bg: 'var(--surface-3)', fg: 'var(--ink-2)', dot: 'var(--muted-2)', bd: 'var(--line)' },
};

const LEGENDA: Array<{ s: StatusTampil; d: string }> = [
  { s: 'selesai', d: 'Pertemuan sudah ditandai selesai, atau Anda konfirmasi sudah mengajar.' },
  { s: 'belum', d: 'Jadwal sudah lewat tetapi belum ditandai selesai atau dikonfirmasi.' },
  { s: 'berhalangan', d: 'Anda konfirmasi tidak mengajar (izin, sakit, atau digantikan badal).' },
  { s: 'hari_ini', d: 'Pertemuan yang dijadwalkan hari ini.' },
  { s: 'terjadwal', d: 'Jadwal di Dashboard Edu atau jadwal Kelas Maahir — bukan target kontrak.' },
];

type Filter = 'semua' | 'belum' | 'selesai' | 'mendatang' | 'berhalangan';
const FILTER: Array<{ id: Filter; l: string; cocok: (b: BarisPertemuan) => boolean }> = [
  { id: 'semua', l: 'Semua', cocok: () => true },
  { id: 'belum', l: 'Belum diinput', cocok: (b) => b.status === 'belum' },
  { id: 'selesai', l: 'Selesai', cocok: (b) => b.status === 'selesai' || b.status === 'dikonfirmasi' },
  { id: 'berhalangan', l: 'Berhalangan', cocok: (b) => b.status === 'berhalangan' },
  { id: 'mendatang', l: 'Mendatang', cocok: (b) => b.status === 'hari_ini' || b.status === 'terjadwal' },
];

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HARI_PANJANG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const KUNCI_TAMPILAN = 'rekap-pertemuan-tampilan';

// Tanggal kalender murni (UTC) supaya zona perangkat tak menggeser hari.
const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const selisihHari = (a: string, b: string) => Math.round((utc(a).getTime() - utc(b).getTime()) / 86_400_000);

function relatif(tanggal: string, hariIni: string): string {
  const d = selisihHari(hariIni, tanggal);
  if (d === 0) return 'Hari ini';
  if (d === 1) return 'Kemarin';
  if (d === -1) return 'Besok';
  return d > 0 ? `${d} hari lalu` : `${-d} hari lagi`;
}

function catatan(b: BarisPertemuan, hariIni: string): string {
  switch (b.status) {
    case 'belum':
      return `Lewat ${selisihHari(hariIni, b.tanggal)} hari`;
    case 'berhalangan':
      return b.alasan ?? 'Berhalangan';
    case 'dikonfirmasi':
      return 'Mengajar, belum diinput';
    case 'hari_ini':
      return 'Hari ini';
    case 'terjadwal':
      return relatif(b.tanggal, hariIni);
    default:
      return '';
  }
}

function Lencana({ s, label }: { s: StatusTampil; label?: string }) {
  const g = GAYA[s];
  return (
    <span
      className="rp-lencana"
      style={{ background: g.bg, color: g.fg, borderColor: g.bd }}
    >
      <span className="rp-dot" style={{ background: g.dot }} />
      {label ?? g.l}
    </span>
  );
}

function KartuSinkron({ sinkron, month }: { sinkron: SinkronInfo; month: string }) {
  const g = sinkron.nada === 'hijau' ? GAYA.selesai : sinkron.nada === 'kuning' ? GAYA.hari_ini : GAYA.belum;
  return (
    <div className="rp-kartu rp-sinkron">
      <div className="rp-sinkron-ikon" style={{ background: g.bg, color: g.fg }} aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </div>
      <div style={{ flex: '1 1 150px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Dashboard Edu</span>
          <span className="rp-lencana" style={{ background: g.bg, color: g.fg, borderColor: g.bd, height: 20 }}>
            <span className="rp-dot" style={{ background: g.dot }} />
            {sinkron.label}
          </span>
        </div>
        <div className="rp-redup" style={{ marginTop: 3 }}>{sinkron.desc}</div>
      </div>
      <TombolPerbarui month={month} />
    </div>
  );
}

function CaraMembaca({ awalTerbuka }: { awalTerbuka: boolean }) {
  return (
    <details className="rp-kartu rp-cara" open={awalTerbuka}>
      <summary>
        <span className="rp-cara-i" aria-hidden>i</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>Cara membaca rekap ini</span>
        <span className="rp-redup rp-cara-buka" style={{ fontWeight: 600 }} />
      </summary>
      <div style={{ padding: '2px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {LEGENDA.map((x) => (
          <div key={x.s} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, width: 108, display: 'flex' }}>
              <Lencana s={x.s} />
            </span>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>{x.d}</span>
          </div>
        ))}
        <div className="rp-redup" style={{ lineHeight: 1.5, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          Periode berjalan tanggal 16 s/d 15 bulan berikutnya. Data Dashboard Edu diperbarui otomatis
          beberapa kali sehari.
        </div>
      </div>
    </details>
  );
}

function BarisDaftar({ b, hariIni }: { b: BarisPertemuan; hariIni: string }) {
  const d = utc(b.tanggal);
  const isHariIni = b.status === 'hari_ini';
  const isBelum = b.status === 'belum';
  const g = GAYA[b.status];
  return (
    <div className="rp-baris" style={{ background: isHariIni ? GAYA.hari_ini.bg : undefined }}>
      <div
        className="rp-tgl"
        style={{
          background: isHariIni ? 'var(--forest)' : isBelum ? GAYA.belum.bg : 'var(--surface-2)',
          color: isHariIni ? '#fff' : isBelum ? GAYA.belum.fg : 'var(--ink)',
        }}
      >
        <span className="rp-tgl-h">{HARI[d.getUTCDay()]}</span>
        <span className="rp-tgl-n">{d.getUTCDate()}</span>
        <span className="rp-tgl-b">{BULAN[d.getUTCMonth()]}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
          {b.urutan != null ? `Pertemuan ke-${b.urutan}` : 'Pertemuan'}
        </div>
        <div className="rp-redup" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="rp-kelas" style={{ background: b.warna }} />
          {b.halaqahNama} · {b.programNama}
          {b.keterangan && <> · {b.keterangan}</>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <Lencana s={b.status} label={b.status === 'berhalangan' ? g.l : undefined} />
        <span className="rp-redup" style={{ fontSize: 11 }}>{catatan(b, hariIni)}</span>
      </div>
    </div>
  );
}

function TampilanDaftar({ baris, hariIni }: { baris: BarisPertemuan[]; hariIni: string }) {
  const [filter, setFilter] = useState<Filter>('semua');
  const aktif = FILTER.filter((f) => f.id !== 'berhalangan' || baris.some(f.cocok));
  const cocok = (FILTER.find((f) => f.id === filter) ?? FILTER[0]).cocok;
  const tampil = baris.filter(cocok);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="rp-saring" role="tablist" aria-label="Saring status">
        {aktif.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={on}
              className={on ? 'on' : ''}
              onClick={() => setFilter(f.id)}
            >
              {f.l}
              <span className="rp-angka" style={{ color: f.id === 'belum' ? 'var(--merah-ink)' : undefined }}>
                {baris.filter(f.cocok).length}
              </span>
            </button>
          );
        })}
      </div>
      {tampil.length > 0 ? (
        <div className="rp-kartu" style={{ overflow: 'hidden' }}>
          {tampil.map((b) => (
            <BarisDaftar key={b.id} b={b} hariIni={hariIni} />
          ))}
        </div>
      ) : (
        <div className="rp-kosong">
          <div style={{ fontSize: 14, fontWeight: 700 }}>Tidak ada pertemuan</div>
          <div className="rp-redup" style={{ maxWidth: 320, lineHeight: 1.5 }}>
            {filter === 'belum'
              ? 'Semua pertemuan yang sudah lewat sudah diinput. Mantap!'
              : 'Tidak ada pertemuan dengan status ini di periode ini.'}
          </div>
        </div>
      )}
    </div>
  );
}

function TampilanKalender({
  baris,
  hariIni,
  start,
  end,
  pilihAwal,
}: {
  baris: BarisPertemuan[];
  hariIni: string;
  start: string;
  end: string;
  pilihAwal: string;
}) {
  const [pilih, setPilih] = useState(pilihAwal);
  const perTanggal = useMemo(() => {
    const m = new Map<string, BarisPertemuan[]>();
    for (const b of baris) m.set(b.tanggal, [...(m.get(b.tanggal) ?? []), b]);
    return m;
  }, [baris]);

  // Grid Senin–Minggu yang mencakup seluruh periode.
  const sel: string[] = [];
  const s = utc(start);
  const geserSenin = (s.getUTCDay() + 6) % 7;
  const mulai = new Date(s.getTime() - geserSenin * 86_400_000);
  const akhir = utc(end);
  const geserMinggu = (7 - akhir.getUTCDay()) % 7;
  const selesai = new Date(akhir.getTime() + geserMinggu * 86_400_000);
  for (let d = mulai; d <= selesai; d = new Date(d.getTime() + 86_400_000)) sel.push(iso(d));

  const judulBulan = (() => {
    const a = utc(start);
    const b = utc(end);
    const nama = (d: Date) => d.toLocaleDateString('id-ID', { month: 'long', timeZone: 'UTC' });
    return `${nama(a)} – ${nama(b)} ${b.getUTCFullYear()}`;
  })();

  const item = perTanggal.get(pilih) ?? [];
  const dp = utc(pilih);
  const belum = baris.filter((b) => b.status === 'belum');

  return (
    <div className="rp-dua">
      <div className="rp-kartu rp-kal" style={{ flex: '3 1 420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 16, fontWeight: 700, textTransform: 'capitalize' }}>{judulBulan}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>
            {(['selesai', 'belum', 'berhalangan', 'hari_ini', 'terjadwal'] as StatusTampil[]).map((x) => (
              <span key={x} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span className="rp-dot" style={{ background: GAYA[x].dot, width: 7, height: 7 }} />
                {GAYA[x].l}
              </span>
            ))}
          </div>
        </div>
        <div className="rp-grid">
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((h) => (
            <div key={h} className="rp-grid-h">{h}</div>
          ))}
          {sel.map((t) => {
            const dalam = t >= start && t <= end;
            const isi = perTanggal.get(t) ?? [];
            const on = pilih === t;
            const d = utc(t);
            const adaBelum = isi.some((b) => b.status === 'belum');
            return (
              <button
                key={t}
                type="button"
                disabled={!dalam}
                onClick={() => setPilih(t)}
                aria-pressed={on}
                aria-label={`${HARI_PANJANG[d.getUTCDay()]} ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}, ${isi.length} pertemuan`}
                className="rp-sel"
                style={{
                  background: on ? 'var(--forest)' : dalam ? (adaBelum ? GAYA.belum.bg : 'var(--surface-2)') : 'transparent',
                  color: on ? '#fff' : dalam ? 'var(--ink)' : 'var(--muted-2)',
                  borderColor: t === hariIni ? 'var(--emas)' : on ? 'var(--forest)' : 'transparent',
                  cursor: dalam ? 'pointer' : 'default',
                }}
              >
                <span>
                  {d.getUTCDate()}
                  {d.getUTCDate() === 1 ? ` ${BULAN[d.getUTCMonth()]}` : ''}
                </span>
                <span style={{ display: 'flex', gap: 3, height: 6 }}>
                  {isi.slice(0, 4).map((b) => (
                    <span key={b.id} className="rp-dot" style={{ background: GAYA[b.status].dot }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="rp-redup">Tanggal di luar periode dibuat pudar.</div>
      </div>

      <div style={{ flex: '2 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="rp-kartu" style={{ overflow: 'hidden' }}>
          <div className="rp-hari-kepala">
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {HARI_PANJANG[dp.getUTCDay()]}, {dp.getUTCDate()} {BULAN[dp.getUTCMonth()]} {dp.getUTCFullYear()}
            </span>
            <span className="rp-redup" style={{ fontWeight: 600 }}>{relatif(pilih, hariIni)}</span>
          </div>
          {item.length === 0 ? (
            <div className="rp-redup" style={{ padding: '20px 16px', fontSize: 13 }}>Tidak ada pertemuan di tanggal ini.</div>
          ) : (
            item.map((b) => (
              <div key={b.id} className="rp-baris" style={{ padding: '12px 16px' }}>
                <span style={{ width: 4, height: 36, borderRadius: 2, background: b.warna, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{b.halaqahNama}</div>
                  <div className="rp-redup">
                    {b.urutan != null ? `Pertemuan ke-${b.urutan} · ` : ''}
                    {b.programNama}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <Lencana s={b.status} />
                  <span className="rp-redup" style={{ fontSize: 11 }}>{catatan(b, hariIni)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {belum.length > 0 && (
          <div className="rp-perhatian">
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--merah-ink)' }}>
              Perlu perhatian · {belum.length} pertemuan belum diinput
            </div>
            {belum.map((b) => {
              const d = utc(b.tanggal);
              return (
                <button key={b.id} type="button" onClick={() => setPilih(b.tanggal)}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{b.halaqahNama}</span>
                  <span className="rp-redup" style={{ whiteSpace: 'nowrap' }}>
                    {HARI[d.getUTCDay()]} {d.getUTCDate()} {BULAN[d.getUTCMonth()]} ›
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function RekapView({
  baris,
  hariIni,
  start,
  end,
  month,
  sinkron,
  adaData,
}: {
  baris: BarisPertemuan[];
  hariIni: string;
  start: string;
  end: string;
  month: string;
  sinkron: SinkronInfo;
  /** false = tampilkan hanya kartu sinkron + cara membaca (keadaan kosong ditangani halaman). */
  adaData: boolean;
}) {
  const [tampilan, setTampilan] = useState<'daftar' | 'kalender'>('daftar');
  useEffect(() => {
    try {
      const v = localStorage.getItem(KUNCI_TAMPILAN);
      if (v === 'daftar' || v === 'kalender') setTampilan(v);
    } catch {
      /* penyimpanan peramban tak tersedia — pakai bawaan */
    }
  }, []);
  function ganti(v: 'daftar' | 'kalender') {
    setTampilan(v);
    try {
      localStorage.setItem(KUNCI_TAMPILAN, v);
    } catch {
      /* abaikan */
    }
  }

  // Kalender: pilih hari ini bila dalam periode, kalau tidak tanggal pertama yang berisi.
  const pilihAwal =
    hariIni >= start && hariIni <= end ? hariIni : (baris[0]?.tanggal ?? start);

  const sakelar = (
    <div className="rp-saring rp-sakelar" role="tablist" aria-label="Pilih tampilan">
      {(['daftar', 'kalender'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={tampilan === v}
          className={tampilan === v ? 'on' : ''}
          onClick={() => ganti(v)}
        >
          {v === 'daftar' ? 'Daftar' : 'Kalender'}
        </button>
      ))}
    </div>
  );

  const samping = (
    <>
      <KartuSinkron sinkron={sinkron} month={month} />
      <CaraMembaca awalTerbuka={tampilan === 'kalender'} />
    </>
  );

  if (!adaData) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{samping}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{tampilan === 'daftar' ? 'Daftar pertemuan' : 'Kalender periode'}</div>
        {sakelar}
      </div>
      {tampilan === 'daftar' ? (
        <div className="rp-dua">
          <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>{samping}</div>
          <div style={{ flex: '2 1 440px', minWidth: 0 }}>
            <TampilanDaftar baris={baris} hariIni={hariIni} />
          </div>
        </div>
      ) : (
        <>
          <TampilanKalender baris={baris} hariIni={hariIni} start={start} end={end} pilihAwal={pilihAwal} />
          <div className="rp-dua">
            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <KartuSinkron sinkron={sinkron} month={month} />
            </div>
            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <CaraMembaca awalTerbuka />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
