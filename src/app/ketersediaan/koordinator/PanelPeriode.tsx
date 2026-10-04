'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { KsHariIdx, KsPeriode } from '@/types/db';
import { idxKeHari } from '@/lib/ketersediaan-slot';
import { tanggalPertemuan, teksLibur, uraiLibur } from '@/lib/ketersediaan-pertemuan';
import {
  buatPeriode,
  rekamRiwayatPeriode,
  nyalakanKirimNyata,
  tetapkanTujuanTilawah,
  ubahAturanPeriode,
} from './actions';
import { Angka, Bagian, Kotak, useAksi } from './ui';

export function PanelPeriode({
  periode,
  superadmin,
  polaHari,
}: {
  periode: KsPeriode;
  superadmin: boolean;
  /** Pola hari jam aktif periode ini, untuk pratinjau pertemuan terakhir. */
  polaHari: KsHariIdx[][];
}) {
  return (
    <>
      <AturanPeriode periode={periode} polaHari={polaHari} />
      <TujuanTilawah periode={periode} superadmin={superadmin} />
    </>
  );
}

export function PeriodeBaru() {
  const { pending, jalan, tampilan } = useAksi();
  const router = useRouter();
  const [nama, setNama] = useState('');
  const [mulai, setMulai] = useState('');
  const [selesai, setSelesai] = useState('');
  const [kapasitas, setKapasitas] = useState(12);
  // Master bawaan sudah tertinggal dari formulir nyata; jam diisi lewat impor xlsx.
  const [isiBawaan, setIsiBawaan] = useState(false);

  return (
    <Bagian
      judul="Buat periode"
      keterangan="Satu periode = satu batch KBM, mis. Batch Oktober 2026. Tanggal mulai adalah hari pertama KBM: dipakai menentukan halaqah lama mana yang masih berjalan."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 220px' }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Nama periode</span>
          <input
            className="input"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Batch Oktober 2026"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Mulai KBM</span>
          <input className="input" type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Selesai</span>
          <input className="input" type="date" value={selesai} onChange={(e) => setSelesai(e.target.value)} />
        </label>
        <Angka label="Kapasitas halaqah" nilai={kapasitas} ubah={setKapasitas} min={1} max={100} />
      </div>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
        <input type="checkbox" checked={isiBawaan} onChange={(e) => setIsiBawaan(e.target.checked)} />
        <span className="t-small">
          Isi master slot dari daftar bawaan (27 slot dari template). Slot offline masih perlu diisi lokasinya.
        </span>
      </label>

      {tampilan}

      <button
        className="btn"
        style={{ marginTop: 10 }}
        disabled={pending}
        onClick={() =>
          jalan(
            () => buatPeriode({ nama, mulai, selesai, kapasitas, isiSlotBawaan: isiBawaan }),
            (data) => {
              // Kosongkan form supaya klik kedua tidak membuat periode kembar,
              // lalu pindah ke periode baru — tanpa itu dashboard tetap di periode lama.
              setNama('');
              setMulai('');
              setSelesai('');
              setIsiBawaan(false);
              const id = (data as { id?: string } | undefined)?.id;
              if (id) router.push(`/ketersediaan/koordinator?periode=${id}&tab=pengaturan`);
            }
          )
        }
      >
        {pending ? 'Membuat…' : 'Buat periode'}
      </button>
    </Bagian>
  );
}

function AturanPeriode({ periode, polaHari }: { periode: KsPeriode; polaHari: KsHariIdx[][] }) {
  const { pending, jalan, tampilan } = useAksi();
  const [nama, setNama] = useState(periode.nama);
  const [mulai, setMulai] = useState(periode.mulai.slice(0, 10));
  const [selesai, setSelesai] = useState(periode.selesai.slice(0, 10));
  const [liburTeks, setLiburTeks] = useState(teksLibur(periode.libur ?? []));
  const [kapasitas, setKapasitas] = useState(periode.kapasitas_halaqah);
  const [ambangBentuk, setAmbangBentuk] = useState(periode.ambang_bentuk);
  const [ambangBawah, setAmbangBawah] = useState(periode.ambang_bawah);
  const [usiaMaks, setUsiaMaks] = useState(periode.usia_antrean_maks_hari);
  const [jedaMulai, setJedaMulai] = useState(periode.jeda_mulai_hari);
  const [tenggat, setTenggat] = useState(periode.tenggat_konfirmasi_jam);
  const [penyegaran, setPenyegaran] = useState(periode.penyegaran_hari);
  const [pertemuanDasar, setPertemuanDasar] = useState(periode.jumlah_pertemuan_dasar);
  const [pertemuanLanjutan, setPertemuanLanjutan] = useState(periode.jumlah_pertemuan_lanjutan);

  const libur = useMemo(() => uraiLibur(liburTeks), [liburTeks]);
  // Pertemuan terakhir per pola hari, dengan libur yang sedang diketik — supaya
  // tanggal selesai periode bisa dicocokkan sebelum disimpan.
  const pratinjau = useMemo(
    () =>
      polaHari.map((hari) => {
        const akhir = (n: number) => (n > 0 ? tanggalPertemuan(mulai, hari, n, libur.libur).at(-1) ?? null : null);
        return { hari: hari.map(idxKeHari).join(' & '), dasar: akhir(pertemuanDasar), lanjutan: akhir(pertemuanLanjutan) };
      }),
    [polaHari, mulai, libur, pertemuanDasar, pertemuanLanjutan]
  );
  const terakhir = pratinjau.map((p) => p.dasar ?? p.lanjutan).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;

  return (
    <Bagian
      judul="Aturan periode"
      keterangan="Angka-angka ini yang dipakai mesin: kapan halaqah boleh dibentuk, berapa lama antrean boleh menunggu, dan berapa lama pengajar punya waktu mengonfirmasi."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 220px' }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Nama periode</span>
          <input id="aturan-nama" className="input" value={nama} onChange={(e) => setNama(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Mulai KBM</span>
          <input id="aturan-mulai" className="input" type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>Selesai</span>
          <input id="aturan-selesai" className="input" type="date" value={selesai} onChange={(e) => setSelesai(e.target.value)} />
        </label>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
        <span className="t-small" style={{ color: 'var(--muted-2)' }}>
          Tanggal libur — satu per baris. Pertemuan yang jatuh di tanggal ini dilompati.
        </span>
        <textarea
          id="aturan-libur"
          className="input"
          rows={Math.max(4, liburTeks.split('\n').length + 1)}
          value={liburTeks}
          onChange={(e) => setLiburTeks(e.target.value)}
          placeholder={'25/12/2026 Natal\n01/01/2027 Tahun Baru\n08/02/2027 - 23/03/2027 Ramadhan + 2 pekan'}
          style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 13 }}
        />
      </label>
      {libur.galat.length > 0 && <Kotak nada="galat">{libur.galat.join('\n')}</Kotak>}
      {pratinjau.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table className="t-small" style={{ borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ color: 'var(--muted-2)', textAlign: 'left' }}>
                <th style={{ padding: '4px 12px 4px 0' }}>Hari</th>
                <th style={{ padding: '4px 12px 4px 0' }}>Pertemuan terakhir Dasar</th>
                <th style={{ padding: '4px 12px 4px 0' }}>Pertemuan terakhir Lanjutan</th>
              </tr>
            </thead>
            <tbody>
              {pratinjau.map((p) => (
                <tr key={p.hari}>
                  <td style={{ padding: '2px 12px 2px 0' }}>{p.hari}</td>
                  <td style={{ padding: '2px 12px 2px 0' }}>{tampilTanggal(p.dasar)}</td>
                  <td style={{ padding: '2px 12px 2px 0' }}>{tampilTanggal(p.lanjutan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {terakhir && terakhir > selesai && (
            <Kotak nada="galat">
              Pertemuan terakhir jatuh {tampilTanggal(terakhir)}, setelah tanggal selesai periode. Mundurkan tanggal selesai.
            </Kotak>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Angka label="Kapasitas halaqah" nilai={kapasitas} ubah={setKapasitas} min={1} max={100} />
        <Angka label="Ambang bentuk" nilai={ambangBentuk} ubah={setAmbangBentuk} min={1} max={100} />
        <Angka label="Ambang bawah" nilai={ambangBawah} ubah={setAmbangBawah} min={1} max={100} />
        <Angka label="Batas antrean (hari)" nilai={usiaMaks} ubah={setUsiaMaks} min={1} max={365} />
        <Angka label="Jeda mulai (hari)" nilai={jedaMulai} ubah={setJedaMulai} min={0} max={90} />
        <Angka label="Tenggat konfirmasi (jam)" nilai={tenggat} ubah={setTenggat} min={1} max={720} />
        <Angka label="Penyegaran (hari)" nilai={penyegaran} ubah={setPenyegaran} min={1} max={365} />
        <Angka label="Pertemuan · HITS Dasar" nilai={pertemuanDasar} ubah={setPertemuanDasar} min={0} max={200} />
        <Angka label="Pertemuan · HITS Lanjutan" nilai={pertemuanLanjutan} ubah={setPertemuanLanjutan} min={0} max={200} />
      </div>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
        Pertemuan dibuat di CMS tilawah pada hari slot sejak tanggal mulai, melompati tanggal libur di atas.
        HITS Dasar 50 pertemuan, HITS Lanjutan 26. Pendaftar &ldquo;Alumni HITS&rdquo; ikut
        Lanjutan. Isi 0 bila pertemuan akan dibuat manual di sana.
      </p>
      {tampilan}
      <button
        className="btn btn-sm"
        style={{ marginTop: 8 }}
        disabled={pending}
        onClick={() =>
          jalan(() =>
            ubahAturanPeriode({
              periodeId: periode.id,
              nama,
              mulai,
              selesai,
              liburTeks,
              kapasitas,
              ambangBentuk,
              ambangBawah,
              usiaAntreanMaksHari: usiaMaks,
              jedaMulaiHari: jedaMulai,
              tenggatKonfirmasiJam: tenggat,
              penyegaranHari: penyegaran,
              jumlahPertemuanDasar: pertemuanDasar,
              jumlahPertemuanLanjutan: pertemuanLanjutan,
            })
          )
        }
      >
        {pending ? 'Menyimpan…' : 'Simpan aturan'}
      </button>
      <button
        className="btn btn-sm btn-ghost"
        style={{ marginTop: 8, marginLeft: 8 }}
        disabled={pending}
        onClick={() => jalan(() => rekamRiwayatPeriode({ periodeId: periode.id }))}
      >
        Rekam riwayat periode
      </button>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
        Menyimpan berapa halaqah terbentuk dan batal per slot pada periode ini. Angka inilah
        yang dilihat pengajar sebagai &quot;peluang slot terbentuk&quot;. Dijalankan otomatis
        setelah periode berakhir; tombol ini untuk merekam lebih awal.
      </p>
    </Bagian>
  );
}

function TujuanTilawah({ periode, superadmin }: { periode: KsPeriode; superadmin: boolean }) {
  const { pending, jalan, tampilan } = useAksi();
  const [program, setProgram] = useState(periode.tilawah_program_id ?? 0);
  const [batch, setBatch] = useState(periode.tilawah_batch_id ?? 0);
  const [ketikNama, setKetikNama] = useState('');
  const namaCocok = ketikNama.trim() === periode.nama.trim();

  return (
    <Bagian
      judul="Tujuan CMS tilawah"
      keterangan="Halaqah yang dibentuk akan dikirim ke batch ini. CMS tidak punya endpoint pembuat batch — batch harus sudah ada, dibuat manual dari UI tilawah."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <Angka label="program_id" nilai={program} ubah={setProgram} min={0} />
        <Angka label="batch_id" nilai={batch} ubah={setBatch} min={0} />
        <button
          className="btn btn-sm"
          disabled={pending || periode.kirim_nyata}
          title={periode.kirim_nyata ? 'Matikan pengiriman nyata dulu' : undefined}
          onClick={() =>
            jalan(() =>
              tetapkanTujuanTilawah({
                periodeId: periode.id,
                programId: program || null,
                batchId: batch || null,
              })
            )
          }
        >
          Simpan tujuan
        </button>
      </div>
      {periode.kirim_nyata && (
        <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
          Tujuan terkunci selama pengiriman nyata menyala — matikan dulu untuk menggantinya.
        </p>
      )}

      <Kotak nada={periode.kirim_nyata ? 'baik' : 'netral'}>
        {periode.kirim_nyata
          ? 'Pengiriman NYATA aktif — outbox akan memanggil CMS tilawah sungguhan.'
          : 'Mode kirim-percobaan: outbox hanya mencatat payload, tidak memanggil CMS tilawah.'}
      </Kotak>

      {superadmin ? (
        <>
          {tampilan}
          {periode.kirim_nyata ? (
            <button
              className="btn btn-sm"
              disabled={pending}
              onClick={() => jalan(() => nyalakanKirimNyata({ periodeId: periode.id, nyala: false }))}
            >
              Matikan pengiriman nyata
            </button>
          ) : (
            <>
              <p className="t-small" style={{ color: 'var(--muted-2)', margin: '6px 0' }}>
                CMS tilawah tidak menyediakan endpoint hapus. Halaqah dan akun murid yang salah
                terkirim hanya dapat dibereskan manual dari dalam CMS — nyalakan setelah satu
                halaqah uji terbukti benar.
              </p>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 360 }}>
                <span className="t-small" style={{ color: 'var(--muted-2)' }}>
                  Ketik nama periode <strong>{periode.nama}</strong> untuk menyalakan
                </span>
                <input
                  id="kirim-nyata-konfirmasi"
                  className="input"
                  value={ketikNama}
                  onChange={(e) => setKetikNama(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <button
                className="btn btn-sm"
                style={{ marginTop: 8 }}
                disabled={pending || !namaCocok}
                onClick={() =>
                  jalan(
                    () => nyalakanKirimNyata({ periodeId: periode.id, nyala: true, konfirmasiNama: ketikNama }),
                    () => setKetikNama('')
                  )
                }
              >
                Nyalakan pengiriman nyata
              </button>
            </>
          )}
        </>
      ) : (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Menyalakan pengiriman nyata dikunci untuk superadmin.
        </p>
      )}
    </Bagian>
  );
}

function tampilTanggal(t: string | null): string {
  if (!t) return '—';
  return new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
