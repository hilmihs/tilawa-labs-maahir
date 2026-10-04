'use client';

import { useState } from 'react';
import type { Tile, SaveStatus } from '../EvaluasiPengajarApp';

interface NilaiProps {
  nama: string;
  pos: number;
  totalPeserta: number;
  ringGradient: string;
  skor: number;
  skorColor: string;
  tierLabel: string;
  hitungan: string;
  ambang: number;
  isUjian: boolean;
  lulusLabel: string;
  lulusBg: string;
  lulusBorder: string;
  lulusColor: string;
  confirmed: boolean;
  toggleConfirm: () => void;
  jaliy: Tile[];
  khafiy: Tile[];
  catatan: string;
  setCatatan: (v: string) => void;
  isFirst: boolean;
  prevPeserta: () => void;
  simpanDisabled: boolean;
  simpanLabel: string;
  simpanLanjut: () => void;
  status: SaveStatus;
  /** Pesan galat simpan peserta ini (ditampilkan di bawah kepala). */
  gagalPesan?: string | null;
  /** Jumlah isian LAIN (peserta/sesi lain) yang belum tersimpan. */
  gagalLain?: number;
  onCobaLagi?: () => void;
  /** Nama halaqah — ditampilkan bila pengajar punya lebih dari satu halaqah. */
  halaqahNama?: string | null;
  /** Jarak menempel kepala dari atas (tinggi pita Mode Coba / peringatan). */
  stickyTop?: number;
  /** Sesi terkirim: semua kontrol hanya-baca. */
  terkunci?: boolean;
  /** Peserta ini punya isian di server/lokal (tombol kosongkan hanya tampil bila ada). */
  adaNilai?: boolean;
  onResetPeserta?: () => void | Promise<void>;
  resetPesertaBusy?: boolean;
  resetPesertaError?: string | null;
  back: () => void;
}

const MERAH = 'oklch(0.46 0.14 25)';

function statusView(status: SaveStatus, terkunci: boolean): { dot: string; text: string; merah?: boolean } {
  if (terkunci) return { dot: 'oklch(0.62 0.11 150)', text: '🔒 Terkirim' };
  switch (status) {
    case 'pending':
      return { dot: 'oklch(0.78 0.10 80)', text: 'Belum terkirim…' };
    case 'saving':
      return { dot: 'oklch(0.78 0.10 80)', text: 'Menyimpan…' };
    case 'saved':
      return { dot: 'oklch(0.62 0.11 150)', text: 'Tersimpan' };
    case 'error':
      return { dot: 'oklch(0.62 0.16 25)', text: 'Belum tersimpan', merah: true };
    case 'conflict':
      return { dot: 'oklch(0.70 0.13 70)', text: 'Dimuat ulang' };
    case 'coba':
      // Dulu Mode Coba menampilkan "Tersimpan" padahal tak ada yang disimpan.
      return { dot: 'oklch(0.75 0.12 85)', text: 'Mode Coba — tidak disimpan' };
    default:
      return { dot: 'var(--line-2)', text: 'Belum diubah' };
  }
}

export function Nilai(props: NilaiProps) {
  const ro = !!props.terkunci;
  const sv = statusView(props.status, ro);
  const [konfirmasiKosong, setKonfirmasiKosong] = useState(false);
  // Hanya-baca: ketukan kartu & koreksi angka tidak melakukan apa pun.
  const tap = (c: Tile) => (ro ? undefined : c.tap);
  return (
    <>
      <div style={{ padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid var(--line)', position: 'sticky', top: props.stickyTop ?? 0, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={props.back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)', background: '#ffffff', color: 'var(--ink-2)', fontSize: 15, cursor: 'pointer', flexShrink: 0 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{props.nama}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              Peserta {props.pos} dari {props.totalPeserta}
              {props.halaqahNama ? ` · ${props.halaqahNama}` : ''}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: sv.merah ? 800 : 600,
              color: sv.merah ? MERAH : 'oklch(0.50 0.09 70)',
              background: sv.merah ? 'oklch(0.97 0.02 25)' : 'oklch(0.96 0.035 85)',
              border: `1px solid ${sv.merah ? 'oklch(0.85 0.08 25)' : 'oklch(0.88 0.07 82)'}`,
              padding: '4px 9px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: sv.dot }} />{sv.text}
          </div>
        </div>
        {/* Kegagalan simpan tak lagi senyap: pesan peserta ini + jumlah isian
            lain yang tertahan, dengan tombol coba lagi di tempat. */}
        {!ro && (props.gagalPesan || !!props.gagalLain) && (
          <div role="alert" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, lineHeight: 1.35, color: MERAH, background: 'oklch(0.97 0.02 25)', border: '1px solid oklch(0.85 0.08 25)', borderRadius: 8, padding: '6px 8px' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              {props.gagalPesan ? <>{props.gagalPesan} </> : null}
              {props.gagalLain ? <b>{props.gagalLain} isian lain belum tersimpan.</b> : null}
            </span>
            {props.onCobaLagi && (
              <button
                type="button"
                onClick={props.onCobaLagi}
                style={{ flexShrink: 0, height: 26, padding: '0 10px', borderRadius: 7, border: 'none', background: 'oklch(0.55 0.16 25)', color: '#fff', font: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Coba lagi
              </button>
            )}
          </div>
        )}
      </div>

      {ro && (
        <div style={{ margin: '14px 16px 0', padding: '10px 12px', borderRadius: 12, background: 'oklch(0.96 0.035 150)', border: '1px solid oklch(0.85 0.06 150)', color: 'oklch(0.36 0.09 150)', fontSize: 12, lineHeight: 1.45 }}>
          <b>🔒 Sesi ini sudah dikirim — hanya-baca.</b> Nilai tidak bisa diubah di sini. Buka kunci
          sesi dari daftar peserta bila perlu diperbaiki.
        </div>
      )}

      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ borderRadius: 20, padding: 16, background: 'linear-gradient(150deg, oklch(0.97 0.02 165), oklch(0.945 0.03 165))', border: '1px solid var(--accent-line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 84, height: 84, borderRadius: '50%', flexShrink: 0, background: props.ringGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#fbfaf7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 21, fontWeight: 800, lineHeight: 1, color: props.skorColor, fontVariantNumeric: 'tabular-nums' }}>{props.skor}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted-2)' }}>/ 100</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: props.skorColor }}>{props.tierLabel}</div>
              <div style={{ fontSize: 11, color: '#5c5950', marginTop: 2 }}>{props.hitungan}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Ambang lulus: {props.ambang} / 100</div>
            </div>
          </div>
        </div>
      </div>

      {props.isUjian && (
        <div style={{ margin: '14px 16px 0', padding: '12px 14px', borderRadius: 12, background: props.lulusBg, border: `1px solid ${props.lulusBorder}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: props.lulusColor }}>Rekomendasi: {props.lulusLabel}</span>
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: props.lulusColor, cursor: 'pointer' }}>
            <input type="checkbox" checked={props.confirmed} onChange={props.toggleConfirm} disabled={ro} />
            Konfirmasi
          </label>
        </div>
      )}

      <div style={{ padding: '18px 16px 0' }}>
        {!ro && (
          <div style={{ fontSize: 11, color: 'var(--muted-2)', marginBottom: 10 }}>Ketuk kartu setiap ada kesalahan · ketuk angka untuk mengoreksi manual</div>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'oklch(0.46 0.14 25)', marginBottom: 8 }}>
          Lahn Jaliy <span style={{ fontWeight: 500, color: 'var(--muted-2)', textTransform: 'none' }}>· −6 / kesalahan</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {props.jaliy.map((c) => (
            <div key={c.key} onClick={tap(c)} className={ro ? undefined : 'ev-tile'} style={{ position: 'relative', minHeight: 104, borderRadius: 16, padding: '14px 8px 10px', background: c.tileBg, border: `1.5px solid ${c.tileBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: ro ? 'default' : 'pointer' }}>
              {c.showMinus && !ro && (
                <button onClick={c.minus} className="ev-minus" style={{ position: 'absolute', top: -14, left: -14, width: 42, height: 42, borderRadius: '50%', background: '#ffffff', border: `2.5px solid ${c.tileBorder}`, color: c.textColor, fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer', boxShadow: '0 2px 6px rgba(20,18,14,0.18)', zIndex: 2 }}>−</button>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.25, color: c.textColor, textAlign: 'center' }}>{c.label}</span>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={c.count} onClick={c.stop} onChange={c.setCount} readOnly={ro} style={{ width: 52, height: 34, textAlign: 'center', fontSize: 20, fontWeight: 800, color: c.textColor, background: '#ffffff', border: `1.5px solid ${c.tileBorder}`, borderRadius: 8, outline: 'none', fontVariantNumeric: 'tabular-nums', cursor: 'text' }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'oklch(0.48 0.10 75)', marginBottom: 8 }}>
          Lahn Khafiy <span style={{ fontWeight: 500, color: 'var(--muted-2)', textTransform: 'none' }}>· −2 / kesalahan</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {props.khafiy.map((c) => (
            <div key={c.key} onClick={tap(c)} className={ro ? undefined : 'ev-tile-sm'} style={{ position: 'relative', minHeight: 62, borderRadius: 14, padding: '8px 12px', background: c.tileBg, border: `1.5px solid ${c.tileBorder}`, display: 'flex', alignItems: 'center', gap: 8, cursor: ro ? 'default' : 'pointer' }}>
              {c.showMinus && !ro && (
                <button onClick={c.minus} className="ev-minus" style={{ position: 'absolute', top: -12, left: -12, width: 36, height: 36, borderRadius: '50%', background: '#ffffff', border: `2.5px solid ${c.tileBorder}`, color: c.textColor, fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, cursor: 'pointer', boxShadow: '0 2px 6px rgba(20,18,14,0.18)', zIndex: 2 }}>−</button>
              )}
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, lineHeight: 1.25, color: c.textColor }}>{c.label}</span>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={c.count} onClick={c.stop} onChange={c.setCount} readOnly={ro} style={{ width: 38, height: 30, textAlign: 'center', fontSize: 15, fontWeight: 800, color: c.textColor, background: '#ffffff', border: `1.5px solid ${c.tileBorder}`, borderRadius: 7, outline: 'none', fontVariantNumeric: 'tabular-nums', flexShrink: 0, cursor: 'text' }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Catatan untuk peserta</div>
        <textarea
          placeholder={ro ? '' : 'Mad wajib di ayat 148 masih pendek. Latih lagi 5× sebelum pertemuan depan.'}
          value={props.catatan}
          readOnly={ro}
          onChange={(e) => props.setCatatan(e.target.value)}
          style={{ width: '100%', minHeight: 66, padding: '10px 12px', background: '#ffffff', border: '1px solid var(--line-2)', borderRadius: 8, font: 'inherit', fontSize: 13, lineHeight: 1.45, color: 'var(--ink)', outline: 'none', resize: 'none' }}
        />
      </div>

      {/* Kosongkan SATU peserta — bawaan reset sekarang (reset seluruh sesi
          ada di layar daftar, di balik konfirmasi kedua). */}
      {!ro && props.onResetPeserta && props.adaNilai && (
        <div style={{ padding: '14px 16px 0' }}>
          {konfirmasiKosong ? (
            <div style={{ background: 'oklch(0.97 0.02 25)', border: '1px solid oklch(0.85 0.08 25)', borderRadius: 10, padding: '10px 12px', color: MERAH, fontSize: 12, lineHeight: 1.4 }}>
              <div>
                Kosongkan nilai <b>{props.nama}</b> di sesi ini? Skor, catatan, dan tanda selesai
                peserta ini dihapus. Peserta lain tidak tersentuh.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  disabled={props.resetPesertaBusy}
                  onClick={async () => {
                    await props.onResetPeserta?.();
                    setKonfirmasiKosong(false);
                  }}
                  style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: 'oklch(0.55 0.16 25)', font: 'inherit', fontSize: 12, fontWeight: 700, color: '#fff', cursor: props.resetPesertaBusy ? 'default' : 'pointer', opacity: props.resetPesertaBusy ? 0.6 : 1 }}
                >
                  {props.resetPesertaBusy ? 'Mengosongkan…' : 'Ya, kosongkan'}
                </button>
                <button
                  type="button"
                  disabled={props.resetPesertaBusy}
                  onClick={() => setKonfirmasiKosong(false)}
                  style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', font: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setKonfirmasiKosong(true)}
              style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid oklch(0.85 0.08 25)', background: '#ffffff', font: 'inherit', fontSize: 12, fontWeight: 600, color: MERAH, cursor: 'pointer' }}
            >
              ♻ Kosongkan nilai peserta ini
            </button>
          )}
        </div>
      )}
      {props.resetPesertaError && (
        <div style={{ margin: '8px 16px 0', fontSize: 11, color: MERAH, background: 'oklch(0.97 0.02 25)', border: '1px solid oklch(0.85 0.08 25)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.4 }}>
          {props.resetPesertaError}
        </div>
      )}

      <div style={{ height: 110 }} />
      <div style={{ position: 'sticky', bottom: 0, background: '#ffffff', borderTop: '1px solid var(--line)', padding: '10px 16px 14px' }}>
        {/* Gerbang ujian: konfirmasi kelulusan wajib sebelum simpan. Kotak centang
            aslinya di kartu rekomendasi (jauh di atas, kelewat saat menggulir), jadi
            tombol tampak "terkunci" tanpa sebab. Salinannya ditaruh di sini supaya
            alasannya kebaca dan bisa dicentang di tempat. */}
        {!ro && props.isUjian && props.simpanDisabled && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              padding: '9px 11px',
              borderRadius: 10,
              background: props.lulusBg,
              border: `1px solid ${props.lulusBorder}`,
              color: props.lulusColor,
              fontSize: 12,
              lineHeight: 1.35,
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={props.confirmed} onChange={props.toggleConfirm} />
            <span>
              Centang untuk mengonfirmasi hasil <strong>{props.lulusLabel}</strong> — tombol simpan
              terbuka setelah dikonfirmasi.
            </span>
          </label>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={props.prevPeserta} disabled={props.isFirst} className="ev-ghost" style={{ width: 50, height: 48, borderRadius: 8, border: '1px solid var(--line-2)', background: '#ffffff', font: 'inherit', fontSize: 16, color: 'var(--ink)', cursor: props.isFirst ? 'not-allowed' : 'pointer', opacity: props.isFirst ? 0.5 : 1 }}>←</button>
          <button onClick={props.simpanLanjut} disabled={props.simpanDisabled} className="ev-dark" style={{ flex: 1, height: 48, borderRadius: 8, border: 'none', background: 'var(--ink)', color: '#ffffff', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: props.simpanDisabled ? 'not-allowed' : 'pointer', opacity: props.simpanDisabled ? 0.5 : 1 }}>{props.simpanLabel}</button>
        </div>
      </div>
    </>
  );
}
