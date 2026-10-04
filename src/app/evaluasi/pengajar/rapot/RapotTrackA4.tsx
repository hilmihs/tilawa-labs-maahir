import type { ReactElement } from 'react';
import type { RapotPayloadTrack, RapotTrackSnap, RapotLahnRow } from '@/lib/rapot';
import { NILAI_MINIMUM, skorMaksOf } from '@/lib/rapot';
import { tierOf, vonisTrack } from '@/lib/evaluasi';
import RapotKop from './RapotKop';

// Rapot Evaluasi per-track (0062) — cetak A4 potret, presentasional murni:
// tanpa 'use client', tanpa hooks, tanpa fetch.
//
// Jumlah lembarnya ikut bentuk dokumennya:
// - batch normal → DUA lembar, dikembalikan sebagai dua `.a4-sheet` bersaudara;
// - batch `ujianSaja` → SATU lembar (isinya memang jauh lebih sedikit).
// Pemanggil WAJIB membungkusnya dalam `.a4-stack`: aturan pemisah halaman ada di
// `.a4-sheet` sendiri, tapi pengecualian lembar terakhir memakai `:last-child` —
// tanpa pembungkus, `:last-child` di dalam `.a4-print-wrap` justru jatuh ke
// tombol Cetak/Cabut dan tiap cetakan berakhir dengan satu halaman kosong.
//
// Kenapa dua untuk batch normal: isinya 1400–1850px sementara kotak cetak hanya
// 296mm (≈1119px). Sebelumnya dipaksa satu lembar, dan karena lembar adalah kolom
// flex bertinggi pasti, kelebihan itu tidak meluber melainkan menggencet setiap
// blok sampai tabelnya menelan barisnya sendiri — baris skor ujian dan baris total
// nilai akhir raib dari kertas tanpa jejak.
//
// Batas halaman: halaman 1 = vonis + nilai mentahnya (pita status, identitas,
// A tabel sesi berkala, B ujian); halaman 2 = cara nilai itu dibentuk dan dirinci
// (C komponen 30/70, D akumulasi kesalahan, E catatan sesi, F catatan penguji)
// + QR & tanda tangan.
//
// Aturannya satu kalimat: SELURUH teks bebas hidup di lembar terakhir. Lembar
// yang bukan penutup bertinggi pasti dan memotong kelebihannya, jadi ia hanya
// boleh memuat blok yang jumlah barisnya terkunci. Catatan sesi dan catatan
// penguji sama-sama tanpa batas panjang — keduanya di lembar penutup, yang boleh
// tumbuh lewat kelas `.a4-sheet-akhir`.
//
// Satu dokumen = satu track (QN atau PB) dan memuat SELURUH isinya:
// seluruh sesi evaluasi berkala track itu + ujian akhir track itu.
// Nilai akhir = 30% rata sesi berkala track + 70% ujian track, ambang lulus 70,
// dengan lantai cetak `NILAI_MINIMUM` (55) — lantai itu BUKAN ambang kelulusan.
//
// Komponen ini terparameterisasi track (bukan dua file kembar): semua yang
// berbeda antara QN dan PB datang dari `payload.trackRapot` —
// `track`/`label` (judul & penamaan) dan `peran` (kalimat status).
//
// Dua bentuk khusus yang wajib ditangani, keduanya datang dari data:
// - `ujianSaja` (batch `eval_batch.rapot_ujian_terpisah`): tidak ada sesi berkala
//   sama sekali, `berkalaAvg` null dan `akumulasi` kosong. Dokumennya diringkas
//   jadi SATU tabel penilaian (jenis kesalahan · kelompok · jumlah + skor) —
//   tanpa tabel 4 sesi, tanpa tabel bobot 30/70, tanpa kolom "Sesi berkala".
//   Judulnya pun "RAPOT UJIAN PB", bukan "RAPOT EVALUASI PB": batch ini
//   menentukan kelulusan lewat ujian, bukan lewat evaluasi berkala.
// - `nilaiAkhir` null (komponen belum lengkap): cetak "Belum ada", bukan angka 0
//   dan bukan em-dash 44px (yang terbaca sebagai garis coret).

interface Props {
  payload: RapotPayloadTrack;
  /** QR verifikasi. Kosong = rapot belum diterbitkan (pratinjau/cetak dari aplikasi). */
  qr?: string;
  logoSrc: string;
  /**
   * Keterangan keputusan koordinator, mis. "Mengulang di Evaluasi QN" (0075).
   *
   * Dibaca HIDUP oleh pemanggil, bukan dari `payload`: keputusan hampir selalu
   * ditetapkan setelah rapot terbit, jadi snapshot payload takkan pernah
   * memuatnya. Angka rapot tetap beku — ini keterangan tambahan yang muncul
   * hanya bila keputusannya ada, dan tidak menyentuh vonis LULUS/MENGULANG.
   *
   * Kosong/null = tidak ada keputusan → lembar rapot tidak menampilkan apa pun
   * soal ini, bukan baris kosong atau "—".
   */
  keteranganKeputusan?: string | null;
}

const GREEN_DARK = 'oklch(0.40 0.10 150)';
const RED = 'oklch(0.46 0.14 25)';
// Amber = QN di bawah standar: peringatan prasyarat, bukan vonis mengulang.
const AMBER = 'oklch(0.48 0.11 80)';
const AMBER_BG = 'oklch(0.96 0.05 85)';
const MUTED = '#7a766f';
const INK = '#1b1a17';
const FAINT = '#a8a39a';
const BORDER = '#e8e4dc';
const BORDER_STRONG = '#d8d3c8';
const CARD_BG = '#faf8f4';
const HEAD_BG = '#efece5';

const PAGE: React.CSSProperties = {
  width: 794,
  minHeight: 1123,
  background: '#ffffff',
  color: INK,
  // Padding bawah 34px (≈9mm): lembar 296mm di atas kertas 297mm, jadi 14px
  // menaruh baris kaki ~4,7mm dari tepi fisik — di dalam margin mati printer
  // kantor (4–5mm). Nomor halaman adalah hal pertama yang hilang di situ.
  padding: '32px 48px 34px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: MUTED,
  marginBottom: 7,
};

const HEAD: React.CSSProperties = {
  background: HEAD_BG,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#44423d',
};

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

function fmtTgl(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Angka nilai; null → em-dash (JANGAN jatuh ke 0). */
function num(v: number | null): string {
  return v == null ? '—' : String(v);
}

/** Satu desimal gaya id-ID — untuk kolom kontribusi bobot. */
function num1(n: number): string {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Tabel 4 sesi berkala. SALINAN visual `TrackTable` dari RapotBerkalaA4 — file itu
// beku (melayani rapot lama yang sudah beredar), jadi sengaja tidak diimpor
// maupun diekstrak agar perubahan di sini tak pernah menyentuh cetakan lama.
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
              color: skor == null ? FAINT : INK,
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

function IdentRow({
  label,
  value,
  divider,
}: {
  label: string;
  value: string;
  divider: boolean;
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '5px 0',
        borderBottom: divider ? '1px solid #efece5' : undefined,
      }}
    >
      <span style={{ width: 96, fontSize: 11, color: MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

/**
 * Gabung akumulasi kesalahan sesi berkala dengan rincian kesalahan ujian jadi
 * satu daftar baris dua kolom. Urut menurun total supaya kesalahan terbanyak
 * naik ke atas; baris yang nol di kedua kolom tidak pernah muncul (kedua sumber
 * sudah difilter nonzero di builder).
 */
function gabungLahn(
  akumulasi: RapotLahnRow[],
  rincianUjian: RapotLahnRow[],
): { key: string; label: string; group: 'jaliy' | 'khafiy'; berkala: number; ujian: number }[] {
  const map = new Map<string, { key: string; label: string; group: 'jaliy' | 'khafiy'; berkala: number; ujian: number }>();
  const ambil = (r: RapotLahnRow) => {
    const cur = map.get(r.key);
    if (cur) return cur;
    const baru = { key: r.key, label: r.label, group: r.group, berkala: 0, ujian: 0 };
    map.set(r.key, baru);
    return baru;
  };
  for (const r of akumulasi) ambil(r).berkala += r.count;
  for (const r of rincianUjian) ambil(r).ujian += r.count;
  return [...map.values()].sort((a, b) => b.berkala + b.ujian - (a.berkala + a.ujian));
}

/**
 * Kop ringkas halaman 2. Halaman kedua gampang terlepas dari halaman pertama,
 * jadi ia harus bisa berdiri sendiri — nama peserta, halaqah, dan jenis rapot
 * ikut tercetak di sini — termasuk logonya, karena justru lembar inilah yang
 * membawa QR dan tanda tangan. Garis ganda kop halaman 1 tidak diulang supaya
 * ia tidak terbaca sebagai dokumen baru.
 */
function KopLanjutan({
  judul,
  sub,
  logoSrc,
}: {
  judul: string;
  sub: string;
  logoSrc: string;
}): ReactElement {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          paddingBottom: 8,
        }}
      >
        {/* Logo tetap ikut — justru halaman inilah yang membawa QR dan tanda
            tangan, dan justru halaman inilah yang paling sering terlepas. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt="Tilawa Labs"
          width={34}
          height={34}
          style={{ width: 34, height: 34, borderRadius: 6, flexShrink: 0, objectFit: 'cover' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.02em' }}>{judul}</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2, overflowWrap: 'anywhere' }}>{sub}</div>
        </div>
        <div style={{ fontSize: 10.5, color: FAINT, flexShrink: 0, textAlign: 'right' }}>
          Lanjutan halaman 1
        </div>
      </div>
      <div style={{ height: 1.5, background: INK }} />
    </div>
  );
}

/**
 * Garis kaki halaman. `mt: 'auto'` mendorongnya ke dasar lembar — dipakai halaman
 * 1, yang isinya selalu lebih pendek dari kotak 296mm. Halaman 2 memakai jarak
 * tetap: di sana sisa ruang sudah diserap kotak catatan penguji (`flex: 1`), dan
 * kaki cukup menempel di bawah blok QR + tanda tangan.
 */
function KakiHalaman({
  n,
  total,
  teks,
  mt,
}: {
  n: number;
  total: number;
  teks: string;
  mt: number | 'auto';
}): ReactElement {
  return (
    <div
      style={{
        marginTop: mt,
        paddingTop: 8,
        borderTop: `1px solid ${BORDER}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 16,
        fontSize: 10,
        color: MUTED,
      }}
    >
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{teks}</span>
      <span style={{ fontWeight: 700, flexShrink: 0 }}>
        Halaman {n} dari {total}
      </span>
    </div>
  );
}

export default function RapotTrackA4({
  payload,
  qr,
  logoSrc,
  keteranganKeputusan,
}: Props): ReactElement {
  const { identitas, trackRapot: t } = payload;

  const trackUp = t.track.toUpperCase(); // 'QN' | 'PB'
  const ujianLabel = `Ujian ${trackUp}`;

  // Varian kalimat peran: PB menentukan kelulusan level, QN sekadar prasyarat.
  const peranTeks =
    t.peran === 'prasyarat'
      ? `Rapot QN adalah prasyarat. Kelulusan level ditentukan Rapot PB.`
      : `Menentukan kelulusan level.`;

  const peranLabel = t.peran === 'penentu' ? 'penentu kelulusan' : 'prasyarat';

  // Judul selalu "RAPOT UJIAN QN/PB" — juga untuk batch yang punya sesi berkala
  // (dokumennya tetap memuat sesi berkala; subjudul yang menyebutkannya).
  // `t.label` ("Evaluasi QN") adalah nama instrumen penilaian, bukan nama rapot.
  const judul = `RAPOT ${ujianLabel.toUpperCase()}`;

  // Vonis ikut PERAN track, bukan cuma `lulus`: QN di bawah ambang = DI BAWAH
  // STANDAR (amber), bukan MENGULANG — peserta tetap lanjut ke PB. Definisinya
  // tunggal di `vonisTrack`; jangan tulis ulang ternary lulus/mengulang di sini.
  const vonis = vonisTrack(t.peran, t.lulus);
  const statusColor =
    vonis.nada === 'lulus' ? GREEN_DARK
      : vonis.nada === 'mengulang' ? RED
      : vonis.nada === 'bawah_standar' ? AMBER
      : MUTED;
  const statusText = vonis.teks;
  const statusBg =
    vonis.nada === 'lulus' ? 'oklch(0.96 0.035 150)'
      : vonis.nada === 'mengulang' ? 'oklch(0.96 0.03 25)'
      : vonis.nada === 'bawah_standar' ? AMBER_BG
      : CARD_BG;
  const statusKet =
    vonis.nada === 'lulus'
      ? `Memenuhi ambang nilai akhir (${payload.ambang}). ${peranTeks}`
      : vonis.nada === 'mengulang'
        ? `Belum memenuhi ambang kelulusan nilai akhir (${payload.ambang}). ${peranTeks}`
        : vonis.nada === 'bawah_standar'
          ? `Nilai akhir di bawah ambang standar (${payload.ambang}). Tetap melanjutkan ke level Perbaikan Bacaan (PB).`
          : `Nilai akhir belum dapat ditetapkan karena komponen penilaian belum lengkap. ${peranTeks}`;

  // Predikat diturunkan dari nilai akhir yang beku, bukan dari string
  // `t.predikat` di snapshot: rapot yang sudah terbit menyimpan label lama
  // ("Cukup — di bawah standar") dan harus ikut berubah tanpa terbit ulang.
  const predikat = t.nilaiAkhir == null ? t.predikat : tierOf(t.nilaiAkhir, payload.ambang).label;

  const halaqahVal = [identitas.halaqah, identitas.gender].filter(Boolean).join(' · ');
  const levelVal = identitas.level ?? (identitas.mustawa != null ? String(identitas.mustawa) : '—');
  const batchVal = identitas.batch ?? '—';

  const idRows: { label: string; value: string }[] = [
    { label: 'Nama peserta', value: identitas.peserta },
    { label: 'Halaqah', value: halaqahVal || '—' },
    { label: 'Level', value: levelVal },
    { label: 'Batch', value: batchVal },
    { label: 'Penguji', value: payload.penerbit },
    { label: 'Jenis rapot', value: `Rapot ${ujianLabel} · ${peranLabel}` },
  ];
  // Tanggal ujian pindah ke identitas: tabel penilaian batch ujian-terpisah tak
  // lagi punya kolom tanggal.
  if (t.ujianSaja && t.ujian?.tgl) {
    idRows.push({ label: 'Tanggal ujian', value: fmtTgl(t.ujian.tgl) });
  }

  // Komponen 30/70 — hanya relevan bila ada sesi berkala.
  const kontribBerkala = t.berkalaAvg == null ? null : 0.3 * t.berkalaAvg;
  const kontribUjian = t.ujianSkor == null ? null : 0.7 * t.ujianSkor;
  const rawAkhir =
    t.berkalaAvg == null || t.ujianSkor == null ? null : 0.3 * t.berkalaAvg + 0.7 * t.ujianSkor;

  const barisLahn = gabungLahn(t.akumulasi, t.rincianUjian);
  const totalBerkala = barisLahn.reduce((a, r) => a + r.berkala, 0);
  const totalUjian = barisLahn.reduce((a, r) => a + r.ujian, 0);
  const lahnGrid = '1fr 84px 118px 118px';

  const komponenGrid = '1fr 110px 100px 120px';
  const ujianGrid = '1fr 78px 78px 74px 130px';
  // Tabel tunggal batch ujian-terpisah: jenis kesalahan · kelompok · jumlah.
  const penilaianGrid = '1fr 110px 110px';

  // Jejak identitas untuk kaki halaman & kop lanjutan. Halaman 2 sering terlepas
  // dari halaman 1, jadi ia wajib memuat nama peserta sendiri.
  const jejakDok = `${identitas.peserta} · Rapot ${ujianLabel}`;
  const subLanjutan = [
    identitas.peserta,
    identitas.halaqah ? `Halaqah ${identitas.halaqah}` : null,
    batchVal !== '—' ? `Batch ${batchVal}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Dipakai di dua tempat: lembar penutup rapot dua-lembar, dan lembar tunggal
  // batch ujian-terpisah. `flex: 1` membuat kotaknya menyerap sisa ruang lembar
  // — tanpa itu ada 300–470px putih menganga di antara catatan dan tanda tangan,
  // yang terbaca sebagai cetakan gagal, bukan sebagai jarak.
  const kotakCatatanPenguji = (
    <div
      style={{
        flex: 1,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: '11px 16px',
        background: CARD_BG,
        fontSize: 12,
        lineHeight: 1.6,
        color: '#44423d',
        textWrap: 'pretty',
        // Penguji mengetik catatannya berbaris-baris, dengan baris kosong sebagai
        // jeda paragraf dan spasi awal untuk kutipan hadits. Tanpa pre-wrap, HTML
        // meruntuhkan semuanya jadi satu blok padat yang berat dibaca.
        whiteSpace: 'pre-wrap',
      }}
    >
      {t.catatanPenguji.trim() || 'Tidak ada catatan penguji.'}
    </div>
  );

  const blokQrTtd = (
    <div
      style={{
        marginTop: 'auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 20,
        paddingTop: 22,
      }}
    >
      {qr ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR verifikasi rapot" style={{ width: 62, height: 62, display: 'block' }} />
          <div style={{ fontSize: 8.5, color: FAINT }}>Cek keaslian rapot</div>
        </div>
      ) : (
        <div style={{ fontSize: 8.5, color: FAINT, maxWidth: 190, lineHeight: 1.5 }}>
          Cetakan pratinjau — rapot belum diterbitkan, jadi belum ada QR verifikasi.
        </div>
      )}
      {/* Satu tanda tangan saja: penguji. Kolom koordinator dibuang — tak pernah
          ditandatangani, dan keaslian dokumen dijamin QR verifikasi. */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>{fmtTanggal(payload.tanggal)}</div>
        <div style={{ fontSize: 11, color: MUTED }}>Penguji</div>
        <div style={{ height: 34 }} />
        <div style={{ fontSize: 12, fontWeight: 700, borderTop: `1px solid ${INK}`, paddingTop: 4, minWidth: 180 }}>
          {payload.penerbit}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ══════════ HALAMAN 1 — vonis, identitas, dan angka pembentuk nilai ══════════ */}
      {/* Batch ujian-terpisah cukup SATU lembar, jadi lembar ini sekaligus
          lembar penutup dan berhak tumbuh (`a4-sheet-akhir`). */}
      <div className={t.ujianSaja ? "a4-sheet a4-sheet-akhir" : "a4-sheet"} style={PAGE}>
        <RapotKop
          identitas={identitas}
          logoSrc={logoSrc}
          sub={batchVal !== '—' ? `Halaqah ${identitas.halaqah} · Batch ${batchVal}` : undefined}
          pageLabel={`Rapot ${trackUp}`}
        />

        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.06em' }}>
            {judul}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
            {t.ujianSaja
              ? ujianLabel
              : `Sesi evaluasi berkala ${trackUp} & ${ujianLabel}`}
          </div>
        </div>

        {/* Pita status: nilai akhir + kelulusan + predikat */}
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            border: `2px solid ${statusColor}`,
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              flex: 1,
              background: statusBg,
              padding: '14px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: statusColor,
                opacity: 0.8,
              }}
            >
              Dinyatakan
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: '0.05em',
                lineHeight: 1.05,
                color: statusColor,
                marginTop: 4,
              }}
            >
              {statusText}
            </div>
            <div style={{ fontSize: 11.5, color: statusColor, opacity: 0.85, marginTop: 6, textWrap: 'pretty' }}>
              {statusKet}
            </div>
            {/* Keputusan koordinator. Tanpa keputusan, tak ada apa pun di sini —
                termasuk tanpa label kosong: rapot yang mencantumkan "Keputusan: —"
                akan terbaca sebagai "sudah ditinjau dan tak ada tindak lanjut". */}
            {keteranganKeputusan && (
              <div
                style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: '#ffffff',
                  border: `1px solid ${statusColor}`,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: statusColor,
                  alignSelf: 'flex-start',
                }}
              >
                {keteranganKeputusan}
              </div>
            )}
          </div>
          <div
            style={{
              width: 200,
              background: '#ffffff',
              borderLeft: `2px solid ${statusColor}`,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: MUTED,
              }}
            >
              Nilai akhir {trackUp}
            </div>
            {/* Nilai belum ada → JANGAN cetak em-dash 44px: ia terbaca sebagai
                garis coret tebal di atas "dari 100", bukan sebagai "kosong". */}
            {t.nilaiAkhir == null ? (
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: MUTED, textAlign: 'center' }}>
                Belum ada
              </div>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 44,
                    fontWeight: 800,
                    lineHeight: 1,
                    color: statusColor,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t.nilaiAkhir}
                </div>
                <div style={{ fontSize: 11, color: FAINT, fontWeight: 600 }}>dari 100</div>
                {/* JANGAN `whiteSpace: nowrap`: predikat panjang pernah
                    terpotong di tengah kata oleh `overflow: hidden` pita. */}
                <div
                  style={{
                    marginTop: 7,
                    padding: '5px 12px',
                    borderRadius: 10,
                    background: statusBg,
                    border: `1px solid ${statusColor}`,
                    fontSize: 11,
                    fontWeight: 800,
                    maxWidth: '100%',
                    textAlign: 'center',
                    lineHeight: 1.3,
                    textWrap: 'balance',
                    color: statusColor,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Predikat {predikat}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Identitas */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0 32px',
            padding: '9px 16px',
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            marginBottom: 14,
          }}
        >
          {idRows.map((r, i) => (
            <IdentRow key={r.label} label={r.label} value={r.value} divider={i < 4} />
          ))}
        </div>

        {t.ujianSaja ? (
          /* Batch ujian-terpisah: SATU tabel penilaian — jenis kesalahan,
             kelompok, jumlah — ditutup baris skor yang sekaligus nilai akhir.
             Tak ada sesi berkala, jadi tak ada tabel 4 sesi, tabel bobot 30/70,
             maupun kolom "Sesi berkala". Seluruh dokumen muat satu lembar. */
          <>
            <div style={SECTION_LABEL}>A. Penilaian {ujianLabel}</div>
            <div style={{ border: `1px solid ${BORDER_STRONG}`, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: penilaianGrid, alignItems: 'center', ...HEAD }}>
                <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER_STRONG}` }}>Jenis kesalahan</div>
                <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}` }}>Kelompok</div>
                <div style={{ padding: '8px', textAlign: 'center' }}>Jumlah</div>
              </div>
              {t.ujian == null ? (
                <div style={{ padding: '11px 14px', fontSize: 12, color: FAINT }}>{ujianLabel} belum dinilai.</div>
              ) : barisLahn.length === 0 ? (
                <div style={{ padding: '11px 14px', fontSize: 12, color: FAINT }}>Tidak ada kesalahan tercatat.</div>
              ) : (
                barisLahn.map((r) => {
                  const isJaliy = r.group === 'jaliy';
                  return (
                    <div
                      key={r.key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: penilaianGrid,
                        alignItems: 'center',
                        fontSize: 11.5,
                        borderBottom: '1px solid #f4f2ed',
                      }}
                    >
                      <div style={{ padding: '6px 14px', borderRight: '1px solid #f4f2ed', color: '#44423d' }}>{r.label}</div>
                      <div
                        style={{
                          padding: '6px 8px',
                          borderRight: '1px solid #f4f2ed',
                          fontSize: 10,
                          fontWeight: 700,
                          color: isJaliy ? RED : 'oklch(0.48 0.10 75)',
                        }}
                      >
                        {isJaliy ? 'Jaliy' : 'Khafiy'}
                      </div>
                      <div style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {r.ujian}
                      </div>
                    </div>
                  );
                })
              )}
              <div style={{ display: 'grid', gridTemplateColumns: penilaianGrid, alignItems: 'center', fontSize: 11.5, borderBottom: `1px solid ${BORDER_STRONG}`, background: CARD_BG }}>
                <div style={{ padding: '7px 14px', borderRight: `1px solid ${BORDER}`, fontWeight: 700 }}>Total kesalahan</div>
                <div style={{ padding: '7px 8px', borderRight: `1px solid ${BORDER}` }} />
                <div style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  {t.ujian == null ? '—' : totalUjian}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: penilaianGrid, alignItems: 'center', fontSize: 12, background: HEAD_BG }}>
                <div style={{ padding: '9px 14px', borderRight: `1px solid ${BORDER_STRONG}`, gridColumn: '1 / span 2', fontWeight: 800 }}>
                  Skor {ujianLabel} — sekaligus nilai akhir
                </div>
                <div style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
                  {num(t.nilaiAkhir)}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 9.5, color: MUTED, marginBottom: 14 }}>
              {/* Keterangan "batch ini tidak menjalankan sesi evaluasi berkala" dibuang:
                  itu urusan tata kelola angkatan, bukan keterangan yang perlu dibaca
                  wali santri di lembar rapotnya. */}
              Skor = {skorMaksOf(payload)} − (Lahn Jaliy × 6) − (Lahn Khafiy × 2), dengan nilai minimum {NILAI_MINIMUM}. Nilai
              akhir 100% dari {ujianLabel}. Ambang lulus {payload.ambang}.
            </div>

            <div style={SECTION_LABEL}>B. Catatan penguji</div>
            {kotakCatatanPenguji}

            {blokQrTtd}

            <KakiHalaman n={1} total={1} teks={jejakDok} mt={12} />
          </>
        ) : (
          <>
            {/* A. Nilai sesi berkala — hanya tabelnya. Catatan sesi (teks bebas,
                tanpa batas panjang) pindah ke halaman 2: halaman 1 bertinggi PASTI,
                jadi ia hanya boleh memuat blok yang jumlah barisnya terkunci.
                Selebar halaman, seirama dengan tabel B dan D. */}
            <div style={SECTION_LABEL}>A. Nilai sesi evaluasi berkala {trackUp}</div>
            <div style={{ marginBottom: 14 }}>
              <TrackTable track={t.berkala} />
            </div>

            {/* B. Ujian track ini */}
            <div style={SECTION_LABEL}>B. {ujianLabel}</div>
            <div style={{ border: `1px solid ${BORDER_STRONG}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
              {/* Header kolom hanya bila ada barisnya — kalau tidak, JALIY/KHAFIY/
                  SKOR/TANGGAL menggantung di atas satu kalimat. */}
              {t.ujian && (
                <div style={{ display: 'grid', gridTemplateColumns: ujianGrid, alignItems: 'center', ...HEAD }}>
                  <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER_STRONG}` }}>Ujian</div>
                  <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Jaliy</div>
                  <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Khafiy</div>
                  <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Skor</div>
                  <div style={{ padding: '8px 14px' }}>Tanggal</div>
                </div>
              )}
              {t.ujian ? (
                <div style={{ display: 'grid', gridTemplateColumns: ujianGrid, alignItems: 'center', fontSize: 12 }}>
                  <div style={{ padding: '9px 14px', borderRight: `1px solid ${BORDER}`, fontWeight: 700 }}>
                    {t.ujian.label}
                  </div>
                  <div style={{ padding: '9px 8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {t.ujian.jaliy}
                  </div>
                  <div style={{ padding: '9px 8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {t.ujian.khafiy}
                  </div>
                  <div style={{ padding: '9px 8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {num(t.ujian.skor)}
                  </div>
                  <div style={{ padding: '9px 14px', color: MUTED }}>{fmtTgl(t.ujian.tgl)}</div>
                </div>
              ) : (
                <div style={{ padding: '11px 14px', fontSize: 12, color: FAINT }}>
                  {ujianLabel} belum dinilai.
                </div>
              )}
            </div>
            {/* Rumus skor ikut halaman 1: di sinilah angka Jaliy/Khafiy dan skornya
                dicetak, jadi di sini pula ia harus bisa dicocokkan. Kalimat nilai
                akhir tetap menemani tabel komponen di halaman 2.
                Ambang sengaja TIDAK disebut: `payload.ambang` adalah ambang nilai
                akhir, bukan ambang ujian. Ambang lulus tetap di pita status. */}
            <div style={{ fontSize: 9.5, color: MUTED }}>
              Skor = {skorMaksOf(payload)} − (Lahn Jaliy × 6) − (Lahn Khafiy × 2), dengan nilai minimum {NILAI_MINIMUM}.
            </div>

            <KakiHalaman
              n={1}
              total={2}
              teks="Bersambung ke halaman 2 — komponen nilai, rincian kesalahan, catatan, dan tanda tangan."
              mt="auto"
            />
          </>
        )}
      </div>

      {/* ══════════ HALAMAN 2 — rincian kesalahan, catatan, tanda tangan ══════════ */}
      {!t.ujianSaja && (
      <div className="a4-sheet a4-sheet-akhir" style={PAGE}>
        <KopLanjutan
          judul={judul}
          sub={subLanjutan}
          logoSrc={logoSrc}
        />

        {/* C. Komponen nilai akhir 30/70. Pada batch `ujianSaja` bagian ini
            DIHILANGKAN, bukan diganti keterangan: tidak ada pembobotan untuk
            diuraikan, dan keterangannya hanya mengulang kalimat yang sudah
            tercetak di bagian A dan di catatan kaki. */}
        {!t.ujianSaja && (
          <>
            <div style={SECTION_LABEL}>C. Komponen nilai akhir</div>
            <div style={{ border: `1px solid ${BORDER_STRONG}`, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: komponenGrid, alignItems: 'center', ...HEAD }}>
                <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER_STRONG}` }}>Komponen</div>
                <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Nilai</div>
                <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Bobot</div>
                <div style={{ padding: '8px', textAlign: 'center' }}>Kontribusi</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: komponenGrid, alignItems: 'center', fontSize: 12, borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER}` }}>
                  Sesi evaluasi berkala
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                    Rata-rata sesi {trackUp} yang dinilai
                  </div>
                </div>
                <div style={{ padding: '8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  {num(t.berkalaAvg)}
                </div>
                <div style={{ padding: '8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>30%</div>
                <div style={{ padding: '8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {kontribBerkala == null ? '—' : num1(kontribBerkala)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: komponenGrid, alignItems: 'center', fontSize: 12, borderBottom: `1px solid ${BORDER_STRONG}` }}>
                <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER}` }}>
                  {ujianLabel}
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>Skor ujian akhir track ini</div>
                </div>
                <div style={{ padding: '8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  {num(t.ujianSkor)}
                </div>
                <div style={{ padding: '8px', borderRight: `1px solid ${BORDER}`, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>70%</div>
                <div style={{ padding: '8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {kontribUjian == null ? '—' : num1(kontribUjian)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: komponenGrid, alignItems: 'center', fontSize: 12, background: HEAD_BG }}>
                <div style={{ padding: '9px 14px', borderRight: `1px solid ${BORDER_STRONG}`, fontWeight: 800 }}>
                  Nilai akhir {trackUp}
                </div>
                <div style={{ padding: '9px 8px', borderRight: `1px solid ${BORDER_STRONG}` }} />
                <div style={{ padding: '9px 8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center', fontWeight: 700 }}>100%</div>
                <div style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
                  {rawAkhir == null ? num(t.nilaiAkhir) : `${num1(rawAkhir)} → ${num(t.nilaiAkhir)}`}
                </div>
              </div>
            </div>
            {/* Ikut di dalam kondisi: ini catatan kaki UNTUK tabel di atasnya.
                Pada `ujianSaja` tabelnya tidak ada, dan kalimatnya sudah
                tercetak sebagai keterangan bagian A di halaman 1. */}
            <div style={{ fontSize: 9.5, color: MUTED, marginBottom: 14 }}>
              {`Nilai akhir = 30% rata-rata sesi berkala ${trackUp} + 70% ${ujianLabel} (ambang lulus ${payload.ambang}).`}
            </div>
          </>
        )}

        {/* D. Akumulasi kesalahan: sesi berkala vs ujian */}
        <div style={SECTION_LABEL}>D. Akumulasi kesalahan</div>
        <div style={{ border: `1px solid ${BORDER_STRONG}`, borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: lahnGrid, alignItems: 'center', ...HEAD }}>
            <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER_STRONG}` }}>Jenis kesalahan</div>
            <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}` }}>Kelompok</div>
            <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center' }}>Sesi berkala</div>
            <div style={{ padding: '8px', textAlign: 'center' }}>{ujianLabel}</div>
          </div>
          {barisLahn.length === 0 ? (
            <div style={{ padding: '11px 14px', fontSize: 12, color: FAINT }}>Tidak ada kesalahan tercatat.</div>
          ) : (
            barisLahn.map((r) => {
              const isJaliy = r.group === 'jaliy';
              return (
                <div
                  key={r.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: lahnGrid,
                    alignItems: 'center',
                    fontSize: 11.5,
                    borderBottom: '1px solid #f4f2ed',
                  }}
                >
                  <div style={{ padding: '6px 14px', borderRight: '1px solid #f4f2ed', color: '#44423d' }}>{r.label}</div>
                  <div
                    style={{
                      padding: '6px 8px',
                      borderRight: '1px solid #f4f2ed',
                      fontSize: 10,
                      fontWeight: 700,
                      color: isJaliy ? RED : 'oklch(0.48 0.10 75)',
                    }}
                  >
                    {isJaliy ? 'Jaliy' : 'Khafiy'}
                  </div>
                  {/* `ujianSaja` → tidak ada sesi berkala sama sekali: em-dash, bukan 0. */}
                  <div style={{ padding: '6px 8px', borderRight: '1px solid #f4f2ed', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {t.ujianSaja ? '—' : r.berkala || '–'}
                  </div>
                  <div style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {t.ujian == null ? '—' : r.ujian || '–'}
                  </div>
                </div>
              );
            })
          )}
          <div style={{ display: 'grid', gridTemplateColumns: lahnGrid, alignItems: 'center', fontSize: 12, background: HEAD_BG }}>
            <div style={{ padding: '8px 14px', borderRight: `1px solid ${BORDER_STRONG}`, fontWeight: 800 }}>Total</div>
            <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}` }} />
            <div style={{ padding: '8px', borderRight: `1px solid ${BORDER_STRONG}`, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {t.ujianSaja ? '—' : totalBerkala}
            </div>
            <div style={{ padding: '8px', textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {t.ujian == null ? '—' : totalUjian}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 9.5, color: MUTED, marginBottom: 14 }}>
          Kolom &ldquo;Sesi berkala&rdquo; menjumlahkan seluruh sesi {trackUp} yang dinilai.
        </div>

        {/* E. Catatan sesi — pindahan dari bagian A. Teks bebas ini hanya boleh
            hidup di lembar terakhir, satu-satunya lembar yang boleh tumbuh. */}
        {!t.ujianSaja && (
          <>
            <div style={SECTION_LABEL}>E. Catatan sesi evaluasi berkala</div>
            <div
              style={{
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                background: CARD_BG,
                padding: '10px 16px',
                fontSize: 11.5,
                color: '#44423d',
                lineHeight: 1.55,
                marginBottom: 14,
              }}
            >
              {t.berkala.catatan.length === 0 ? (
                <div style={{ color: MUTED }}>Tidak ada catatan sesi.</div>
              ) : (
                t.berkala.catatan.map((c, i) => (
                  <div key={i} style={{ marginBottom: 4, textWrap: 'pretty' }}>
                    <span style={{ fontWeight: 700 }}>{c.label}</span>
                    <span style={{ color: MUTED }}> · {fmtTgl(c.tgl)}</span>
                    <span> — {c.teks}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* F. Catatan penguji */}
        <div style={SECTION_LABEL}>F. Catatan penguji</div>
        {kotakCatatanPenguji}

        {blokQrTtd}

        <KakiHalaman n={2} total={2} teks={jejakDok} mt={12} />
      </div>
      )}
    </>
  );
}
