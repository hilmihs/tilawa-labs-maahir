import type { RapotPayloadLegacy, RapotUjianSnap } from '@/lib/rapot';
import { fokusUjian } from '@/lib/rapot';
import { tierOf } from '@/lib/evaluasi';
import RapotKop from './RapotKop';

// Presentasional murni (tanpa hooks) — cetak A4 Rapot Ujian Akhir, 2 halaman @794px.
// Hal 1: status kelulusan, komponen nilai akhir, hasil ujian, QR, tanda tangan.
// Hal 2: rincian kesalahan QN vs PB + catatan penguji.
//
// Dua varian, dipilih dari payload.jenis_rapot:
// - 'ujian'                → gabungan; nilai akhir 30% berkala + 70% Ujian PB.
// - 'ujian_qn' / 'ujian_pb' → batch `rapot_ujian_terpisah` (0058); satu ujian saja,
//   nilai akhir = skor ujian itu. Tabel komponen nilai akhir dibuang dan ujian
//   satunya TIDAK disinggung di mana pun.

interface Props {
  payload: RapotPayloadLegacy;
  /** QR verifikasi. Kosong = rapot belum diterbitkan (pratinjau/cetak dari aplikasi). */
  qr?: string;
  logoSrc: string;
}

const GREEN = 'oklch(0.40 0.10 150)';
const RED = 'oklch(0.46 0.14 25)';

const PAGE: React.CSSProperties = {
  width: 794,
  minHeight: 1123,
  background: '#ffffff',
  padding: '32px 48px 16px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  color: '#1b1a17',
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#7a766f',
  marginBottom: 8,
};

function fmtTgl(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function num1(n: number): string {
  // satu desimal, koma sebagai pemisah (gaya id-ID)
  return n.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function nilaiOf(n: number | null): string {
  return n == null ? '—' : String(n);
}

// Sel angka kesalahan pada tabel rincian: '—' bila ujian tak ada, '–' bila 0/null.
function rincianCell(v: number | null, snapNull: boolean): string {
  if (snapNull) return '—';
  if (!v) return '–';
  return String(v);
}

export default function RapotUjianA4({ payload, qr, logoSrc }: Props) {
  const { identitas } = payload;
  const uj = payload.ujian;
  const id = identitas;
  // Rapot per-ujian (batch Januari): fokus 'qn' | 'pb'. null = rapot gabungan.
  const fokus = fokusUjian(payload.jenis_rapot);
  const tunggal = fokus != null;
  const ujianLabel = fokus === 'qn' ? 'Ujian QN' : 'Ujian PB';
  const judul = tunggal ? `RAPOT ${ujianLabel.toUpperCase()} AKHIR LEVEL` : 'RAPOT UJIAN AKHIR LEVEL';
  const lampiran = `Lampiran ${tunggal ? `rapot ${ujianLabel.toLowerCase()}` : 'rapot ujian akhir'} · ${id.peserta} · Halaqah ${id.halaqah} · halaman 2 dari 2`;

  if (!uj) {
    return (
      <div className="a4-stack">
        <div className="a4-sheet" style={PAGE}>
          <RapotKop identitas={identitas} logoSrc={logoSrc} />
          <div style={{ fontSize: 13, color: '#7a766f' }}>Data ujian tidak tersedia.</div>
        </div>
      </div>
    );
  }

  const lulus = uj.lulus === true;
  const statusColor = lulus ? GREEN : RED;
  const statusText = lulus ? 'LULUS' : 'MENGULANG';
  const statusKet = lulus
    ? 'Memenuhi ambang kelulusan nilai akhir (70).'
    : 'Belum memenuhi ambang kelulusan nilai akhir (70).';

  const berkalaAvg = uj.berkalaAvg;
  const pbSkor = uj.ujianPbSkor;
  const kontribBerkala = berkalaAvg == null ? null : 0.3 * berkalaAvg;
  const kontribPb = pbSkor == null ? null : 0.7 * pbSkor;
  const rawAkhir = berkalaAvg == null || pbSkor == null ? null : 0.3 * berkalaAvg + 0.7 * pbSkor;
  const predikat = uj.nilaiAkhir == null ? '—' : `PREDIKAT ${tierOf(uj.nilaiAkhir, payload.ambang).label.toUpperCase()}`;

  const CELL_BORDER = '1px solid #e8e4dc';
  const HEAD: React.CSSProperties = {
    background: '#efece5',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#44423d',
  };

  const idRows: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Nama peserta', value: id.peserta, strong: true },
    { label: 'Halaqah', value: `${id.halaqah}${id.gender ? ` · ${id.gender}` : ''}${id.level ? ` · Level ${id.level}` : ''}` },
    { label: 'Penguji', value: payload.penerbit },
    { label: 'Level', value: id.level ?? '—' },
  ];

  // Tabel hasil ujian (QN & PB)
  const ujiRow = (snap: RapotUjianSnap | null, jenisLabel: string) => {
    const gridCols = '1fr 78px 78px 66px 150px';
    if (!snap) {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', fontSize: 12, borderBottom: '1px solid #e8e4dc' }}>
          <div style={{ padding: '9px 14px', borderRight: CELL_BORDER, fontWeight: 700 }}>{jenisLabel}</div>
          <div style={{ padding: '9px 8px', borderRight: CELL_BORDER, textAlign: 'center', color: '#a8a39a' }}>—</div>
          <div style={{ padding: '9px 8px', borderRight: CELL_BORDER, textAlign: 'center', color: '#a8a39a' }}>—</div>
          <div style={{ padding: '9px 8px', borderRight: CELL_BORDER, textAlign: 'center', color: '#a8a39a' }}>—</div>
          <div style={{ padding: '9px 14px', color: '#a8a39a' }}>—</div>
        </div>
      );
    }
    const rowLulus = snap.lulus === true;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', fontSize: 12, borderBottom: '1px solid #e8e4dc' }}>
        <div style={{ padding: '9px 14px', borderRight: CELL_BORDER, fontWeight: 700 }}>{jenisLabel}</div>
        <div style={{ padding: '9px 8px', borderRight: CELL_BORDER, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{snap.jaliy}</div>
        <div style={{ padding: '9px 8px', borderRight: CELL_BORDER, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{snap.khafiy}</div>
        <div style={{ padding: '9px 8px', borderRight: CELL_BORDER, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{nilaiOf(snap.skor)}</div>
        <div style={{ padding: '9px 14px', fontWeight: 700, color: rowLulus ? GREEN : RED }}>{rowLulus ? 'Lulus' : 'Mengulang'}</div>
      </div>
    );
  };

  // Total kolom rincian
  const totalQn = uj.qn ? uj.rincian.reduce((a, r) => a + (r.qn ?? 0), 0) : null;
  const totalPb = uj.pb ? uj.rincian.reduce((a, r) => a + (r.pb ?? 0), 0) : null;
  const rincGrid = tunggal ? '1fr 96px 120px' : '1fr 96px 96px 96px';

  return (
    <div className="a4-stack">
      {/* ============ HALAMAN 1 ============ */}
      <div className="a4-sheet" style={PAGE}>
        <RapotKop identitas={identitas} logoSrc={logoSrc} pageLabel="Halaman 1 dari 2" />

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.06em' }}>{judul}</div>
          <div style={{ fontSize: 12, color: '#7a766f', marginTop: 4 }}>
            {tunggal
              ? `Sekaligus surat keterangan hasil ${ujianLabel.toLowerCase()}`
              : 'Sekaligus surat keterangan hasil ujian akhir'}
          </div>
        </div>

        {/* Status kelulusan + nilai akhir */}
        <div style={{ display: 'flex', alignItems: 'stretch', border: `2px solid ${statusColor}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ flex: 1, background: lulus ? 'oklch(0.96 0.035 150)' : 'oklch(0.96 0.03 25)', padding: '16px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: statusColor, opacity: 0.8 }}>Dinyatakan</div>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '0.05em', lineHeight: 1.05, color: statusColor, marginTop: 4 }}>{statusText}</div>
            <div style={{ fontSize: 12, color: statusColor, opacity: 0.85, marginTop: 6, textWrap: 'pretty' }}>{statusKet}</div>
          </div>
          <div style={{ width: 210, background: '#ffffff', borderLeft: `2px solid ${statusColor}`, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7a766f' }}>Nilai akhir</div>
            <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>{nilaiOf(uj.nilaiAkhir)}</div>
            <div style={{ fontSize: 11, color: '#a8a39a', fontWeight: 600 }}>dari 100</div>
            <div style={{ marginTop: 8, padding: '5px 12px', borderRadius: 999, background: lulus ? 'oklch(0.96 0.035 150)' : 'oklch(0.96 0.03 25)', border: `1px solid ${statusColor}`, fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', color: statusColor, letterSpacing: '0.04em' }}>{predikat}</div>
          </div>
        </div>

        {/* Identitas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px', padding: '11px 16px', background: '#faf8f4', border: '1px solid #e8e4dc', borderRadius: 10, marginBottom: 18 }}>
          {idRows.map((r, i) => (
            <div key={r.label} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: i < 2 ? '1px solid #efece5' : undefined }}>
              <span style={{ width: 96, fontSize: 11, color: '#7a766f', flexShrink: 0 }}>{r.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: r.strong ? 700 : 600 }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* A. Komponen nilai akhir — hanya rapot gabungan. Pada rapot per-ujian
            nilai akhir = skor ujian itu sendiri, jadi tabel bobot tak ada gunanya. */}
        {!tunggal && (
          <>
        <div style={SECTION_LABEL}>A. Komponen nilai akhir</div>
        <div style={{ border: '1px solid #d8d3c8', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px 120px', alignItems: 'center', ...HEAD }}>
            <div style={{ padding: '9px 14px', borderRight: '1px solid #d8d3c8' }}>Komponen</div>
            <div style={{ padding: '9px 8px', borderRight: '1px solid #d8d3c8', textAlign: 'center' }}>Nilai</div>
            <div style={{ padding: '9px 8px', borderRight: '1px solid #d8d3c8', textAlign: 'center' }}>Bobot</div>
            <div style={{ padding: '9px 8px', textAlign: 'center' }}>Kontribusi</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px 120px', alignItems: 'center', fontSize: 12, borderBottom: '1px solid #e8e4dc' }}>
            <div style={{ padding: '9px 14px', borderRight: CELL_BORDER }}>
              Evaluasi Berkala
              <div style={{ fontSize: 10, color: '#7a766f', marginTop: 1 }}>Rata-rata semua sesi QN &amp; PB</div>
            </div>
            <div style={{ padding: '9px 8px', borderRight: CELL_BORDER, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{nilaiOf(berkalaAvg)}</div>
            <div style={{ padding: '9px 8px', borderRight: CELL_BORDER, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>30%</div>
            <div style={{ padding: '9px 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{kontribBerkala == null ? '—' : num1(kontribBerkala)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px 120px', alignItems: 'center', fontSize: 12, borderBottom: '1px solid #d8d3c8' }}>
            <div style={{ padding: '9px 14px', borderRight: CELL_BORDER }}>
              Ujian Akhir
              <div style={{ fontSize: 10, color: '#7a766f', marginTop: 1 }}>Skor Ujian PB saja — Ujian QN tidak dihitung</div>
            </div>
            <div style={{ padding: '9px 8px', borderRight: CELL_BORDER, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{nilaiOf(pbSkor)}</div>
            <div style={{ padding: '9px 8px', borderRight: CELL_BORDER, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>70%</div>
            <div style={{ padding: '9px 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{kontribPb == null ? '—' : num1(kontribPb)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 100px 120px', alignItems: 'center', fontSize: 12, background: '#efece5' }}>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #d8d3c8', fontWeight: 800 }}>Nilai akhir</div>
            <div style={{ padding: '10px 8px', borderRight: '1px solid #d8d3c8' }}></div>
            <div style={{ padding: '10px 8px', borderRight: '1px solid #d8d3c8', textAlign: 'center', fontWeight: 700 }}>100%</div>
            <div style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
              {rawAkhir == null ? '—' : `${num1(rawAkhir)} → ${nilaiOf(uj.nilaiAkhir)}`}
            </div>
          </div>
        </div>
          </>
        )}

        {/* Nilai ujian — gabungan menampilkan QN & PB, per-ujian hanya fokusnya. */}
        <div style={SECTION_LABEL}>{tunggal ? `A. Nilai ${ujianLabel.toLowerCase()}` : 'B. Nilai ujian akhir'}</div>
        <div style={{ border: '1px solid #d8d3c8', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 78px 78px 66px 150px', alignItems: 'center', ...HEAD }}>
            <div style={{ padding: '9px 14px', borderRight: '1px solid #d8d3c8' }}>Jenis ujian</div>
            <div style={{ padding: '9px 8px', borderRight: '1px solid #d8d3c8', textAlign: 'center' }}>Jaliy</div>
            <div style={{ padding: '9px 8px', borderRight: '1px solid #d8d3c8', textAlign: 'center' }}>Khafiy</div>
            <div style={{ padding: '9px 8px', borderRight: '1px solid #d8d3c8', textAlign: 'center' }}>Skor</div>
            <div style={{ padding: '9px 14px' }}>Hasil</div>
          </div>
          {(!tunggal || fokus === 'qn') && ujiRow(uj.qn, 'Ujian QN')}
          {(!tunggal || fokus === 'pb') && ujiRow(uj.pb, 'Ujian PB')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 78px 78px 66px 150px', alignItems: 'center', fontSize: 12, background: '#efece5' }}>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #d8d3c8', gridColumn: '1 / span 3', fontWeight: 800 }}>
              {tunggal ? `Nilai akhir · ${ujianLabel}` : 'Dipakai untuk nilai akhir · Ujian PB'}
            </div>
            <div style={{ padding: '10px 8px', borderRight: '1px solid #d8d3c8', textAlign: 'center', fontWeight: 800, fontSize: 14, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
              {nilaiOf(tunggal ? uj.nilaiAkhir : pbSkor)}
            </div>
            <div style={{ padding: '10px 14px', fontWeight: 800, color: statusColor }}>{statusText}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#a8a39a' }}>
          Skor = 100 − (Lahn Jaliy × 6) − (Lahn Khafiy × 2).{' '}
          {tunggal
            ? `Nilai akhir = skor ${ujianLabel} (ambang lulus 70).`
            : 'Nilai akhir = 30% Evaluasi Berkala + 70% Ujian PB (ambang lulus nilai akhir 70).'}
        </div>

        {/* QR + tanda tangan */}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, paddingTop: 24 }}>
          {qr ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR verifikasi rapot" style={{ width: 62, height: 62, display: 'block' }} />
              <div style={{ fontSize: 8.5, color: '#a8a39a' }}>Cek keaslian rapot</div>
            </div>
          ) : (
            <div style={{ fontSize: 8.5, color: '#a8a39a', maxWidth: 190, lineHeight: 1.5 }}>
              Cetakan pratinjau — rapot belum diterbitkan, jadi belum ada QR verifikasi.
            </div>
          )}
          {/* Kolom tanda tangan koordinator dihapus — tak pernah diisi. */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#7a766f', marginBottom: 2 }}>{fmtTgl(payload.tanggal)}</div>
            <div style={{ fontSize: 11, color: '#7a766f' }}>Penguji</div>
            <div style={{ height: 34 }}></div>
            <div style={{ fontSize: 12, fontWeight: 700, borderTop: '1px solid #1b1a17', paddingTop: 4, minWidth: 150 }}>{payload.penerbit}</div>
          </div>
        </div>
      </div>

      {/* ============ HALAMAN 2 ============ */}
      {/* `a4-sheet-akhir`: lembar penutup boleh tumbuh melewati 296mm. Catatan
          penguji di sini teks bebas — kalau ia kepanjangan, biarkan dokumen
          bertambah halaman, jangan sampai QR dan tanda tangannya yang hilang. */}
      <div
        className="a4-sheet a4-sheet-akhir"
        style={{ ...PAGE, pageBreakBefore: 'always', breakBefore: 'page' }}
      >
        <RapotKop identitas={identitas} logoSrc={logoSrc} sub={lampiran} pageLabel="Halaman 2 dari 2" />

        {/* Rincian kesalahan — gabungan: dua kolom (QN & PB); per-ujian: satu kolom. */}
        <div style={SECTION_LABEL}>
          {tunggal ? `B. Rincian kesalahan ${ujianLabel.toLowerCase()}` : 'C. Rincian kesalahan tiap ujian'}
        </div>
        <div style={{ border: '1px solid #d8d3c8', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: rincGrid, alignItems: 'center', ...HEAD }}>
            <div style={{ padding: '9px 14px', borderRight: '1px solid #d8d3c8' }}>Jenis kesalahan</div>
            <div style={{ padding: '9px 8px', borderRight: '1px solid #d8d3c8' }}>Kelompok</div>
            {(!tunggal || fokus === 'qn') && (
              <div style={{ padding: '9px 8px', borderRight: tunggal ? undefined : '1px solid #d8d3c8', textAlign: 'center' }}>Ujian QN</div>
            )}
            {(!tunggal || fokus === 'pb') && (
              <div style={{ padding: '9px 8px', textAlign: 'center' }}>Ujian PB</div>
            )}
          </div>
          {uj.rincian.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: '#a8a39a' }}>Tidak ada kesalahan tercatat.</div>
          ) : (
            uj.rincian.map((r) => {
              const isJaliy = r.group === 'jaliy';
              return (
                <div key={r.key} style={{ display: 'grid', gridTemplateColumns: rincGrid, alignItems: 'center', fontSize: 12, borderBottom: '1px solid #f4f2ed' }}>
                  <div style={{ padding: '8px 14px', borderRight: '1px solid #f4f2ed', color: '#44423d' }}>{r.label}</div>
                  <div style={{ padding: '8px 8px', borderRight: '1px solid #f4f2ed', fontSize: 10, fontWeight: 700, color: isJaliy ? 'oklch(0.46 0.14 25)' : 'oklch(0.48 0.10 75)' }}>{isJaliy ? 'Jaliy' : 'Khafiy'}</div>
                  {(!tunggal || fokus === 'qn') && (
                    <div style={{ padding: '8px 8px', borderRight: tunggal ? undefined : '1px solid #f4f2ed', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{rincianCell(r.qn, uj.qn == null)}</div>
                  )}
                  {(!tunggal || fokus === 'pb') && (
                    <div style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{rincianCell(r.pb, uj.pb == null)}</div>
                  )}
                </div>
              );
            })
          )}
          <div style={{ display: 'grid', gridTemplateColumns: rincGrid, alignItems: 'center', fontSize: 12, background: '#efece5' }}>
            <div style={{ padding: '10px 14px', borderRight: '1px solid #d8d3c8', fontWeight: 800 }}>Total</div>
            <div style={{ padding: '10px 8px', borderRight: '1px solid #d8d3c8' }}></div>
            {(!tunggal || fokus === 'qn') && (
              <div style={{ padding: '10px 8px', borderRight: tunggal ? undefined : '1px solid #d8d3c8', textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{totalQn == null ? '—' : totalQn}</div>
            )}
            {(!tunggal || fokus === 'pb') && (
              <div style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{totalPb == null ? '—' : totalPb}</div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#a8a39a', marginBottom: 20 }}>
          Lahn Jaliy dihitung −6 poin per kesalahan, Lahn Khafiy −2 poin per kesalahan.
        </div>

        {/* Catatan penguji */}
        <div style={SECTION_LABEL}>{tunggal ? 'C. Catatan penguji' : 'D. Catatan penguji'}</div>
        {/* whiteSpace pre-wrap: penguji mengetik catatannya berbaris-baris, dengan
            baris kosong sebagai jeda paragraf dan spasi awal untuk kutipan hadits.
            Tanpa ini HTML meruntuhkan semuanya jadi satu blok padat yang berat
            dibaca — persis keluhan yang memunculkan perubahan ini. */}
        <div style={{ border: '1px solid #e8e4dc', borderRadius: 8, padding: '13px 16px', background: '#faf8f4', fontSize: 12.5, lineHeight: 1.65, color: '#44423d', textWrap: 'pretty', whiteSpace: 'pre-wrap' }}>
          {uj.catatanPenguji.trim() || 'Tidak ada catatan penguji.'}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          <div style={{ fontSize: 9.5, color: '#a8a39a' }}>Halaman 2 dari 2 — lampiran rapot ujian akhir.</div>
        </div>
      </div>
    </div>
  );
}
