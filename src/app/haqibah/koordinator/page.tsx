// Haqibatul Mu'allim — halaman kelola untuk koordinator ketua kelas.
//
// Isinya sama dengan halaman baca pengajar (breadcrumb + subfolder + berkas),
// hanya saja daftar dan formulirnya dirender <KelolaPanel /> yang memanggil
// Server Action di './actions' (buat folder, unggah, ubah nama, hapus).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllAccesses } from '@/lib/session';
import { isSuperadmin } from '@/lib/admin-guard';
import { LogoutButton } from '@/components/LogoutButton';
import { daftarFile, daftarFolder, jalurFolder, urlFile } from '@/lib/haqibah';
import { KelolaPanel } from './KelolaPanel';

export const dynamic = 'force-dynamic';

/** Id dari query string yang bukan UUID tak boleh sampai ke query (pg 22P02). */
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HaqibahKoordinatorPage({
  searchParams,
}: {
  searchParams: { f?: string };
}) {
  // Pengelola = punya akses role 'koordinator_ketua_kelas' ATAU superadmin.
  // Sengaja tak memakai requireKoordinatorKetuaKelas() karena superadmin boleh
  // masuk tanpa memegang role itu; yang tak berhak diarahkan ke '/' (bukan 500).
  const accesses = await getAllAccesses();
  const kk = accesses.find((a) => a.role === 'koordinator_ketua_kelas') ?? null;
  if (!kk && !(await isSuperadmin())) redirect('/');

  const fParam = searchParams.f?.trim() || null;
  // jalurFolder() memulangkan array kosong bila folder sudah tak ada — anggap
  // saja pengguna berada di akar, jangan 500 karena tautan basi.
  const jalur = await jalurFolder(fParam && POLA_UUID.test(fParam) ? fParam : null);
  const folderHilang = !!fParam && jalur.length === 0;
  const folderId = folderHilang ? null : fParam;

  const [subfolder, berkas] = await Promise.all([daftarFolder(folderId), daftarFile(folderId)]);
  const berkasDenganUrl = await Promise.all(
    berkas.map(async (b) => ({
      id: b.id,
      nama: b.nama,
      ext: b.ext,
      ukuran: b.ukuran,
      url: await urlFile(b),
    }))
  );

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">H</span> Kelola Haqibah
            </div>
            <LogoutButton />
          </div>


          <h1 className="t-h1" style={{ marginBottom: 4 }}>Kelola Haqibatul Mu’allim</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            {kk ? `${kk.name} — ` : ''}susun folder dan berkas pembantu pengajar: panduan
            ujian, tatib/SOP, modul, kurikulum, dan panduan aplikasi. Yang tersimpan di sini
            langsung terlihat pengajar di{' '}
            <Link href="/haqibah/pengajar">Haqibatul Mu’allim</Link>.
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
              <Link href="/haqibah/koordinator">Semua Berkas</Link>
            )}
            {jalur.map((f, i) => (
              <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--muted-2)' }}>/</span>
                {i === jalur.length - 1 ? (
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{f.nama}</span>
                ) : (
                  <Link href={`/haqibah/koordinator?f=${f.id}`}>{f.nama}</Link>
                )}
              </span>
            ))}
          </nav>

          {folderHilang && (
            <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
              Folder yang Anda tuju sudah tidak ada. Ditampilkan daftar teratas.
            </p>
          )}

          <KelolaPanel folderId={folderId} subfolder={subfolder} berkas={berkasDenganUrl} />

          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 20 }}>
            <Link href="/">← Kembali ke Menu Utama</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
