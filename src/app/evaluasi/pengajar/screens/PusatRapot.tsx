'use client';

// Pusat Rapot — satu pintu untuk seluruh urusan rapot akhir satu halaqah.
//
// Sebelumnya urusan ini tersebar: empat tombol "Cetak"/"PDF" bermuara ke
// pratinjau TANPA QR, sementara "Terbitkan" (satu-satunya yang menghasilkan
// dokumen resmi) hanya bisa dicapai lewat sesi → daftar → ringkasan → ketuk
// peserta. Pengajar yang mencari "rapot ujian akhir" tak menemukan apa pun
// bernama begitu, sebab sejak 0062 ujian akhir adalah BAGIAN dari Rapot QN/PB.
//
// Layar ini menaruh keduanya sejajar di satu baris peserta, menyebut alasan
// persis kenapa seseorang belum bisa diterbitkan, dan — yang paling penting —
// memunculkan kembali token rapot yang sudah terbit. Tanpa daftar ini, token
// hanya muncul sekali di panel setelah penerbitan; `window.open` yang menyusul
// diblokir peramban HP dan rapot yang sudah masuk DB tak bisa dibuka lagi.

import { useState } from 'react';
import { alasanBelumTerbit, type RapotPayloadTrack } from '@/lib/rapot';
import { TRACKS, vonisTrack, type Track } from '@/lib/evaluasi';
import { absUrl } from '@/lib/url';
import type { RapotTerbit } from '../EvaluasiPengajarApp';

interface PesertaRingkas {
  id: string;
  nama: string;
}

interface Props {
  halaqahNama: string;
  track: Track;
  onPilihTrack: (t: Track) => void;
  /** Nama panjang track dari eval_config (mis. "Qiroatun Nadhoriyah"). */
  namaTrack: (t: Track) => string;
  /** Batch rapot_ujian_terpisah: nilai akhir murni skor ujian, tanpa sesi berkala. */
  ujianSaja: boolean;
  peserta: PesertaRingkas[];
  /** Payload rapot peserta untuk track aktif — dibangun di induk (buildRapotFor). */
  build: (pesertaId: string, track: Track) => RapotPayloadTrack;
  rapotTerbit: RapotTerbit[];
  coba: boolean;
  onCetak: (ids: string[]) => void;
  onTerbitkan: (pesertaId: string) => void;
  /** peserta_id yang penerbitannya sedang berjalan. */
  terbitBusy: string | null;
  terbitError: string | null;
  back: () => void;
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

const KAP: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 10,
};

const BTN: React.CSSProperties = {
  flexShrink: 0,
  height: 32,
  padding: '0 11px',
  borderRadius: 8,
  font: 'inherit',
  fontSize: 11.5,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function shortOf(t: Track): string {
  return t === 'qn' ? 'QN' : 'PB';
}

function fmtTgl(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function PusatRapot(props: Props) {
  const { track, peserta, rapotTerbit, coba, ujianSaja } = props;
  const short = shortOf(track);
  const [konfirmasiUlang, setKonfirmasiUlang] = useState<string | null>(null);
  const [tersalin, setTersalin] = useState<string | null>(null);

  // Satu baris = satu peserta pada track aktif.
  const baris = peserta.map((p) => {
    const tr = props.build(p.id, track).trackRapot;
    const alasan = alasanBelumTerbit(tr);
    return {
      peserta: p,
      tr,
      alasan,
      siap: alasan.length === 0,
      terbit: rapotTerbit.find((r) => r.peserta_id === p.id && r.track === track) ?? null,
    };
  });

  const siapIds = baris.filter((b) => b.siap).map((b) => b.peserta.id);
  const jumlahTerbit = baris.filter((b) => b.terbit).length;

  const salin = (token: string) => {
    navigator.clipboard
      ?.writeText(absUrl(`/evaluasi/rapot/cek/${token}`))
      .then(() => {
        setTersalin(token);
        setTimeout(() => setTersalin(null), 2000);
      })
      .catch(() => setTersalin(null));
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid var(--line)' }}>
        <button onClick={props.back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)', background: '#ffffff', color: 'var(--ink-2)', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Rapot Akhir</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {props.halaqahNama} · {peserta.length} peserta
          </div>
        </div>
      </div>

      {/* Satu rapot per track — ujian akhir ada DI DALAM masing-masing. */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 16px 0' }}>
        {TRACKS.map((t) => {
          const aktif = t === track;
          return (
            <button
              key={t}
              type="button"
              onClick={() => props.onPilihTrack(t)}
              style={{
                height: 32,
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
              Rapot Akhir {shortOf(t)}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '8px 16px 0', fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.5 }}>
        {props.namaTrack(track)} ·{' '}
        {ujianSaja
          ? `nilai akhir 100% dari Ujian ${short}`
          : `4 sesi berkala ${short} + Ujian ${short}`}
      </div>

      {coba && (
        <div style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: 10, background: 'oklch(0.95 0.05 85)', border: '1px solid oklch(0.85 0.08 85)', fontSize: 12, color: 'oklch(0.42 0.09 75)' }}>
          Mode Coba menyala — rapot resmi tak bisa diterbitkan. Matikan dulu untuk menerbitkan.
        </div>
      )}

      {props.terbitError && (
        <div style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: 10, background: MERAH_BG, border: `1px solid ${MERAH_BORDER}`, fontSize: 11.5, fontWeight: 700, color: MERAH, lineHeight: 1.45 }}>
          {props.terbitError}
        </div>
      )}

      <div style={{ padding: '18px 16px 0' }}>
        <div style={KAP}>
          Peserta ({siapIds.length} siap · {jumlahTerbit} sudah terbit)
        </div>

        {baris.length === 0 ? (
          <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, padding: 14, fontSize: 12, color: 'var(--muted-2)' }}>
            Belum ada peserta di halaqah ini.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {baris.map((b) => {
              const t = b.terbit;
              const sibuk = props.terbitBusy === b.peserta.id;
              const nilai = b.tr.nilaiAkhir;
              const vonis = vonisTrack(b.tr.peran, b.tr.lulus);
              const warna =
                vonis.nada === 'lulus' ? HIJAU : vonis.nada === 'mengulang' ? MERAH : vonis.nada === 'bawah_standar' ? AMBER : 'var(--muted-2)';
              const konfirmasi = konfirmasiUlang === b.peserta.id;
              return (
                <div
                  key={b.peserta.id}
                  style={{
                    background: '#ffffff',
                    border: `1px solid ${t ? BANNER_BORDER : 'var(--line)'}`,
                    borderRadius: 12,
                    padding: '11px 12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                        {b.peserta.nama}
                      </div>
                      <div style={{ fontSize: 11, color: b.siap ? 'var(--muted)' : MERAH, marginTop: 2, lineHeight: 1.4 }}>
                        {b.siap
                          ? `${vonis.teks} · nilai akhir ${nilai}`
                          : b.alasan.join(' · ')}
                        {t && ` · terbit ${fmtTgl(t.diterbitkan_at)}`}
                      </div>
                    </div>
                    {nilai != null && (
                      <span style={{ fontSize: 17, fontWeight: 800, color: warna, fontVariantNumeric: 'tabular-nums' }}>
                        {nilai}
                      </span>
                    )}
                  </div>

                  {/* Cetak & Terbitkan sejajar — cetak selalu boleh (pratinjau
                      tanpa QR), terbit hanya bila lengkap. */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => props.onCetak([b.peserta.id])}
                      title={b.siap ? 'Cetak lembar A4' : 'Cetak pratinjau — belum lengkap, tanpa QR'}
                      style={{ ...BTN, border: '1px solid var(--line-2)', background: '#ffffff', color: 'var(--ink-2)' }}
                    >
                      🖨 Cetak{b.siap ? '' : ' pratinjau'}
                    </button>

                    {!t && !konfirmasi && (
                      <button
                        type="button"
                        onClick={() => props.onTerbitkan(b.peserta.id)}
                        disabled={!b.siap || coba || sibuk}
                        title={b.siap ? `Terbitkan Rapot Akhir ${short} (ber-QR)` : b.alasan.join(' · ')}
                        style={{
                          ...BTN,
                          border: 'none',
                          background: !b.siap || coba ? '#c9c3b8' : HIJAU_BTN,
                          color: '#ffffff',
                          cursor: !b.siap || coba || sibuk ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {sibuk ? 'Menerbitkan…' : '✓ Terbitkan'}
                      </button>
                    )}

                    {t && (
                      <>
                        <a
                          href={`/evaluasi/pengajar/rapot/${t.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ ...BTN, border: 'none', background: HIJAU_BTN, color: '#ffffff', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                        >
                          Buka &amp; cetak
                        </a>
                        <button
                          type="button"
                          onClick={() => salin(t.token)}
                          style={{ ...BTN, border: '1px solid var(--line-2)', background: '#ffffff', color: 'var(--ink-2)' }}
                        >
                          {tersalin === t.token ? 'Tersalin ✓' : 'Salin tautan'}
                        </button>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(
                            `Rapot ${short} ${b.peserta.nama} — Halaqah ${props.halaqahNama}. Cek keasliannya di ${absUrl(
                              `/evaluasi/rapot/cek/${t.token}`,
                            )}`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ ...BTN, border: 'none', background: 'oklch(0.58 0.12 155)', color: '#ffffff', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                        >
                          WhatsApp
                        </a>
                      </>
                    )}

                    {/* Terbit ulang mencabut lembar yang sudah dibagikan, jadi
                        dikunci konfirmasi dua ketuk. */}
                    {t && !konfirmasi && !coba && (
                      <button
                        type="button"
                        onClick={() => setKonfirmasiUlang(b.peserta.id)}
                        style={{ ...BTN, border: `1px solid ${MERAH_BORDER}`, background: '#ffffff', color: MERAH }}
                      >
                        Terbitkan ulang
                      </button>
                    )}
                    {konfirmasi && (
                      <>
                        <button
                          type="button"
                          disabled={sibuk}
                          onClick={() => {
                            props.onTerbitkan(b.peserta.id);
                            setKonfirmasiUlang(null);
                          }}
                          style={{ ...BTN, border: 'none', background: 'oklch(0.55 0.16 25)', color: '#ffffff', opacity: sibuk ? 0.6 : 1 }}
                        >
                          {sibuk ? 'Menerbitkan…' : 'Ya, ganti lembar lama'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setKonfirmasiUlang(null)}
                          style={{ ...BTN, border: '1px solid var(--line)', background: '#ffffff', color: 'var(--ink-2)' }}
                        >
                          Batal
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {siapIds.length > 0 && (
        <div style={{ padding: '14px 16px 0' }}>
          <button
            type="button"
            onClick={() => props.onCetak(siapIds)}
            className="ev-dark"
            style={{ width: '100%', height: 46, borderRadius: 10, border: 'none', background: HIJAU_BTN, font: 'inherit', fontSize: 13.5, fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}
          >
            🖨 Cetak semua yang siap ({siapIds.length})
          </button>
        </div>
      )}

      {/* Repo ini tak punya generator PDF di server (lihat globals.css) — PDF
          selalu lahir dari dialog cetak peramban. Sebagian kebingungan
          "menarik PDF" berhenti di kalimat ini. */}
      <div style={{ padding: '12px 16px 0', fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.5 }}>
        Untuk menyimpan PDF: tekan Cetak, lalu di dialog cetak pilih tujuan
        <b> Save as PDF</b> (Android: <b>Simpan sebagai PDF</b>). Lembar ber-QR hanya
        didapat dari rapot yang sudah diterbitkan.
      </div>
      <div style={{ height: 28 }} />
    </>
  );
}
