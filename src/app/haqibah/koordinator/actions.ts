'use server';

// Server Actions pengelolaan Haqibatul Mu'allim (koordinator ketua kelas /
// superadmin). Semua galat dikembalikan sebagai pesan berbahasa Indonesia —
// lapisan '@/lib/haqibah' dan '@/lib/haqibah-storage' melempar Error dengan
// pesan yang sudah siap tampil, jadi di sini cukup ditangkap dan dibungkus.

import { revalidatePath } from 'next/cache';
import { getAllAccesses } from '@/lib/session';
import { isSuperadmin, getAdminActor } from '@/lib/admin-guard';
import { logAudit } from '@/lib/audit';
import {
  HAQIBAH_MAX_DEPTH,
  kedalamanFolder,
  buatFolder,
  ubahNamaFolder,
  hapusFolder,
  catatFile,
  ubahNamaFile,
  hapusFileMeta,
  ambilFile,
} from '@/lib/haqibah';
import { simpanBerkas, hapusBerkas, adalahBerkas } from '@/lib/haqibah-storage';
import type { BerkasTersimpan } from '@/lib/haqibah-storage';
import type { RoleAccess } from '@/types/db';

export type HasilAksi = { ok: true } | { ok: false; error: string };

const TOLAK: HasilAksi = {
  ok: false,
  error: 'Kamu tidak punya akses mengelola Haqibatul Mu’allim.',
};

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Pengelola {
  /** Untuk atribusi audit; null bila superadmin tak punya role apa pun. */
  aktor: RoleAccess | null;
  /** Nama tampil, dipakai kolom `diunggah_oleh`. */
  nama: string;
}

/**
 * Pengelola = punya akses role 'koordinator_ketua_kelas' ATAU superadmin.
 * Tak me-redirect (beda dengan requireKoordinatorKetuaKelas) supaya action
 * bisa mengembalikan pesan galat yang rapi ke panel klien.
 */
async function pengelola(): Promise<Pengelola | null> {
  const accesses = await getAllAccesses();
  const kk = accesses.find((a) => a.role === 'koordinator_ketua_kelas');
  if (kk) return { aktor: kk, nama: kk.name };
  if (await isSuperadmin()) {
    const admin = await getAdminActor();
    return { aktor: admin, nama: admin?.name ?? 'admin' };
  }
  return null;
}

function segarkan(): void {
  revalidatePath('/haqibah/koordinator');
  revalidatePath('/haqibah/pengajar');
}

/** Pesan Error dari lapisan data sudah berbahasa Indonesia — pakai apa adanya. */
function pesanGalat(e: unknown, bawaan: string): string {
  if (e instanceof Error && e.message) return e.message;
  return bawaan;
}

async function catat(
  p: Pengelola,
  action: string,
  targetTable: string,
  targetId: string | null,
  detail?: Record<string, unknown>
): Promise<void> {
  if (!p.aktor) return;
  await logAudit({ actor: p.aktor, action, targetTable, targetId, detail });
}

/** Id folder/berkas dari klien: kosong → null (akar), selain UUID → ditolak. */
function bacaId(nilai: unknown): string | null | undefined {
  if (nilai === null || nilai === undefined || nilai === '') return null;
  const s = String(nilai);
  return POLA_UUID.test(s) ? s : undefined;
}

// ── Folder ────────────────────────────────────────────────────────────────────

export async function buatFolderAksi(
  parentId: string | null,
  nama: string
): Promise<HasilAksi> {
  const p = await pengelola();
  if (!p) return TOLAK;

  const induk = bacaId(parentId);
  if (induk === undefined) return { ok: false, error: 'Folder induk tidak dikenali.' };
  const bersih = (nama ?? '').replace(/\s+/g, ' ').trim();
  if (!bersih) return { ok: false, error: 'Nama folder tidak boleh kosong.' };

  try {
    // Dicek di sini juga (bukan cuma di lapisan data) supaya kedalaman yang
    // melebihi batas tak sempat menyentuh DB.
    if ((await kedalamanFolder(induk)) >= HAQIBAH_MAX_DEPTH) {
      return {
        ok: false,
        error: `Folder hanya boleh sampai ${HAQIBAH_MAX_DEPTH} tingkat. Simpan berkasnya langsung di folder ini.`,
      };
    }
    const folder = await buatFolder(induk, bersih);
    await catat(p, 'haqibah.folder.buat', 'haqibah_folder', folder.id, {
      nama: folder.nama,
      parent_id: induk,
    });
    segarkan();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: pesanGalat(e, 'Gagal membuat folder.') };
  }
}

export async function ubahNamaFolderAksi(id: string, nama: string): Promise<HasilAksi> {
  const p = await pengelola();
  if (!p) return TOLAK;

  const folderId = bacaId(id);
  if (!folderId) return { ok: false, error: 'Folder tidak ditemukan.' };
  const bersih = (nama ?? '').replace(/\s+/g, ' ').trim();
  if (!bersih) return { ok: false, error: 'Nama folder tidak boleh kosong.' };

  try {
    await ubahNamaFolder(folderId, bersih);
    await catat(p, 'haqibah.folder.ubah_nama', 'haqibah_folder', folderId, { nama: bersih });
    segarkan();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: pesanGalat(e, 'Gagal mengubah nama folder.') };
  }
}

export async function hapusFolderAksi(id: string): Promise<HasilAksi> {
  const p = await pengelola();
  if (!p) return TOLAK;

  const folderId = bacaId(id);
  if (!folderId) return { ok: false, error: 'Folder tidak ditemukan.' };

  try {
    // hapusFolder() menolak folder yang masih berisi dengan pesan yang
    // menjelaskan isinya (FK-nya `on delete restrict`).
    await hapusFolder(folderId);
    await catat(p, 'haqibah.folder.hapus', 'haqibah_folder', folderId);
    segarkan();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: pesanGalat(e, 'Gagal menghapus folder.') };
  }
}

// ── Berkas ────────────────────────────────────────────────────────────────────

/**
 * Unggah banyak berkas sekaligus (`<input type="file" name="berkas" multiple>`).
 * Folder tujuan dibaca dari field `folderId` (kosong = akar).
 * Tiap berkas diproses sendiri-sendiri: yang berhasil tetap tersimpan, yang
 * gagal dilaporkan namanya supaya koordinator tahu mana yang perlu diulang.
 */
export async function unggahBerkasAksi(formData: FormData): Promise<HasilAksi> {
  const p = await pengelola();
  if (!p) return TOLAK;

  const folderId = bacaId(formData.get('folderId') ?? formData.get('folder_id'));
  if (folderId === undefined) return { ok: false, error: 'Folder tujuan tidak dikenali.' };

  // Input file kosong tetap terkirim sebagai berkas tanpa nama & 0 byte — saring.
  // `adalahBerkas` memeriksa bentuk, bukan `instanceof File`: global File tak ada
  // di runtime Node produksi, dan pemeriksaan instanceof di sini akan membuang
  // SEMUA berkas tanpa pesan galat.
  const berkas = formData
    .getAll('berkas')
    .filter((v) => adalahBerkas(v) && (v.size > 0 || v.name !== '')) as File[];
  if (berkas.length === 0) return { ok: false, error: 'Belum ada berkas yang dipilih.' };

  let sukses = 0;
  const gagal: string[] = [];

  for (const f of berkas) {
    let tersimpan: BerkasTersimpan | null = null;
    try {
      tersimpan = await simpanBerkas(f);
      const baris = await catatFile({
        folder_id: folderId,
        nama: tersimpan.namaAsli,
        storage_path: tersimpan.storage_path,
        ext: tersimpan.ext,
        mime: tersimpan.mime,
        ukuran: tersimpan.ukuran,
        diunggahOleh: p.nama,
      });
      sukses++;
      await catat(p, 'haqibah.file.unggah', 'haqibah_file', baris.id, {
        nama: baris.nama,
        folder_id: folderId,
        ukuran: baris.ukuran,
      });
    } catch (e) {
      // Berkas fisik sudah telanjur ditulis tapi metadatanya gagal → buang lagi
      // supaya tak ada berkas yatim di bucket.
      if (tersimpan) await hapusBerkas(tersimpan.storage_path);
      gagal.push(pesanGalat(e, `Gagal mengunggah "${f.name || 'berkas'}".`));
    }
  }

  if (sukses > 0) segarkan();
  if (gagal.length > 0) {
    const awalan = sukses > 0 ? `${sukses} berkas tersimpan, ${gagal.length} gagal. ` : '';
    return { ok: false, error: awalan + gagal.join(' ') };
  }
  return { ok: true };
}

export async function ubahNamaFileAksi(id: string, nama: string): Promise<HasilAksi> {
  const p = await pengelola();
  if (!p) return TOLAK;

  const fileId = bacaId(id);
  if (!fileId) return { ok: false, error: 'Berkas tidak ditemukan.' };
  const bersih = (nama ?? '').replace(/\s+/g, ' ').trim();
  if (!bersih) return { ok: false, error: 'Nama berkas tidak boleh kosong.' };

  try {
    await ubahNamaFile(fileId, bersih);
    await catat(p, 'haqibah.file.ubah_nama', 'haqibah_file', fileId, { nama: bersih });
    segarkan();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: pesanGalat(e, 'Gagal mengubah nama berkas.') };
  }
}

/**
 * Hapus berkas: metadata dulu, baru berkas fisiknya (best-effort). Urutan ini
 * disengaja — kalau penghapusan di disk gagal, yang tersisa hanya file yatim di
 * bucket (tak terlihat pengguna), bukan baris DB yang menunjuk berkas hilang.
 */
export async function hapusFileAksi(id: string): Promise<HasilAksi> {
  const p = await pengelola();
  if (!p) return TOLAK;

  const fileId = bacaId(id);
  if (!fileId) return { ok: false, error: 'Berkas tidak ditemukan.' };

  try {
    const berkas = await ambilFile(fileId);
    if (!berkas) return { ok: false, error: 'Berkas tidak ditemukan.' };

    await hapusFileMeta(fileId);
    await hapusBerkas(berkas.storage_path);
    await catat(p, 'haqibah.file.hapus', 'haqibah_file', fileId, {
      nama: berkas.nama,
      folder_id: berkas.folder_id,
    });
    segarkan();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: pesanGalat(e, 'Gagal menghapus berkas.') };
  }
}
