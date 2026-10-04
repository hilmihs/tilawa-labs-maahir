import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsPeriode, KsSlot } from '@/types/db';
import { identitasPendaftar } from '@/lib/ketersediaan-pendaftar';
import { identitasTerpakaiLintasPeriode } from '@/lib/ketersediaan-lintas-periode';

/**
 * Pasokan (pengajar) vs permintaan (pendaftar) per slot.
 *
 * Dipakai dua sisi:
 *  · form pengajar — supaya slot dipilih dengan sadar, bukan menebak. Dokumen
 *    konsep mencatat pengajar mengosongkan waktu berbulan-bulan lalu tidak
 *    mendapat kelas karena murid tak cukup; angka di sini yang mencegahnya.
 *  · papan koordinator — dasar keputusan slot mana perlu dikejar pengajarnya.
 *
 * Pengajar HANYA melihat angka agregat: tidak ada nama, tidak ada nomor WA.
 * Calon murid belum menjadi peserta siapa pun saat ini, jadi identitasnya tidak
 * boleh tersebar ke ratusan pengajar.
 */

export interface RiwayatSlot {
  /** Berapa periode lampau yang tercatat untuk slot ini. */
  periode: number;
  terbentuk: number;
  batal: number;
}

export interface RingkasSlot {
  slot_id: string;
  /** Pendaftar sah yang belum masuk halaqah mana pun — inilah antreannya. */
  antre: number;
  /** Sudah masuk usulan halaqah. */
  dialokasikan: number;
  /** Ditahan saringan mutu; tidak dihitung sampai dibereskan. */
  ditahan: number;
  /** Pendaftar sah di periode ini yang sudah masuk usulan di periode lain. Tidak ikut antre. */
  terpakai_lain: number;
  /** Pengajar bersedia di slot ini (terverifikasi + diajukan) — definisi yang sama dengan mesin alokasi. */
  pengajar_tersedia: number;
  /** Pengajar yang sudah memegang halaqah di slot ini pada periode berjalan. */
  pengajar_terpakai: number;
  /** Halaqah hidup di slot ini (disetujui sampai terkirim). */
  halaqah_hidup: number;
  /** ceil(antre / kapasitas) — berapa halaqah lagi yang dibutuhkan permintaan. */
  butuh_halaqah: number;
  /** Dibatasi pasokan: tak mungkin lebih dari pengajar yang masih bebas. */
  dapat_dibentuk: number;
  /** Antre yang tetap tak tertampung walau semua pengajar bebas dipakai. */
  belum_tertampung: number;
  /** Usia antrean terlama dalam hari; null bila tak ada yang antre. */
  antrean_tertua_hari: number | null;
  /** Ada antrean cukup tapi tak ada pengajar bebas — slot ini yang perlu dikejar. */
  butuh_pengajar: boolean;
  riwayat: RiwayatSlot | null;
}

const HARI_MS = 24 * 60 * 60 * 1000;

interface PendaftarRingkas {
  slot_id: string | null;
  status: string;
  didaftar_pada: string | null;
  wa_normal: string | null;
  nama: string;
}

interface KetersediaanRingkas {
  slot_id: string;
  status: string;
  pengisian?: { pengajar_id: string; status: string } | null;
}

interface UsulanRingkas {
  slot_id: string;
  pengajar_id: string | null;
  status: string;
}

const STATUS_HALAQAH_HIDUP = ['disetujui', 'menunggu', 'dikonfirmasi', 'dikirim'];
/** Pengajar terpakai dihitung seperti mesin alokasi: usulan yang belum disetujui pun sudah memegang jamnya. */
const STATUS_MEMEGANG_JAM = ['usulan', ...STATUS_HALAQAH_HIDUP];

/**
 * Hitung ringkasan untuk semua slot sebuah periode sekaligus.
 *
 * Sengaja satu tarikan lalu dihitung di memori, bukan agregasi SQL: lapisan
 * pg-shim tidak menyediakan GROUP BY, dan jumlah barisnya masih ratusan sampai
 * ribuan — jauh di bawah ambang yang menuntut agregasi sisi basis data.
 */
export async function ringkasSlot(
  periode: KsPeriode,
  slots: readonly KsSlot[],
  sekarang: Date
): Promise<Map<string, RingkasSlot>> {
  const [{ data: pendaftar }, { data: ketersediaan }, { data: usulan }, riwayat, terpakaiLain] = await Promise.all([
    supabaseAdmin
      .from('ks_pendaftar')
      .select('slot_id, status, didaftar_pada, wa_normal, nama')
      .eq('periode_id', periode.id),
    // Sama dengan mesin alokasi: 'diajukan' juga pasokan. Sebelumnya papan hanya
    // menghitung 'terverifikasi', jadi angka di layar selalu lebih kecil dari yang
    // benar-benar dipakai alokasi.
    // Hanya baris milik slot periode ini — bukan seluruh tabel lintas periode.
    slots.length > 0
      ? supabaseAdmin
          .from('ks_ketersediaan')
          .select('slot_id, status, pengisian:pengisian_id(pengajar_id, status)')
          .in(
            'slot_id',
            slots.map((s) => s.id)
          )
          .in('status', ['terverifikasi', 'diajukan'])
      : Promise.resolve({ data: [] as KetersediaanRingkas[] }),
    supabaseAdmin
      .from('ks_usulan')
      .select('slot_id, pengajar_id, status')
      .eq('periode_id', periode.id)
      .in('status', STATUS_MEMEGANG_JAM),
    riwayatSlot(slots),
    identitasTerpakaiLintasPeriode(periode.id),
  ]);

  const slotIds = new Set(slots.map((s) => s.id));

  const antre = new Map<string, number>();
  const lain = new Map<string, number>();
  const dialokasikan = new Map<string, number>();
  const ditahan = new Map<string, number>();
  const tertua = new Map<string, number>();

  for (const p of (pendaftar ?? []) as PendaftarRingkas[]) {
    if (!p.slot_id || !slotIds.has(p.slot_id)) continue;
    if (p.status === 'valid') {
      const id = identitasPendaftar(p.wa_normal, p.nama);
      if (id && terpakaiLain.has(id)) {
        lain.set(p.slot_id, (lain.get(p.slot_id) ?? 0) + 1);
        continue;
      }
      antre.set(p.slot_id, (antre.get(p.slot_id) ?? 0) + 1);
      if (p.didaftar_pada) {
        const hari = Math.floor((sekarang.getTime() - new Date(p.didaftar_pada).getTime()) / HARI_MS);
        if (hari >= 0) tertua.set(p.slot_id, Math.max(tertua.get(p.slot_id) ?? 0, hari));
      }
    } else if (p.status === 'dialokasikan') {
      dialokasikan.set(p.slot_id, (dialokasikan.get(p.slot_id) ?? 0) + 1);
    } else if (p.status === 'ditahan') {
      ditahan.set(p.slot_id, (ditahan.get(p.slot_id) ?? 0) + 1);
    }
  }

  // Pengajar tersedia dihitung sebagai himpunan, bukan jumlah baris: satu
  // pengajar bisa punya beberapa baris bila datanya pernah diperbaiki.
  const tersediaPerSlot = new Map<string, Set<string>>();
  for (const k of (ketersediaan ?? []) as KetersediaanRingkas[]) {
    if (!slotIds.has(k.slot_id)) continue;
    const p = k.pengisian;
    // 'nonaktif' = sudah diingatkan dan tetap diam → berhenti ikut hitungan.
    // 'basi' tetap dihitung: turun prioritas, bukan hilang.
    if (!p || p.status === 'nonaktif') continue;
    if (!tersediaPerSlot.has(k.slot_id)) tersediaPerSlot.set(k.slot_id, new Set());
    tersediaPerSlot.get(k.slot_id)!.add(p.pengajar_id);
  }

  const terpakaiPerSlot = new Map<string, Set<string>>();
  const halaqahHidup = new Map<string, number>();
  for (const u of (usulan ?? []) as UsulanRingkas[]) {
    if (!slotIds.has(u.slot_id)) continue;
    if (STATUS_HALAQAH_HIDUP.includes(u.status)) halaqahHidup.set(u.slot_id, (halaqahHidup.get(u.slot_id) ?? 0) + 1);
    if (u.pengajar_id) {
      if (!terpakaiPerSlot.has(u.slot_id)) terpakaiPerSlot.set(u.slot_id, new Set());
      terpakaiPerSlot.get(u.slot_id)!.add(u.pengajar_id);
    }
  }

  const out = new Map<string, RingkasSlot>();
  for (const s of slots) {
    const a = antre.get(s.id) ?? 0;
    const tersedia = tersediaPerSlot.get(s.id)?.size ?? 0;
    const terpakai = terpakaiPerSlot.get(s.id)?.size ?? 0;
    // Seorang pengajar tak dapat mengajar dua kelas pada jam yang sama, jadi
    // pasokan bebas di satu slot = pengajar tersedia dikurangi yang sudah terpakai.
    const bebas = Math.max(0, tersedia - terpakai);
    const butuh = Math.ceil(a / periode.kapasitas_halaqah);
    const dapat = Math.min(butuh, bebas);
    const belum = Math.max(0, a - dapat * periode.kapasitas_halaqah);

    out.set(s.id, {
      slot_id: s.id,
      antre: a,
      dialokasikan: dialokasikan.get(s.id) ?? 0,
      ditahan: ditahan.get(s.id) ?? 0,
      terpakai_lain: lain.get(s.id) ?? 0,
      pengajar_tersedia: tersedia,
      pengajar_terpakai: terpakai,
      halaqah_hidup: halaqahHidup.get(s.id) ?? 0,
      butuh_halaqah: butuh,
      dapat_dibentuk: dapat,
      belum_tertampung: belum,
      antrean_tertua_hari: tertua.get(s.id) ?? null,
      butuh_pengajar: a >= periode.ambang_bentuk && bebas === 0,
      riwayat: riwayat.get(kunciRiwayat(s.label, s.kelompok, s.mode)) ?? null,
    });
  }
  return out;
}

function kunciRiwayat(label: string, kelompok: Gender, mode: string): string {
  return `${kelompok}|${mode}|${label.trim().toLowerCase()}`;
}

/**
 * Riwayat "peluang slot benar-benar terbentuk" dari periode lampau.
 * Menjawab kekhawatiran kedua dokumen konsep: pengajar mengosongkan waktu lalu
 * tidak mendapat kelas. Dicocokkan lewat label + kelompok + mode karena periode
 * lampau tidak punya slot_id apa pun di basis data ini.
 */
async function riwayatSlot(slots: readonly KsSlot[]): Promise<Map<string, RiwayatSlot>> {
  const out = new Map<string, RiwayatSlot>();
  if (slots.length === 0) return out;

  const { data } = await supabaseAdmin
    .from('ks_slot_riwayat')
    .select('slot_label, kelompok, mode, halaqah_terbentuk, halaqah_batal');

  for (const r of (data ?? []) as {
    slot_label: string;
    kelompok: Gender;
    mode: string;
    halaqah_terbentuk: number;
    halaqah_batal: number;
  }[]) {
    const k = kunciRiwayat(r.slot_label, r.kelompok, r.mode);
    const ada = out.get(k) ?? { periode: 0, terbentuk: 0, batal: 0 };
    out.set(k, {
      periode: ada.periode + 1,
      terbentuk: ada.terbentuk + r.halaqah_terbentuk,
      batal: ada.batal + r.halaqah_batal,
    });
  }
  return out;
}

/**
 * Kalimat pendek "peluang terbentuk" untuk ditampilkan ke pengajar.
 * Sengaja menyebut jumlah periode: "3 dari 4 periode" lebih jujur daripada
 * persentase yang menyamarkan bahwa datanya cuma dua periode.
 */
export function teksPeluang(r: RiwayatSlot | null): string | null {
  if (!r || r.periode === 0) return null;
  const total = r.terbentuk + r.batal;
  if (total === 0) return `${r.periode} periode tercatat, belum pernah terbentuk`;
  return `terbentuk ${r.terbentuk}× dari ${total} percobaan (${r.periode} periode)`;
}
