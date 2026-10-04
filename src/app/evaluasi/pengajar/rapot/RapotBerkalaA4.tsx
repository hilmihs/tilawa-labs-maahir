import type { ReactElement } from 'react';
import type { RapotPayloadLegacy, RapotTrackSnap } from '@/lib/rapot';
import { tierOf } from '@/lib/evaluasi';
import RapotKop from './RapotKop';

// Rapot Evaluasi Berkala — halaman cetak A4 (794×1123px), presentasional murni.
// Sumber data: payload.berkala & payload.identitas. Tanpa 'use client', tanpa hooks.

interface Props {
  payload: RapotPayloadLegacy;
  /** QR verifikasi. Kosong = rapot belum diterbitkan (pratinjau/cetak dari aplikasi). */
  qr?: string;
  logoSrc: string;
}

const GREEN_DARK = 'oklch(0.40 0.10 150)';
const MUTED = '#7a766f';
const INK = '#1b1a17';
const BORDER = '#e8e4dc';
const BORDER_STRONG = '#d8d3c8';
const CARD_BG = '#faf8f4';
const HEAD_BG = '#efece5';

// Tanggal terbit SELALU dibaca sebagai waktu Jakarta. `payload.tanggal` adalah
// ISO UTC, dan `getDate()` memakai zona waktu mesin yang merender — VPS produksi
// berjalan UTC, jadi rapot yang terbit sebelum pukul 07.00 WIB mencetak tanggal
// KEMARIN, sementara halaman verifikasinya sendiri (yang memang memaksa
// Asia/Jakarta) menampilkan tanggal hari ini. Dokumen jadi membantah QR-nya.
function fmtTanggal(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

function num(v: number | null): string {
  return v == null ? '—' : String(v);
}

function TrackTable({ track }: { track: RapotTrackSnap }): ReactElement {
  const accent = track.jenis === 'qn' ? 'oklch(0.46 0.09 165)' : 'oklch(0.44 0.10 210)';
  const cols = '1fr 64px';
  return (
    <div style={{ border: `1px solid ${BORDER_STRONG}`, borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          padding: '5px 10px',
          background: CARD_BG,
          borderBottom: `1px solid ${BORDER_STRONG}`,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: accent,
        }}
      >
        {track.label}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          alignItems: 'center',
          background: HEAD_BG,
          borderBottom: `1px solid ${BORDER_STRONG}`,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          color: '#44423d',
        }}
      >
        <div style={{ padding: '6px 0 6px 10px' }}>Sesi</div>
        <div style={{ padding: '6px 10px 6px 0', textAlign: 'center' }}>Skor</div>
      </div>
      {track.history.map((skor, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: cols,
            alignItems: 'center',
            fontSize: 11.5,
            borderBottom: '1px solid #f4f2ed',
          }}
        >
          <div style={{ padding: '5px 0 5px 10px', fontWeight: 700 }}>S{i + 1}</div>
          <div
            style={{
              padding: '5px 10px 5px 0',
              textAlign: 'center',
              fontWeight: 800,
              color: skor == null ? '#a8a39a' : INK,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {num(skor)}
          </div>
        </div>
      ))}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          alignItems: 'center',
          fontSize: 11.5,
          background: HEAD_BG,
        }}
      >
        <div style={{ padding: '6px 0 6px 10px', fontWeight: 800 }}>Rata-rata</div>
        <div
          style={{
            padding: '6px 10px 6px 0',
            textAlign: 'center',
            fontWeight: 800,
            color: GREEN_DARK,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {num(track.rata)}
        </div>
      </div>
    </div>
  );
}

function IdentRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #efece5' }}>
      <span style={{ width: 96, fontSize: 11, color: MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

export default function RapotBerkalaA4({ payload, qr, logoSrc }: Props): ReactElement {
  const { identitas, berkala } = payload;
  const b = berkala;

  const halaqahVal = [identitas.halaqah, identitas.gender].filter(Boolean).join(' · ');
  const levelVal =
    identitas.level ?? (identitas.mustawa != null ? String(identitas.mustawa) : '—');
  const batchVal = identitas.batch ?? '—';

  const rataGabungan = b?.rataGabungan ?? null;
  const predikat = b?.predikat ?? '—';
  const predColor = rataGabungan == null ? MUTED : tierOf(rataGabungan, payload.ambang).color;

  return (
    <div
      className="a4-sheet"
      style={{
        width: 794,
        minHeight: 1123,
        background: '#ffffff',
        color: INK,
        padding: '32px 48px 12px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
      }}
    >
      <RapotKop
        identitas={identitas}
        logoSrc={logoSrc}
        sub={batchVal !== '—' ? `Batch ${batchVal}` : undefined}
        pageLabel="Rapot Berkala"
      />

      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.06em' }}>
          RAPOT EVALUASI BERKALA
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
          {batchVal !== '—' ? `Batch ${batchVal} · ` : ''}4 sesi Evaluasi QN &amp; 4 sesi Evaluasi PB
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0 32px',
          padding: '11px 16px',
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <IdentRow label="Nama peserta" value={identitas.peserta} />
        <IdentRow label="Halaqah" value={halaqahVal || '—'} />
        <IdentRow label="Level" value={levelVal} />
        <IdentRow label="Batch" value={batchVal} />
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: MUTED,
          marginBottom: 8,
        }}
      >
        A. Nilai tiap sesi
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 8 }}>
        {(b?.tracks ?? []).map((t) => (
          <TrackTable key={t.jenis} track={t} />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          border: `1px solid ${BORDER_STRONG}`,
          borderRadius: 8,
          background: HEAD_BG,
          padding: '6px 14px',
          marginBottom: 5,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 800 }}>Rata-rata keseluruhan</span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: GREEN_DARK,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {num(rataGabungan)}
        </span>
        <span
          style={{
            padding: '3px 10px',
            borderRadius: 999,
            background: 'oklch(0.96 0.035 150)',
            border: '1px solid oklch(0.85 0.06 150)',
            fontSize: 10.5,
            fontWeight: 800,
            color: predColor,
            textTransform: 'uppercase',
          }}
        >
          {predikat}
        </span>
      </div>
      <div style={{ fontSize: 9.5, color: '#a8a39a', marginBottom: 'auto' }}>
        J = Lahn Jaliy (−6/kesalahan) · K = Lahn Khafiy (−2/kesalahan) · Skor = 100 − 6J − 2K ·
        ambang standar 70. Predikat: Mumtaz ≥ 90 · Standar ≥ 70 · Di bawah standar ≥ 50 · Perlu pengulangan
        &lt; 50. Rata-rata keseluruhan = rata semua sesi dinilai (dibobot jumlah sesi, bukan per-track).
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 20,
          marginTop: 18,
        }}
      >
        {qr ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} width={64} height={64} alt="QR verifikasi rapot" style={{ display: 'block' }} />
            <div style={{ fontSize: 8.5, color: '#a8a39a' }}>Cek keaslian rapot</div>
          </div>
        ) : (
          <div style={{ fontSize: 8.5, color: '#a8a39a', maxWidth: 190, lineHeight: 1.5 }}>
            Cetakan pratinjau — rapot belum diterbitkan, jadi belum ada QR verifikasi.
          </div>
        )}
        {/* Kolom tanda tangan koordinator dihapus — tak pernah diisi. */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>
            {fmtTanggal(payload.tanggal)}
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>Pengajar Halaqah</div>
          <div style={{ height: 34 }} />
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              borderTop: `1px solid ${INK}`,
              paddingTop: 4,
              minWidth: 150,
            }}
          >
            {payload.penerbit}
          </div>
        </div>
      </div>
    </div>
  );
}
