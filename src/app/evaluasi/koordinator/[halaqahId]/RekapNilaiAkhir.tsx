import { AMBANG_LULUS_AKHIR, initials, type NilaiAkhirTrack } from '@/lib/evaluasi';

// Palet (selaras dgn modul Evaluasi Halaqah)
const HIJAU_TXT = 'oklch(0.40 0.10 150)';
const HIJAU_BG = 'oklch(0.96 0.035 150)';
const HIJAU_BORDER = 'oklch(0.85 0.06 150)';
const MERAH_TXT = 'oklch(0.46 0.14 25)';
const MERAH_BG = 'oklch(0.96 0.03 25)';
const MERAH_BORDER = 'oklch(0.86 0.07 25)';
const MERAH_ROW = 'oklch(0.985 0.012 25)';
// Amber = prasyarat belum tuntas. Sengaja BUKAN merah: nilai QN rendah tidak
// menggugurkan kelulusan, jadi ia tidak boleh terbaca sebagai status gagal.
const AMBER_TXT = 'oklch(0.48 0.11 80)';
const AMBER_BG = 'oklch(0.96 0.05 85)';
const AMBER_BORDER = 'oklch(0.86 0.08 85)';
const AMBER_TXT_REDUP = 'oklch(0.55 0.07 80)';
const AMBER_BG_REDUP = 'oklch(0.975 0.025 85)';
const AMBER_BORDER_REDUP = 'oklch(0.91 0.04 85)';
const HIJAU_TXT_REDUP = 'oklch(0.52 0.06 150)';
const HIJAU_BG_REDUP = 'oklch(0.975 0.02 150)';
const HIJAU_BORDER_REDUP = 'oklch(0.90 0.035 150)';

export interface RekapNilaiAkhirRow {
  nama: string;
  /** Rapot QN — prasyarat. Wajib tuntas, tapi nilainya tidak menentukan kelulusan. */
  qn: NilaiAkhirTrack;
  /** Rapot PB — penentu kelulusan level. */
  pb: NilaiAkhirTrack;
}

export interface RekapNilaiAkhirProps {
  halaqahNama: string;
  rows: RekapNilaiAkhirRow[];
  /**
   * Batch `rapot_ujian_terpisah` (0058): nilai akhir murni skor ujian, tanpa bobot
   * berkala. Kini sudah terbawa per baris lewat `qn.ujianSaja`/`pb.ujianSaja`;
   * prop dipertahankan untuk kompatibilitas pemanggil.
   */
  terpisah?: boolean;
}

// 7 kolom; sisa lebar (kontainer ~1180px) jatuh ke kolom nama.
const GRID = '1fr 86px 128px 96px 86px 86px 130px';

function fmt(n: number | null): string {
  return n === null || Number.isNaN(n) ? '–' : String(Math.round(n));
}

/** Status resmi kelulusan level — HANYA dari Rapot PB. */
function StatusPill({ lulus }: { lulus: boolean | null }) {
  if (lulus === null) {
    return <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>—</span>;
  }
  const isLulus = lulus === true;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: 999,
        background: isLulus ? HIJAU_BG : MERAH_BG,
        border: `1px solid ${isLulus ? HIJAU_BORDER : MERAH_BORDER}`,
        fontSize: 10.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        color: isLulus ? HIJAU_TXT : MERAH_TXT,
      }}
    >
      {isLulus ? 'LULUS' : 'MENGULANG'}
    </span>
  );
}

/**
 * Keadaan prasyarat QN. Tidak ada varian merah: QN di bawah ambang adalah catatan
 * administratif, bukan kegagalan level.
 */
function PrasyaratPill({ qn }: { qn: NilaiAkhirTrack }) {
  const { label, txt, bg, border } = !qn.lengkap
    ? { label: 'BELUM LENGKAP', txt: AMBER_TXT, bg: AMBER_BG, border: AMBER_BORDER }
    : qn.lulus === false
      ? { label: `< ${AMBANG_LULUS_AKHIR}`, txt: AMBER_TXT_REDUP, bg: AMBER_BG_REDUP, border: AMBER_BORDER_REDUP }
      : { label: 'SELESAI', txt: HIJAU_TXT_REDUP, bg: HIJAU_BG_REDUP, border: HIJAU_BORDER_REDUP };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        fontSize: 10.5,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        color: txt,
      }}
    >
      {label}
    </span>
  );
}

export default function RekapNilaiAkhir({ halaqahNama, rows }: RekapNilaiAkhirProps) {
  const total = rows.length;
  // Status resmi = Rapot PB saja.
  const jumlahLulus = rows.filter((r) => r.pb.lulus === true).length;
  const jumlahMengulang = rows.filter((r) => r.pb.lulus === false).length;
  // Alarm prasyarat, terpisah dari kelulusan.
  const jumlahQnBelumLengkap = rows.filter((r) => !r.qn.lengkap).length;

  return (
    <div style={{ background: 'var(--bg)', padding: '24px 26px 30px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{halaqahNama}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Nilai akhir tiap track = 30% rata 4 sesi + 70% ujian track itu · ambang{' '}
          {AMBANG_LULUS_AKHIR} · status resmi mengikuti Rapot PB; Rapot QN prasyarat yang wajib
          diselesaikan.
        </div>
      </div>

      {/* Ringkasan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{total}</div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 5, fontWeight: 600 }}>Peserta</div>
        </div>
        <div style={{ background: HIJAU_BG, border: `1px solid ${HIJAU_BORDER}`, borderRadius: 12, padding: '13px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: HIJAU_TXT, fontVariantNumeric: 'tabular-nums' }}>{jumlahLulus}</div>
          <div style={{ fontSize: 10.5, color: HIJAU_TXT, marginTop: 5, fontWeight: 600 }}>Lulus</div>
        </div>
        <div style={{ background: MERAH_BG, border: `1px solid ${MERAH_BORDER}`, borderRadius: 12, padding: '13px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: MERAH_TXT, fontVariantNumeric: 'tabular-nums' }}>{jumlahMengulang}</div>
          <div style={{ fontSize: 10.5, color: MERAH_TXT, marginTop: 5, fontWeight: 600 }}>Mengulang</div>
        </div>
        <div style={{ background: AMBER_BG, border: `1px solid ${AMBER_BORDER}`, borderRadius: 12, padding: '13px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: AMBER_TXT, fontVariantNumeric: 'tabular-nums' }}>{jumlahQnBelumLengkap}</div>
          <div style={{ fontSize: 10.5, color: AMBER_TXT, marginTop: 5, fontWeight: 600 }}>QN belum lengkap</div>
        </div>
      </div>

      {/* Tabel */}
      <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          <div style={{ padding: '10px 14px' }}>Peserta</div>
          <div style={{ padding: '10px 0', textAlign: 'center' }}>QN akhir</div>
          <div style={{ padding: '10px 12px' }}>QN prasyarat</div>
          <div style={{ padding: '10px 0', textAlign: 'center' }}>PB berkala</div>
          <div style={{ padding: '10px 0', textAlign: 'center' }}>PB ujian</div>
          <div style={{ padding: '10px 0', textAlign: 'center' }}>PB akhir</div>
          <div style={{ padding: '10px 12px' }}>Status resmi</div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
            Belum ada data rekap.
          </div>
        ) : (
          rows.map((r, i) => {
            const isLast = i === rows.length - 1;
            const pbAkhirColor = r.pb.nilai === null ? 'var(--muted)' : r.pb.lulus === false ? MERAH_TXT : HIJAU_TXT;
            return (
              <div
                key={`${r.nama}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
                  alignItems: 'center',
                  borderBottom: isLast ? 'none' : '1px solid var(--bg)',
                  fontSize: 12,
                  // Tint merah HANYA dari Rapot PB. QN rendah tidak memerahkan baris.
                  background: r.pb.lulus === false ? MERAH_ROW : undefined,
                }}
              >
                <div style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: 'var(--surface-3)',
                      color: 'var(--ink-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9.5,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {initials(r.nama)}
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.nama}</span>
                </div>
                {/* QN akhir — informasi prasyarat, tidak pernah diwarnai merah. */}
                <div style={{ padding: '9px 0', textAlign: 'center', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.qn.nilai === null ? 'var(--muted)' : 'var(--ink)' }}>
                  {fmt(r.qn.nilai)}
                </div>
                <div style={{ padding: '9px 12px' }}>
                  <PrasyaratPill qn={r.qn} />
                </div>
                <div style={{ padding: '9px 0', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
                  {r.pb.ujianSaja ? (
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.02em' }}>100% ujian</span>
                  ) : (
                    fmt(r.pb.berkalaAvg)
                  )}
                </div>
                <div style={{ padding: '9px 0', textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>
                  {fmt(r.pb.ujianSkor)}
                </div>
                <div style={{ padding: '9px 0', textAlign: 'center', fontSize: 14, fontWeight: 800, color: pbAkhirColor, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(r.pb.nilai)}
                </div>
                <div style={{ padding: '9px 12px' }}>
                  <StatusPill lulus={r.pb.lulus} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer ringkas */}
      {total > 0 && (
        <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--muted)' }}>
          {jumlahLulus} dari {total} peserta lulus (dari Rapot PB) · {jumlahQnBelumLengkap} Rapot QN
          belum lengkap.
        </div>
      )}
    </div>
  );
}
