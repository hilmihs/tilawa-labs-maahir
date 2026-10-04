// Halaman verifikasi keaslian rapot — PUBLIK (tanpa auth).
// Diakses via QR pada rapot cetak: /evaluasi/rapot/cek/<token>.
// Server component: baca row dari evaluasi_rapot lalu render ringkas dari payload.
import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { RapotPayload, RapotPayloadLegacy, RapotPayloadTrack } from '@/lib/rapot';
import { tierOf, vonisTrack } from '@/lib/evaluasi';
import { keteranganKeputusanRapot } from '@/lib/evaluasi-keputusan-db';

export const dynamic = 'force-dynamic';

/**
 * Judulnya SENGAJA tidak menyebut nama santri maupun nilainya. Halaman ini punya
 * pintu publik (carve-out di `src/middleware.ts`) dan tautannya beredar lewat
 * WhatsApp — judul dokumen itulah yang jadi kartu pratinjau di daftar obrolan.
 * `noindex` karena tautan yang bocor ke permukaan yang bisa dirayapi akan
 * menjadikan hasil ujian seorang anak sebagai halaman terindeks.
 */
export const metadata: Metadata = {
  title: 'Cek Keaslian Rapot — Tilawa Labs',
  description: 'Verifikasi keaslian rapot evaluasi yang diterbitkan Tilawa Labs.',
  robots: { index: false, follow: false },
};

const HIJAU = 'oklch(0.58 0.09 165)';
const HIJAU_TUA = 'oklch(0.40 0.10 150)';
const MERAH = 'oklch(0.55 0.16 25)';
const MERAH_TUA = 'oklch(0.46 0.14 25)';
// Amber = keputusan tindak lanjut. Sengaja bukan merah: ia bukan vonis kedua.
const AMBER_TUA = 'oklch(0.48 0.11 80)';
const AMBER_MUDA = 'oklch(0.96 0.05 85)';
const AMBER_GARIS = 'oklch(0.86 0.08 85)';
const BG = '#f4f2ed';
const KARTU = '#fff';
const BORDER = '#e8e4dc';
const MUTED = '#7a766f';
const TEKS = '#1b1a17';

function fmtTanggal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        color: TEKS,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        boxSizing: 'border-box',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  );
}

/** Kartu pesan sederhana (rapot tak ditemukan / bentuk payload tak dikenali). */
function KartuNetral({ judul, pesan }: { judul: string; pesan: string }) {
  return (
    <Shell>
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: KARTU,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: '32px 24px',
          textAlign: 'center',
          boxShadow: '0 1px 2px rgba(20,18,14,0.04), 0 6px 24px -8px rgba(20,18,14,0.10)',
        }}
      >
        <img src="/logo-mpt.png" alt="Logo" width={44} height={44} style={{ display: 'block', margin: '0 auto 14px' }} />
        <div style={{ fontSize: 17, fontWeight: 800 }}>{judul}</div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>{pesan}</div>
      </div>
    </Shell>
  );
}

/**
 * `row.payload` datang dari DB tanpa validasi apa pun, dan halaman ini PUBLIK —
 * satu deref ke field yang tak ada = 500 di layar orang tua santri. Jadi bentuknya
 * dikenali dulu secara runtime; apa pun yang tidak cocok jatuh ke kartu netral.
 */
type Bentuk =
  | { kind: 'legacy'; payload: RapotPayloadLegacy }
  | { kind: 'track'; payload: RapotPayloadTrack }
  | { kind: 'asing' };

function kenaliBentuk(raw: unknown): Bentuk {
  if (!raw || typeof raw !== 'object') return { kind: 'asing' };
  const p = raw as Record<string, unknown>;

  // Field yang di-deref tanpa syarat oleh kartu utama (header + footer).
  const identitas = p.identitas;
  if (!identitas || typeof identitas !== 'object') return { kind: 'asing' };
  if (typeof (identitas as Record<string, unknown>).peserta !== 'string') return { kind: 'asing' };
  if (typeof p.tanggal !== 'string' || typeof p.penerbit !== 'string') return { kind: 'asing' };

  const j = p.jenis_rapot;
  if (j === 'qn' || j === 'pb') {
    const tr = p.trackRapot;
    if (!tr || typeof tr !== 'object') return { kind: 'asing' };
    return { kind: 'track', payload: raw as RapotPayloadTrack };
  }
  if (j === 'berkala' || j === 'ujian' || j === 'ujian_qn' || j === 'ujian_pb') {
    return { kind: 'legacy', payload: raw as RapotPayloadLegacy };
  }
  return { kind: 'asing' };
}

/** Nilai turunan untuk blok angka besar — supaya JSX bebas ternary bersarang. */
type Pill = { teks: string; fg: string; bg: string; border: string };
type Vm = {
  jenisLabel: string;
  angka: number | null;
  angkaColor: string;
  pill: Pill | null;
  tampilAmbang: boolean;
  predikat: { teks: string; color: string } | null;
  peranTeks: string | null;
};

/** Pil status kelulusan — warna sama persis di era legacy maupun track. */
function pillLulus(lulus: boolean | null, teksKosong: string): Pill {
  return {
    teks: lulus === true ? 'LULUS' : lulus === false ? 'MENGULANG' : teksKosong,
    fg: lulus === true ? HIJAU_TUA : lulus === false ? MERAH_TUA : MUTED,
    bg: lulus === true ? 'oklch(0.96 0.035 150)' : lulus === false ? 'oklch(0.96 0.04 25)' : '#f0eee9',
    border: lulus === true ? 'oklch(0.85 0.06 150)' : lulus === false ? 'oklch(0.85 0.08 25)' : BORDER,
  };
}

/** ERA LAMA — perilaku dikunci; rapot yang sudah dicetak harus terverifikasi identik. */
function vmLegacy(payload: RapotPayloadLegacy): Vm {
  // 'ujian' (gabungan) maupun 'ujian_qn'/'ujian_pb' (batch terpisah, 0058) sama-sama
  // rapot ujian — yang membedakan hanya label dokumennya.
  const isUjian = payload.jenis_rapot !== 'berkala';
  const jenisLabel =
    payload.jenis_rapot === 'ujian_qn'
      ? 'Ujian QN'
      : payload.jenis_rapot === 'ujian_pb'
      ? 'Ujian PB'
      : payload.jenis_rapot === 'ujian'
      ? 'Ujian Akhir'
      : 'Berkala';
  const lulus = isUjian ? payload.ujian?.lulus ?? null : null;
  const angka = isUjian
    ? payload.ujian?.nilaiAkhir ?? null
    : payload.berkala?.rataGabungan ?? null;

  // Warna angka besar ikut status. Ujian: lulus hijau / mengulang merah / null netral.
  // Berkala: ikut tier predikat (jangan paksa hijau utk "Di bawah standar"/"Perlu pengulangan").
  const angkaColor = isUjian
    ? lulus === true ? HIJAU : lulus === false ? MERAH : MUTED
    : angka != null ? tierOf(angka, payload.ambang).color : MUTED;

  return {
    jenisLabel,
    angka,
    angkaColor,
    pill: isUjian ? pillLulus(lulus, 'Belum ada nilai ujian') : null,
    tampilAmbang: isUjian && lulus != null,
    predikat: isUjian
      ? null
      : {
          teks: payload.berkala?.predikat ?? '—',
          color: angka != null ? tierOf(angka, payload.ambang).color : MUTED,
        },
    peranTeks: null,
  };
}

/** Pil vonis era track: ikut peran — QN gagal = DI BAWAH STANDAR (amber), bukan MENGULANG. */
function pillTrack(peran: 'penentu' | 'prasyarat', lulus: boolean | null): Pill {
  const v = vonisTrack(peran, lulus, 'Belum lengkap');
  if (v.nada === 'bawah_standar') {
    return { teks: v.teks, fg: AMBER_TUA, bg: AMBER_MUDA, border: AMBER_GARIS };
  }
  return pillLulus(lulus, 'Belum lengkap');
}

/** ERA BARU (0062) — satu rapot per track: QN prasyarat, PB penentu kelulusan. */
function vmTrack(payload: RapotPayloadTrack): Vm {
  // `trackRapot` cuma dipastikan "sebuah objek" oleh kenaliBentuk — baca defensif.
  const tr = payload.trackRapot as Partial<RapotPayloadTrack['trackRapot']>;
  const angka = typeof tr.nilaiAkhir === 'number' ? tr.nilaiAkhir : null;
  const lulus = tr.lulus === true ? true : tr.lulus === false ? false : null;
  // `peran` di payload lama bisa absen; QN = prasyarat, selebihnya penentu.
  const peran: 'penentu' | 'prasyarat' =
    tr.peran === 'prasyarat' || (tr.peran == null && payload.jenis_rapot === 'qn') ? 'prasyarat' : 'penentu';
  const nada = vonisTrack(peran, lulus).nada;

  return {
    jenisLabel: payload.jenis_rapot === 'qn' ? 'Rapot QN' : 'Rapot PB',
    angka,
    angkaColor: nada === 'lulus' ? HIJAU : nada === 'mengulang' ? MERAH : nada === 'bawah_standar' ? AMBER_TUA : MUTED,
    pill: pillTrack(peran, lulus),
    tampilAmbang: true,
    predikat: null,
    peranTeks:
      tr.peran === 'penentu'
        ? 'Penentu kelulusan level'
        : tr.peran === 'prasyarat'
        ? 'Prasyarat — bukan penentu kelulusan'
        : null,
  };
}

export default async function CekRapotPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;

  const { data: row } = await supabaseAdmin
    .from('evaluasi_rapot')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (!row) {
    return (
      <KartuNetral
        judul="Rapot tidak ditemukan"
        pesan="Kode verifikasi tidak dikenali. Pastikan QR dipindai dari rapot resmi."
      />
    );
  }

  const bentuk = kenaliBentuk(row.payload);
  if (bentuk.kind === 'asing') {
    return (
      <KartuNetral
        judul="Format rapot tidak dikenali"
        pesan="Kode ini terdaftar, tapi isinya tidak bisa ditampilkan di halaman ini. Hubungi penerbit rapot."
      />
    );
  }

  const payload: RapotPayload = bentuk.payload;
  const vm = bentuk.kind === 'track' ? vmTrack(bentuk.payload) : vmLegacy(bentuk.payload);

  // Status lifecycle rapot (0054): dicabut / digantikan menandai dokumen tak berlaku.
  const status = (row.status as string | undefined) ?? 'aktif';
  let banner: { warna: string; bg: string; border: string; teks: string; linkToken?: string } | null = null;
  if (status === 'dicabut') {
    banner = {
      warna: MERAH_TUA,
      bg: 'oklch(0.96 0.04 25)',
      border: 'oklch(0.85 0.08 25)',
      teks: 'Rapot ini telah DICABUT oleh penerbit dan tidak berlaku.',
    };
  } else if (status === 'digantikan') {
    const { data: aktif } = await supabaseAdmin
      .from('evaluasi_rapot')
      .select('token')
      .eq('peserta_id', row.peserta_id as string)
      .eq('halaqah_id', row.halaqah_id as string)
      .eq('jenis_rapot', row.jenis_rapot as string)
      .eq('status', 'aktif')
      .maybeSingle();
    banner = {
      warna: 'oklch(0.45 0.10 75)',
      bg: 'oklch(0.96 0.05 85)',
      border: 'oklch(0.85 0.09 85)',
      teks: 'Rapot ini telah DIPERBARUI. Versi ini bukan lagi yang berlaku.',
      linkToken: (aktif?.token as string | undefined) ?? undefined,
    };
  }

  const identitas = payload.identitas;

  // Keputusan koordinator (0075). Dibaca hidup: keputusan hampir selalu
  // ditetapkan setelah rapot terbit, jadi payload beku takkan pernah memuatnya.
  // Halaman ini publik — `keteranganKeputusanRapot` sendiri sudah membatasi diri
  // ke rapot PB dan mengembalikan null bila tak ada keputusan.
  const keteranganKeputusan = await keteranganKeputusanRapot(
    String(row.peserta_id ?? ''),
    String(row.jenis_rapot ?? '')
  );

  const barisMeta = [identitas.halaqah, identitas.level, identitas.batch]
    // typeof, bukan sekadar truthy: payload tak tervalidasi, jangan sampai .trim() throw.
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' · ');

  return (
    <Shell>
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: KARTU,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: '26px 22px',
          boxShadow: '0 1px 2px rgba(20,18,14,0.04), 0 6px 24px -8px rgba(20,18,14,0.10)',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: `1px solid ${BORDER}`, paddingBottom: 16, marginBottom: 18 }}>
          <img src="/logo-mpt.png" alt="Logo" width={44} height={44} style={{ display: 'block', margin: '0 auto 10px' }} />
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            Cek Keaslian Rapot
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 6 }}>{identitas.peserta}</div>
          {barisMeta && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{barisMeta}</div>}
          <div style={{ marginTop: 12 }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: HIJAU_TUA,
                background: 'oklch(0.96 0.035 150)',
                border: '1px solid oklch(0.85 0.06 150)',
                borderRadius: 999,
                padding: '4px 12px',
              }}
            >
              {vm.jenisLabel}
            </span>
          </div>
        </div>

        {/* Banner status (dicabut / diperbarui) */}
        {banner && (
          <div
            style={{
              background: banner.bg,
              border: `1px solid ${banner.border}`,
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 800, color: banner.warna }}>{banner.teks}</div>
            {banner.linkToken && (
              <a
                href={`/evaluasi/rapot/cek/${banner.linkToken}`}
                style={{ fontSize: 12, fontWeight: 700, color: HIJAU_TUA, textDecoration: 'underline', marginTop: 6, display: 'inline-block' }}
              >
                Lihat rapot terbaru →
              </a>
            )}
          </div>
        )}

        {/* Angka besar — diredupkan bila rapot tak berlaku (dicabut/digantikan). */}
        <div style={{ textAlign: 'center', marginBottom: 6, opacity: banner ? 0.4 : 1, filter: banner ? 'grayscale(1)' : undefined }}>
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              lineHeight: 1,
              color: vm.angkaColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {vm.angka ?? '—'}
          </div>

          {vm.pill && (
            <div style={{ marginTop: 14 }}>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  borderRadius: 999,
                  padding: '6px 16px',
                  color: vm.pill.fg,
                  background: vm.pill.bg,
                  border: `1px solid ${vm.pill.border}`,
                }}
              >
                {vm.pill.teks}
              </span>
            </div>
          )}

          {vm.tampilAmbang && (
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8 }}>ambang {row.ambang}</div>
          )}

          {vm.predikat && (
            <div style={{ fontSize: 13, fontWeight: 700, color: vm.predikat.color, marginTop: 8 }}>
              {vm.predikat.teks}
            </div>
          )}

          {vm.peranTeks && (
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{vm.peranTeks}</div>
          )}

          {/* Keputusan koordinator (0075) — dibaca hidup, bukan dari payload.
              Tanpa keputusan tak ada apa pun di sini, termasuk tanpa label
              kosong yang akan terbaca sebagai "sudah ditinjau, tak ada tindak
              lanjut". Angka di atas tetap beku. */}
          {keteranganKeputusan && (
            <div
              style={{
                marginTop: 12,
                display: 'inline-block',
                fontSize: 12,
                fontWeight: 700,
                color: AMBER_TUA,
                background: AMBER_MUDA,
                border: `1px solid ${AMBER_GARIS}`,
                borderRadius: 10,
                padding: '7px 12px',
                textAlign: 'left',
              }}
            >
              {keteranganKeputusan}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${BORDER}`,
            marginTop: 20,
            paddingTop: 14,
            textAlign: 'center',
            fontSize: 11.5,
            color: MUTED,
            lineHeight: 1.5,
          }}
        >
          Diterbitkan {fmtTanggal(payload.tanggal)} oleh {payload.penerbit}
        </div>
      </div>
    </Shell>
  );
}
