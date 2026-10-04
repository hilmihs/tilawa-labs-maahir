'use client';

// Rekap Sesi — SATU tabel semua peserta beserta rincian lahn untuk satu sesi.
//
// Ringkasan hanya menampilkan skor; Pusat Rapot mencetak satu peserta per
// lembar. Pengajar yang ditanya "sesi ini siapa salah apa" harus membuka
// peserta satu per satu. Layar ini menjawabnya dalam satu tabel yang bisa
// dicetak (A4 lanskap → PDF lewat dialog cetak) atau diunduh sebagai XLSX
// (`/api/evaluasi/rekap`, membaca nilai yang SUDAH tersimpan di server).
//
// Angka di layar dibangun dari state `work` yang hidup (sama seperti layar
// Ringkasan), jadi suntingan yang belum sempat tersimpan pun ikut terlihat.

import { SKOR_MAKS, type Jenis } from '@/lib/evaluasi';
import {
  KOLOM_JALIY, KOLOM_KHAFIY, labelPendek, type RekapSesi as RekapData,
} from '@/lib/evaluasi-rekap-sesi';

export interface RekapSesiOpsi {
  jenis: Jenis;
  nomor: number;
  label: string;
  tgl: string | null;
  terkirim: boolean;
}

interface Props {
  halaqahNama: string;
  /** "Ikhwan · HITS Dasar · 12 peserta" */
  halaqahMeta: string;
  pengajarName: string;
  batch: string | null;
  opsi: RekapSesiOpsi[];
  aktif: { jenis: Jenis; nomor: number } | null;
  onPilih: (jenis: Jenis, nomor: number) => void;
  rekap: RekapData | null;
  ambang: number;
  /** URL unduhan XLSX; `semua` = satu lembar per sesi. */
  xlsxUrl: (semua: boolean) => string;
  back: () => void;
}

const INK = 'var(--ink)';
const MUTED = 'var(--muted)';
const BORDER = 'var(--line)';
const HEAD_BG = 'var(--surface-3)';
const HIJAU = 'oklch(0.40 0.10 150)';
const MERAH = 'oklch(0.46 0.14 25)';
const AMBER = 'oklch(0.48 0.10 75)';

// WAJIB dangerouslySetInnerHTML — lihat catatan di RapotPrintStyle.tsx:
// React meng-escape `>` pada anak teks <style>, combinator anak mati diam-diam.
const PRINT_CSS = `
  @media print {
    @page { size: A4 landscape; margin: 10mm; }
    body * { visibility: hidden !important; }
    .rekap-root, .rekap-root * { visibility: visible !important; }
    .rekap-root { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 0 !important; }
    .rekap-root .no-print { display: none !important; }
    .rekap-tabel-wrap { overflow: visible !important; border: none !important; }
    .rekap-tabel { font-size: 9.5px !important; }
    .rekap-tabel th, .rekap-tabel td { padding: 3px 4px !important; }
    .rekap-tabel tr { break-inside: avoid; }
    .rekap-tabel thead { display: table-header-group; }
  }
`;

function fmtTgl(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

const TH: React.CSSProperties = {
  padding: '6px 6px',
  borderBottom: `1px solid var(--line-2)`,
  borderRight: `1px solid ${BORDER}`,
  background: HEAD_BG,
  fontSize: 10.5,
  fontWeight: 700,
  color: 'var(--ink-2)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  verticalAlign: 'bottom',
};
const TD: React.CSSProperties = {
  padding: '5px 6px',
  borderBottom: `1px solid ${BORDER}`,
  borderRight: `1px solid ${BORDER}`,
  fontSize: 12,
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

export function RekapSesi(props: Props) {
  const { rekap, opsi, aktif } = props;
  const aktifOpsi = aktif ? opsi.find((o) => o.jenis === aktif.jenis && o.nomor === aktif.nomor) ?? null : null;
  const total = rekap?.baris.length ?? 0;
  const jumlahKolom = 3 + KOLOM_JALIY.length + KOLOM_KHAFIY.length + 5;

  return (
    <div className="rekap-root" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={props.back} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#ffffff', color: 'var(--ink-2)', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Rekap nilai per sesi</div>
          <div style={{ fontSize: 11, color: MUTED }}>{props.halaqahNama} · satu tabel semua peserta</div>
        </div>
      </div>

      {/* Pilih sesi */}
      <div className="no-print" style={{ padding: '12px 16px 0' }}>
        {opsi.length === 0 ? (
          <div style={{ background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, fontSize: 12, color: 'var(--muted-2)' }}>
            Belum ada sesi yang dibuat. Mulai sesi dari beranda dulu.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
            {opsi.map((o) => {
              const on = aktif?.jenis === o.jenis && aktif?.nomor === o.nomor;
              return (
                <button
                  key={`${o.jenis}|${o.nomor}`}
                  onClick={() => props.onPilih(o.jenis, o.nomor)}
                  style={{
                    flexShrink: 0,
                    padding: '7px 12px',
                    borderRadius: 999,
                    border: `1.5px solid ${on ? HIJAU : BORDER}`,
                    background: on ? 'oklch(0.96 0.035 150)' : '#ffffff',
                    color: on ? HIJAU : 'var(--ink-2)',
                    font: 'inherit',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title={o.terkirim ? 'Sesi sudah terkirim' : 'Sesi masih draf'}
                >
                  {o.label}
                  {o.terkirim ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {rekap && aktifOpsi && (
        <div style={{ padding: '12px 16px 0' }}>
          {/* Kop — ikut tercetak */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>
              Rekap {aktifOpsi.label}
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>
              {props.halaqahNama} · {props.halaqahMeta}
              {props.batch ? ` · ${props.batch}` : ''}
              <br />
              Pengajar: {props.pengajarName}
              {aktifOpsi.tgl ? ` · Jadwal: ${fmtTgl(aktifOpsi.tgl)}` : ''}
              {' · '}Ambang {props.ambang}
              {' · '}Skor = {SKOR_MAKS} − 6×jaliy − 2×khafiy
            </div>
          </div>

          {/* Ringkasan */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {[
              ['Dinilai', `${rekap.dinilai}/${total}`, INK],
              ['Tidak hadir', String(rekap.absen), rekap.absen ? AMBER : MUTED],
              ['Belum dinilai', String(rekap.belum), rekap.belum ? MERAH : MUTED],
              ['Rata-rata', rekap.rata == null ? '—' : String(rekap.rata), rekap.rata == null ? MUTED : rekap.rata >= props.ambang ? HIJAU : MERAH],
              [`≥ ${props.ambang}`, String(rekap.standar), HIJAU],
              [`< ${props.ambang}`, String(rekap.bawah), rekap.bawah ? MERAH : MUTED],
            ].map(([k, v, c]) => (
              <div key={k} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '6px 10px', background: '#ffffff', minWidth: 78 }}>
                <div style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 700 }}>{k}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Tabel — lebih lebar dari layar HP, biarkan wrapper yang menggeser. */}
          <div className="rekap-tabel-wrap" style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: 12, background: '#ffffff' }}>
            <table className="rekap-tabel" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, borderBottom: 'none' }} rowSpan={2}>No</th>
                  <th style={{ ...TH, textAlign: 'left', borderBottom: 'none' }} rowSpan={2}>Nama peserta</th>
                  <th style={{ ...TH, borderBottom: 'none' }} rowSpan={2}>Status</th>
                  <th style={{ ...TH, color: MERAH }} colSpan={KOLOM_JALIY.length}>Lahn Jaliy (−6)</th>
                  <th style={{ ...TH, color: AMBER }} colSpan={KOLOM_KHAFIY.length}>Lahn Khafiy (−2)</th>
                  <th style={{ ...TH, borderBottom: 'none' }} rowSpan={2}>Σ Jaliy</th>
                  <th style={{ ...TH, borderBottom: 'none' }} rowSpan={2}>Σ Khafiy</th>
                  <th style={{ ...TH, borderBottom: 'none' }} rowSpan={2}>Skor</th>
                  <th style={{ ...TH, borderBottom: 'none' }} rowSpan={2}>Predikat</th>
                  <th style={{ ...TH, textAlign: 'left', borderBottom: 'none', borderRight: 'none' }} rowSpan={2}>Catatan</th>
                </tr>
                <tr>
                  {KOLOM_JALIY.map((d) => (
                    <th key={d.key} style={{ ...TH, fontWeight: 600, fontSize: 10 }}>{labelPendek(d.label)}</th>
                  ))}
                  {KOLOM_KHAFIY.map((d) => (
                    <th key={d.key} style={{ ...TH, fontWeight: 600, fontSize: 10 }}>{labelPendek(d.label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rekap.baris.map((b, i) => {
                  const redup = b.status !== 'hadir';
                  const skorColor = b.skor == null ? MUTED : b.skor >= props.ambang ? HIJAU : MERAH;
                  return (
                    <tr key={b.id} style={{ opacity: redup ? 0.6 : 1 }}>
                      <td style={{ ...TD, color: MUTED }}>{i + 1}</td>
                      <td style={{ ...TD, textAlign: 'left', fontWeight: 600, whiteSpace: 'normal', minWidth: 140 }}>{b.nama}</td>
                      <td style={{ ...TD, fontSize: 11, color: b.status === 'hadir' ? HIJAU : b.status === 'absen' ? AMBER : MERAH }}>
                        {b.status === 'hadir' ? 'Hadir' : b.status === 'absen' ? 'Tidak hadir' : 'Belum dinilai'}
                      </td>
                      {KOLOM_JALIY.map((d) => (
                        <td key={d.key} style={{ ...TD, color: b.counts[d.key] ? MERAH : '#c9c4ba', fontWeight: b.counts[d.key] ? 700 : 400 }}>
                          {redup ? '' : b.counts[d.key] || '·'}
                        </td>
                      ))}
                      {KOLOM_KHAFIY.map((d) => (
                        <td key={d.key} style={{ ...TD, color: b.counts[d.key] ? AMBER : '#c9c4ba', fontWeight: b.counts[d.key] ? 700 : 400 }}>
                          {redup ? '' : b.counts[d.key] || '·'}
                        </td>
                      ))}
                      <td style={{ ...TD, fontWeight: 700 }}>{redup ? '' : b.jaliy}</td>
                      <td style={{ ...TD, fontWeight: 700 }}>{redup ? '' : b.khafiy}</td>
                      <td style={{ ...TD, fontWeight: 800, fontSize: 13, color: skorColor }}>{b.skor ?? '—'}</td>
                      <td style={{ ...TD, fontSize: 11, color: skorColor }}>{b.tier ?? '—'}</td>
                      <td style={{ ...TD, textAlign: 'left', whiteSpace: 'normal', minWidth: 160, fontSize: 11, color: 'var(--ink-2)', borderRight: 'none' }}>{b.catatan}</td>
                    </tr>
                  );
                })}
                {rekap.baris.length === 0 && (
                  <tr>
                    <td colSpan={jumlahKolom} style={{ ...TD, color: 'var(--muted-2)', padding: 14 }}>Belum ada peserta aktif.</td>
                  </tr>
                )}
              </tbody>
              {rekap.baris.length > 0 && (
                <tfoot>
                  <tr style={{ background: HEAD_BG }}>
                    <td style={{ ...TD, fontWeight: 700, textAlign: 'left', borderBottom: 'none' }} colSpan={3}>Total kesalahan (peserta dinilai)</td>
                    {KOLOM_JALIY.map((d) => (
                      <td key={d.key} style={{ ...TD, fontWeight: 700, borderBottom: 'none', color: rekap.totalCounts[d.key] ? MERAH : MUTED }}>{rekap.totalCounts[d.key] || '·'}</td>
                    ))}
                    {KOLOM_KHAFIY.map((d) => (
                      <td key={d.key} style={{ ...TD, fontWeight: 700, borderBottom: 'none', color: rekap.totalCounts[d.key] ? AMBER : MUTED }}>{rekap.totalCounts[d.key] || '·'}</td>
                    ))}
                    <td style={{ ...TD, fontWeight: 700, borderBottom: 'none' }}>
                      {KOLOM_JALIY.reduce((a, d) => a + (rekap.totalCounts[d.key] || 0), 0)}
                    </td>
                    <td style={{ ...TD, fontWeight: 700, borderBottom: 'none' }}>
                      {KOLOM_KHAFIY.reduce((a, d) => a + (rekap.totalCounts[d.key] || 0), 0)}
                    </td>
                    <td style={{ ...TD, fontWeight: 800, borderBottom: 'none' }}>{rekap.rata ?? '—'}</td>
                    <td style={{ ...TD, fontSize: 10.5, color: MUTED, borderBottom: 'none' }}>rata-rata</td>
                    <td style={{ ...TD, borderBottom: 'none', borderRight: 'none' }} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="no-print" style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 8, lineHeight: 1.45 }}>
            Di HP, geser tabel ke samping untuk melihat semua kolom. Untuk PDF: tekan Cetak,
            lalu pilih tujuan &ldquo;Simpan sebagai PDF&rdquo; di dialog cetak (lembar lanskap).
            XLSX memuat nilai yang sudah tersimpan di server.
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <div className="no-print" style={{ position: 'sticky', bottom: 0, background: '#ffffff', borderTop: `1px solid ${BORDER}`, padding: '12px 16px calc(14px + env(safe-area-inset-bottom))', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => window.print()}
          disabled={!rekap}
          style={{ width: '100%', height: 46, borderRadius: 8, border: 'none', background: INK, color: '#ffffff', font: 'inherit', fontSize: 14, fontWeight: 700, cursor: rekap ? 'pointer' : 'default', opacity: rekap ? 1 : 0.5 }}
        >
          🖨 Cetak / simpan PDF
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={aktif ? props.xlsxUrl(false) : undefined}
            aria-disabled={!aktif}
            style={{ flex: 1, height: 42, borderRadius: 8, border: `1px solid var(--line-2)`, background: '#ffffff', color: INK, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', opacity: aktif ? 1 : 0.5, pointerEvents: aktif ? 'auto' : 'none' }}
          >
            ⬇ XLSX sesi ini
          </a>
          <a
            href={opsi.length ? props.xlsxUrl(true) : undefined}
            aria-disabled={!opsi.length}
            style={{ flex: 1, height: 42, borderRadius: 8, border: `1px solid var(--line-2)`, background: '#ffffff', color: INK, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', opacity: opsi.length ? 1 : 0.5, pointerEvents: opsi.length ? 'auto' : 'none' }}
          >
            ⬇ XLSX semua sesi
          </a>
        </div>
      </div>
    </div>
  );
}
