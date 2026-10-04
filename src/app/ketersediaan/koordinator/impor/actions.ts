'use server';

import { revalidatePath } from 'next/cache';
import { requireOneOfRoles } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { simpanImpor, susunPratinjau, type PilihanImpor, type Pratinjau } from '@/lib/ketersediaan-impor';
import { cekZipAman } from '@/lib/zip-aman';

export type HasilPratinjau = { ok: true; pratinjau: Pratinjau } | { ok: false; error: string };
export type HasilSimpanImpor = { ok: true; pesan: string } | { ok: false; error: string };

const BATAS_BYTE = 5 * 1024 * 1024;

async function jaga(): Promise<{ wa: string | null; nama: string } | string> {
  const sesi = await requireOneOfRoles(['koordinator']);
  return { wa: await getSessionWa(), nama: sesi.name };
}

async function bacaForm(fd: FormData): Promise<{ data: ArrayBuffer; nama: string; pilihan: PilihanImpor } | string> {
  const berkas = fd.get('berkas');
  // Runtime produksi tidak punya global File: `instanceof File` selalu false dan
  // unggahan terbuang diam-diam. Yang diperiksa bentuknya.
  if (!berkas || typeof berkas === 'string' || typeof (berkas as Blob).arrayBuffer !== 'function') {
    return 'Pilih berkas xlsx dulu.';
  }
  const b = berkas as Blob & { name?: string };
  if (!/\.xlsx$/i.test(b.name ?? '')) return 'Berkas harus berformat .xlsx.';
  if (b.size > BATAS_BYTE) return 'Berkas lebih dari 5 MB.';

  let pilihan: PilihanImpor = { tujuan: {}, manual: {} };
  const mentah = fd.get('pilihan');
  if (typeof mentah === 'string' && mentah) {
    try {
      const p = JSON.parse(mentah) as Partial<PilihanImpor>;
      pilihan = { tujuan: p.tujuan ?? {}, manual: p.manual ?? {} };
    } catch {
      return 'Pilihan tidak terbaca. Muat ulang halaman.';
    }
  }
  const data = await b.arrayBuffer();
  const zip = cekZipAman(data);
  if (!zip.ok) return zip.alasan ?? 'Berkas xlsx tidak dapat diterima.';
  return { data, nama: b.name ?? 'ketersediaan.xlsx', pilihan };
}

export async function pratinjauImporXlsx(fd: FormData): Promise<HasilPratinjau> {
  const aktor = await jaga();
  if (typeof aktor === 'string') return { ok: false, error: aktor };
  const form = await bacaForm(fd);
  if (typeof form === 'string') return { ok: false, error: form };
  try {
    return { ok: true, pratinjau: await susunPratinjau(form.data, form.pilihan) };
  } catch (e) {
    return { ok: false, error: `Berkas tidak dapat dibaca: ${(e as Error).message}` };
  }
}

export async function simpanImporXlsx(fd: FormData): Promise<HasilSimpanImpor> {
  const aktor = await jaga();
  if (typeof aktor === 'string') return { ok: false, error: aktor };
  const form = await bacaForm(fd);
  if (typeof form === 'string') return { ok: false, error: form };
  try {
    const h = await simpanImpor(form.data, form.pilihan, aktor, form.nama);
    revalidatePath('/ketersediaan/koordinator');
    const perPeriode = h.periode.map((p) => {
      const bagian = [`${p.pengajar} pengajar, ${p.jam} jam`];
      if (p.slotBaru) bagian.push(`${p.slotBaru} jam baru di master`);
      if (p.dihapus) bagian.push(`${p.dihapus} jam lama dihapus`);
      if (p.pengajarDihapus) bagian.push(`${p.pengajarDihapus} pengajar tak lagi di berkas`);
      if (p.dilindungi) bagian.push(`${p.dilindungi} dilewati karena mengisi sendiri`);
      if (p.catatan) bagian.push(p.catatan);
      return `${p.nama}: ${bagian.join(', ')}`;
    });
    return { ok: true, pesan: `Tersimpan. ${perPeriode.join(' · ')}. ${h.dilewati} baris tidak diimpor.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
