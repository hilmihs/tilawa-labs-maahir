'use client';

import { useState } from 'react';
import type { KsPemetaanKolom, KsPendaftarSumber } from '@/types/db';
import { aturSumberAktif, intipKolomCsv, simpanSumberPendaftar, tarikPendaftarSekarang } from './actions';
import { Bagian, useAksi } from './ui';

const MEDAN: { kunci: keyof KsPemetaanKolom; label: string }[] = [
  { kunci: 'timestamp', label: 'Timestamp' },
  { kunci: 'nama', label: 'Nama' },
  { kunci: 'wa', label: 'Nomor WhatsApp' },
  { kunci: 'gender', label: 'Jenis kelamin' },
  { kunci: 'tanggal_lahir', label: 'Tanggal lahir' },
  { kunci: 'umur', label: 'Usia' },
  { kunci: 'level', label: 'Level' },
  { kunci: 'slot', label: 'Pilihan jam' },
  { kunci: 'rekaman', label: 'Rekaman bacaan' },
];

/**
 * Satu periode boleh menarik dari banyak CSV — mis. formulir ikhwan dan akhwat
 * terpisah, atau formulir lama dan baru. Yang disimpan LINK-nya, bukan isi CSV:
 * pendaftaran tetap dibuka, jadi setiap tarikan membaca isi terbaru.
 */
export function PanelPendaftar({
  periodeId,
  sumber,
}: {
  periodeId: string;
  sumber: KsPendaftarSumber[];
}) {
  const { pending, jalan, tampilan } = useAksi();
  const aktif = sumber.filter((s) => s.aktif).length;

  return (
    <Bagian
      judul="CSV pendaftar"
      keterangan="Tempel link CSV (Google Sheet → File → Bagikan → Publikasikan ke web → CSV). Link disimpan dan ditarik ulang setiap sinkron, jadi pendaftar baru ikut masuk tanpa unggah ulang. Orang yang mengisi lebih dari satu formulir dihitung sekali, memakai kiriman terakhirnya. Jam pilihan yang belum ada di master ditambahkan otomatis."
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="t-small" style={{ color: 'var(--muted-2)' }}>
          {sumber.length === 0
            ? 'Belum ada CSV.'
            : `${sumber.length} CSV terpasang, ${aktif} ditarik saat sinkron.`}
        </span>
        <button
          className="btn btn-sm"
          disabled={pending || aktif === 0}
          onClick={() => jalan(() => tarikPendaftarSekarang({ periodeId }))}
        >
          {pending ? 'Menarik…' : 'Tarik semua CSV'}
        </button>
      </div>
      {tampilan}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sumber.map((s) => (
          <KartuSumber key={s.id} periodeId={periodeId} sumber={s} />
        ))}
        <KartuSumber key={`baru-${sumber.length}`} periodeId={periodeId} sumber={null} urutan={sumber.length + 1} />
      </div>
    </Bagian>
  );
}

function KartuSumber({
  periodeId,
  sumber,
  urutan,
}: {
  periodeId: string;
  sumber: KsPendaftarSumber | null;
  urutan?: number;
}) {
  const { pending, jalan, tampilan } = useAksi();
  const baru = sumber === null;

  const [terbuka, setTerbuka] = useState(false);
  const [nama, setNama] = useState(sumber?.nama ?? `Formulir pendaftaran ${urutan ?? ''}`.trim());
  const [csvUrl, setCsvUrl] = useState(sumber?.csv_url ?? '');
  const [petakan, setPetakan] = useState<KsPemetaanKolom>(sumber?.pemetaan_kolom ?? {});
  const [kepala, setKepala] = useState<string[]>([]);

  const terpetakan = MEDAN.filter((m) => petakan[m.kunci]).length;

  const intip = () =>
    jalan(
      () => intipKolomCsv({ csvUrl }),
      (data) => {
        const d = data as { kepala?: string[]; usulan?: KsPemetaanKolom } | undefined;
        if (d?.kepala) setKepala(d.kepala);
        // Usulan hanya mengisi kolom yang masih kosong — pilihan koordinator tidak ditimpa.
        if (d?.usulan) setPetakan((lama) => ({ ...d.usulan, ...buangKosong(lama) }));
      }
    );

  if (baru && !terbuka) {
    return (
      <div>
        <button className="btn btn-sm btn-ghost" onClick={() => setTerbuka(true)}>
          + Tambah CSV
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: '10px 12px',
        opacity: sumber && !sumber.aktif ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{baru ? 'CSV baru' : sumber.nama}</strong>
        {sumber && (
          <span
            className="t-small"
            style={{
              padding: '1px 8px',
              borderRadius: 999,
              border: '1px solid var(--line)',
              color: sumber.aktif ? 'var(--hijau-ink)' : 'var(--muted-2)',
            }}
          >
            {sumber.aktif ? 'ditarik' : 'dihentikan'}
          </span>
        )}
        {sumber && (
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>
            {terpetakan} dari {MEDAN.length} kolom terpetakan
          </span>
        )}
      </div>

      {sumber && (
        <p className="t-small" style={{ color: 'var(--muted-2)', margin: '4px 0 0', wordBreak: 'break-all' }}>
          {sumber.csv_url}
        </p>
      )}

      {sumber?.terakhir_tarik ? (
        <p
          className="t-small"
          style={{
            margin: '4px 0 0',
            color: sumber.terakhir_status === 'gagal' ? 'var(--merah-ink)' : 'var(--muted-2)',
          }}
        >
          Tarikan terakhir {new Date(sumber.terakhir_tarik).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB —{' '}
          {sumber.terakhir_status === 'gagal' ? 'GAGAL: ' : ''}
          {sumber.terakhir_pesan ?? '—'}
        </p>
      ) : sumber ? (
        <p className="t-small" style={{ margin: '4px 0 0', color: 'var(--muted-2)' }}>Belum pernah ditarik.</p>
      ) : null}

      {sumber && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm"
            disabled={pending || !sumber.aktif}
            onClick={() => jalan(() => tarikPendaftarSekarang({ periodeId, sumberId: sumber.id }))}
          >
            Tarik CSV ini
          </button>
          <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => setTerbuka(!terbuka)}>
            {terbuka ? 'Tutup pengaturan' : 'Ubah link / kolom'}
          </button>
          <button
            className="btn btn-sm btn-ghost"
            disabled={pending}
            onClick={() => jalan(() => aturSumberAktif({ periodeId, sumberId: sumber.id, aktif: !sumber.aktif }))}
          >
            {sumber.aktif ? 'Hentikan tarikan' : 'Tarik lagi saat sinkron'}
          </button>
        </div>
      )}

      {terbuka && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 200px' }}>
              <span className="t-small" style={{ color: 'var(--muted-2)' }}>Nama</span>
              <input
                id={`sumber-nama-${sumber?.id ?? 'baru'}`}
                className="input"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '2 1 340px' }}>
              <span className="t-small" style={{ color: 'var(--muted-2)' }}>Link CSV</span>
              <input
                id={`sumber-url-${sumber?.id ?? 'baru'}`}
                className="input"
                value={csvUrl}
                onChange={(e) => setCsvUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"
              />
            </label>
            <button className="btn btn-sm btn-ghost" disabled={pending || !csvUrl} onClick={intip}>
              Baca kolom
            </button>
          </div>

          {kepala.length > 0 && (
            <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 8 }}>
              {kepala.length} kolom terbaca. Kolom yang dikenali sudah dipilihkan — periksa lagi sebelum menyimpan.
            </p>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 8,
              marginTop: 10,
            }}
          >
            {MEDAN.map((m) => (
              <label key={m.kunci} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="t-small" style={{ color: 'var(--muted-2)' }}>{m.label}</span>
                {kepala.length > 0 ? (
                  <select
                    id={`sumber-${sumber?.id ?? 'baru'}-${m.kunci}`}
                    className="input"
                    value={petakan[m.kunci] ?? ''}
                    onChange={(e) => setPetakan({ ...petakan, [m.kunci]: e.target.value || undefined })}
                  >
                    <option value="">— tidak dipakai —</option>
                    {kepala.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`sumber-${sumber?.id ?? 'baru'}-${m.kunci}`}
                    className="input"
                    value={petakan[m.kunci] ?? ''}
                    onChange={(e) => setPetakan({ ...petakan, [m.kunci]: e.target.value || undefined })}
                    placeholder="tekan Baca kolom dulu"
                  />
                )}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm"
              disabled={pending || !csvUrl}
              onClick={() =>
                jalan(() =>
                  simpanSumberPendaftar({
                    periodeId,
                    sumberId: sumber?.id,
                    nama,
                    csvUrl,
                    pemetaan: buangKosong(petakan),
                  })
                )
              }
            >
              {baru ? 'Simpan CSV' : 'Simpan perubahan'}
            </button>
            {baru && (
              <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => setTerbuka(false)}>
                Batal
              </button>
            )}
          </div>
        </div>
      )}

      {tampilan}
    </div>
  );
}

function buangKosong(p: KsPemetaanKolom): KsPemetaanKolom {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => Boolean(v))) as KsPemetaanKolom;
}
