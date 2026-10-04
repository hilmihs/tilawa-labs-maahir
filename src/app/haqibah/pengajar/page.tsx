// Haqibatul Mu'allim — halaman baca untuk pengajar.
//
// Hanya menelusuri: breadcrumb, daftar subfolder, lalu daftar berkas dengan
// tautan bertanda tangan (berlaku 1 jam) ke /api/audio. Semua pengelolaan
// (buat folder, unggah, ubah nama, hapus) ada di /haqibah/koordinator.

import Link from 'next/link';
import { requirePengajar } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';
import { daftarFile, daftarFolder, jalurFolder, urlFile } from '@/lib/haqibah';

export const dynamic = 'force-dynamic';

/** Ukuran berkas dalam satuan yang enak dibaca (MB di atas 1 MB, selebihnya KB). */
function formatUkuran(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function HaqibahPengajarPage({
  searchParams,
}: {
  searchParams: { f?: string };
}) {
  await requirePengajar();

  const fParam = searchParams.f?.trim() || null;
  // jalurFolder() memulangkan array kosong bila folder sudah tak ada — anggap
  // saja pengguna berada di akar, jangan 500 karena tautan basi.
  const jalur = await jalurFolder(fParam);
  const folderHilang = !!fParam && jalur.length === 0;
  const folderId = folderHilang ? null : fParam;

  const [subfolder, berkas] = await Promise.all([daftarFolder(folderId), daftarFile(folderId)]);
  const berkasDenganUrl = await Promise.all(
    berkas.map(async (b) => ({ ...b, url: await urlFile(b) }))
  );

  const kosong = subfolder.length === 0 && berkas.length === 0;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">H</span> Haqibatul Mu’allim
            </div>
            <LogoutButton />
          </div>


          <h1 className="t-h1" style={{ marginBottom: 4 }}>Haqibatul Mu’allim</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            Berkas pembantu pengajar: panduan ujian, tatib/SOP, modul, kurikulum, dan
            panduan aplikasi. Ketuk “Buka” untuk melihat berkasnya.
          </p>

          {/* Breadcrumb: akar selalu ada, tiap tingkat jadi tautan kecuali yang terakhir. */}
          <nav
            className="t-small"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
              marginBottom: 12,
            }}
          >
            {jalur.length === 0 ? (
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Semua Berkas</span>
            ) : (
              <Link href="/haqibah/pengajar">Semua Berkas</Link>
            )}
            {jalur.map((f, i) => (
              <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--muted-2)' }}>/</span>
                {i === jalur.length - 1 ? (
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{f.nama}</span>
                ) : (
                  <Link href={`/haqibah/pengajar?f=${f.id}`}>{f.nama}</Link>
                )}
              </span>
            ))}
          </nav>

          {folderHilang && (
            <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
              Folder yang Anda tuju sudah tidak ada. Ditampilkan daftar teratas.
            </p>
          )}

          {kosong ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada berkas di folder ini.
            </p>
          ) : (
            <>
              {subfolder.length > 0 && (
                <div className="card-flat" style={{ marginBottom: 16 }}>
                  {subfolder.map((f) => (
                    <Link
                      key={f.id}
                      href={`/haqibah/pengajar?f=${f.id}`}
                      className="row"
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <span aria-hidden style={{ fontSize: 16 }}>📁</span>
                      <span className="t-body" style={{ flex: 1, fontWeight: 600 }}>{f.nama}</span>
                      <span className="t-small" style={{ color: 'var(--muted-2)' }}>›</span>
                    </Link>
                  ))}
                </div>
              )}

              {berkasDenganUrl.length > 0 && (
                <div className="card-flat">
                  {berkasDenganUrl.map((b) => (
                    <div key={b.id} className="row">
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 20 }}>
            <Link href="/">← Kembali ke Menu Utama</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
