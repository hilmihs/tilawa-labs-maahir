'use client';

import { useState } from 'react';
import {
  batalkanUsulan,
  jalankanAlokasiSekarang,
  putuskanSanggahan,
  sapuKedaluwarsa,
  setujuiUsulan,
  ubahStatusVerifikasi,
} from './actions';
import { Bagian, useAksi } from './ui';

export interface BarisAntrean {
  id: string;
  gender: 'ikhwan' | 'akhwat' | null;
  pengajar: string;
  slot: string;
  status: string;
  sanggahan_status: string | null;
  bentrok_alasan: string | null;
  catatan: string | null;
}

export interface KartuUsulan {
  id: string;
  status: string;
  slot: string;
  pengajar: string;
  level: string;
  pita: string;
  putaran: number;
  peserta: number;
  terenrol: number;
  tanggal_mulai: string | null;
  tenggat: string | null;
  tilawah_halaqah_id: number | null;
  grup_wa_link: string | null;
  /** Gender slot — dipakai menyaring papan sesuai pilihan gender dashboard. */
  gender: 'ikhwan' | 'akhwat' | null;
  alasan_tolak: string | null;
  /** Tautan wa.me konfirmasi; hanya ada untuk status 'menunggu'. */
  wa_url: string | null;
}

interface Props {
  periodeId: string;
  antrean: BarisAntrean[];
  usulan: KartuUsulan[];
  /** Daftar usulan dipotong di batas baris terbaru. */
  terpotong?: boolean;
  batas?: number;
  preset: { id: string; nama: string; gender: string; tipe: string }[];
}

const STATUS_RIWAYAT = ['ditolak', 'kedaluwarsa', 'batal', 'gagal'];

export function PanelKerja({ periodeId, antrean, usulan, terpotong, batas, preset }: Props) {
  return (
    <>
      <Alokasi periodeId={periodeId} preset={preset} />
      <PapanUsulan usulan={usulan.filter((u) => !STATUS_RIWAYAT.includes(u.status))} terpotong={terpotong} batas={batas} />
      <Riwayat usulan={usulan.filter((u) => STATUS_RIWAYAT.includes(u.status))} />
      <Antrean baris={antrean} />
    </>
  );
}

const waktuWib = (iso: string) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

/** "2026-10-21" → "Rab, 21 Okt 2026". Tanggal murni, jadi dibaca sebagai UTC. */
function tanggalTampil(t: string): string {
  const d = new Date(`${t.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function Alokasi({ periodeId, preset }: { periodeId: string; preset: Props['preset'] }) {
  const { pending, jalan, tampilan } = useAksi();
  const [ikhwan, setIkhwan] = useState('');
  const [akhwat, setAkhwat] = useState('');

  const opsi = (gender: string) => preset.filter((p) => p.gender === gender);

  return (
    <Bagian
      judul="Jalankan alokasi"
      keterangan="Membentuk usulan halaqah dari antrean pendaftar dan pengajar yang tersedia. Berputar: tidak ada pengajar mendapat halaqah kedua sebelum semua yang bersedia mendapat yang pertama. Hasilnya usulan — belum halaqah."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Prioritas ikhwan</span>
          <select className="input" value={ikhwan} onChange={(e) => setIkhwan(e.target.value)}>
            <option value="">Urutan waktu pengisian form</option>
            {opsi('ikhwan').map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama} ({p.tipe})
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Prioritas akhwat</span>
          <select className="input" value={akhwat} onChange={(e) => setAkhwat(e.target.value)}>
            <option value="">Urutan waktu pengisian form</option>
            {opsi('akhwat').map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama} ({p.tipe})
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn"
          disabled={pending}
          onClick={() =>
            jalan(() =>
              jalankanAlokasiSekarang({
                periodeId,
                presetIkhwanId: ikhwan || null,
                presetAkhwatId: akhwat || null,
              })
            )
          }
        >
          {pending ? 'Menjalankan…' : 'Jalankan alokasi'}
        </button>
        <button
          className="btn btn-sm btn-ghost"
          disabled={pending}
          onClick={() => jalan(() => sapuKedaluwarsa({ periodeId }))}
        >
          Sapu yang lewat tenggat
        </button>
      </div>
      {tampilan}
    </Bagian>
  );
}

function PapanUsulan({ usulan, terpotong, batas }: { usulan: KartuUsulan[]; terpotong?: boolean; batas?: number }) {
  const { pending, jalan, tampilan } = useAksi();
  const [waBaru, setWaBaru] = useState<{ url: string; pengajar: string } | null>(null);

  const perStatus = new Map<string, KartuUsulan[]>();
  for (const u of usulan) {
    if (!perStatus.has(u.status)) perStatus.set(u.status, []);
    perStatus.get(u.status)!.push(u);
  }
  const urutStatus = ['usulan', 'menunggu', 'dikonfirmasi', 'dikirim', 'disetujui'];

  return (
    <Bagian
      judul="Papan usulan & konfirmasi"
      keterangan="Setujui usulan untuk menerbitkan tautan konfirmasi pengajar. Tautan dikirim lewat WhatsApp oleh Anda — maahir tidak memiliki gateway pengirim."
    >
      {usulan.length === 0 && (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Belum ada usulan. Jalankan alokasi setelah pendaftar dan ketersediaan masuk.
        </p>
      )}
      {terpotong && (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Menampilkan {batas ?? 200} terbaru per bagian.
        </p>
      )}
      {tampilan}
      {waBaru && (
        <p className="t-small" style={{ marginBottom: 10 }}>
          <a className="btn btn-sm" href={waBaru.url} target="_blank" rel="noopener noreferrer">
            Buka WhatsApp untuk mengirim tautan ke {waBaru.pengajar}
          </a>
        </p>
      )}

      {urutStatus
        .filter((s) => perStatus.has(s))
        .map((s) => (
          <div key={s} style={{ marginBottom: 14 }}>
            <h3 className="t-small" style={{ fontWeight: 700, marginBottom: 6 }}>
              {labelStatus(s)} ({perStatus.get(s)!.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {perStatus.get(s)!.map((u) => (
                <div key={u.id} className="card-flat" style={{ padding: '8px 10px' }}>
                  <KepalaKartu u={u} />
                  <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                    {u.tanggal_mulai ? `Mulai ${tanggalTampil(u.tanggal_mulai)}` : 'Tanggal mulai belum ditetapkan'}
                    {u.tenggat && s === 'menunggu' ? ` · tenggat ${waktuWib(u.tenggat)} WIB` : ''}
                    {u.tilawah_halaqah_id ? ` · tilawah #${u.tilawah_halaqah_id}` : ''}
                    {u.terenrol > 0 ? ` · ${u.terenrol}/${u.peserta} terenrol` : ''}
                    {u.grup_wa_link ? ' · grup siap' : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {(s === 'usulan' || s === 'disetujui') && (
                      <button
                        className="btn btn-sm"
                        disabled={pending}
                        onClick={() =>
                          jalan(
                            () => setujuiUsulan({ usulanId: u.id }),
                            (data) => {
                              const d = data as { waUrl?: string; pengajar?: string } | undefined;
                              if (d?.waUrl) setWaBaru({ url: d.waUrl, pengajar: d.pengajar ?? u.pengajar });
                            }
                          )
                        }
                      >
                        Deklarasikan penuh
                      </button>
                    )}
                    {s === 'menunggu' && u.wa_url && (
                      <a className="btn btn-sm" href={u.wa_url} target="_blank" rel="noopener noreferrer">
                        Kirim WA ke {u.pengajar}
                      </a>
                    )}
                    {s !== 'dikirim' && !u.tilawah_halaqah_id && <TombolBatal usulanId={u.id} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </Bagian>
  );
}

function KepalaKartu({ u }: { u: KartuUsulan }) {
  return (
    <div className="t-small">
      <strong>{u.slot}</strong> · {u.pengajar} · {u.level} · {u.pita} · {u.peserta} murid · putaran {u.putaran}
    </div>
  );
}

/**
 * Usulan yang ditolak, lewat tenggat, dibatalkan, atau gagal dikirim.
 *
 * Dulu hilang begitu saja dari papan — padahal koordinator perlu tahu siapa yang
 * menolak dan kenapa, dan usulan yang masih memegang peserta harus bisa dilepas
 * supaya muridnya kembali antre.
 */
function Riwayat({ usulan }: { usulan: KartuUsulan[] }) {
  const [buka, setBuka] = useState(false);
  if (usulan.length === 0) return null;
  const masihMemegang = usulan.filter(
    (u) => (u.status === 'ditolak' || u.status === 'kedaluwarsa') && u.peserta > 0
  ).length;

  return (
    <Bagian
      judul={`Riwayat usulan (${usulan.length})`}
      keterangan="Ditolak pengajar, lewat tenggat, dibatalkan, atau gagal dikirim ke CMS tilawah."
    >
      {masihMemegang > 0 && (
        <p className="t-small" style={{ color: 'var(--merah-ink)', marginBottom: 6 }}>
          {masihMemegang} usulan masih memegang peserta. Batalkan supaya pesertanya kembali ke antrean.
        </p>
      )}
      <button className="btn btn-sm btn-ghost" onClick={() => setBuka((v) => !v)} aria-expanded={buka}>
        {buka ? 'Sembunyikan riwayat' : `Tampilkan riwayat (${usulan.length})`}
      </button>
      {buka && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {usulan.map((u) => (
            <div key={u.id} className="card-flat" style={{ padding: '8px 10px' }}>
              <KepalaKartu u={u} />
              <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                <strong style={{ color: u.status === 'gagal' || u.status === 'ditolak' ? 'var(--merah-ink)' : undefined }}>
                  {labelStatus(u.status)}
                </strong>
                {u.alasan_tolak ? ` — ${u.alasan_tolak}` : ''}
                {u.tilawah_halaqah_id ? ` · tilawah #${u.tilawah_halaqah_id}` : ''}
              </div>
              {(u.status === 'ditolak' || u.status === 'kedaluwarsa') && u.peserta > 0 && !u.tilawah_halaqah_id && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <TombolBatal usulanId={u.id} label="Batalkan & kembalikan peserta" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Bagian>
  );
}

function TombolBatal({ usulanId, label = 'Batalkan' }: { usulanId: string; label?: string }) {
  const { pending, jalan, tampilan } = useAksi();
  const [buka, setBuka] = useState(false);
  const [alasan, setAlasan] = useState('');

  if (!buka) {
    return (
      <button className="btn btn-sm btn-ghost" onClick={() => setBuka(true)}>
        {label}
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <input
        className="input"
        value={alasan}
        onChange={(e) => setAlasan(e.target.value)}
        placeholder="Alasan pembatalan (wajib — masuk log perubahan)"
      />
      {tampilan}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() => jalan(() => batalkanUsulan({ usulanId, alasan }))}
        >
          Konfirmasi batal
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setBuka(false)}>
          Tutup
        </button>
      </div>
      <span className="t-small" style={{ color: 'var(--muted-2)' }}>
        Peserta dikembalikan ke antrean, tidak dibuang.
      </span>
    </div>
  );
}

function Antrean({ baris }: { baris: BarisAntrean[] }) {
  return (
    <Bagian
      judul="Antrean kerja"
      keterangan="Baris yang perlu diputuskan: sanggahan slot terkunci, dan isian yang gagal salah satu butir verifikasi."
    >
      {baris.length === 0 ? (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>Tidak ada yang menunggu keputusan.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {baris.map((b) => (
            <KartuAntrean key={b.id} baris={b} />
          ))}
        </div>
      )}
    </Bagian>
  );
}

function KartuAntrean({ baris }: { baris: BarisAntrean }) {
  const { pending, jalan, tampilan } = useAksi();
  const [catatan, setCatatan] = useState('');
  const sanggahan = baris.sanggahan_status === 'menunggu';

  return (
    <div className="card-flat" style={{ padding: '8px 10px' }}>
      <div className="t-small">
        <strong>{baris.pengajar}</strong> · {baris.slot}
      </div>
      <div className="t-small" style={{ color: 'var(--muted-2)' }}>
        {sanggahan
          ? `Sanggahan slot terkunci: ${baris.bentrok_alasan ?? '—'}`
          : `Status: ${baris.status}${baris.catatan ? ` · ${baris.catatan}` : ''}`}
      </div>
      <input
        className="input"
        style={{ marginTop: 6, width: '100%' }}
        value={catatan}
        onChange={(e) => setCatatan(e.target.value)}
        placeholder={sanggahan ? 'Catatan keputusan (opsional)' : 'Catatan / alasan'}
      />
      {tampilan}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        {sanggahan ? (
          <>
            <button
              className="btn btn-sm"
              disabled={pending}
              onClick={() =>
                jalan(() => putuskanSanggahan({ ketersediaanId: baris.id, terima: true, catatan }))
              }
            >
              Terima — buka kunci
            </button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={pending}
              onClick={() =>
                jalan(() => putuskanSanggahan({ ketersediaanId: baris.id, terima: false, catatan }))
              }
            >
              Tolak — tetap terkunci
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-sm"
              disabled={pending}
              onClick={() =>
                jalan(() =>
                  ubahStatusVerifikasi({ ketersediaanId: baris.id, status: 'terverifikasi', catatan })
                )
              }
            >
              Verifikasi
            </button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={pending}
              onClick={() =>
                jalan(() =>
                  ubahStatusVerifikasi({ ketersediaanId: baris.id, status: 'ditolak', catatan })
                )
              }
            >
              Tolak
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function labelStatus(s: string): string {
  const peta: Record<string, string> = {
    usulan: 'Menunggu persetujuan koordinator',
    disetujui: 'Disetujui, belum dikirimi tautan',
    menunggu: 'Menunggu konfirmasi pengajar',
    dikonfirmasi: 'Dikonfirmasi pengajar',
    dikirim: 'Terkirim ke CMS tilawah',
    kedaluwarsa: 'Lewat tenggat',
    ditolak: 'Ditolak pengajar',
    batal: 'Dibatalkan',
    gagal: 'Gagal dikirim',
  };
  return peta[s] ?? s;
}
