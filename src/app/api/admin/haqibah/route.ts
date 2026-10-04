import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
  HAQIBAH_MAX_DEPTH,
  buatFolder,
  catatFile,
  daftarFile,
  daftarFolder,
} from '@/lib/haqibah';
import { simpanBerkas, hapusBerkas, adalahBerkas } from '@/lib/haqibah-storage';

/**
 * Endpoint pengisian awal Haqibatul Mu'allim — jalur otomasi tanpa SSH.
 *
 * Dipakai sekali untuk menuangkan struktur folder + berkas yang sudah disusun
 * koordinator ke produksi; sesudahnya cukup dimatikan lewat env (lihat
 * `enabled()`), tak perlu deploy ulang. Pengelolaan sehari-hari tetap lewat UI
 * /haqibah/koordinator — endpoint ini sengaja tak bisa mengubah nama & menghapus.
 *
 * Auth & master-switch identik dengan /api/admin/db: Bearer ADMIN_API_TOKEN dan
 * ADMIN_DB_API=on. Mati → 404 supaya keberadaannya tak bocor.
 *
 * POST multipart/form-data:
 *   folder  path folder tujuan, dipisah '/', mis. "3. MODUL DAN KURIKULUM/HITS DASAR"
 *           (kosong = akar). Folder yang belum ada dibuatkan.
 *   berkas  satu atau beberapa berkas.
 * Idempoten: berkas yang namanya sudah ada di folder itu DILEWATI, bukan digandakan.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function enabled(): boolean {
  return process.env.ADMIN_DB_API === 'on' && !!process.env.ADMIN_API_TOKEN;
}

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.ADMIN_API_TOKEN ?? '';
  const header = req.headers.get('authorization') ?? '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  const given = m?.[1] ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Telusuri path folder, buat yang belum ada. Kembalikan id folder terdalam. */
async function pastikanFolder(path: string): Promise<string | null> {
  const bagian = path
    .split('/')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (bagian.length === 0) return null;
  if (bagian.length > HAQIBAH_MAX_DEPTH) {
    throw new Error(`Path "${path}" lebih dari ${HAQIBAH_MAX_DEPTH} tingkat.`);
  }

  let indukId: string | null = null;
  for (const nama of bagian) {
    const adik = await daftarFolder(indukId);
    const cocok = adik.find((f) => f.nama.toLowerCase() === nama.toLowerCase());
    indukId = cocok ? cocok.id : (await buatFolder(indukId, nama)).id;
  }
  return indukId;
}

export async function POST(req: NextRequest) {
  try {
    return await tangani(req);
  } catch (e) {
    // Tanpa akses SSH, log systemd tak terbaca — pesan galat dipulangkan ke
    // pemanggil (endpoint ini sudah dijaga token admin, jadi bukan kebocoran).
    console.error('[admin/haqibah] error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) },
      { status: 500 }
    );
  }
}

async function tangani(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!tokenOk(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_form_data' }, { status: 400 });
  }

  const berkas = fd.getAll('berkas').filter((v) => adalahBerkas(v) && v.size > 0) as File[];
  if (berkas.length === 0) {
    return NextResponse.json({ error: 'berkas_required' }, { status: 400 });
  }

  let folderId: string | null;
  try {
    folderId = await pastikanFolder(String(fd.get('folder') ?? ''));
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }

  // Nama yang sudah ada di folder tujuan → dilewati, supaya aman diulang.
  const sudahAda = new Set((await daftarFile(folderId)).map((f) => f.nama.toLowerCase()));

  const dibuat: string[] = [];
  const dilewati: string[] = [];
  const gagal: Array<{ nama: string; error: string }> = [];

  for (const f of berkas) {
    const namaTampil = f.name.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
    if (sudahAda.has(namaTampil.toLowerCase())) {
      dilewati.push(namaTampil);
      continue;
    }
    let path: string | null = null;
    try {
      const tersimpan = await simpanBerkas(f);
      path = tersimpan.storage_path;
      await catatFile({
        folder_id: folderId,
        nama: tersimpan.namaAsli,
        storage_path: tersimpan.storage_path,
        ext: tersimpan.ext,
        mime: tersimpan.mime,
        ukuran: tersimpan.ukuran,
        diunggahOleh: 'seed-admin',
      });
      sudahAda.add(tersimpan.namaAsli.toLowerCase());
      dibuat.push(tersimpan.namaAsli);
    } catch (e) {
      // Berkas fisik telanjur ditulis tapi metadatanya gagal → buang lagi.
      if (path) await hapusBerkas(path);
      gagal.push({ nama: f.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: gagal.length === 0,
    folder_id: folderId,
    dibuat,
    dilewati,
    gagal,
  });
}
