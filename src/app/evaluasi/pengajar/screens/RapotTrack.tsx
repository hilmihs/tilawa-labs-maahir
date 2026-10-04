'use client';

// Rapot SATU TRACK (0062) — pengganti gabungan layar RapotBerkala + RapotUjian.
// Satu dokumen = satu track (QN atau PB): seluruh sesi evaluasi berkala track itu
// PLUS ujian akhir track itu. Nilai akhir 30% berkala + 70% ujian (atau 100% ujian
// pada batch `rapot_ujian_terpisah`), ambang lulus `payload.ambang` (70; 65 untuk terbitan 25 Sep – 1 Okt 2026).

import { useState } from 'react';
import { alasanBelumTerbit, type RapotPayloadTrack, type RapotUjianSnap } from '@/lib/rapot';
import {
  buildTrackGeometry,
  tierOf,
  SESI_BERKALA_PER_TRACK,
  TRACKS,
  vonisTrack,
  type Track,
} from '@/lib/evaluasi';
import { absUrl } from '@/lib/url';

interface Props {
  payload: RapotPayloadTrack;
  onBack: () => void;
  onTerbitkan: () => void;
  terbitStatus?: 'idle' | 'saving' | 'done' | 'error';
  /**
   * Token rapot yang baru terbit. WAJIB ditampilkan: tak ada daftar rapot terbit
   * di aplikasi ini, jadi kalau token cuma dibawa `window.open` yang diblokir
   * peramban, rapot yang sudah masuk DB tak bisa dibuka lagi.
   */
  terbitToken?: string | null;
  /** Pesan galat apa adanya dari server (mis. "Sesi evaluasi QN baru 2 dari 4"). */
  terbitPesan?: string | null;
  /** Cetak lembar A4 peserta ini tanpa menerbitkan rapot resmi. */
  onCetak?: () => void;
  /** Pindah dokumen QN ⇄ PB tanpa keluar layar. */
  onPilihTrack?: (t: Track) => void;
}

const HIJAU = 'oklch(0.40 0.10 150)';
const HIJAU_BTN = 'var(--accent)';
const BANNER_BG = 'oklch(0.96 0.035 150)';
const BANNER_BORDER = 'oklch(0.85 0.06 150)';
const MERAH = 'oklch(0.46 0.14 25)';
const MERAH_BG = 'oklch(0.96 0.03 25)';
const MERAH_BORDER = 'oklch(0.85 0.08 25)';
// Amber = QN di bawah standar: peringatan prasyarat, bukan vonis mengulang.
const AMBER = 'oklch(0.48 0.11 80)';
const AMBER_BG = 'oklch(0.96 0.05 85)';
const AMBER_BORDER = 'oklch(0.86 0.08 85)';
const JALIY_COLOR = 'oklch(0.46 0.14 25)';
const KHAFIY_COLOR = 'oklch(0.48 0.10 75)';

const KAP = { fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 } as const;

function shortOf(t: Track): string {
  return t === 'qn' ? 'QN' : 'PB';
}

function SnapCard({ snap, peran }: { snap: RapotUjianSnap; peran: RapotPayloadTrack['trackRapot']['peran'] }) {
  // Badge ujian ikut peran track: Ujian QN gagal = "di bawah standar", bukan mengulang.
  const vonis = vonisTrack(peran, snap.lulus);
  const gagal = vonis.nada === 'mengulang';
  const standar = vonis.nada === 'bawah_standar';
  const warna = gagal ? MERAH : standar ? AMBER : HIJAU;
  return (
    <div
      style={{
        background: gagal ? MERAH_BG : standar ? AMBER_BG : BANNER_BG,
        border: `1px solid ${gagal ? MERAH_BORDER : standar ? AMBER_BORDER : BANNER_BORDER}`,
        borderRadius: 12,
        padding: '11px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
          {snap.label} — {vonis.teks}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
          {snap.jaliy} jaliy · {snap.khafiy} khafiy
        </div>
      </div>
      <span
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: warna,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {snap.skor ?? '–'}
      </span>
    </div>
  );
}

/** Grafik tren 4 sesi berkala track ini (port dari layar RapotBerkala lama). */
function TrenSesi({ history, label, rata }: { history: (number | null)[]; label: string; rata: number | null }) {
  const geo = buildTrackGeometry(history);
  const x2 = geo.chartW - geo.padX;
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>Progres {label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: HIJAU }}>
          rata-rata {rata ?? '—'}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${geo.chartW} ${geo.chartH}`}
        style={{ width: '100%', height: 88, display: 'block', margin: '4px 0 2px' }}
      >
        <line
          x1={geo.padX}
          y1={geo.ambangY}
          x2={x2}
          y2={geo.ambangY}
          stroke="var(--line-2)"
          strokeWidth={1.5}
          strokeDasharray="3,3"
        />
        {geo.points && (
          <polyline
            points={geo.points}
            fill="none"
            stroke={HIJAU_BTN}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {geo.sessions.map((s, i) => {
          if (!s.filled) return null;
          const anchor = i === 0 ? 'start' : i === geo.sessions.length - 1 ? 'end' : 'middle';
          return (
            <g key={s.no}>
              <text
                x={s.cx}
                y={s.cy - 8}
                fontSize={10.5}
                fontWeight={700}
                fill={HIJAU}
                textAnchor={anchor}
                fontFamily="'IBM Plex Mono',monospace"
              >
                {s.score}
              </text>
              <circle cx={s.cx} cy={s.cy} r={5} fill={HIJAU} stroke="#ffffff" strokeWidth={1.5} />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px' }}>
        {geo.sessions.map((s) => (
          <span
            key={s.no}
            style={{ fontSize: 9, color: 'var(--muted-2)', fontWeight: 600, width: 30, textAlign: 'center' }}
          >
            S{s.no}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Tabel lahn sederhana (label · grup · jumlah) — dipakai akumulasi & rincian ujian. */
function LahnTable({ rows, kosong }: { rows: { key: string; label: string; group: 'jaliy' | 'khafiy'; count: number }[]; kosong: string }) {
  if (rows.length === 0) {
    return (
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: 'var(--muted-2)' }}>
        {kosong}
      </div>
    );
  }
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      {rows.map((r) => (
        <div
          key={r.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            padding: '7px 12px',
            borderBottom: '1px solid var(--bg)',
          }}
        >
          <span style={{ flex: 1, color: 'var(--ink-2)' }}>{r.label}</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: r.group === 'jaliy' ? JALIY_COLOR : KHAFIY_COLOR }}>
            {r.group === 'jaliy' ? 'Jaliy' : 'Khafiy'}
          </span>
          <span style={{ fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', minWidth: 18, textAlign: 'right' }}>
            {r.count}
          </span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '8px 12px', background: 'var(--surface-2)' }}>
        <span style={{ flex: 1, fontWeight: 800 }}>Total kesalahan</span>
        <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', minWidth: 18, textAlign: 'right' }}>{total}</span>
      </div>
    </div>
  );
}

export default function RapotTrack({
  payload,
  onBack,
  onTerbitkan,
  terbitStatus = 'idle',
  terbitToken = null,
  terbitPesan = null,
  onCetak,
  onPilihTrack,
}: Props) {
  const [tersalin, setTersalin] = useState(false);
  const { identitas: id, penerbit, ambang } = payload;
  const tr = payload.trackRapot;
  const short = shortOf(tr.track);
  const saving = terbitStatus === 'saving';

  const metaParts: string[] = [`Halaqah ${id.halaqah}`];
  if (id.level) metaParts.push(id.level);
  if (id.mustawa != null) metaParts.push(`Level ${id.mustawa}`);

  // ── Kelengkapan: fungsi yang SAMA dengan guard server
  // (/api/evaluasi/rapot/terbitkan) — lihat `alasanBelumTerbit` di lib/rapot.ts.
  const sesiTerisi = tr.berkala.history.filter((v) => v != null).length;
  const alasan = alasanBelumTerbit(tr);
  const bolehTerbit = alasan.length === 0;
  // `done` ikut mengunci tombol. Menerbitkan ulang mencetak token BARU dan
  // menandai yang lama 'digantikan' — lembar yang sudah dibagikan langsung tak
  // berlaku. Itu tak boleh terjadi hanya karena tombolnya ter-tap dua kali.
  const sudahTerbit = terbitStatus === 'done';
  const btnDisabled = saving || sudahTerbit || !bolehTerbit;
  const alasanTeks = alasan.join(' · ');

  // Tombol ini MENERBITKAN rapot resmi (ber-QR) lalu membukanya di tab baru —
  // bukan sekadar mengunduh. Cetak biasa punya tombolnya sendiri di sebelahnya.
  let btnLabel = 'Terbitkan';
  if (saving) btnLabel = 'Menerbitkan…';
  else if (terbitStatus === 'done') btnLabel = '✓ Terbit';
  else if (terbitStatus === 'error') btnLabel = 'Gagal · ulangi';

  // Vonis ikut peran track (QN gagal = DI BAWAH STANDAR, bukan MENGULANG).
  const vonis = vonisTrack(tr.peran, tr.nilaiAkhir == null ? null : tr.lulus, alasanTeks);
  const status = vonis.teks;
  const showNilai = tr.nilaiAkhir != null;
  const stColor =
    vonis.nada === 'lulus' ? HIJAU : vonis.nada === 'mengulang' ? MERAH : vonis.nada === 'bawah_standar' ? AMBER : 'var(--muted)';
  const stBg =
    vonis.nada === 'lulus' ? BANNER_BG : vonis.nada === 'mengulang' ? MERAH_BG : vonis.nada === 'bawah_standar' ? AMBER_BG : 'var(--bg)';
  const stBorder =
    vonis.nada === 'lulus' ? BANNER_BORDER : vonis.nada === 'mengulang' ? MERAH_BORDER : vonis.nada === 'bawah_standar' ? AMBER_BORDER : 'var(--line)';

  const berkalaAvg = tr.berkalaAvg ?? 0;
  const ujianSkor = tr.ujianSkor ?? 0;
  const rawFormula = (berkalaAvg * 0.3 + ujianSkor * 0.7).toFixed(1).replace('.', ',');

  const peranTeks =
    tr.peran === 'prasyarat'
      ? 'Prasyarat — kelulusan level ditentukan Rapot PB'
      : 'Penentu — rapot ini menentukan kelulusan level';

  const catatanSesi = tr.berkala.catatan;
  const predikatColor = tr.nilaiAkhir != null ? tierOf(tr.nilaiAkhir, ambang).color : 'var(--muted)';

  return (
    <>
      <div
        className="no-print"
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid var(--line)' }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)', background: '#ffffff', color: 'var(--ink-2)', fontSize: 15, cursor: 'pointer', flexShrink: 0 }}
        >
          ←
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0 }}>Rapot {short}</div>
        {onCetak && (
          <button
            type="button"
            onClick={onCetak}
            title="Cetak lembar A4 tanpa menerbitkan"
            style={{ height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--line-2)', background: '#ffffff', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            🖨 Cetak
          </button>
        )}
        <button
          type="button"
          onClick={onTerbitkan}
          disabled={btnDisabled}
          title={bolehTerbit ? `Terbitkan Rapot ${short}` : `Belum bisa diterbitkan — ${alasanTeks}`}
          className="ev-dark"
          style={{
            height: 36,
            padding: '0 14px',
            borderRadius: 8,
            border: 'none',
            background: btnDisabled ? '#c9c3b8' : HIJAU_BTN,
            font: 'inherit',
            fontSize: 12.5,
            fontWeight: 700,
            color: '#ffffff',
            cursor: btnDisabled ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {btnLabel}
        </button>
      </div>

      {/* Pilih dokumen: satu rapot per track. */}
      {onPilihTrack && (
        <div
          className="no-print"
          style={{ display: 'flex', gap: 6, padding: '10px 16px 0', background: 'var(--bg)' }}
        >
          {TRACKS.map((t) => {
            const aktif = t === tr.track;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onPilihTrack(t)}
                style={{
                  height: 30,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: `1.5px solid ${aktif ? HIJAU_BTN : 'var(--line)'}`,
                  background: aktif ? BANNER_BG : '#ffffff',
                  font: 'inherit',
                  fontSize: 12,
                  fontWeight: 700,
                  color: aktif ? HIJAU : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                Rapot {shortOf(t)}
              </button>
            );
          })}
        </div>
      )}

      {/* Kenapa tombol Terbitkan terkunci — sebutkan penyebabnya, jangan cuma abu-abu. */}
      {!bolehTerbit && !saving && (
        <div
          className="no-print"
          style={{
            margin: '12px 16px 0',
            background: MERAH_BG,
            border: `1px solid ${MERAH_BORDER}`,
            borderRadius: 10,
            padding: '9px 12px',
            fontSize: 11.5,
            fontWeight: 700,
            color: MERAH,
            lineHeight: 1.45,
          }}
        >
          Belum bisa diterbitkan — {alasanTeks}
        </div>
      )}

      {/* Sebab kegagalan apa adanya dari server, bukan "Gagal · ulangi". */}
      {terbitStatus === 'error' && terbitPesan && (
        <div
          className="no-print"
          style={{
            margin: '12px 16px 0',
            background: MERAH_BG,
            border: `1px solid ${MERAH_BORDER}`,
            borderRadius: 10,
            padding: '9px 12px',
            fontSize: 11.5,
            fontWeight: 700,
            color: MERAH,
            lineHeight: 1.45,
          }}
        >
          Gagal menerbitkan — {terbitPesan}
        </div>
      )}

      {/* Rapot sudah terbit: tampilkan tautannya. Ini satu-satunya tempat token
          itu muncul di aplikasi — tanpa panel ini, tab yang diblokir peramban
          berarti rapot yang sudah masuk DB tak bisa dibuka lagi. */}
      {terbitToken && (
        <div
          className="no-print"
          style={{
            margin: '12px 16px 0',
            background: BANNER_BG,
            border: `1px solid ${BANNER_BORDER}`,
            borderRadius: 10,
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: HIJAU, marginBottom: 3 }}>
            Rapot {short} terbit
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 10 }}>
            Simpan tautannya sekarang. Menerbitkan ulang akan membuat tautan ini
            tidak berlaku.
          </div>

          <div
            style={{
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: 'var(--ink-2)',
              background: '#ffffff',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '8px 10px',
              marginBottom: 10,
              overflowWrap: 'anywhere',
            }}
          >
            {absUrl(`/evaluasi/rapot/cek/${terbitToken}`)}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <a
              href={`/evaluasi/pengajar/rapot/${terbitToken}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: '1 1 140px',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                background: HIJAU_BTN,
                color: '#ffffff',
                font: 'inherit',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Buka &amp; cetak
            </a>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(absUrl(`/evaluasi/rapot/cek/${terbitToken}`))
                  .then(() => {
                    setTersalin(true);
                    setTimeout(() => setTersalin(false), 2000);
                  })
                  .catch(() => setTersalin(false));
              }}
              style={{
                flex: '1 1 120px',
                minHeight: 44,
                borderRadius: 8,
                border: '1px solid var(--line-2)',
                background: '#ffffff',
                font: 'inherit',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--ink-2)',
                cursor: 'pointer',
              }}
            >
              {tersalin ? 'Tersalin ✓' : 'Salin tautan'}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Rapot ${short} ${id.peserta} — Halaqah ${id.halaqah}. Cek keasliannya di ${absUrl(
                  `/evaluasi/rapot/cek/${terbitToken}`,
                )}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: '1 1 120px',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                border: 'none',
                background: 'oklch(0.58 0.12 155)',
                color: '#ffffff',
                font: 'inherit',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Kirim via WhatsApp
            </a>
          </div>
        </div>
      )}

      <div style={{ padding: 16 }}>
        <div
          style={{
            background: '#ffffff',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: '0 0 22px',
            boxShadow: '0 1px 2px rgba(20,18,14,0.04), 0 6px 24px -8px rgba(20,18,14,0.10)',
            overflow: 'hidden',
          }}
        >
          {/* Banner LULUS / MENGULANG */}
          <div style={{ background: stBg, borderBottom: `1px solid ${stBorder}`, padding: '20px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: stColor, opacity: 0.8 }}>
              Rapot Ujian {shortOf(tr.track)}
              {id.mustawa != null ? ` · Level ${id.mustawa}` : ''}
            </div>
            <div style={{ fontSize: showNilai ? 34 : 16, fontWeight: 800, letterSpacing: '0.06em', color: stColor, lineHeight: 1.2, marginTop: 6 }}>
              {status}
            </div>
            {showNilai && (
              <div style={{ fontSize: 12, color: stColor, opacity: 0.85, marginTop: 4 }}>
                Nilai akhir {tr.nilaiAkhir} · ambang lulus {ambang}
                {vonis.nada === 'bawah_standar' && ' · tetap melanjutkan ke level Perbaikan Bacaan (PB)'}
              </div>
            )}
          </div>

          {/* Identitas */}
          <div style={{ padding: '20px 18px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{id.peserta}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{metaParts.join(' · ')}</div>
            {id.batch && <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 3 }}>Batch {id.batch}</div>}
            <div style={{ fontSize: 10.5, color: 'var(--muted-2)', marginTop: 6, lineHeight: 1.45 }}>{peranTeks}</div>
          </div>

          {/* Donat nilai akhir + komponen 30/70 (atau 100% ujian) */}
          {showNilai && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '20px 18px' }}>
              <div
                style={{
                  position: 'relative',
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: `conic-gradient(${stColor} ${tr.nilaiAkhir}%, var(--line) 0)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: stColor, fontVariantNumeric: 'tabular-nums' }}>
                    {tr.nilaiAkhir}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted-2)', marginTop: 2 }}>/ 100</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={KAP}>Nilai akhir</div>
                {tr.ujianSaja ? (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                        <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Ujian {short}</span>
                        <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{tr.ujianSkor ?? '–'}</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${ujianSkor}%`, background: HIJAU_BTN }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted-2)', lineHeight: 1.4 }}>
                      Nilai akhir 100% dari Ujian {short}.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                        <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Berkala {short} · bobot 30%</span>
                        <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{tr.berkalaAvg ?? '–'}</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${berkalaAvg}%`, background: 'oklch(0.72 0.07 210)' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                        <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>Ujian {short} · bobot 70%</span>
                        <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{tr.ujianSkor ?? '–'}</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${ujianSkor}%`, background: HIJAU_BTN }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted-2)', lineHeight: 1.4 }}>
                      ({tr.berkalaAvg ?? '–'} × 0,3) + ({tr.ujianSkor ?? '–'} × 0,7) = {rawFormula} → {tr.nilaiAkhir}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div style={{ padding: showNilai ? '0 18px' : '20px 18px 0' }}>
            {/* Predikat */}
            {showNilai && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: 9,
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  marginBottom: 18,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 800, color: predikatColor, letterSpacing: '0.04em' }}>
                  PREDIKAT: {(tr.nilaiAkhir != null ? tierOf(tr.nilaiAkhir, ambang).label : tr.predikat).toUpperCase()}
                </span>
              </div>
            )}

            {/* Tren sesi berkala — tidak ada di mode ujianSaja (batch tanpa sesi berkala) */}
            {!tr.ujianSaja && (
              <>
                <div style={KAP}>Evaluasi berkala {short}</div>
                <div style={{ marginBottom: 8 }}>
                  <TrenSesi history={tr.berkala.history} label={tr.label} rata={tr.berkalaAvg} />
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--muted-2)', marginBottom: 18, lineHeight: 1.45 }}>
                  {sesiTerisi} dari {SESI_BERKALA_PER_TRACK} sesi dinilai. Rata-ratanya menyumbang 30% nilai akhir.
                </div>
              </>
            )}

            {/* Ujian track ini */}
            <div style={KAP}>Ujian {short}</div>
            <div style={{ marginBottom: 8 }}>
              {tr.ujian ? (
                <SnapCard snap={tr.ujian} peran={tr.peran} />
              ) : (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 12px', fontSize: 12, color: 'var(--muted-2)' }}>
                  Belum ada Ujian {short}
                </div>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--muted-2)', marginBottom: 18, lineHeight: 1.45 }}>
              {tr.ujianSaja ? (
                <>Nilai akhir 100% dari <b>Ujian {short}</b>. Ambang lulus {ambang}.</>
              ) : (
                <>Skor <b>Ujian {short}</b> menyumbang 70% nilai akhir. Ambang lulus {ambang}.</>
              )}
            </div>

            {/* Rincian kesalahan pada ujian */}
            <div style={KAP}>Rincian kesalahan Ujian {short}</div>
            <div style={{ marginBottom: 18 }}>
              <LahnTable rows={tr.rincianUjian} kosong="Tanpa kesalahan tercatat" />
            </div>

            {/* Akumulasi kesalahan sesi berkala */}
            {!tr.ujianSaja && (
              <>
                <div style={KAP}>Akumulasi kesalahan sesi {short}</div>
                <div style={{ marginBottom: 18 }}>
                  <LahnTable rows={tr.akumulasi} kosong="Belum ada kesalahan tercatat" />
                </div>
              </>
            )}

            {/* Catatan pengajar tiap sesi */}
            {catatanSesi.length > 0 && (
              <>
                <div style={KAP}>Catatan pengajar tiap sesi</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                  {catatanSesi.map((c, i) => (
                    <div
                      key={`${c.label}-${i}`}
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 11px' }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-2)', marginBottom: 2 }}>{c.label}</div>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink-2)' }}>{c.teks}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Catatan penguji */}
            <div style={{ ...KAP, marginBottom: 6 }}>Catatan penguji</div>
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                color: 'var(--ink-2)',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 18,
                textWrap: 'pretty',
                // Samakan dengan lembar A4-nya: baris dan jeda paragraf yang
                // diketik penguji dipertahankan, tidak diruntuhkan jadi satu blok.
                whiteSpace: 'pre-wrap',
              }}
            >
              {tr.catatanPenguji || '—'}
            </div>

            {/* Tanda tangan — penguji saja; kolom koordinator sudah dihapus,
                sejalan dengan lembar A4-nya. */}
            <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <div style={{ textAlign: 'center', maxWidth: 200, margin: '0 auto' }}>
                <div style={{ height: 36 }} />
                <div style={{ fontSize: 10, color: 'var(--muted-2)', borderTop: '1px solid var(--line-2)', paddingTop: 4 }}>
                  {penerbit}
                  <br />
                  Pengajar / Penguji
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ height: 16 }} />
    </>
  );
}
