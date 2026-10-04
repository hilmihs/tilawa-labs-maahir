'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BarisPratinjau, Pratinjau } from '@/lib/ketersediaan-impor';
import { pratinjauImporXlsx, simpanImporXlsx } from './impor/actions';
import { Bagian, Kotak } from './ui';

const LABEL_MASALAH: Record<string, string> = {
  jam_tak_terbaca: 'jam tidak terbaca',
  wa_tak_sah: 'nomor WA tidak sah',
};

const LABEL_COCOK: Record<string, string> = {
  cocok: 'cocok',
  tanpa_akun: 'nomor ini belum punya akun pengajar',
  gender_beda: 'akun bernomor ini bergender lain',
  nama_tak_ketemu: 'nama tidak ditemukan',
  nama_ganda: 'nama cocok ke beberapa akun',
  dilewati: 'tidak diimpor',
};

function formData(berkas: File, tujuan: Record<string, string>, manual: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set('berkas', berkas);
  fd.set('pilihan', JSON.stringify({ tujuan, manual }));
  return fd;
}

export function PanelImpor() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [tujuan, setTujuan] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, string>>({});
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [pending, mulai] = useTransition();

  function muat(b: File, t: Record<string, string>, m: Record<string, string>) {
    setGalat(null);
    setPesan(null);
    mulai(async () => {
      const r = await pratinjauImporXlsx(formData(b, t, m));
      if (!r.ok) {
        setGalat(r.error);
        return;
      }
      setPratinjau(r.pratinjau);
      // Tebakan server (dari nama bulan) menjadi nilai awal pilihan periode.
      setTujuan(
        Object.fromEntries(
          r.pratinjau.bagian.filter((x) => x.tujuan).map((x) => [x.kunci, x.tujuan as string])
        )
      );
    });
  }

  function pilihTujuan(kunci: string, periodeId: string) {
    if (!berkas || !periodeId) return;
    const t = { ...tujuan, [kunci]: periodeId };
    setTujuan(t);
    muat(berkas, t, manual);
  }

  function pilihAkun(kunciBaris: string, nilai: string) {
    if (!berkas) return;
    const m = { ...manual };
    if (nilai) m[kunciBaris] = nilai;
    else delete m[kunciBaris];
    setManual(m);
    muat(berkas, tujuan, m);
  }

  function simpan() {
    if (!berkas) return;
    setGalat(null);
    setPesan(null);
    mulai(async () => {
      const r = await simpanImporXlsx(formData(berkas, tujuan, manual));
      if (r.ok) {
        setPesan(r.pesan);
        router.refresh();
      } else {
        setGalat(r.error);
      }
    });
  }

  const baris: BarisPratinjau[] = pratinjau?.baris ?? [];
  const perluPilih = baris.filter(
    (b) =>
      b.masalah.length === 0 &&
      (b.cocok.status === 'nama_tak_ketemu' ||
        b.cocok.status === 'nama_ganda' ||
        // Nomor di xlsx bisa beda dengan nomor akun (ganti nomor): tetap boleh dipilih manual.
        b.cocok.status === 'tanpa_akun' ||
        b.cocok.cara === 'manual')
  );
  const tanpaAkun = baris.filter((b) => b.cocok.status === 'gender_beda');
  const jamBermasalah = baris.filter((b) => b.masalah.length > 0);
  const lewatNama = baris.filter((b) => b.cocok.status === 'cocok' && b.cocok.cara === 'nama');
  const namaPeriode = new Map((pratinjau?.periode ?? []).map((p) => [p.id, p.nama]));
  const belumBertujuan = (pratinjau?.bagian ?? []).filter((b) => b.siap > 0 && !tujuan[b.kunci]);
  const akanDisimpan = (pratinjau?.bagian ?? [])
    .filter((b) => b.siap > 0 && tujuan[b.kunci])
    .map((b) => `${b.siap} jam ${b.judul} → ${namaPeriode.get(tujuan[b.kunci])}`);

  return (
    <Bagian
      judul="Impor ketersediaan pengajar"
      keterangan="Berkas xlsx adalah sumber kebenaran. Impor ulang menggantikan hasil impor sebelumnya; isian yang diisi pengajar sendiri tidak disentuh."
    >
      <div className="ks-unggah">
        <span className="ks-berkas-ikon" aria-hidden="true">XLSX</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600 }}>{berkas ? berkas.name : 'Belum ada berkas'}</div>
          <div className="t-small">
            {pending
              ? 'Membaca…'
              : pratinjau
                ? `${baris.length} baris dibaca · belum ada yang disimpan`
                : 'Pilih berkas KETERSEDIAAN PENGAJAR HITS (.xlsx)'}
          </div>
        </div>
        <input
          ref={input}
          id="impor-xlsx"
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBerkas(f);
            setPratinjau(null);
            setTujuan({});
            setManual({});
            muat(f, {}, {});
          }}
        />
        <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => input.current?.click()}>
          {berkas ? 'Ganti berkas' : 'Pilih berkas'}
        </button>
      </div>

      {galat && <Kotak nada="galat">{galat}</Kotak>}
      {pesan && <Kotak nada="baik">{pesan}</Kotak>}

      {pratinjau && (
        <>
          {pratinjau.periode.length === 0 && (
            <Kotak nada="galat">
              Belum ada periode. Buat periode Batch September dan Batch Oktober di bagian &ldquo;Buat periode&rdquo; di
              bawah, lalu pilih berkas lagi.
            </Kotak>
          )}

          <div className="ks-bagian-grid">
            {pratinjau.bagian.map((b) => (
              <div key={b.kunci} className="ks-bagian">
                <div>
                  <div className="ks-bagian-judul">{b.judul}</div>
                  <div className="t-small">
                    {b.baris} baris · {b.pengajar} pengajar
                  </div>
                </div>
                <div className="ks-bagian-angka">
                  <div>
                    <b>{b.siap}</b>
                    <span>siap disimpan</span>
                  </div>
                  <div>
                    <b>{b.bermasalah}</b>
                    <span>perlu diperiksa</span>
                  </div>
                </div>
                <label className="field-label" htmlFor={`tujuan-${b.kunci}`} style={{ marginBottom: 0 }}>
                  Masuk ke periode
                </label>
                <select
                  id={`tujuan-${b.kunci}`}
                  className="select"
                  value={tujuan[b.kunci] ?? ''}
                  disabled={pending}
                  onChange={(e) => pilihTujuan(b.kunci, e.target.value)}
                >
                  <option value="">— pilih periode —</option>
                  {pratinjau.periode.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {perluPilih.length > 0 && (
            <div className="ks-masalah kuning">
              <div className="ks-masalah-kepala">
                <span className="badge badge-kuning">
                  <span className="dot" />
                  {perluPilih.length} baris
                </span>
                <b>Pilih akun pengajarnya</b>
              </div>
              <p className="t-small" style={{ margin: 0, color: 'var(--ink-2)' }}>
                Nama tidak ditemukan, atau nomor WA di berkas belum terdaftar di akun mana pun (bisa jadi pengajarnya
                ganti nomor). Pilih akunnya bila orangnya sama. Yang dibiarkan kosong tidak diimpor — buat akunnya dulu
                lalu impor ulang.
              </p>
              <div className="table-scroll">
                <table className="k-table">
                  <thead>
                    <tr>
                      <th>Nama di berkas</th>
                      <th>Sheet · jam</th>
                      <th>Akun pengajar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perluPilih.map((b) => (
                      <tr key={b.kunci}>
                        <td>
                          <div className="nm">{b.nama}</div>
                          <div className="sub">{LABEL_COCOK[b.cocok.status]}</div>
                        </td>
                        <td>
                          {b.sheet}
                          <div className="sub">{b.waktu}</div>
                        </td>
                        <td style={{ minWidth: 240 }}>
                          <select
                            className="select"
                            aria-label={`Akun pengajar untuk ${b.nama}`}
                            value={manual[b.kunci] ?? ''}
                            disabled={pending}
                            onChange={(e) => pilihAkun(b.kunci, e.target.value)}
                          >
                            <option value="">— pilih pengajar {b.gender} —</option>
                            {b.cocok.kandidat.length > 0 && (
                              <optgroup label="Kandidat dari nama">
                                {b.cocok.kandidat.map((k) => (
                                  <option key={`k-${k.id}`} value={k.id}>
                                    {k.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label={`Semua pengajar ${b.gender}`}>
                              {pratinjau.pengajar[b.gender].map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </optgroup>
                            <option value="lewati">Tidak diimpor</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tanpaAkun.length > 0 && (
            <div className="ks-masalah merah">
              <div className="ks-masalah-kepala">
                <span className="badge badge-merah">
                  <span className="dot" />
                  {tanpaAkun.length} baris
                </span>
                <b>Nomor WA milik akun bergender lain — dilewati</b>
              </div>
              <p className="t-small" style={{ margin: 0, color: 'var(--ink-2)' }}>
                Betulkan gender akunnya atau nomor di berkas, lalu impor ulang.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {tanpaAkun.map((b) => (
                  <li key={b.kunci}>
                    {b.nama} · {b.waktu} — {LABEL_COCOK[b.cocok.status]}
                    {b.cocok.nama_akun ? ` (${b.cocok.nama_akun})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {jamBermasalah.length > 0 && (
            <div className="ks-masalah merah">
              <div className="ks-masalah-kepala">
                <span className="badge badge-merah">
                  <span className="dot" />
                  {jamBermasalah.length} baris
                </span>
                <b>Jam tidak bisa disimpan — dilewati</b>
              </div>
              <p className="t-small" style={{ margin: 0, color: 'var(--ink-2)' }}>
                Periksa penulisan jamnya di xlsx, lalu impor ulang. Contoh yang terbaca: &ldquo;Senin &amp; Rabu 06.00 - 07.30&rdquo; atau &ldquo;Rabu 16.00 - 17.30 dan Sabtu 13.00 - 14.30&rdquo;.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {jamBermasalah.map((b) => (
                  <li key={b.kunci}>
                    {b.nama} · {b.sheet} · &ldquo;{b.waktu}&rdquo; — {b.masalah.map((m) => LABEL_MASALAH[m]).join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lewatNama.length > 0 && (
            <details className="ks-masalah">
              <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
                {lewatNama.length} baris dicocokkan lewat nama — periksa sebelum menyimpan
              </summary>
              <div className="table-scroll">
                <table className="k-table">
                  <thead>
                    <tr>
                      <th>Nama di berkas</th>
                      <th>Akun yang dipasangkan</th>
                      <th>Sheet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lewatNama.map((b) => (
                      <tr key={b.kunci}>
                        <td className="nm">{b.nama}</td>
                        <td>{b.cocok.nama_akun}</td>
                        <td>{b.sheet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div className="ks-simpan">
            <p>
              {akanDisimpan.length > 0 ? <>Akan disimpan: {akanDisimpan.join(' · ')}.</> : 'Belum ada baris yang siap disimpan.'}
              {belumBertujuan.length > 0 && <> Pilih periode untuk: {belumBertujuan.map((b) => b.judul).join(', ')}.</>}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending || akanDisimpan.length === 0 || belumBertujuan.length > 0}
              onClick={simpan}
            >
              {pending ? 'Memproses…' : 'Simpan impor'}
            </button>
          </div>
        </>
      )}
    </Bagian>
  );
}
