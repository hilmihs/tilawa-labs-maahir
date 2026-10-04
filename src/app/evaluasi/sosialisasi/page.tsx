import { JALIY, KHAFIY, SKOR_MAKS, NILAI_MINIMUM, AMBANG_LULUS_AKHIR as A } from '@/lib/evaluasi';
import PrintButton from '../pengajar/rapot/PrintButton';

export const dynamic = 'force-static';

// Lembar sosialisasi (A4, cetak → PDF) sistem penilaian untuk pengajar.
const CARD: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 12,
  background: '#fff',
  breakInside: 'avoid',
};
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 8,
};
const CHIP_J: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'oklch(0.46 0.14 25)',
  marginLeft: 8,
};
const CHIP_K: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'oklch(0.48 0.10 75)',
  marginLeft: 8,
};

export default function SosialisasiPenilaianPage() {
  return (
    <div style={{ background: '#eae7e0', minHeight: '100vh', padding: '24px 0' }}>
      <style>{'@page{size:A4;margin:14mm} @media print{.noprint{display:none} body{background:#fff}}'}</style>

      <div
        style={{
          width: 794,
          maxWidth: '100%',
          margin: '0 auto',
          background: '#fff',
          padding: '32px 40px 40px',
          boxSizing: 'border-box',
          color: 'var(--ink)',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          boxShadow: '0 18px 40px -24px rgba(20,18,14,.4)',
        }}
      >
        {/* Kop */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2px solid var(--ink)', paddingBottom: 14, marginBottom: 18 }}>
          <img src="/logo-mpt.png" alt="MPT" width={54} height={54} style={{ borderRadius: 8, objectFit: 'cover' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Tilawa Labs</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Evaluasi Halaqah</div>
          </div>
        </div>

        {/* Judul — to the point, tanpa deskripsi */}
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.01em', margin: '0 0 20px', textWrap: 'balance' }}>
          Sosialisasi Sistem Penilaian: Rapot QN &amp; Rapot PB
        </h1>

        {/* 1. Skor per sesi */}
        <div style={CARD}>
          <div style={SECTION_LABEL}>1 · Skor tiap sesi</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            Skor = {SKOR_MAKS} − (Lahn Jaliy × 6) − (Lahn Khafiy × 2)
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 6 }}>
            Bacaan tanpa kesalahan bernilai <b>{SKOR_MAKS}</b>, dan tiap kesalahan mengurangi dari {SKOR_MAKS}.
            Skor ujian dan nilai akhir tidak dicetak di bawah <b>{NILAI_MINIMUM}</b>.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.46 0.14 25)', marginBottom: 4 }}>Lahn Jaliy · −6 / kesalahan</div>
              {JALIY.map((d) => (
                <div key={d.key} style={{ fontSize: 12, color: 'var(--ink-2)', padding: '2px 0' }}>{d.label}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.48 0.10 75)', marginBottom: 4 }}>Lahn Khafiy · −2 / kesalahan</div>
              {KHAFIY.map((d) => (
                <div key={d.key} style={{ fontSize: 12, color: 'var(--ink-2)', padding: '2px 0' }}>{d.label}</div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 10 }}>
            Predikat: <b>Mumtaz</b> ≥ 90 · <b>Standar</b> ≥ {A} · <b>Di bawah standar</b> ≥ 50 · <b>Perlu pengulangan</b> &lt; 50.
          </div>
        </div>

        {/* 2. Rapot dipisah per track */}
        <div style={CARD}>
          <div style={SECTION_LABEL}>2 · Rapot dipisah per track</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            Ada dua track — <b>QN</b> dan <b>PB</b>, masing-masing 4 sesi evaluasi. Mulai pembaruan ini setiap track
            punya rapot sendiri: <b>Rapot QN</b> dan <b>Rapot PB</b>, terbit sebagai dua dokumen terpisah.
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55, marginTop: 8 }}>
            <b>Rapot QN</b> memuat seluruh sesi evaluasi QN + Ujian QN. <b>Rapot PB</b> memuat seluruh sesi evaluasi PB
            + Ujian PB. Sesi QN dan PB <b>tidak lagi digabung</b> menjadi satu rata-rata.
          </div>
        </div>

        {/* 3. Ujian Akhir */}
        <div style={CARD}>
          <div style={SECTION_LABEL}>3 · Ujian Akhir</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            Ada dua ujian: <b>Ujian QN</b> dan <b>Ujian PB</b>. Keduanya diuji, dinilai, dan <b>keduanya kini dihitung</b>
            {' '}— masing-masing masuk ke nilai akhir rapot track-nya sendiri.
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.40 0.10 150)', marginTop: 8 }}>
            Perubahan penting: Ujian QN sebelumnya hanya catatan progres dan tidak masuk nilai akhir. Sekarang Ujian QN
            menyumbang <b>70%</b> nilai akhir Rapot QN.
          </div>
        </div>

        {/* 4. Nilai akhir tiap rapot */}
        <div style={{ ...CARD, background: 'oklch(0.96 0.035 150)', border: '1px solid oklch(0.85 0.06 150)' }}>
          <div style={SECTION_LABEL}>4 · Nilai akhir tiap rapot</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
            Nilai Akhir QN = (rata-rata sesi QN × 30%) + (Ujian QN × 70%)
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
            Nilai Akhir PB = (rata-rata sesi PB × 30%) + (Ujian PB × 70%)
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            Ambang <b>{A} per rapot</b>, dinilai terpisah untuk QN dan PB. Rapot PB menentukan kelulusan level:
            nilai akhir ≥ {A} → <b>LULUS</b>; di bawah {A} → <b>MENGULANG</b>. Rapot QN adalah prasyarat: di bawah {A}
            dinyatakan <b>DI BAWAH STANDAR</b>, tetap melanjutkan ke level Perbaikan Bacaan (PB).
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 10, background: '#fff', border: '1px solid var(--line-2)', borderRadius: 8, padding: '8px 12px' }}>
            Contoh (Rapot PB): rata-rata sesi PB 79, Ujian PB 78 → (79 × 0,3) + (78 × 0,7) = 78,3 → <b>78</b> · LULUS.
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 8, background: '#fff', border: '1px solid var(--line-2)', borderRadius: 8, padding: '8px 12px' }}>
            Sebagian angkatan tidak menjalankan sesi evaluasi berkala. Untuk angkatan tersebut, nilai akhir tiap rapot
            diambil <b>100% dari skor ujian track yang bersangkutan</b> — Rapot QN dari Ujian QN, Rapot PB dari Ujian PB.
          </div>
        </div>

        {/* 5. Kelulusan */}
        <div style={CARD}>
          <div style={SECTION_LABEL}>5 · Kelulusan</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            Kelulusan level ditentukan <b>Rapot PB</b>. Rapot QN <b>wajib diselesaikan</b> sebagai prasyarat, tetapi
            nilai QN di bawah {A} <b>tidak menggugurkan kelulusan</b>.
          </div>
        </div>

        {/* 6. Rapot lama */}
        <div style={CARD}>
          <div style={SECTION_LABEL}>6 · Rapot lama</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            Rapot yang terbit sebelum pembaruan ini <b>tetap berlaku dengan aturan lama</b> (Rapot Berkala + Rapot Ujian
            Akhir). Bila keterangan pada rapot lama berbeda dengan lembar ini, yang berlaku untuk rapot tersebut adalah
            keterangan yang tercetak padanya.
          </div>
        </div>
      </div>

      <div className="noprint" style={{ position: 'fixed', bottom: 20, right: 20 }}>
        <PrintButton />
      </div>
    </div>
  );
}
