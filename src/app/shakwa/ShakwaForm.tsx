'use client';

import { useState, useTransition } from 'react';
import { kirimShakwa, type KirimShakwaResult } from './actions';
import {
  KATEGORI,
  KATEGORI_LUPA_PASSWORD,
  LUPA_PASSWORD_PATH,
  IZIN_JENIS,
  MAX_LAMPIRAN,
  kategoriDef,
  type ShakwaIzinJenis,
} from '@/lib/shakwa';

import type { ProgramOpsi } from '@/lib/shakwa-program';

export type HalaqahPengajar = { id: string; name: string };

// Nilai tetap — sama dengan konstanta di src/lib/shakwa-program.ts (modul itu
// server-only, jadi tak diimpor nilainya di sini).
const PROGRAM_LAINNYA = 'lainnya';
const HALAQAH_UMUM = 'umum';
const PROGRAM_LAIN_SAJA = '__lain';

type RincianRow = {
  tanggal: string;
  jenis: ShakwaIzinJenis | '';
  menit: string;
  jadwalGanti: string;
  halaqahId: string;
  badalId: string;
};

const barisKosong: RincianRow = { tanggal: '', jenis: '', menit: '', jadwalGanti: '', halaqahId: '', badalId: '' };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  fontSize: 13,
  marginBottom: 6,
};

export function ShakwaForm({
  prefillNama,
  prefillGender,
  isPengajar,
  halaqahPengajar,
  semuaProgram,
  programSaya,
  calonBadal,
}: {
  prefillNama: string;
  prefillGender: string;
  isPengajar: boolean;
  halaqahPengajar: HalaqahPengajar[];
  /** Semua program aktif + halaqahnya (dari data, bukan daftar tetap). */
  semuaProgram: ProgramOpsi[];
  /** Program & halaqah yang diajar pengguna ini — kosong bila bukan pengajar. */
  programSaya: ProgramOpsi[];
  /** Pengajar aktif segender (tanpa diri sendiri) — pilihan badal. */
  calonBadal: Array<{ id: string; name: string }>;
}) {
  const [gender, setGender] = useState(prefillGender);
  // Pengajar melihat program yang ia ajar dulu; "Program lain…" membuka daftar lengkap.
  const [pakaiDaftarLengkap, setPakaiDaftarLengkap] = useState(programSaya.length === 0);
  const daftarProgram = pakaiDaftarLengkap ? semuaProgram : programSaya;
  const [programId, setProgramId] = useState(
    !pakaiDaftarLengkap && programSaya.length === 1 ? programSaya[0].id : ''
  );
  const [halaqahId, setHalaqahId] = useState('');
  const program = daftarProgram.find((p) => p.id === programId) ?? null;
  // Daftar lengkap disaring gender pelapor; halaqah milik pengajar ditampilkan semua.
  const opsiHalaqah = (program?.halaqah ?? []).filter(
    (h) => !pakaiDaftarLengkap || !gender || !h.gender || h.gender === gender
  );

  const [kategori, setKategori] = useState('');
  const [rincian, setRincian] = useState<RincianRow[]>([{ ...barisKosong }]);
  const [hasil, setHasil] = useState<KirimShakwaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lupaPassword = kategori === KATEGORI_LUPA_PASSWORD;
  const def = kategori && !lupaPassword ? kategoriDef(kategori) : null;
  const terkunci = !!def?.butuhLogin && !isPengajar;

  function ubahRincian(idx: number, patch: Partial<RincianRow>) {
    setRincian((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function handleSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await kirimShakwa(undefined, fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setHasil(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (hasil?.ok) {
    return (
      <div className="card-flat" style={{ padding: '20px 22px' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
          Jazakumullahu khairan — laporan Anda tersimpan.
        </div>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 14 }}>
          Nomor tiket <strong className="t-mono">{hasil.nomorTiket}</strong>. Simpan nomor ini untuk
          menanyakan tindak lanjutnya.
        </p>
        {hasil.waUrl ? (
          <>
            <a
              href={hasil.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
            >
              Kirim ke {hasil.tujuanNama ?? 'penanggung jawab'} via WhatsApp
            </a>
            <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 8 }}>
              Pesannya sudah disiapkan; Anda tinggal menekan kirim di WhatsApp.
            </p>
          </>
        ) : (
          <p className="t-small" style={{ color: 'var(--muted-2)' }}>
            Laporan ini masuk ke rekap harian koordinator — tak perlu dikirim lewat WhatsApp.
          </p>
        )}
        {hasil.badalWa && hasil.badalWa.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="t-small" style={{ fontWeight: 600, marginBottom: 6 }}>
              Kabari pengajar badal
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {hasil.badalWa.map((b, i) => (
                <a
                  key={`${b.url}-${i}`}
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                  style={{ textDecoration: 'none' }}
                >
                  Kabari badal: {b.nama}
                </a>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setHasil(null);
              setKategori('');
              setRincian([{ ...barisKosong }]);
            }}
          >
            Kirim laporan lain
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="card-flat" style={{ padding: '18px 20px' }}>
      {/* Honeypot: disembunyikan dari manusia, diisi bot. */}
      <input
        type="text"
        name="alamat"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
      />

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="shakwa-gender">
          Gender <span style={{ color: 'var(--merah-ink)' }}>*</span>
        </label>
        <select
          id="shakwa-gender"
          name="gender"
          required
          value={gender}
          onChange={(e) => {
            setGender(e.target.value);
            setHalaqahId('');
          }}
          className="input"
          style={{ width: '100%' }}
        >
          <option value="">— pilih —</option>
          <option value="akhwat">AKHWAT</option>
          <option value="ikhwan">IKHWAN</option>
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="shakwa-nama">
          Nama Lengkap <span style={{ color: 'var(--merah-ink)' }}>*</span>
        </label>
        <input
          id="shakwa-nama"
          name="nama"
          required
          defaultValue={prefillNama}
          className="input"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="shakwa-wa">
          Nomor WhatsApp
        </label>
        <input
          id="shakwa-wa"
          name="pelapor_wa"
          inputMode="tel"
          placeholder="08xxxxxxxxxx — agar koordinator bisa membalas"
          className="input"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="shakwa-kategori">
          Laporan Terkait <span style={{ color: 'var(--merah-ink)' }}>*</span>
        </label>
        <select
          id="shakwa-kategori"
          name="kategori"
          required
          value={kategori}
          onChange={(e) => setKategori(e.target.value)}
          className="input"
          style={{ width: '100%' }}
        >
          <option value="">— pilih kategori —</option>
          {KATEGORI.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
              {k.butuhLogin ? ' (perlu masuk sebagai pengajar)' : ''}
            </option>
          ))}
          <option value={KATEGORI_LUPA_PASSWORD}>Lupa Password</option>
        </select>
      </div>

      {lupaPassword && (
        <div
          className="card-flat"
          style={{ padding: '14px 16px', borderLeft: '3px solid var(--kuning)', marginBottom: 16 }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Lupa password tak perlu lewat formulir ini</div>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
            Reset password bisa Anda ajukan sendiri di halaman khusus — lebih cepat daripada
            menunggu tindak lanjut koordinator.
          </p>
          <a href={LUPA_PASSWORD_PATH} className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Buka halaman Lupa Password
          </a>
        </div>
      )}

      {!lupaPassword && (
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle} htmlFor="shakwa-program">
            Program <span style={{ color: 'var(--merah-ink)' }}>*</span>
          </label>
          <select
            id="shakwa-program"
            name="program_id"
            required
            value={programId}
            onChange={(e) => {
              const v = e.target.value;
              setHalaqahId('');
              if (v === PROGRAM_LAIN_SAJA) {
                setPakaiDaftarLengkap(true);
                setProgramId('');
                return;
              }
              setProgramId(v);
            }}
            className="input"
            style={{ width: '100%' }}
          >
            <option value="">— pilih program —</option>
            {daftarProgram.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
            {!pakaiDaftarLengkap ? (
              <option value={PROGRAM_LAIN_SAJA}>Program lain…</option>
            ) : (
              <option value={PROGRAM_LAINNYA}>Lainnya / tidak terkait program</option>
            )}
          </select>
          {!pakaiDaftarLengkap && (
            <p className="t-small" style={{ marginTop: 6 }}>
              Menampilkan program yang Anda ajar.
            </p>
          )}

          {programId && programId !== PROGRAM_LAINNYA && (
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle} htmlFor="shakwa-halaqah">
                Halaqah <span style={{ color: 'var(--merah-ink)' }}>*</span>
              </label>
              <select
                id="shakwa-halaqah"
                name="halaqah_id"
                required
                value={halaqahId}
                onChange={(e) => setHalaqahId(e.target.value)}
                className="input"
                style={{ width: '100%' }}
              >
                <option value="">
                  {pakaiDaftarLengkap && !gender ? '— pilih gender dulu —' : '— pilih halaqah —'}
                </option>
                {opsiHalaqah.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nama}
                  </option>
                ))}
                <option value={HALAQAH_UMUM}>Tidak terkait halaqah tertentu</option>
              </select>
            </div>
          )}
        </div>
      )}

      {terkunci && def && (
        <div
          className="card-flat"
          style={{ padding: '14px 16px', borderLeft: '3px solid var(--kuning)', marginBottom: 16 }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Kategori {def.label} perlu masuk dulu</div>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
            Laporan ini menyangkut data pengajar, jadi identitas pengirimnya harus pasti.
          </p>
          <a href="/?next=/shakwa" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Masuk sebagai pengajar
          </a>
        </div>
      )}

      {def && !terkunci && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>{def.judulBlok}</div>
          <p
            className="t-small"
            style={{ color: 'var(--muted-2)', whiteSpace: 'pre-line', marginBottom: 14 }}
          >
            {def.hintFormat}
          </p>

          {def.fieldTambahan.map((f) => (
            <div key={f.name} style={{ marginBottom: 14 }}>
              <label style={labelStyle} htmlFor={`tambahan-${f.name}`}>
                {f.label} <span style={{ color: 'var(--merah-ink)' }}>*</span>
              </label>
              <select
                id={`tambahan-${f.name}`}
                name={`tambahan_${f.name}`}
                required
                className="input"
                style={{ width: '100%' }}
              >
                <option value="">— pilih —</option>
                {f.opsi.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle} htmlFor="shakwa-isi">
              {def.labelIsi} <span style={{ color: 'var(--merah-ink)' }}>*</span>
            </label>
            <textarea
              id="shakwa-isi"
              name="isi"
              required
              rows={6}
              className="input"
              style={{ width: '100%' }}
            />
          </div>

          {def.value === 'izin' && (
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>
                Rincian izin <span style={{ color: 'var(--merah-ink)' }}>*</span>
              </div>
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
                Rincian ini yang membuat Anda tak perlu tabayyun lagi saat ketua kelas mengisi
                observasi hari itu.
              </p>
              {rincian.map((r, idx) => {
                const jenisDef = IZIN_JENIS.find((j) => j.value === r.jenis);
                return (
                  <div
                    key={idx}
                    className="card-flat"
                    style={{ padding: '12px 14px', marginBottom: 8, background: 'var(--surface-2)' }}
                  >
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                      <div>
                        <label className="t-tiny" htmlFor={`izin-tanggal-${idx}`} style={{ color: 'var(--muted-2)' }}>
                          Tanggal
                        </label>
                        <input
                          id={`izin-tanggal-${idx}`}
                          type="date"
                          name="izin_tanggal"
                          value={r.tanggal}
                          onChange={(e) => ubahRincian(idx, { tanggal: e.target.value })}
                          className="input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label className="t-tiny" htmlFor={`izin-jenis-${idx}`} style={{ color: 'var(--muted-2)' }}>
                          Jenis
                        </label>
                        <select
                          id={`izin-jenis-${idx}`}
                          name="izin_jenis"
                          value={r.jenis}
                          onChange={(e) => ubahRincian(idx, { jenis: e.target.value as ShakwaIzinJenis })}
                          className="input"
                          style={{ width: '100%' }}
                        >
                          <option value="">— pilih —</option>
                          {IZIN_JENIS.map((j) => (
                            <option key={j.value} value={j.value}>
                              {j.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="t-tiny" htmlFor={`izin-halaqah-${idx}`} style={{ color: 'var(--muted-2)' }}>
                          Halaqah
                        </label>
                        <select
                          id={`izin-halaqah-${idx}`}
                          name="izin_halaqah"
                          value={r.halaqahId}
                          onChange={(e) => ubahRincian(idx, { halaqahId: e.target.value })}
                          className="input"
                          style={{ width: '100%' }}
                        >
                          <option value="">Semua halaqah saya</option>
                          {halaqahPengajar.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="t-tiny" htmlFor={`izin-menit-${idx}`} style={{ color: 'var(--muted-2)' }}>
                          {jenisDef?.butuhBadal
                            ? 'Pengajar Badal'
                            : jenisDef?.butuhTanggalGanti
                            ? 'Jadwal Kelas Pengganti'
                            : jenisDef?.value === 'KMT'
                              ? 'Lama Terlambat (menit)'
                              : jenisDef?.value === 'KBLA'
                                ? 'Lama KBLA (menit)'
                                : 'Jumlah menit'}
                        </label>
                        {jenisDef?.butuhBadal ? (
                          <select
                            id={`izin-menit-${idx}`}
                            name="izin_badal"
                            required
                            value={r.badalId}
                            onChange={(e) => ubahRincian(idx, { badalId: e.target.value })}
                            className="input"
                            style={{ width: '100%' }}
                          >
                            <option value="">— pilih pengajar —</option>
                            {calonBadal.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        ) : jenisDef?.butuhTanggalGanti ? (
                          <input
                            id={`izin-menit-${idx}`}
                            type="date"
                            name="izin_jadwal_ganti"
                            value={r.jadwalGanti}
                            onChange={(e) => ubahRincian(idx, { jadwalGanti: e.target.value })}
                            className="input"
                            style={{ width: '100%' }}
                          />
                        ) : (
                          <input
                            id={`izin-menit-${idx}`}
                            type="number"
                            min={0}
                            name="izin_menit"
                            value={r.menit}
                            // readOnly, bukan disabled: field disabled tak ikut terkirim
                            // dan akan menggeser pasangan array rincian di server.
                            readOnly={!jenisDef?.butuhMenit}
                            placeholder={jenisDef?.butuhMenit ? 'mis. 15' : '—'}
                            onChange={(e) => ubahRincian(idx, { menit: e.target.value })}
                            className="input"
                            style={{ width: '100%' }}
                          />
                        )}
                      </div>
                    </div>
                    {/* Field sejajar per indeks: yang tak dipakai tetap dikirim kosong
                        supaya urutan baris di server tak bergeser. */}
                    {!jenisDef?.butuhTanggalGanti && <input type="hidden" name="izin_jadwal_ganti" value="" />}
                    {(jenisDef?.butuhTanggalGanti || jenisDef?.butuhBadal) && (
                      <input type="hidden" name="izin_menit" value="" />
                    )}
                    {!jenisDef?.butuhBadal && <input type="hidden" name="izin_badal" value="" />}
                    {rincian.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ marginTop: 8 }}
                        onClick={() => setRincian((rows) => rows.filter((_, i) => i !== idx))}
                      >
                        Hapus baris
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setRincian((rows) => [...rows, { ...barisKosong }])}
              >
                + Tambah rincian
              </button>
            </div>
          )}

          {def.pakaiLampiran && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle} htmlFor="shakwa-lampiran">
                Foto / bukti (opsional)
              </label>
              <input
                id="shakwa-lampiran"
                type="file"
                name="lampiran"
                multiple
                accept="image/*,application/pdf"
                className="input"
                style={{ width: '100%' }}
              />
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
                Maksimal {MAX_LAMPIRAN} berkas, 5 MB per berkas (JPG/PNG/WEBP/PDF).
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="t-small" style={{ color: 'var(--merah-ink)', marginBottom: 10 }}>
          {error}
        </div>
      )}

      {!lupaPassword && (
        <button type="submit" className="btn btn-primary" disabled={pending || !def || terkunci}>
          {pending ? 'Mengirim…' : 'Kirim Laporan'}
        </button>
      )}
      <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 10 }}>
        Semoga Allah mudahkan.
      </p>
    </form>
  );
}
