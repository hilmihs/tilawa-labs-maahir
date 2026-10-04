'use client';

// Panel kelola Haqibatul Mu'allim: buat folder, unggah berkas, ubah nama, hapus.
// Semua mutasi lewat Server Action di './actions' (yang sudah revalidatePath),
// jadi daftar di halaman ikut segar sendiri setelah aksi berhasil.
//
// Penghapusan sengaja dua langkah di dalam komponen (tombol berubah jadi
// "Yakin hapus?") — bukan window.confirm — supaya tetap konsisten dengan gaya
// panel lain di aplikasi dan tak terblokir popup di WebView WhatsApp.

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import {
  buatFolderAksi,
  hapusFileAksi,
  hapusFolderAksi,
  ubahNamaFileAksi,
  ubahNamaFolderAksi,
  unggahBerkasAksi,
} from './actions';

export interface SubfolderRingkas {
  id: string;
  nama: string;
}

export interface BerkasRingkas {
  id: string;
  nama: string;
  ext: string;
  ukuran: number;
  url: string | null;
}

export interface KelolaPanelProps {
  /** Folder yang sedang dibuka; null = akar. */
  folderId: string | null;
  subfolder: SubfolderRingkas[];
  berkas: BerkasRingkas[];
}

/**
 * Salinan EXT_DIIZINKAN dari '@/lib/haqibah-storage'. Modul itu server-only
 * (mengimpor supabaseAdmin), jadi tak boleh diimpor komponen klien — kalau
 * daftar di sana berubah, samakan daftar ini. Ini cuma saringan dialog berkas;
 * penolakan yang sebenarnya tetap di server.
 */
const EXT_DIIZINKAN = [
  'pdf',
  'xlsx',
  'xls',
  'docx',
  'doc',
  'pptx',
  'ppt',
  'txt',
  'csv',
  'jpg',
  'jpeg',
  'png',
  'webp',
];
const ACCEPT = EXT_DIIZINKAN.map((e) => `.${e}`).join(',');

/** Ukuran berkas dalam satuan yang enak dibaca (MB di atas 1 MB, selebihnya KB). */
function formatUkuran(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Sunting = { tipe: 'folder' | 'berkas'; id: string; nilai: string };
type Konfirmasi = { tipe: 'folder' | 'berkas'; id: string };

export function KelolaPanel({ folderId, subfolder, berkas }: KelolaPanelProps) {
  const [pending, mulai] = useTransition();
  const [mengunggah, mulaiUnggah] = useTransition();

  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const [namaFolderBaru, setNamaFolderBaru] = useState('');
  const [sunting, setSunting] = useState<Sunting | null>(null);
  const [konfirmasi, setKonfirmasi] = useState<Konfirmasi | null>(null);
  const [terpilih, setTerpilih] = useState(0);

  const inputBerkasRef = useRef<HTMLInputElement>(null);
  const sibuk = pending || mengunggah;

  function bersihkanKabar() {
    setPesan(null);
    setGalat(null);
  }

  function buatFolder() {
    const nama = namaFolderBaru.trim();
    bersihkanKabar();
    if (!nama) {
      setGalat('Nama folder tidak boleh kosong.');
      return;
    }
    setKonfirmasi(null);
    mulai(async () => {
      const res = await buatFolderAksi(folderId, nama);
      if (!res.ok) {
        setGalat(res.error);
        return;
      }
      setNamaFolderBaru('');
      setPesan(`Folder “${nama}” dibuat.`);
    });
  }

  function unggah() {
    const berkasTerpilih = Array.from(inputBerkasRef.current?.files ?? []);
    bersihkanKabar();
    if (berkasTerpilih.length === 0) {
      setGalat('Pilih dulu berkas yang mau diunggah.');
      return;
    }
    setKonfirmasi(null);
    const fd = new FormData();
    fd.set('folderId', folderId ?? '');
    for (const f of berkasTerpilih) fd.append('berkas', f);

    mulaiUnggah(async () => {
      const res = await unggahBerkasAksi(fd);
      if (!res.ok) {
        setGalat(res.error);
        return;
      }
      if (inputBerkasRef.current) inputBerkasRef.current.value = '';
      setTerpilih(0);
      setPesan(
        berkasTerpilih.length === 1
          ? `Berkas “${berkasTerpilih[0].name}” diunggah.`
          : `${berkasTerpilih.length} berkas diunggah.`
      );
    });
  }

  function simpanNama() {
    if (!sunting) return;
    const nama = sunting.nilai.trim();
    const { tipe, id } = sunting;
    bersihkanKabar();
    if (!nama) {
      setGalat(tipe === 'folder' ? 'Nama folder tidak boleh kosong.' : 'Nama berkas tidak boleh kosong.');
      return;
    }
    mulai(async () => {
      const res = tipe === 'folder' ? await ubahNamaFolderAksi(id, nama) : await ubahNamaFileAksi(id, nama);
      if (!res.ok) {
        setGalat(res.error);
        return;
      }
      setSunting(null);
      setPesan(`Nama diubah menjadi “${nama}”.`);
    });
  }

  function hapus(tipe: 'folder' | 'berkas', id: string, nama: string) {
    bersihkanKabar();
    setSunting(null);
    mulai(async () => {
      const res = tipe === 'folder' ? await hapusFolderAksi(id) : await hapusFileAksi(id);
      if (!res.ok) {
        setGalat(res.error);
        return;
      }
      setKonfirmasi(null);
      setPesan(`${tipe === 'folder' ? 'Folder' : 'Berkas'} “${nama}” dihapus.`);
    });
  }

  // Dua penolong di bawah sengaja fungsi biasa yang dipanggil (bukan komponen
  // <Aksi />): komponen yang dideklarasikan di dalam render akan di-remount tiap
  // render, dan input ubah nama kehilangan fokus tiap ketikan.

  /** Tombol "Ubah nama" + "Hapus" dua langkah, dipakai baris folder & berkas. */
  function aksiBaris(tipe: 'folder' | 'berkas', id: string, nama: string) {
    const mintaKonfirmasi = konfirmasi?.tipe === tipe && konfirmasi.id === id;
    return (
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {!mintaKonfirmasi && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={sibuk}
            onClick={() => {
              bersihkanKabar();
              setKonfirmasi(null);
              setSunting({ tipe, id, nilai: nama });
            }}
          >
            Ubah nama
          </button>
        )}
        {mintaKonfirmasi ? (
          <>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={sibuk}
              onClick={() => hapus(tipe, id, nama)}
            >
              {pending ? 'Menghapus…' : 'Yakin hapus?'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={sibuk}
              onClick={() => setKonfirmasi(null)}
            >
              Batal
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={sibuk}
            onClick={() => {
              bersihkanKabar();
              setSunting(null);
              setKonfirmasi({ tipe, id });
            }}
          >
            Hapus
          </button>
        )}
      </div>
    );
  }

  /** Input nama inline yang menggantikan isi baris saat tombol "Ubah nama" ditekan. */
  function formNama() {
    if (!sunting) return null;
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          simpanNama();
        }}
        style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0, flexWrap: 'wrap' }}
      >
        <input
          className="input"
          autoFocus
          maxLength={200}
          value={sunting.nilai}
          onChange={(e) => setSunting({ ...sunting, nilai: e.target.value })}
          style={{ flex: '1 1 160px', minWidth: 0 }}
        />
        <button type="submit" className="btn btn-sm" disabled={sibuk}>
          {pending ? 'Menyimpan…' : 'Simpan'}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={sibuk}
          onClick={() => setSunting(null)}
        >
          Batal
        </button>
      </form>
    );
  }

  const kosong = subfolder.length === 0 && berkas.length === 0;

  return (
    <>
      {pesan && (
        <div className="banner banner-success" style={{ marginBottom: 12 }}>
          <div className="desc">{pesan}</div>
        </div>
      )}
      {galat && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          <div className="desc">{galat}</div>
        </div>
      )}

      {/* Buat folder */}
      <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 12 }}>
        <div className="t-small" style={{ fontWeight: 600, marginBottom: 8 }}>
          Folder baru di sini
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            buatFolder();
          }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <input
            className="input"
            placeholder="Nama folder…"
            maxLength={120}
            value={namaFolderBaru}
            onChange={(e) => setNamaFolderBaru(e.target.value)}
            style={{ flex: '1 1 200px', minWidth: 0 }}
          />
          <button type="submit" className="btn btn-sm" disabled={sibuk}>
            {pending ? 'Membuat…' : 'Buat folder'}
          </button>
        </form>
        <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
          Maksimal 3 tingkat folder. Folder hanya bisa dihapus kalau sudah kosong.
        </p>
      </div>

      {/* Unggah berkas */}
      <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 16 }}>
        <div className="t-small" style={{ fontWeight: 600, marginBottom: 8 }}>
          Unggah berkas ke folder ini
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={inputBerkasRef}
            type="file"
            multiple
            accept={ACCEPT}
            disabled={mengunggah}
            onChange={(e) => {
              bersihkanKabar();
              setTerpilih(e.target.files?.length ?? 0);
            }}
            className="t-small"
            style={{ flex: '1 1 220px', minWidth: 0 }}
          />
          <button type="button" className="btn btn-sm" disabled={sibuk} onClick={unggah}>
            {mengunggah ? 'Mengunggah…' : 'Unggah'}
          </button>
        </div>
        <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
          {mengunggah
            ? 'Sedang mengunggah — jangan tutup halaman ini.'
            : terpilih > 0
              ? `${terpilih} berkas siap diunggah.`
              : `Boleh pilih beberapa sekaligus. Maksimal 50 MB per berkas. Jenis: ${EXT_DIIZINKAN.join(', ')}.`}
        </p>
      </div>

      {kosong && (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Folder ini masih kosong.
        </p>
      )}

      {/* Subfolder */}
      {subfolder.length > 0 && (
        <div className="card-flat" style={{ marginBottom: 16 }}>
          {subfolder.map((f) => {
            const disunting = sunting?.tipe === 'folder' && sunting.id === f.id;
            return (
              <div key={f.id} className="row">
                <span aria-hidden style={{ fontSize: 16 }}>
                  📁
                </span>
                {disunting ? (
                  formNama()
                ) : (
                  <>
                    <Link
                      href={`/haqibah/koordinator?f=${f.id}`}
                      className="t-body"
                      style={{ flex: 1, minWidth: 0, fontWeight: 600, wordBreak: 'break-word' }}
                    >
                      {f.nama}
                    </Link>
                    {aksiBaris('folder', f.id, f.nama)}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Berkas */}
      {berkas.length > 0 && (
        <div className="card-flat">
          {berkas.map((b) => {
            const disunting = sunting?.tipe === 'berkas' && sunting.id === b.id;
            return (
              <div key={b.id} className="row" style={{ flexWrap: 'wrap' }}>
                {disunting ? (
                  formNama()
                ) : (
                  <>
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <div className="t-body" style={{ fontWeight: 600, wordBreak: 'break-word' }}>
                        {b.nama}
                      </div>
                      <div className="t-small" style={{ color: 'var(--muted-2)' }}>
                        {b.ext.toUpperCase()} · {formatUkuran(b.ukuran)}
                      </div>
                    </div>
                    {b.url ? (
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-ghost"
                      >
                        Buka
                      </a>
                    ) : (
                      <span className="t-small" style={{ color: 'var(--muted-2)' }}>
                        Tak tersedia
                      </span>
                    )}
                    {aksiBaris('berkas', b.id, b.nama)}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
