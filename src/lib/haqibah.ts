// Haqibatul Mu'allim — lapisan data pustaka berkas pembantu pengajar.
//
// Metadata folder & berkas ada di Postgres (haqibah_folder, haqibah_file);
// berkas fisiknya ditulis src/lib/haqibah-storage.ts ke bucket 'haqibah'.
// Nama di disk memakai UUID, jadi mengubah nama tampil tak menyentuh disk dan
// URL bertanda tangan yang lama tetap sah.
//
// Shim supabaseAdmin tak mendukung .rpc / .or / embed to-many, jadi penelusuran
// jalur folder dikerjakan dengan rekursi kecil di TypeScript (kedalaman maksimum
// hanya 3 tingkat, jadi biayanya tak berarti).

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const HAQIBAH_BUCKET = 'haqibah';
export const HAQIBAH_MAX_DEPTH = 3;

const MAKS_NAMA_FOLDER = 120;
const MAKS_NAMA_FILE = 200;
/** Rem darurat penelusuran ke atas bila data terlanjur bersiklus/terlalu dalam. */
const BATAS_TELUSUR = 20;

export interface FolderNode {
  id: string;
  parent_id: string | null;
  nama: string;
  urutan: number;
}

export interface FileNode {
  id: string;
  folder_id: string | null;
  nama: string;
  storage_path: string;
  ext: string;
  mime: string;
  ukuran: number;
  urutan: number;
}

const KOLOM_FOLDER = 'id, parent_id, nama, urutan';
const KOLOM_FILE = 'id, folder_id, nama, storage_path, ext, mime, ukuran, urutan';

function keFolderNode(r: Record<string, unknown>): FolderNode {
  return {
    id: r.id as string,
    parent_id: (r.parent_id as string | null) ?? null,
    nama: r.nama as string,
    urutan: (r.urutan as number) ?? 0,
  };
}

function keFileNode(r: Record<string, unknown>): FileNode {
  return {
    id: r.id as string,
    folder_id: (r.folder_id as string | null) ?? null,
    nama: r.nama as string,
    storage_path: r.storage_path as string,
    ext: r.ext as string,
    mime: r.mime as string,
    ukuran: Number(r.ukuran ?? 0),
    urutan: (r.urutan as number) ?? 0,
  };
}

/** Nama folder/berkas dirapikan: spasi ganda dibuang, panjang dibatasi. */
function rapikanNama(nama: string, maks: number, label: string): string {
  const t = nama.replace(/\s+/g, ' ').trim();
  if (!t) throw new Error(`Nama ${label} tidak boleh kosong.`);
  if (t.length > maks) {
    throw new Error(`Nama ${label} terlalu panjang (maksimum ${maks} karakter).`);
  }
  return t;
}

/** Pesan galat berbahasa Indonesia untuk kegagalan query yang tak diharapkan. */
function lempar(pesan: string, err: { message: string } | null): never {
  throw new Error(err?.message ? `${pesan}: ${err.message}` : pesan);
}

/** Nomor urut berikutnya di dalam satu induk, supaya prefiks "1. ", "2. " rapi. */
async function urutanBerikut(tabel: string, kolomInduk: string, indukId: string | null): Promise<number> {
  let q = supabaseAdmin.from(tabel).select('urutan');
  q = indukId === null ? q.is(kolomInduk, null) : q.eq(kolomInduk, indukId);
  const { data } = await q.order('urutan', { ascending: false }).limit(1);
  const tertinggi = (data ?? [])[0]?.urutan as number | undefined;
  return typeof tertinggi === 'number' ? tertinggi + 1 : 0;
}

// ── Baca ──────────────────────────────────────────────────────────────────────

export async function daftarFolder(parentId: string | null): Promise<FolderNode[]> {
  let q = supabaseAdmin.from('haqibah_folder').select(KOLOM_FOLDER);
  q = parentId === null ? q.is('parent_id', null) : q.eq('parent_id', parentId);
  const { data, error } = await q.order('urutan').order('nama');
  if (error) lempar('Gagal memuat daftar folder', error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(keFolderNode);
}

export async function daftarFile(folderId: string | null): Promise<FileNode[]> {
  let q = supabaseAdmin.from('haqibah_file').select(KOLOM_FILE);
  q = folderId === null ? q.is('folder_id', null) : q.eq('folder_id', folderId);
  const { data, error } = await q.order('urutan').order('nama');
  if (error) lempar('Gagal memuat daftar berkas', error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(keFileNode);
}

export async function ambilFolder(id: string): Promise<FolderNode | null> {
  const { data, error } = await supabaseAdmin
    .from('haqibah_folder')
    .select(KOLOM_FOLDER)
    .eq('id', id)
    .maybeSingle();
  if (error) lempar('Gagal memuat folder', error);
  return data ? keFolderNode(data as Record<string, unknown>) : null;
}

export async function ambilFile(id: string): Promise<FileNode | null> {
  const { data, error } = await supabaseAdmin
    .from('haqibah_file')
    .select(KOLOM_FILE)
    .eq('id', id)
    .maybeSingle();
  if (error) lempar('Gagal memuat berkas', error);
  return data ? keFileNode(data as Record<string, unknown>) : null;
}

/**
 * Rantai folder dari akar ke `id` untuk breadcrumb.
 * `null` (atau folder yang sudah tak ada) → array kosong.
 */
export async function jalurFolder(id: string | null): Promise<FolderNode[]> {
  if (!id) return [];
  const jalur: FolderNode[] = [];
  const terlihat = new Set<string>();
  let kini: string | null = id;
  for (let i = 0; kini && i < BATAS_TELUSUR; i++) {
    if (terlihat.has(kini)) break; // jaga-jaga bila data bersiklus
    terlihat.add(kini);
    const folder: FolderNode | null = await ambilFolder(kini);
    if (!folder) break;
    jalur.unshift(folder);
    kini = folder.parent_id;
  }
  return jalur;
}

/** Kedalaman folder (akar = 1). `null` = di luar folder mana pun → 0. */
export async function kedalamanFolder(id: string | null): Promise<number> {
  if (!id) return 0;
  return (await jalurFolder(id)).length;
}

// ── Tulis: folder ─────────────────────────────────────────────────────────────

/** Cegah dua folder bernama sama dalam satu induk (cocok dengan indeks unik parsial). */
async function pastikanNamaFolderBebas(
  parentId: string | null,
  nama: string,
  kecualiId?: string
): Promise<void> {
  const saudara = await daftarFolder(parentId);
  const bentrok = saudara.some(
    (f) => f.id !== kecualiId && f.nama.toLowerCase() === nama.toLowerCase()
  );
  if (bentrok) throw new Error(`Sudah ada folder bernama "${nama}" di tempat ini.`);
}

export async function buatFolder(parentId: string | null, nama: string): Promise<FolderNode> {
  const bersih = rapikanNama(nama, MAKS_NAMA_FOLDER, 'folder');

  if (parentId) {
    const induk = await ambilFolder(parentId);
    if (!induk) throw new Error('Folder induk tidak ditemukan.');
  }
  const kedalamanInduk = await kedalamanFolder(parentId);
  if (kedalamanInduk >= HAQIBAH_MAX_DEPTH) {
    throw new Error(
      `Folder hanya boleh sampai ${HAQIBAH_MAX_DEPTH} tingkat. Simpan berkasnya langsung di folder ini.`
    );
  }
  await pastikanNamaFolderBebas(parentId, bersih);

  const urutan = await urutanBerikut('haqibah_folder', 'parent_id', parentId);
  const { data, error } = await supabaseAdmin
    .from('haqibah_folder')
    .insert({ parent_id: parentId, nama: bersih, urutan })
    .select(KOLOM_FOLDER)
    .single();
  if (error || !data) {
    if (error?.code === '23505') throw new Error(`Sudah ada folder bernama "${bersih}" di tempat ini.`);
    lempar('Gagal membuat folder', error);
  }
  return keFolderNode(data as Record<string, unknown>);
}

export async function ubahNamaFolder(id: string, nama: string): Promise<void> {
  const bersih = rapikanNama(nama, MAKS_NAMA_FOLDER, 'folder');
  const folder = await ambilFolder(id);
  if (!folder) throw new Error('Folder tidak ditemukan.');
  if (folder.nama === bersih) return;

  await pastikanNamaFolderBebas(folder.parent_id, bersih, id);
  const { error } = await supabaseAdmin
    .from('haqibah_folder')
    .update({ nama: bersih, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') throw new Error(`Sudah ada folder bernama "${bersih}" di tempat ini.`);
    lempar('Gagal mengubah nama folder', error);
  }
}

/**
 * Hapus folder — hanya bila kosong. Isinya dihitung lebih dulu supaya pesan
 * galatnya menjelaskan apa yang masih menghalangi (FK-nya `on delete restrict`,
 * pesan mentahnya tak terbaca pengguna).
 */
export async function hapusFolder(id: string): Promise<void> {
  const folder = await ambilFolder(id);
  if (!folder) throw new Error('Folder tidak ditemukan.');

  const [subfolder, berkas] = await Promise.all([daftarFolder(id), daftarFile(id)]);
  if (subfolder.length || berkas.length) {
    const isi: string[] = [];
    if (subfolder.length) isi.push(`${subfolder.length} subfolder`);
    if (berkas.length) isi.push(`${berkas.length} berkas`);
    throw new Error(
      `Folder "${folder.nama}" masih berisi ${isi.join(' dan ')}. Kosongkan dulu isinya sebelum menghapus.`
    );
  }

  const { error } = await supabaseAdmin.from('haqibah_folder').delete().eq('id', id);
  if (error) lempar('Gagal menghapus folder', error);
}

// ── Tulis: berkas ─────────────────────────────────────────────────────────────

/** Catat metadata berkas yang sudah tersimpan di bucket oleh haqibah-storage. */
export async function catatFile(
  input: Omit<FileNode, 'id' | 'urutan'> & { diunggahOleh: string | null }
): Promise<FileNode> {
  const bersih = rapikanNama(input.nama, MAKS_NAMA_FILE, 'berkas');
  if (input.folder_id) {
    const folder = await ambilFolder(input.folder_id);
    if (!folder) throw new Error('Folder tujuan tidak ditemukan.');
  }

  const urutan = await urutanBerikut('haqibah_file', 'folder_id', input.folder_id);
  const { data, error } = await supabaseAdmin
    .from('haqibah_file')
    .insert({
      folder_id: input.folder_id,
      nama: bersih,
      storage_path: input.storage_path,
      ext: input.ext,
      mime: input.mime,
      ukuran: input.ukuran,
      urutan,
      diunggah_oleh: input.diunggahOleh,
    })
    .select(KOLOM_FILE)
    .single();
  if (error || !data) lempar('Gagal menyimpan data berkas', error);
  return keFileNode(data as Record<string, unknown>);
}

export async function ubahNamaFile(id: string, nama: string): Promise<void> {
  const bersih = rapikanNama(nama, MAKS_NAMA_FILE, 'berkas');
  const berkas = await ambilFile(id);
  if (!berkas) throw new Error('Berkas tidak ditemukan.');
  if (berkas.nama === bersih) return;

  const { error } = await supabaseAdmin
    .from('haqibah_file')
    .update({ nama: bersih, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) lempar('Gagal mengubah nama berkas', error);
}

/** Hapus barisnya saja; berkas fisiknya dihapus haqibah-storage (best-effort). */
export async function hapusFileMeta(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('haqibah_file').delete().eq('id', id);
  if (error) lempar('Gagal menghapus data berkas', error);
}

// ── URL bertanda tangan ───────────────────────────────────────────────────────

/**
 * URL bertanda tangan siap pakai (berlaku 1 jam) ke route /api/audio.
 * Gagal → null, supaya satu berkas rusak tak menjatuhkan seluruh halaman.
 *
 * Bila `nama` ikut dikirim, ditambahkan parameter `n` supaya berkas yang diunduh
 * bernama seperti yang dilihat pengajar, bukan UUID di disk. Parameter itu di
 * luar tanda tangan — sengaja, karena ia cuma memengaruhi nama unduhan, bukan
 * berkas mana yang boleh dibuka.
 */
export async function urlFile(
  f: Pick<FileNode, 'storage_path'> & Partial<Pick<FileNode, 'nama' | 'ext'>>
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(HAQIBAH_BUCKET)
      .createSignedUrl(f.storage_path, 3600);
    if (error || !data) return null;
    if (!f.nama) return data.signedUrl;
    const berkas = f.ext ? `${f.nama}.${f.ext}` : f.nama;
    return `${data.signedUrl}&n=${encodeURIComponent(berkas)}`;
  } catch {
    return null;
  }
}
