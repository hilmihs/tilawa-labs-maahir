// Rekap Shakwa — dipakai dashboard koordinator DAN endpoint API publik
// (/api/v1/rekap/shakwa) yang ditarik hermes agent. Satu builder supaya angka di
// layar dan angka yang ditarik agen tak mungkin berbeda.

import { supabaseAdmin } from './supabase-admin';
import {
  KATEGORI,
  KATEGORI_LABEL,
  STATUS_LABEL,
  IZIN_JENIS_LABEL,
  type ShakwaKategori,
  type ShakwaStatus,
  type ShakwaIzinJenis,
} from './shakwa';
import { todayJakartaISO } from './hits-observasi';
import type { Gender } from '@/types/db';

export type ShakwaIzinItem = {
  /** Dipakai koordinator untuk membetulkan `jadwalGanti`. */
  id: string;
  tanggal: string;
  jenis: ShakwaIzinJenis;
  jenisLabel: string;
  menit: number | null;
  jadwalGanti: string | null;
  halaqahName: string | null;
  sudahTerpakai: boolean;
  /** Pengajar yang izin — disaring dari pilihan badalnya sendiri. */
  pengajarId: string;
  /** Hanya izin BADAL. Id dipakai koordinator mengganti badal. */
  badalPengajarId: string | null;
  badalNama: string | null;
};

export type ShakwaItem = {
  id: string;
  nomorTiket: string;
  pelaporType: 'peserta' | 'pengajar';
  kategori: ShakwaKategori;
  kategoriLabel: string;
  gender: Gender;
  nama: string;
  /** Hanya diisi untuk dashboard; dibuang dari keluaran API oleh sanitize(). */
  pelapor_wa: string | null;
  halaqahLabel: string;
  pengajarNama: string | null;
  isi: string;
  jawaban: Record<string, string>;
  status: ShakwaStatus;
  statusLabel: string;
  catatanKoordinator: string | null;
  ditanganiAt: string | null;
  lampiran: string[];
  jumlahLampiran: number;
  izin: ShakwaIzinItem[];
  createdAt: string;
};

export type ShakwaRekap = {
  mulai: string; // YYYY-MM-DD inklusif
  sampai: string; // YYYY-MM-DD inklusif
  total: number;
  belumDitangani: number;
  perKategori: Array<{ kategori: ShakwaKategori; label: string; jumlah: number }>;
  perStatus: Array<{ status: ShakwaStatus; label: string; jumlah: number }>;
  items: ShakwaItem[];
  page: number; // halaman aktif (1 bila tak dipaginasi)
  limit: number; // ukuran halaman efektif
  totalItems: number; // jumlah baris penuh dalam rentang (sebelum diiris halaman)
  totalHalaman: number; // jumlah halaman (minimal 1)
};

export type ShakwaFilter = {
  /** Hari tunggal; diabaikan bila `dari`/`sampai` diisi. Default: hari ini (WIB). */
  tanggal?: string;
  dari?: string;
  sampai?: string;
  kategori?: ShakwaKategori;
  status?: ShakwaStatus;
  gender?: Gender;
  /** Batas jumlah baris yang dikembalikan (bukan batas hitungan ringkasan). */
  limit?: number;
  /** Halaman aktif (mulai 1). Bila diisi, `items` diiris per halaman; bila kosong, semua baris dikembalikan (jalur API). */
  page?: number;
};

const STATUS_LIST: ShakwaStatus[] = ['submitted', 'in_review', 'resolved', 'closed'];

export function rentangShakwa(f: ShakwaFilter): { mulai: string; sampai: string } {
  if (f.dari || f.sampai) {
    const mulai = f.dari ?? f.sampai!;
    const sampai = f.sampai ?? f.dari!;
    return mulai <= sampai ? { mulai, sampai } : { mulai: sampai, sampai: mulai };
  }
  const t = f.tanggal ?? todayJakartaISO();
  return { mulai: t, sampai: t };
}

export async function getShakwaRekap(f: ShakwaFilter = {}): Promise<ShakwaRekap> {
  const { mulai, sampai } = rentangShakwa(f);

  // Rentang tanggal WIB (UTC+7) → batas UTC. Tanpa penyesuaian ini, laporan yang
  // masuk sebelum pukul 07.00 WIB akan terhitung di hari sebelumnya.
  const mulaiUtc = `${mulai}T00:00:00+07:00`;
  const sampaiUtc = `${sampai}T23:59:59.999+07:00`;

  let q = supabaseAdmin
    .from('shakwa')
    .select(
      'id, nomor_tiket, pelapor_type, kategori, gender, nama, pelapor_wa, halaqoh, pengajar_id, isi, jawaban, lampiran, status, catatan_reviewer, reviewed_at, created_at'
    )
    .gte('created_at', mulaiUtc)
    .lte('created_at', sampaiUtc)
    .order('created_at', { ascending: false });
  if (f.kategori) q = q.eq('kategori', f.kategori);
  if (f.status) q = q.eq('status', f.status);
  if (f.gender) q = q.eq('gender', f.gender);
  if (f.limit) q = q.limit(f.limit);

  const { data } = await q;
  const rows = (data ?? []) as Array<{
    id: string;
    nomor_tiket: string | null;
    pelapor_type: 'peserta' | 'pengajar';
    kategori: ShakwaKategori;
    gender: Gender;
    nama: string;
    pelapor_wa: string | null;
    halaqoh: string | null;
    pengajar_id: string | null;
    isi: string;
    jawaban: Record<string, string> | null;
    lampiran: string[] | null;
    status: ShakwaStatus;
    catatan_reviewer: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>;

  // Nama pengajar & rincian izin hanya diambil bila memang ada yang memerlukan.
  const pengajarIds = [...new Set(rows.map((r) => r.pengajar_id).filter((x): x is string => !!x))];
  const shakwaIds = rows.map((r) => r.id);

  const [pengajarRows, izinRows] = await Promise.all([
    pengajarIds.length
      ? supabaseAdmin.from('pengajar').select('id, name').in('id', pengajarIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    shakwaIds.length
      ? supabaseAdmin
          .from('shakwa_izin')
          .select('id, shakwa_id, pengajar_id, tanggal, jenis, menit, jadwal_ganti, dipakai_tabayyun_id, badal_pengajar_id, halaqah:halaqah_id(name), badal:badal_pengajar_id(name)')
          .in('shakwa_id', shakwaIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const namaPengajar = new Map(
    ((pengajarRows.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name])
  );

  const izinByShakwa = new Map<string, ShakwaIzinItem[]>();
  for (const raw of (izinRows.data ?? []) as Array<{
    id: string;
    shakwa_id: string;
    pengajar_id: string;
    tanggal: string;
    jenis: ShakwaIzinJenis;
    menit: number | null;
    jadwal_ganti: string | null;
    dipakai_tabayyun_id: string | null;
    badal_pengajar_id: string | null;
    halaqah: { name: string } | null;
    badal: { name: string } | null;
  }>) {
    const arr = izinByShakwa.get(raw.shakwa_id) ?? [];
    arr.push({
      id: raw.id,
      tanggal: raw.tanggal,
      jenis: raw.jenis,
      jenisLabel: IZIN_JENIS_LABEL[raw.jenis] ?? raw.jenis,
      menit: raw.menit,
      jadwalGanti: raw.jadwal_ganti,
      halaqahName: (raw.halaqah as unknown as { name: string } | null)?.name ?? null,
      sudahTerpakai: !!raw.dipakai_tabayyun_id,
      pengajarId: raw.pengajar_id,
      badalPengajarId: raw.badal_pengajar_id,
      badalNama: (raw.badal as unknown as { name: string } | null)?.name ?? null,
    });
    izinByShakwa.set(raw.shakwa_id, arr);
  }

  const items: ShakwaItem[] = rows.map((r) => ({
    id: r.id,
    nomorTiket: r.nomor_tiket ?? '—',
    pelaporType: r.pelapor_type,
    kategori: r.kategori,
    kategoriLabel: KATEGORI_LABEL[r.kategori] ?? r.kategori,
    gender: r.gender,
    nama: r.nama,
    pelapor_wa: r.pelapor_wa,
    halaqahLabel: r.halaqoh ?? '—',
    pengajarNama: r.pengajar_id ? (namaPengajar.get(r.pengajar_id) ?? null) : null,
    isi: r.isi,
    jawaban: r.jawaban ?? {},
    status: r.status,
    statusLabel: STATUS_LABEL[r.status] ?? r.status,
    catatanKoordinator: r.catatan_reviewer,
    ditanganiAt: r.reviewed_at,
    lampiran: r.lampiran ?? [],
    jumlahLampiran: (r.lampiran ?? []).length,
    izin: izinByShakwa.get(r.id) ?? [],
    createdAt: r.created_at,
  }));

  // Semua hitungan ringkasan tetap dari set baris penuh dalam rentang.
  const hitungKategori = new Map<ShakwaKategori, number>();
  const hitungStatus = new Map<ShakwaStatus, number>();
  for (const i of items) {
    hitungKategori.set(i.kategori, (hitungKategori.get(i.kategori) ?? 0) + 1);
    hitungStatus.set(i.status, (hitungStatus.get(i.status) ?? 0) + 1);
  }

  // Paginasi hanya bila `page` diisi (jalur dashboard). Jalur API biarkan `page`
  // undefined agar seluruh baris dalam rentang dikembalikan utuh.
  const totalItems = items.length;
  const PER_HALAMAN = f.limit ?? 25;
  let page: number;
  let limit: number;
  let totalHalaman: number;
  let itemsHalaman: ShakwaItem[];
  if (f.page != null) {
    page = Math.max(1, f.page);
    limit = PER_HALAMAN;
    totalHalaman = Math.max(1, Math.ceil(totalItems / PER_HALAMAN));
    itemsHalaman = items.slice((page - 1) * PER_HALAMAN, page * PER_HALAMAN);
  } else {
    page = 1;
    limit = totalItems || PER_HALAMAN;
    totalHalaman = 1;
    itemsHalaman = items;
  }

  return {
    mulai,
    sampai,
    total: totalItems,
    belumDitangani: items.filter((i) => i.status === 'submitted').length,
    perKategori: KATEGORI.map((k) => ({
      kategori: k.value,
      label: k.label,
      jumlah: hitungKategori.get(k.value) ?? 0,
    })).filter((k) => k.jumlah > 0),
    perStatus: STATUS_LIST.map((s) => ({
      status: s,
      label: STATUS_LABEL[s],
      jumlah: hitungStatus.get(s) ?? 0,
    })),
    items: itemsHalaman,
    page,
    limit,
    totalItems,
    totalHalaman,
  };
}

/** Jumlah aduan berstatus 'submitted' sepanjang waktu (lepas dari filter tanggal). */
/**
 * Jumlah aduan yang belum ditangani. `gender` WAJIB: tanpanya lonceng di
 * dashboard menghitung kedua gender, jadi koordinator ikhwan melihat angka yang
 * memuat antrean akhwat — dan mengejar tiket yang bukan bagiannya.
 */
export async function countShakwaBelumDitangani(gender: Gender): Promise<number> {
  const { count } = await supabaseAdmin
    .from('shakwa')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'submitted')
    .eq('gender', gender);
  return count ?? 0;
}
