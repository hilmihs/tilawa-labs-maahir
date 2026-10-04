import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplKonfirmasiHalaqahPenuh } from '@/lib/whatsapp';
import type { Gender, KsHariIdx, KsLibur, KsMode, KsPendaftarSumber, KsPengisianSumber } from '@/types/db';
import { perkiraanSelesaiHalaqah } from '@/lib/ketersediaan-pertemuan';
import type { PendaftarLevel } from '@/lib/ketersediaan-dasbor';
import type { BarisAntrean, KartuUsulan } from './PanelKerja';
import type { BarisGrup } from './PanelGrupPool';

const STATUS_HIDUP = ['disetujui', 'menunggu', 'dikonfirmasi', 'dikirim'];
/** Status yang tampil di papan kerja; sisanya masuk "Riwayat". */
const STATUS_PAPAN = ['usulan', 'disetujui', 'menunggu', 'dikonfirmasi', 'dikirim'];
const STATUS_RIWAYAT = ['ditolak', 'kedaluwarsa', 'batal', 'gagal'];
export const BATAS_USULAN = 200;

/** Tanggal & waktu WIB untuk teks yang dibaca manusia. */
export function waktuWib(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

/**
 * Tautan wa.me berisi pesan konfirmasi halaqah penuh.
 *
 * Satu-satunya penyusun pesan ini: dipakai saat usulan disetujui dan saat papan
 * menampilkan ulang tautan untuk usulan yang masih menunggu. Tautan yang hanya
 * muncul sekali sesudah klik gampang hilang (halaman dimuat ulang, koordinator
 * lain yang menyetujui), padahal tanpa itu pengajar tak pernah tahu.
 */
export function tautanWaKonfirmasi(u: {
  token: string;
  tenggat: string;
  tanggalMulai: string;
  pengajar: { name: string; gender: Gender; whatsapp_number: string };
  slotLabel: string;
  level: string;
  jumlahPeserta: number;
}): { waUrl: string; konfirmasiUrl: string } {
  const konfirmasiUrl = absUrl(`/ketersediaan/konfirmasi/${u.token}`);
  const teks = tplKonfirmasiHalaqahPenuh({
    pengajarName: u.pengajar.name,
    pengajarGender: u.pengajar.gender,
    slotLabel: u.slotLabel,
    level: u.level,
    jumlahPeserta: u.jumlahPeserta,
    tanggalMulai: u.tanggalMulai,
    batasKonfirmasi: waktuWib(u.tenggat),
    konfirmasiUrl,
  });
  return { waUrl: buildWaMeUrl(u.pengajar.whatsapp_number, teks), konfirmasiUrl };
}

// ── Panel lama (dipindah dari page.tsx) ────────────────────────────────────

export async function muatAntrean(periodeId: string): Promise<BarisAntrean[]> {
  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, pengajar:pengajar_id(name, gender)')
    .eq('periode_id', periodeId);
  const pengisianRows = (pengisian ?? []) as { id: string; pengajar?: { name: string; gender: Gender } | null }[];
  const namaPengisian = new Map(pengisianRows.map((p) => [p.id, p.pengajar?.name ?? '—']));
  const genderPengisian = new Map(pengisianRows.map((p) => [p.id, p.pengajar?.gender ?? null]));
  if (namaPengisian.size === 0) return [];

  // Disaring per pengisian periode ini, bukan membaca seluruh tabel.
  const { data: baris } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('id, pengisian_id, status, sanggahan_status, bentrok_alasan, catatan, slot:slot_id(label)')
    .in('pengisian_id', [...namaPengisian.keys()])
    .in('status', ['perlu_konfirmasi', 'diajukan']);

  const out: BarisAntrean[] = [];
  for (const b of (baris ?? []) as {
    id: string;
    pengisian_id: string;
    status: string;
    sanggahan_status: string | null;
    bentrok_alasan: string | null;
    catatan: string | null;
    slot?: { label: string } | null;
  }[]) {
    const nama = namaPengisian.get(b.pengisian_id);
    if (!nama) continue;
    // Yang perlu disentuh koordinator: sanggahan menunggu, atau baris yang
    // gagal salah satu butir verifikasi. Baris 'diajukan' yang bersih tidak
    // ditampilkan — menumpuknya hanya membuat antrean terlihat panjang palsu.
    const perluDisentuh = b.sanggahan_status === 'menunggu' || b.status === 'perlu_konfirmasi';
    if (!perluDisentuh) continue;
    out.push({
      id: b.id,
      gender: genderPengisian.get(b.pengisian_id) ?? null,
      pengajar: nama,
      slot: b.slot?.label ?? '—',
      status: b.status,
      sanggahan_status: b.sanggahan_status,
      bentrok_alasan: b.bentrok_alasan,
      catatan: b.catatan,
    });
  }
  return out;
}

export interface DaftarUsulan {
  kartu: KartuUsulan[];
  /** true bila riwayat atau papan dipotong di BATAS_USULAN baris terbaru. */
  terpotong: boolean;
}

type BarisUsulanDb = {
  id: string;
  status: string;
  level: string;
  pita_umur: string | null;
  pita_digabung: boolean;
  putaran: number;
  tanggal_mulai: string | null;
  token_kedaluwarsa: string | null;
  akses_token: string | null;
  alasan_tolak: string | null;
  tilawah_halaqah_id: number | null;
  grup_wa_link: string | null;
  slot?: { label: string; kelompok: Gender } | null;
  pengajar?: { name: string; gender: Gender; whatsapp_number: string } | null;
};

export async function muatUsulan(periodeId: string): Promise<DaftarUsulan> {
  const kolom =
    'id, status, level, pita_umur, pita_digabung, putaran, tanggal_mulai, token_kedaluwarsa, akses_token, alasan_tolak, tilawah_halaqah_id, grup_wa_link, slot:slot_id(label, kelompok), pengajar:pengajar_id(name, gender, whatsapp_number)';
  // Papan dan riwayat dibaca terpisah: riwayat yang panjang tidak boleh
  // mendesak usulan yang masih perlu ditindaklanjuti keluar dari batas.
  const [{ data: papan }, { data: riwayat }] = await Promise.all([
    supabaseAdmin
      .from('ks_usulan')
      .select(kolom)
      .eq('periode_id', periodeId)
      .in('status', STATUS_PAPAN)
      .order('created_at', { ascending: false })
      .limit(BATAS_USULAN + 1),
    supabaseAdmin
      .from('ks_usulan')
      .select(kolom)
      .eq('periode_id', periodeId)
      .in('status', STATUS_RIWAYAT)
      .order('updated_at', { ascending: false })
      .limit(BATAS_USULAN + 1),
  ]);
  const papanRows = (papan ?? []) as BarisUsulanDb[];
  const riwayatRows = (riwayat ?? []) as BarisUsulanDb[];
  const terpotong = papanRows.length > BATAS_USULAN || riwayatRows.length > BATAS_USULAN;
  const baris = [...papanRows.slice(0, BATAS_USULAN), ...riwayatRows.slice(0, BATAS_USULAN)];
  if (baris.length === 0) return { kartu: [], terpotong: false };

  const { data: peserta } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('usulan_id, status')
    .in(
      'usulan_id',
      baris.map((b) => b.id)
    );
  const hitung = new Map<string, number>();
  const terenrol = new Map<string, number>();
  for (const p of (peserta ?? []) as { usulan_id: string; status: string }[]) {
    hitung.set(p.usulan_id, (hitung.get(p.usulan_id) ?? 0) + 1);
    if (p.status === 'terenroll') terenrol.set(p.usulan_id, (terenrol.get(p.usulan_id) ?? 0) + 1);
  }

  const kartu = baris.map((b): KartuUsulan => {
    const jumlah = hitung.get(b.id) ?? 0;
    // Tautan WA hanya untuk yang masih menunggu konfirmasi: token status lain
    // sudah mati atau tidak boleh beredar lagi.
    const wa =
      b.status === 'menunggu' && b.akses_token && b.token_kedaluwarsa && b.pengajar && b.slot
        ? tautanWaKonfirmasi({
            token: b.akses_token,
            tenggat: b.token_kedaluwarsa,
            tanggalMulai: b.tanggal_mulai ?? '-',
            pengajar: b.pengajar,
            slotLabel: b.slot.label,
            level: b.level,
            jumlahPeserta: jumlah,
          }).waUrl
        : null;
    return {
      id: b.id,
      status: b.status,
      slot: b.slot?.label ?? '—',
      gender: b.slot?.kelompok ?? null,
      pengajar: b.pengajar?.name ?? '(belum ada)',
      level: b.level,
      pita: b.pita_digabung ? 'pita digabung' : (b.pita_umur ?? '—'),
      putaran: b.putaran,
      peserta: jumlah,
      terenrol: terenrol.get(b.id) ?? 0,
      tanggal_mulai: b.tanggal_mulai,
      tenggat: b.token_kedaluwarsa,
      tilawah_halaqah_id: b.tilawah_halaqah_id,
      grup_wa_link: b.grup_wa_link,
      alasan_tolak: b.alasan_tolak,
      wa_url: wa,
    };
  });
  return { kartu, terpotong };
}

export async function muatGrupPool(periodeId: string): Promise<BarisGrup[]> {
  const { data } = await supabaseAdmin
    .from('ks_grup_pool')
    .select('id, gender, invite_link, status, usulan:usulan_id(nama_halaqah, slot:slot_id(label))')
    .eq('periode_id', periodeId)
    .order('created_at', { ascending: true });

  return ((data ?? []) as {
    id: string;
    gender: Gender;
    invite_link: string;
    status: string;
    usulan?: { nama_halaqah: string | null; slot?: { label: string } | null } | null;
  }[]).map((b) => ({
    id: b.id,
    gender: b.gender,
    invite_link: b.invite_link,
    status: b.status,
    halaqah: b.usulan ? (b.usulan.nama_halaqah ?? b.usulan.slot?.label ?? 'terpakai') : null,
  }));
}

export async function muatSumber(periodeId: string): Promise<KsPendaftarSumber[]> {
  const { data } = await supabaseAdmin
    .from('ks_pendaftar_sumber')
    .select('*')
    .eq('periode_id', periodeId)
    .order('created_at', { ascending: true });
  return (data ?? []) as KsPendaftarSumber[];
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export interface JamPengajar {
  label: string;
  mode: KsMode;
  prioritas: number | null;
  /** Alasan bentrok yang dicatat saat impor — ditampilkan, tidak mengunci. */
  bentrok: string | null;
}

export interface BarisPengajarDasbor {
  id: string;
  nama: string;
  gender: Gender;
  sumber: KsPengisianSumber;
  status: string;
  halaqah: number;
  /** Halaqah hidup yang dipegang: level dan sampai kapan jamnya terpakai. */
  halaqahRinci: { label: string; level: string | null; status: string; selesai: string | null }[];
  jam: JamPengajar[];
}

export async function muatPengajarDasbor(periodeId: string): Promise<BarisPengajarDasbor[]> {
  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, pengajar_id, status, sumber, pengajar:pengajar_id(name, gender)')
    .eq('periode_id', periodeId);
  const baris = (pengisian ?? []) as {
    id: string;
    pengajar_id: string;
    status: string;
    sumber: KsPengisianSumber;
    pengajar?: { name: string; gender: Gender } | null;
  }[];
  if (baris.length === 0) return [];

  const [{ data: ket }, { data: usulan }] = await Promise.all([
    supabaseAdmin
      .from('ks_ketersediaan')
      .select('pengisian_id, status, prioritas, bentrok_alasan, slot:slot_id(label, mode)')
      .in(
        'pengisian_id',
        baris.map((b) => b.id)
      ),
    supabaseAdmin
      .from('ks_usulan')
      .select(
        'pengajar_id, status, level, tanggal_mulai, slot:slot_id(label, hari_idx), periode:periode_id(mulai, selesai, libur, jumlah_pertemuan_dasar, jumlah_pertemuan_lanjutan)'
      )
      .eq('periode_id', periodeId)
      .in('status', ['usulan', ...STATUS_HIDUP]),
  ]);

  const jamPer = new Map<string, JamPengajar[]>();
  for (const k of (ket ?? []) as {
    pengisian_id: string;
    status: string;
    prioritas: number | null;
    bentrok_alasan: string | null;
    slot?: { label: string; mode: KsMode } | null;
  }[]) {
    if (k.status === 'ditolak' || !k.slot) continue;
    const daftar = jamPer.get(k.pengisian_id) ?? [];
    daftar.push({
      label: k.slot.label.replace(/\s*WIB$/, ''),
      mode: k.slot.mode,
      prioritas: k.prioritas,
      bentrok: k.bentrok_alasan,
    });
    jamPer.set(k.pengisian_id, daftar);
  }

  const halaqah = new Map<string, number>();
  const rinci = new Map<string, BarisPengajarDasbor['halaqahRinci']>();
  for (const u of (usulan ?? []) as {
    pengajar_id: string | null;
    status: string;
    level: string | null;
    tanggal_mulai: string | null;
    slot?: { label: string; hari_idx: KsHariIdx[] } | null;
    periode?: {
      mulai: string;
      selesai: string;
      libur: KsLibur[] | null;
      jumlah_pertemuan_dasar: number;
      jumlah_pertemuan_lanjutan: number;
    } | null;
  }[]) {
    if (!u.pengajar_id) continue;
    // Usulan yang belum dilepas belum dihitung sebagai halaqah, tetapi tetap tampil.
    if (u.status !== 'usulan') halaqah.set(u.pengajar_id, (halaqah.get(u.pengajar_id) ?? 0) + 1);
    const daftar = rinci.get(u.pengajar_id) ?? [];
    daftar.push({
      label: (u.slot?.label ?? '').replace(/\s*WIB$/, ''),
      level: u.level,
      status: u.status,
      selesai:
        u.slot && u.periode
          ? perkiraanSelesaiHalaqah({ mulai: u.tanggal_mulai, hari_idx: u.slot.hari_idx, level: u.level, periode: u.periode })
          : null,
    });
    rinci.set(u.pengajar_id, daftar);
  }

  return baris
    .filter((b) => b.pengajar)
    .map((b) => ({
      id: b.pengajar_id,
      nama: b.pengajar!.name,
      gender: b.pengajar!.gender,
      sumber: b.sumber,
      status: b.status,
      halaqah: halaqah.get(b.pengajar_id) ?? 0,
      halaqahRinci: (rinci.get(b.pengajar_id) ?? []).sort((x, y) => (x.selesai ?? '').localeCompare(y.selesai ?? '')),
      jam: (jamPer.get(b.id) ?? []).sort(
        (x, y) => (x.prioritas ?? 99) - (y.prioritas ?? 99) || x.label.localeCompare(y.label)
      ),
    }))
    // Yang belum kebagian halaqah paling atas: itu yang perlu diperhatikan.
    .sort((a, b) => a.halaqah - b.halaqah || a.nama.localeCompare(b.nama));
}

/** Pengajar yang benar-benar ikut hitungan pasokan: punya jam dan tidak nonaktif. */
export function hitungPengajarTersedia(rows: readonly BarisPengajarDasbor[], gender?: Gender): number {
  return rows.filter((r) => r.status !== 'nonaktif' && r.jam.length > 0 && (!gender || r.gender === gender)).length;
}

export interface TugasGender {
  usulanMenunggu: number;
  tenggatLewat: number;
  sanggahan: number;
  /** Usulan yang ditolak pengajar atau gagal dikirim — perlu dilihat koordinator. */
  ditolak: number;
  gagal: number;
}

export async function muatTugas(periodeId: string, sekarang: Date): Promise<Record<Gender, TugasGender>> {
  const kosong = (): TugasGender => ({ usulanMenunggu: 0, tenggatLewat: 0, sanggahan: 0, ditolak: 0, gagal: 0 });
  const out: Record<Gender, TugasGender> = { ikhwan: kosong(), akhwat: kosong() };

  const [{ data: usulan }, { data: sanggah }] = await Promise.all([
    supabaseAdmin
      .from('ks_usulan')
      .select('status, token_kedaluwarsa, slot:slot_id(kelompok)')
      .eq('periode_id', periodeId)
      .in('status', ['usulan', 'menunggu', 'ditolak', 'gagal']),
    muatSanggahanMenunggu(periodeId),
  ]);

  for (const u of (usulan ?? []) as {
    status: string;
    token_kedaluwarsa: string | null;
    slot?: { kelompok: Gender } | null;
  }[]) {
    if (!u.slot) continue;
    if (u.status === 'usulan') out[u.slot.kelompok].usulanMenunggu += 1;
    else if (u.status === 'ditolak') out[u.slot.kelompok].ditolak += 1;
    else if (u.status === 'gagal') out[u.slot.kelompok].gagal += 1;
    else if (u.token_kedaluwarsa && new Date(u.token_kedaluwarsa) < sekarang) out[u.slot.kelompok].tenggatLewat += 1;
  }
  for (const s of (sanggah ?? []) as { slot?: { kelompok: Gender; periode_id: string } | null }[]) {
    if (s.slot && s.slot.periode_id === periodeId) out[s.slot.kelompok].sanggahan += 1;
  }
  return out;
}

/** Sanggahan menunggu milik periode ini — dibaca per slot periode, bukan seluruh tabel. */
async function muatSanggahanMenunggu(periodeId: string): Promise<{ data: unknown[] }> {
  const { data: slot } = await supabaseAdmin.from('ks_slot').select('id').eq('periode_id', periodeId);
  const ids = ((slot ?? []) as { id: string }[]).map((s) => s.id);
  if (ids.length === 0) return { data: [] };
  const { data } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('slot:slot_id(kelompok, periode_id)')
    .in('slot_id', ids)
    .eq('sanggahan_status', 'menunggu');
  return { data: data ?? [] };
}

export interface PendaftarRingkas {
  didaftar_pada: string | null;
  gender: Gender | null;
  status: string;
}

/** Semua pendaftar periode kecuali kiriman yang digantikan dan yang dibatalkan. */
export async function muatPendaftarRingkas(periodeId: string): Promise<PendaftarRingkas[]> {
  const { data } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('didaftar_pada, gender, status')
    .eq('periode_id', periodeId);
  return ((data ?? []) as PendaftarRingkas[]).filter((p) => p.status !== 'diganti' && p.status !== 'batal');
}

/** Pendaftar sah per jam dengan level dan kelompok umur — bahan rincian jam offline. */
export async function muatPendaftarLevel(periodeId: string): Promise<PendaftarLevel[]> {
  const { data } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('id, slot_id, level_pilihan, pita_umur, didaftar_pada')
    .eq('periode_id', periodeId)
    .eq('status', 'valid');
  return (data ?? []) as PendaftarLevel[];
}
