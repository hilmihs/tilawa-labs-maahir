'use client';

import { useState } from 'react';

interface DaftarItem {
  key: string;
  nama: string;
  ketua: string;
  initial: string;
  toggle: () => void;
  checkMark: string;
  checkBg: string;
  checkBorder: string;
  rowOpacity: number;
  buka: () => void;
  statusText: string;
  showSkor: boolean;
  skor: number;
  skorColor: string;
  /** Status simpan isian peserta ini: gagal (belum tersimpan) / sedang dikirim. */
  simpan?: 'gagal' | 'proses' | null;
}

/** Sesi terkirim: layar hanya-baca + jalan resmi untuk membuka kuncinya. */
export interface DaftarTerkunci {
  /** Konfirmasi "Ya, buka kunci" sedang ditampilkan. */
  konfirmasi: boolean;
  busy: boolean;
  error: string | null;
  minta: () => void;
  batal: () => void;
  buka: () => void;
}

interface DaftarProps {
  judul: string;
  sub: string;
  items: DaftarItem[];
  selesai: number;
  total: number;
  progressPct: number;
  tombolLabel: string;
  back: () => void;
  mulai: () => void;
  /** Hapus nilai SEMUA peserta sesi ini. Boleh async — tombol dikunci selama jalan. */
  onReset?: () => void | Promise<void>;
  /** Jumlah peserta yang punya isian — disebut di konfirmasi kedua reset sesi. */
  resetJumlah?: number;
  /** Permintaan reset sedang berjalan (tombol dikunci, label berubah). */
  resetBusy?: boolean;
  /** Pesan galat reset dari server; null bila tak ada. */
  resetError?: string | null;
  /** Buka menu cetak rapot rinci untuk sesi ini. */
  onPdf?: () => void;
  /** Sesi sudah terkirim → hanya-baca. null/undefined = bisa disunting. */
  terkunci?: DaftarTerkunci | null;
  /** Jumlah isian sesi ini yang belum aman di server. */
  belumTersimpan?: number;
}

const MERAH = 'oklch(0.46 0.14 25)';
const MERAH_LATAR = 'oklch(0.97 0.02 25)';
const MERAH_GARIS = 'oklch(0.85 0.08 25)';

export function Daftar(props: DaftarProps) {
  // Reset sesi dua langkah: 1 = jelaskan (bawaan reset kini per peserta),
  // 2 = konfirmasi tegas yang menyebut berapa peserta akan kehilangan nilai.
  const [langkahReset, setLangkahReset] = useState<0 | 1 | 2>(0);
  const tutupReset = () => {
    if (!props.resetBusy) setLangkahReset(0);
  };
  const jumlah = props.resetJumlah ?? 0;
  const t = props.terkunci;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid var(--line)' }}>
        <button onClick={props.back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)', background: '#ffffff', color: 'var(--ink-2)', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{props.judul}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{props.sub}</div>
        </div>
        {props.onPdf && (
          <button
            onClick={props.onPdf}
            title="Cetak / simpan rapot rinci peserta sesi ini"
            style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--line-2)', background: '#ffffff', font: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            ⬇ PDF
          </button>
        )}
        {props.onReset && langkahReset === 0 && (
          <button
            onClick={() => setLangkahReset(1)}
            style={{ height: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${MERAH_GARIS}`, background: '#ffffff', font: 'inherit', fontSize: 12, fontWeight: 600, color: MERAH, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Reset
          </button>
        )}
      </div>

      {t && (
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ background: 'oklch(0.96 0.035 150)', border: '1px solid oklch(0.85 0.06 150)', borderRadius: 12, padding: '12px 14px', color: 'oklch(0.36 0.09 150)', fontSize: 12, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🔒 Sesi ini sudah dikirim — hanya-baca</div>
            <div style={{ marginTop: 3 }}>
              Nilai sudah masuk ke koordinator dan tidak bisa diubah dari sini. Bila ada yang perlu
              diperbaiki, buka kuncinya dulu — nilai lama tetap utuh, sesi kembali jadi draft, lalu
              kirim ulang. Bila tombol ini ditolak (mis. rapot sudah terbit), minta koordinator
              membukanya.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {t.konfirmasi ? (
                <>
                  <button
                    disabled={t.busy}
                    onClick={t.buka}
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: 'oklch(0.55 0.16 25)', font: 'inherit', fontSize: 12, fontWeight: 700, color: '#fff', cursor: t.busy ? 'default' : 'pointer', opacity: t.busy ? 0.6 : 1 }}
                  >
                    {t.busy ? 'Membuka…' : 'Ya, buka kunci sesi ini'}
                  </button>
                  <button
                    disabled={t.busy}
                    onClick={t.batal}
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', font: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}
                  >
                    Batal
                  </button>
                </>
              ) : (
                <button
                  onClick={t.minta}
                  style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid oklch(0.80 0.07 150)', background: '#ffffff', font: 'inherit', fontSize: 12, fontWeight: 700, color: 'oklch(0.36 0.09 150)', cursor: 'pointer' }}
                >
                  🔓 Buka kunci untuk memperbaiki
                </button>
              )}
            </div>
            {t.error && (
              <div style={{ marginTop: 8, fontSize: 11, color: MERAH, background: MERAH_LATAR, border: `1px solid ${MERAH_GARIS}`, borderRadius: 8, padding: '8px 10px', lineHeight: 1.4 }}>
                {t.error}
              </div>
            )}
          </div>
        </div>
      )}

      {props.onReset && langkahReset > 0 && (
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ background: MERAH_LATAR, border: `1px solid ${MERAH_GARIS}`, borderRadius: 12, padding: '12px 14px', color: MERAH, fontSize: 12, lineHeight: 1.45 }}>
            {langkahReset === 1 ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 13 }}>Mengosongkan nilai</div>
                <div style={{ marginTop: 3 }}>
                  Untuk <b>satu peserta</b>: buka peserta itu, lalu ketuk <b>“Kosongkan nilai peserta
                  ini”</b> di bawah catatan. Tombol di bawah ini menghapus nilai <b>semua peserta</b>.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setLangkahReset(2)}
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${MERAH_GARIS}`, background: '#ffffff', font: 'inherit', fontSize: 12, fontWeight: 700, color: MERAH, cursor: 'pointer' }}
                  >
                    Kosongkan semua peserta…
                  </button>
                  <button
                    onClick={tutupReset}
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', font: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}
                  >
                    Batal
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: 13 }}>
                  Hapus nilai {jumlah} peserta di sesi ini?
                </div>
                <div style={{ marginTop: 3 }}>
                  Semua skor, catatan, dan tanda selesai {jumlah} peserta akan dihapus permanen dan
                  tidak bisa dikembalikan.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    disabled={props.resetBusy}
                    onClick={async () => {
                      await props.onReset?.();
                      setLangkahReset(0);
                    }}
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: 'oklch(0.55 0.16 25)', font: 'inherit', fontSize: 12, fontWeight: 700, color: '#fff', cursor: props.resetBusy ? 'default' : 'pointer', opacity: props.resetBusy ? 0.6 : 1 }}
                  >
                    {props.resetBusy ? 'Menghapus…' : `Ya, hapus nilai ${jumlah} peserta`}
                  </button>
                  <button
                    disabled={props.resetBusy}
                    onClick={tutupReset}
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', font: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: props.resetBusy ? 'default' : 'pointer', opacity: props.resetBusy ? 0.6 : 1 }}
                  >
                    Batal
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '12px 16px 0' }}>
        {props.resetError ? (
          <div style={{ fontSize: 11, color: MERAH, background: MERAH_LATAR, border: `1px solid ${MERAH_GARIS}`, borderRadius: 8, padding: '8px 10px', lineHeight: 1.4 }}>
            {props.resetError}
          </div>
        ) : t ? null : (
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>Semua peserta dipilih otomatis. Ketuk untuk lepas centang bila tidak hadir hari ini.</div>
        )}
      </div>

      <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {props.items.map((p) => (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#ffffff', border: `1px solid ${p.simpan === 'gagal' ? MERAH_GARIS : 'var(--line)'}`, borderRadius: 12, padding: '10px 12px', opacity: p.rowOpacity }}>
            <button
              onClick={p.toggle}
              disabled={!!t}
              aria-label={t ? 'Kehadiran (hanya-baca)' : 'Ubah kehadiran'}
              style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${p.checkBorder}`, background: p.checkBg, color: '#ffffff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: t ? 'default' : 'pointer', flexShrink: 0 }}
            >
              {p.checkMark}
            </button>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-3)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{p.initial}</div>
            <button onClick={p.buka} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', font: 'inherit', cursor: 'pointer', padding: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.nama}{p.ketua}</div>
              <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 1 }}>
                {p.statusText}
                {p.simpan === 'gagal' && (
                  <span style={{ color: MERAH, fontWeight: 700 }}> · ⚠ belum tersimpan</span>
                )}
                {p.simpan === 'proses' && <span> · menyimpan…</span>}
              </div>
            </button>
            {p.showSkor && (
              <span style={{ fontSize: 13, fontWeight: 800, color: p.skorColor, fontVariantNumeric: 'tabular-nums' }}>{p.skor}</span>
            )}
            <span style={{ fontSize: 15, color: 'var(--line-2)' }}>›</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ position: 'sticky', bottom: 0, background: '#ffffff', borderTop: '1px solid var(--line)', padding: '12px 16px calc(18px + env(safe-area-inset-bottom))', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, background: 'var(--accent)', width: `${props.progressPct}%` }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{props.selesai}/{props.total} selesai</span>
        </div>
        {!!props.belumTersimpan && (
          <div style={{ fontSize: 11, fontWeight: 700, color: MERAH, marginBottom: 8, textAlign: 'center' }}>
            {props.belumTersimpan} isian belum tersimpan di server
          </div>
        )}
        <button onClick={props.mulai} style={{ width: '100%', height: 50, borderRadius: 8, border: 'none', background: 'var(--ink)', color: '#ffffff', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{props.tombolLabel}</button>
      </div>
    </>
  );
}
