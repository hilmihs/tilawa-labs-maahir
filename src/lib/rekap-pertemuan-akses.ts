import 'server-only';
// Identitas pengajar untuk halaman Rekap Pertemuan (/kehadiran/pertemuan).
//
// Satu orang bisa punya role `pengajar` (HITS) dan/atau mengampu kelas Maahir
// (akses lewat nomor WA, bukan role — lihat `maahir-checkin-pengajar.ts`).
// Keduanya boleh membuka halaman ini. Pencocokan ke Dashboard Edu (hilmihs)
// memakai `kunciMentah`: override `pengajar.eval_pengajar_id` bila diisi
// koordinator, selain itu nomor WA akun.
//
// PENTING: `wa` dan `kunciMentah` hanya untuk server. Jangan dirender, jangan
// dioper ke komponen client, jangan dicatat ke log.

import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAllAccesses } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { findPengajarMaahir, type PengajarMaahirAkses } from '@/lib/maahir-checkin-pengajar';
import { normalizeWhatsApp } from '@/lib/whatsapp';
import type { PengajarSession } from '@/types/db';

export type IdentitasPertemuan = {
  /** Nama tampilan: pengajar.name ?? maahir_pengajar.name ?? nama sesi. */
  nama: string;
  /** id role pengajar (HITS), null bila hanya pengajar kelas Maahir. */
  pengajarId: string | null;
  aksesMaahir: PengajarMaahirAkses | null;
  /** SERVER-ONLY — jangan dirender atau dioper ke client. */
  wa: string | null;
  /** SERVER-ONLY — 'wa:<nomor>' / 'nm:<slug>:<nama>' mentah, belum di-hash. */
  kunciMentah: string[];
  /** Nama dari baris pengajar / maahir_pengajar (untuk cocok-nama cadangan). */
  namaAkun: string[];
  /** Punya role pengajar, atau mengampu minimal satu kelas Maahir. */
  bolehLihat: boolean;
};

const bersih = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/** Identitas sesi login untuk rekap pertemuan; null bila belum login. */
export async function getIdentitasPertemuan(): Promise<IdentitasPertemuan | null> {
  const accesses = await getAllAccesses();
  if (accesses.length === 0) return null;

  // WA kembar bisa memberi lebih dari satu akses pengajar — ambil semuanya
  // untuk kunci, yang pertama untuk pengajarId.
  const aksesPengajar = accesses.filter((a): a is PengajarSession => a.role === 'pengajar');
  const pengajarIds = Array.from(new Set(aksesPengajar.map((a) => a.pengajar_id).filter(Boolean)));
  const pengajarId = pengajarIds[0] ?? null;

  const [waSesi, barisPengajar, kunciEval] = await Promise.all([
    getSessionWa(),
    pengajarIds.length > 0
      ? supabaseAdmin
          .from('pengajar')
          .select('id, name, whatsapp_number, eval_pengajar_id')
          .in('id', pengajarIds)
          .then(({ data }) => (data ?? []) as Array<{ id: string; name: string | null; whatsapp_number: string | null; eval_pengajar_id: string | null }>)
      : Promise.resolve([] as Array<{ id: string; name: string | null; whatsapp_number: string | null; eval_pengajar_id: string | null }>),
    // evalPengajarIdFor menerima pengajar.id (BUKAN maahir_pengajar.id).
    Promise.all(pengajarIds.map((id) => evalPengajarIdFor(id))),
  ]);

  const utama = barisPengajar.find((r) => r.id === pengajarId) ?? barisPengajar[0] ?? null;
  const wa = bersih(waSesi) ?? bersih(utama?.whatsapp_number);

  const aksesMaahir = wa ? await findPengajarMaahir(wa) : null;

  const kunci = new Set<string>();
  for (const k of kunciEval) {
    const t = bersih(k);
    if (t) kunci.add(t);
  }
  const tambahWa = (nomor: string | null | undefined) => {
    const t = bersih(nomor);
    if (t) kunci.add(`wa:${normalizeWhatsApp(t)}`);
  };
  // Override koordinator (pengajar.eval_pengajar_id) MENGGANTIKAN pencocokan
  // lewat WA — sama seperti evalPengajarIdFor. Tanpa ini, nomor WA yang keliru
  // cocok tetap ikut menarik halaqah milik orang lain.
  const adaOverride = barisPengajar.some((r) => bersih(r.eval_pengajar_id));
  if (!adaOverride) {
    tambahWa(wa);
    for (const r of barisPengajar) tambahWa(r.whatsapp_number);
    tambahWa(aksesMaahir?.pengajar.whatsapp_number);
  }

  const namaAkun = Array.from(
    new Set(
      [...barisPengajar.map((r) => bersih(r.name)), bersih(aksesMaahir?.pengajar.name)].filter(
        (n): n is string => !!n
      )
    )
  );

  const namaSesi = bersih(aksesPengajar[0]?.name) ?? bersih((accesses[0] as { name?: string }).name);
  const nama = bersih(utama?.name) ?? bersih(aksesMaahir?.pengajar.name) ?? namaSesi ?? 'Pengajar';

  return {
    nama,
    pengajarId,
    aksesMaahir,
    wa,
    kunciMentah: Array.from(kunci),
    namaAkun,
    bolehLihat: pengajarId !== null || (aksesMaahir?.kelas.length ?? 0) > 0,
  };
}

/**
 * Akun tercatat sebagai guru di Dashboard Edu (mirror `eval_pengajar`, id
 * 'wa:<nomor>' / 'nm:<slug>:<nama>' — format yang sama dengan `kunciMentah`).
 * Membedakan "akun tak ditemukan" dari "ada, tapi tak berjadwal periode ini".
 */
export async function terdaftarDiDashboardEdu(kunciMentah: string[]): Promise<boolean> {
  if (kunciMentah.length === 0) return false;
  const { data } = await supabaseAdmin.from('eval_pengajar').select('id').in('id', kunciMentah).limit(1);
  return (data ?? []).length > 0;
}

/** Penjaga halaman (bukan server action): alihkan ke beranda bila tak berhak. */
export async function jagaRekapPertemuan(): Promise<IdentitasPertemuan> {
  const id = await getIdentitasPertemuan();
  if (!id || !id.bolehLihat) redirect('/');
  return id;
}
